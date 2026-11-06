// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DemoAsset} from "../src/DemoAsset.sol";
import {ElysiumMatch} from "../src/ElysiumMatch.sol";
import {HyperMatch} from "../src/HyperMatch.sol";
import {KeeperBook} from "../src/KeeperBook.sol";
import {MockUsdc} from "../src/MockUsdc.sol";
import {PositionV2} from "../src/PositionV2.sol";
import {MockArbSys} from "./MockArbSys.sol";

contract MatchTest is Test {
    uint256 internal constant SLICE = 40 ether;
    uint256 internal constant OFFER = 100 ether;

    ElysiumMatch internal elysium;
    HyperMatch internal hyper;
    MockArbSys internal arb;
    PositionV2 internal position;

    address internal maker = address(0xA11CE);
    address internal depositor = address(0xD0);
    address internal other = address(0xD1);
    address internal lp = address(0xA11CE);
    address internal treasury = address(0xFEE);
    address internal l1 = address(0x1111);

    uint256 internal offerId;

    function setUp() public {
        vm.warp(1_000_000);
        arb = new MockArbSys();
        elysium = new ElysiumMatch(treasury, address(arb), 20, 5, 1 hours);
        hyper = new HyperMatch(20);
        vm.deal(maker, 1_000 ether);
        vm.deal(depositor, 1_000 ether);
        vm.deal(other, 1_000 ether);

        vm.prank(maker);
        offerId = elysium.openOffer{value: OFFER}(uint64(block.timestamp + 2 hours));
    }

    function _hash(bytes32 secret) internal pure returns (bytes32) {
        return keccak256(abi.encode(secret));
    }

    function _reserveAndCommit(address who, uint256 amount, bytes32 secret, uint64 hyperTimeout)
        internal
        returns (uint256 reserveId)
    {
        vm.prank(who);
        reserveId = elysium.reserve(offerId, amount);
        vm.prank(maker);
        elysium.commit(reserveId, _hash(secret), hyperTimeout);
    }

    function testNamedPartialFillReleasesOnlyThatDepositor() public {
        bytes32 secretA = keccak256("a");
        bytes32 secretB = keccak256("b");
        uint64 hyperTimeout = uint64(block.timestamp + 30 minutes);
        uint256 reserveA = _reserveAndCommit(depositor, SLICE, secretA, hyperTimeout);
        uint256 reserveB = _reserveAndCommit(other, 60 ether, secretB, hyperTimeout);

        uint256 due = hyper.paymentFor(SLICE);
        vm.prank(depositor);
        hyper.lock{value: due}(reserveA, maker, SLICE, _hash(secretA), hyperTimeout);
        vm.prank(maker);
        hyper.claim(reserveA, secretA);

        uint256 payout = SLICE - (SLICE * 5 / 10_000);
        uint256 fee = SLICE * 5 / 10_000;
        vm.prank(address(0xBEEF));
        elysium.release(reserveA, secretA);

        assertEq(depositor.balance, 1_000 ether - due + payout);
        assertEq(treasury.balance, fee);
        assertEq(maker.balance, 1_000 ether - OFFER + due);
        (,, uint256 stillReserved,,) = _offer();
        assertEq(stillReserved, 60 ether);
        (,,,,,, ElysiumMatch.ReserveStatus statusB) = elysium.reserves(reserveB);
        assertEq(uint256(statusB), uint256(ElysiumMatch.ReserveStatus.Committed));
    }

    function testLastSecondLockKeepsTheReservedSlice() public {
        bytes32 secret = keccak256("last");
        uint64 hyperTimeout = uint64(block.timestamp + 30 minutes);
        uint256 reserveId = _reserveAndCommit(depositor, SLICE, secret, hyperTimeout);

        vm.warp(hyperTimeout - 1);
        uint256 due = hyper.paymentFor(SLICE);
        vm.prank(depositor);
        hyper.lock{value: due}(reserveId, maker, SLICE, _hash(secret), hyperTimeout);

        vm.prank(maker);
        elysium.fallbackUnreserved(offerId, l1);

        assertEq(address(arb).balance, OFFER - SLICE);
        assertEq(address(elysium).balance, SLICE);
        assertEq(elysium.reservedLiabilities(), SLICE);
        (uint256 remaining, uint256 reserved) = _remaining();
        assertEq(remaining, 0);
        assertEq(reserved, SLICE);

        vm.prank(maker);
        hyper.claim(reserveId, secret);
        vm.prank(depositor);
        elysium.release(reserveId, secret);

        uint256 payout = SLICE - (SLICE * 5 / 10_000);
        assertEq(depositor.balance, 1_000 ether - due + payout);
        assertEq(elysium.reservedLiabilities(), 0);
        assertEq(address(elysium).balance, 0);
    }

    function testClaimTwiceAndWrongSecretRevert() public {
        bytes32 secret = keccak256("once");
        uint64 hyperTimeout = uint64(block.timestamp + 30 minutes);
        uint256 reserveId = _reserveAndCommit(depositor, SLICE, secret, hyperTimeout);
        uint256 due = hyper.paymentFor(SLICE);
        vm.prank(depositor);
        hyper.lock{value: due}(reserveId, maker, SLICE, _hash(secret), hyperTimeout);

        vm.prank(maker);
        vm.expectRevert(HyperMatch.BadSecret.selector);
        hyper.claim(reserveId, keccak256("nope"));

        vm.prank(maker);
        hyper.claim(reserveId, secret);
        vm.prank(maker);
        vm.expectRevert(HyperMatch.BadStatus.selector);
        hyper.claim(reserveId, secret);

        vm.expectRevert(ElysiumMatch.BadSecret.selector);
        elysium.release(reserveId, keccak256("nope"));
    }

    function testRefundAfterHyperTimeout() public {
        bytes32 secret = keccak256("late");
        uint64 hyperTimeout = uint64(block.timestamp + 30 minutes);
        uint256 reserveId = _reserveAndCommit(depositor, SLICE, secret, hyperTimeout);
        uint256 due = hyper.paymentFor(SLICE);
        vm.prank(depositor);
        hyper.lock{value: due}(reserveId, maker, SLICE, _hash(secret), hyperTimeout);

        vm.warp(hyperTimeout);
        vm.prank(maker);
        vm.expectRevert(HyperMatch.BadTimeout.selector);
        hyper.claim(reserveId, secret);

        uint256 before = depositor.balance;
        vm.prank(depositor);
        hyper.refund(reserveId);
        assertEq(depositor.balance, before + due);
        assertEq(address(hyper).balance, 0);

        vm.warp(uint64(block.timestamp + 31 minutes));
        elysium.reclaim(reserveId);
        (uint256 remaining, uint256 reserved) = _remaining();
        assertEq(reserved, 0);
        assertEq(remaining, OFFER);
    }

    function testReclaimBeforeDeadlineReverts() public {
        uint256 reserveId = _reserveAndCommit(
            depositor, SLICE, keccak256("hold"), uint64(block.timestamp + 20 minutes)
        );
        vm.expectRevert(ElysiumMatch.TooEarly.selector);
        elysium.reclaim(reserveId);
    }

    function testShiftDoesNotChangeMatch() public {
        DemoAsset base = new DemoAsset(address(this));
        MockUsdc usdc = new MockUsdc(address(this));
        KeeperBook book = new KeeperBook(address(this));
        book.setSnapshot(78 ether, 78 ether, 10, 1);
        position = new PositionV2(lp, address(base), address(usdc), book);
        base.mint(lp, 100 ether);
        vm.startPrank(lp);
        base.approve(address(position), type(uint256).max);
        position.deposit(100 ether, 0);
        position.setSpotLinked(true);
        vm.stopPrank();

        uint256 bal = address(elysium).balance;
        (uint256 remaining, uint256 reserved) = _remaining();
        vm.prank(lp);
        position.shift();

        assertEq(uint256(position.location()), uint256(PositionV2.Location.InTransit));
        assertEq(address(elysium).balance, bal);
        (uint256 remainingAfter, uint256 reservedAfter) = _remaining();
        assertEq(remainingAfter, remaining);
        assertEq(reservedAfter, reserved);
        assertEq(elysium.nextReserveId(), 1);
    }

    function _offer()
        internal
        view
        returns (address maker_, uint256 remaining, uint256 reserved, uint64 expiry, bool open)
    {
        (maker_, remaining, reserved, expiry, open) = elysium.offers(offerId);
    }

    function _remaining() internal view returns (uint256 remaining, uint256 reserved) {
        (, remaining, reserved,,) = _offer();
    }
}
