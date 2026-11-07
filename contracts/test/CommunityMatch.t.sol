// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DemoAsset} from "../src/DemoAsset.sol";
import {DestMatch} from "../src/DestMatch.sol";
import {KeeperBook} from "../src/KeeperBook.sol";
import {IShiftToken, LpFactory, LpPosition} from "../src/LpPosition.sol";
import {MockUsdc} from "../src/MockUsdc.sol";
import {SourceMatch} from "../src/SourceMatch.sol";

contract RejectsNative {
    function pull(DestMatch dest) external {
        dest.take();
    }

    receive() external payable {
        revert("no");
    }
}

contract CommunityMatchTest is Test {
    uint256 internal constant Q = 10 ether;
    uint256 internal constant USDC = 800e6;

    DemoAsset internal whype;
    MockUsdc internal usdc;
    SourceMatch internal source;
    DestMatch internal dest;
    LpFactory internal factory;
    LpPosition internal lp1;
    LpPosition internal lp2;

    uint256 internal constant LP_KEY_A = 1;
    uint256 internal constant LP_KEY_B = 2;
    uint256 internal constant EXIT_KEY = 4;

    address internal lpA;
    address internal lpB;
    address internal exit;
    address internal depositor = address(0xD0);
    address internal stranger = address(0xD1);
    address internal treasury = address(0xFEE);

    function setUp() public {
        lpA = vm.addr(LP_KEY_A);
        lpB = vm.addr(LP_KEY_B);
        exit = vm.addr(EXIT_KEY);
        vm.warp(1_000_000);
        whype = new DemoAsset(address(this));
        usdc = new MockUsdc(address(this));
        source = new SourceMatch(treasury, 20, 5, 2_000, 1 hours, 1 ether);
        dest = new DestMatch(20, 5);
        factory = new LpFactory(address(source), IShiftToken(address(whype)), IShiftToken(address(usdc)));
        source.configure(factory, block.chainid, address(dest), false);

        vm.prank(lpA);
        lp1 = factory.create();
        vm.prank(lpB);
        lp2 = factory.create();

        whype.mint(lpA, 100 ether);
        whype.mint(lpB, 100 ether);
        usdc.mint(exit, 10_000e6);

        vm.startPrank(lpA);
        whype.approve(address(lp1), type(uint256).max);
        lp1.deposit(20 ether);
        vm.stopPrank();
        vm.startPrank(lpB);
        whype.approve(address(lp2), type(uint256).max);
        lp2.deposit(10 ether);
        vm.stopPrank();
        vm.prank(exit);
        usdc.approve(address(source), type(uint256).max);
    }

    function test_settle_pays_the_quoted_split() public {
        (bytes32 id, bytes32 secret) = _fund(lp1, Q);
        _lock(id, secret, lp1, Q);
        dest.claim(id, secret);
        vm.prank(exit);
        dest.take();

        source.settle(id, secret);

        assertEq(exit.balance, 9.98 ether);
        assertEq(whype.balanceOf(depositor), 9.995 ether);
        assertEq(whype.balanceOf(lpA), 80 ether + 0.001 ether);
        assertEq(whype.balanceOf(treasury), 0.004 ether);
        assertEq(lp1.usdcEarned(), USDC);
        assertEq(lp1.available(), 10 ether);
        assertEq(lp1.reserved(), 0);
        assertEq(whype.balanceOf(address(source)), 0);
        assertEq(usdc.balanceOf(exit), 10_000e6 - USDC);
    }

    function test_lps_are_isolated_and_reserved_cannot_be_withdrawn() public {
        _fund(lp1, Q);
        assertEq(lp1.available(), 10 ether);
        assertEq(lp1.reserved(), Q);
        vm.prank(lpA);
        vm.expectRevert(LpPosition.Insufficient.selector);
        lp1.withdraw(11 ether, 0);
        vm.prank(lpA);
        lp1.withdraw(10 ether, 0);
        vm.prank(lpB);
        lp2.withdraw(10 ether, 0);
        assertEq(lp1.available(), 0);
        assertEq(lp2.available(), 0);
        assertEq(whype.balanceOf(lpB), 100 ether);
    }

    function test_short_gap_and_empty_inventory_revert() public {
        bytes32 hash = keccak256(abi.encode(bytes32(uint256(1))));
        uint64 claimBefore = uint64(block.timestamp + 1 hours);
        SourceMatch.FundInput memory early =
            _order(lp1, exit, Q, hash, claimBefore, claimBefore + 1 hours - 1);
        vm.prank(exit);
        vm.expectRevert(SourceMatch.BadTerms.selector);
        source.fund(lp1, early, "");

        SourceMatch.FundInput memory tooBig = _order(lp2, exit, 11 ether, hash, claimBefore, claimBefore + 1 hours);
        bytes memory sig = _sign(lp2, tooBig);
        vm.prank(exit);
        vm.expectRevert(LpPosition.Insufficient.selector);
        source.fund(lp2, tooBig, sig);
        assertEq(usdc.balanceOf(exit), 10_000e6);
    }

    function test_pause_blocks_a_new_fill() public {
        vm.prank(lpA);
        lp1.setPaused(true);
        bytes32 hash = keccak256(abi.encode(bytes32(uint256(2))));
        uint64 claimBefore = uint64(block.timestamp + 1 hours);
        SourceMatch.FundInput memory input = _order(lp1, exit, Q, hash, claimBefore, claimBefore + 1 hours);
        bytes memory sig = _sign(lp1, input);
        vm.prank(exit);
        vm.expectRevert(LpPosition.Paused.selector);
        source.fund(lp1, input, sig);
    }

    function test_stranger_does_not_occupy_the_depositor_id() public {
        (bytes32 id,) = _fund(lp1, Q);
        vm.deal(stranger, 20 ether);
        vm.prank(stranger);
        bytes32 otherId = dest.lock{value: (Q * 9980) / 10_000}(
            _lockOrder(
                lp1,
                exit,
                Q,
                keccak256(abi.encode(bytes32(uint256(9)))),
                uint64(block.timestamp + 1 hours),
                uint64(block.timestamp + 2 hours)
            )
        );
        assertTrue(otherId != id);
        (,,,,,, DestMatch.Status status) = dest.locks(id);
        assertEq(uint8(status), 0);
    }

    function test_refund_returns_the_original_assets() public {
        (bytes32 id,) = _fund(lp1, Q);
        uint256 cap = source.bonusRemaining();
        vm.expectRevert(SourceMatch.TooEarly.selector);
        source.refund(id);
        vm.warp(block.timestamp + 2 hours);
        source.refund(id);
        assertEq(usdc.balanceOf(exit), 10_000e6);
        assertEq(lp1.available(), 20 ether);
        assertEq(lp1.reserved(), 0);
        assertEq(source.bonusRemaining(), cap + 0.001 ether);
        vm.expectRevert(SourceMatch.BadStatus.selector);
        source.settle(id, bytes32(uint256(7)));
    }

    function test_second_fill_has_no_bonus_once_the_cap_is_spent() public {
        source = new SourceMatch(treasury, 20, 5, 2_000, 1 hours, 0.001 ether);
        factory = new LpFactory(address(source), IShiftToken(address(whype)), IShiftToken(address(usdc)));
        source.configure(factory, block.chainid, address(dest), false);
        vm.prank(lpA);
        lp1 = factory.create();
        vm.startPrank(lpA);
        whype.approve(address(lp1), type(uint256).max);
        lp1.deposit(30 ether);
        vm.stopPrank();
        vm.prank(exit);
        usdc.approve(address(source), type(uint256).max);

        (bytes32 first,) = _fund(lp1, Q);
        (bytes32 second,) = _fund(lp1, Q);
        assertEq(_bonus(first), 0.001 ether);
        assertEq(_bonus(second), 0);
        assertEq(_shift(second), 0.005 ether);
        assertEq(source.bonusRemaining(), 0);
    }

    function test_failed_native_send_keeps_the_credit() public {
        RejectsNative box = new RejectsNative();
        bytes32 secret = bytes32(uint256(4));
        bytes32 hash = keccak256(abi.encode(secret));
        uint64 claimBefore = uint64(block.timestamp + 1 hours);
        bytes32 id = _submit(lp1, _order(lp1, address(box), Q, hash, claimBefore, claimBefore + 1 hours));
        vm.deal(depositor, 10 ether);
        vm.prank(depositor);
        dest.lock{value: (Q * 9980) / 10_000}(_lockOrder(lp1, address(box), Q, hash, claimBefore, claimBefore + 1 hours));
        dest.claim(id, secret);
        vm.prank(address(box));
        vm.expectRevert(DestMatch.TransferFailed.selector);
        box.pull(dest);
        assertEq(dest.credit(address(box)), 9.98 ether);
    }

    function test_relayer_quote_pays_gas_and_signer_cannot_withdraw() public {
        address desk = vm.addr(3);
        vm.prank(lpA);
        lp1.setSigner(desk);
        vm.prank(desk);
        vm.expectRevert(LpPosition.NotOwner.selector);
        lp1.withdraw(1 ether, 0);

        bytes32 secret = bytes32(uint256(11));
        uint64 claimBefore = uint64(block.timestamp + 1 hours);
        SourceMatch.FundInput memory input =
            _order(lp1, exit, Q, keccak256(abi.encode(secret)), claimBefore, claimBefore + 1 hours);
        input.gasElysium = 0.0003 ether;
        input.gasHyper = 0.0001 ether;
        bytes32 fillId = source.hashFill(address(lp1), exit, input);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(EXIT_KEY, source.fundDigest(fillId));
        bytes memory exitSig = abi.encodePacked(r, s, v);
        (v, r, s) = vm.sign(3, source.quoteDigest(address(lp1), input));
        vm.prank(address(0xBEEF));
        source.fundFor(lp1, input, abi.encodePacked(r, s, v), exitSig);

        vm.deal(depositor, 10 ether);
        vm.prank(depositor);
        dest.lock{value: 9.9801 ether}(
            DestMatch.LockInput({
                sourceChainId: block.chainid,
                source: address(source),
                position: address(lp1),
                exitUser: exit,
                recipient: exit,
                usdc: USDC,
                whype: Q,
                secretHash: keccak256(abi.encode(secret)),
                claimBefore: claimBefore,
                refundAfter: claimBefore + 1 hours,
                gasElysium: 0.0003 ether,
                gasHyper: 0.0001 ether,
                nonce: input.nonce,
                quotedAt: input.quotedAt,
                direction: 1,
                expectedBonus: input.expectedBonus
            })
        );
        bytes32 claimed = source.hashFill(address(lp1), exit, input);
        vm.prank(address(0xBEEF));
        dest.claim(claimed, secret);
        assertEq(dest.credit(exit), 9.98 ether);
        assertEq(dest.credit(address(0xBEEF)), 0.0001 ether);
        source.settle(fillId, secret);
        assertEq(whype.balanceOf(depositor), 9.9947 ether);
        assertEq(whype.balanceOf(address(this)), 0.0003 ether);
    }

    function test_keeper_quote_binds_size_and_direction() public {
        KeeperBook book = new KeeperBook(address(this));
        book.setSnapshot(1 ether, 2 ether, 10, 1);
        assertTrue(book.boundQuote(10 ether, 1) != book.boundQuote(11 ether, 1));
        assertEq(book.read(10 ether).midX18, book.read(0).midX18);
        vm.warp(block.timestamp + 16);
        vm.expectRevert(KeeperBook.Stale.selector);
        book.boundQuote(10 ether, 1);
    }

    uint256 internal nextSecret = 7;

    function _fund(LpPosition position, uint256 whypeAmount)
        internal
        returns (bytes32 id, bytes32 secret)
    {
        secret = bytes32(nextSecret);
        nextSecret++;
        uint64 claimBefore = uint64(block.timestamp + 1 hours);
        id = _submit(
            position, _order(position, exit, whypeAmount, keccak256(abi.encode(secret)), claimBefore, claimBefore + 1 hours)
        );
    }

    function _lock(bytes32 id, bytes32 secret, LpPosition position, uint256 whypeAmount) internal {
        vm.deal(depositor, 10 ether);
        uint64 claimBefore = uint64(block.timestamp + 1 hours);
        vm.prank(depositor);
        bytes32 destId = dest.lock{value: (whypeAmount * 9980) / 10_000}(
            _lockOrder(position, exit, whypeAmount, keccak256(abi.encode(secret)), claimBefore, claimBefore + 1 hours)
        );
        assertEq(destId, id);
    }

    mapping(address => uint256) internal nextNonce;
    uint256 internal lastNonce;
    uint64 internal lastQuotedAt;
    uint256 internal lastExpectedBonus;

    function _order(
        LpPosition position,
        address recipient,
        uint256 whypeAmount,
        bytes32 hash,
        uint64 claimBefore,
        uint64 refundAfter
    ) internal returns (SourceMatch.FundInput memory input) {
        input = SourceMatch.FundInput({
            depositor: depositor,
            recipient: recipient,
            usdc: USDC,
            whype: whypeAmount,
            secretHash: hash,
            claimBefore: claimBefore,
            refundAfter: refundAfter,
            exitUser: exit,
            gasElysium: 0,
            gasHyper: 0,
            quotedAt: uint64(block.timestamp),
            direction: 1,
            expectedBonus: source.previewBonus(whypeAmount),
            nonce: nextNonce[address(position)]
        });
        lastExpectedBonus = input.expectedBonus;
        lastNonce = input.nonce;
        lastQuotedAt = input.quotedAt;
    }

    function _lockOrder(
        LpPosition position,
        address recipient,
        uint256 whypeAmount,
        bytes32 hash,
        uint64 claimBefore,
        uint64 refundAfter
    ) internal view returns (DestMatch.LockInput memory input) {
        input = DestMatch.LockInput({
            sourceChainId: block.chainid,
            source: address(source),
            position: address(position),
            exitUser: exit,
            recipient: recipient,
            usdc: USDC,
            whype: whypeAmount,
            secretHash: hash,
            claimBefore: claimBefore,
            refundAfter: refundAfter,
            gasElysium: 0,
            gasHyper: 0,
            nonce: lastNonce,
            quotedAt: lastQuotedAt,
            direction: 1,
            expectedBonus: lastExpectedBonus
        });
    }

    function _submit(LpPosition position, SourceMatch.FundInput memory input) internal returns (bytes32 id) {
        bytes memory sig = _sign(position, input);
        vm.prank(exit);
        id = source.fund(position, input, sig);
        nextNonce[address(position)] += 1;
    }

    function _sign(LpPosition position, SourceMatch.FundInput memory input) internal view returns (bytes memory) {
        bytes32 digest = source.quoteDigest(address(position), input);
        uint256 key = position.owner() == lpA ? LP_KEY_A : LP_KEY_B;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _bonus(bytes32 id) internal view returns (uint256) {
        return source.lpBonusOf(id);
    }

    function _shift(bytes32 id) internal view returns (uint256) {
        return source.shiftFeeOf(id);
    }
}
