// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DemoAsset} from "../src/DemoAsset.sol";
import {IHyperCoreBook} from "../src/IHyperCoreBook.sol";
import {KeeperBook} from "../src/KeeperBook.sol";
import {MockUsdc} from "../src/MockUsdc.sol";
import {PositionV2} from "../src/PositionV2.sol";

/// @dev The base stands in for WHYPE. The reader is a live-style KeeperBook, not the scripted book.
contract PositionV2Test is Test {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant USDC = 1e6;
    uint256 internal constant MID = 78 * WAD;

    DemoAsset internal base;
    MockUsdc internal usdc;
    KeeperBook internal book;
    PositionV2 internal position;

    address internal lp = address(0xA11CE);
    address internal buyer = address(0xB0B);
    address internal stranger = address(0xBEEF);

    function setUp() public {
        vm.warp(1_000_000);
        base = new DemoAsset(address(this));
        usdc = new MockUsdc(address(this));
        book = new KeeperBook(address(this));
        book.setSnapshot(MID, MID, 10, 1);

        position = new PositionV2(lp, address(base), address(usdc), book);

        base.mint(lp, 1_000 * WAD);
        usdc.mint(buyer, 10_000 * USDC);

        vm.startPrank(lp);
        base.approve(address(position), type(uint256).max);
        position.deposit(100 * WAD, 0);
        position.setSwapsOpen(true);
        vm.stopPrank();

        vm.prank(buyer);
        usdc.approve(address(position), type(uint256).max);
    }

    function _post(uint256 mid, uint256 slippageBps) internal {
        book.setSnapshot(mid, mid, slippageBps, 2);
    }

    function testReaderIsNotScripted() public view {
        assertFalse(book.isScripted());
        assertTrue(position.SCRIPTED_LEG());
        assertEq(uint256(position.location()), uint256(PositionV2.Location.Quoted));
        assertEq(position.quotedMidX18(), MID);
    }

    function testSwapInsideBandRequotesThenSells() public {
        uint256 moved = MID + MID * 40 / 10_000;
        _post(moved, 10);

        vm.prank(buyer);
        bool filled = position.swap(1 * WAD, type(uint256).max);

        assertTrue(filled);
        assertEq(position.quotedMidX18(), moved);
        assertEq(uint256(position.lastDecision()), uint256(PositionV2.Decision.Stay));
        assertEq(base.balanceOf(buyer), 1 * WAD);
        assertEq(usdc.balanceOf(buyer), 10_000 * USDC - moved / 1e12);
        assertEq(position.elysiumBase(), 99 * WAD);
        assertEq(position.elysiumQuote(), moved / 1e12);
    }

    function testSwapOutsideBandRevertsAndMovesNothing() public {
        _post(MID + MID * 60 / 10_000, 10);

        vm.prank(buyer);
        vm.expectRevert(PositionV2.OutsideBand.selector);
        position.swap(1 * WAD, type(uint256).max);

        assertEq(uint256(position.location()), uint256(PositionV2.Location.Quoted));
        assertEq(position.quotedMidX18(), MID);
        assertEq(base.balanceOf(buyer), 0);
        assertEq(usdc.balanceOf(buyer), 10_000 * USDC);
        assertEq(position.elysiumBase(), 100 * WAD);
    }

    function testSwapRevertsOnSlippageAlone() public {
        _post(MID, 51);

        vm.prank(buyer);
        vm.expectRevert(PositionV2.OutsideBand.selector);
        position.swap(1 * WAD, type(uint256).max);
        assertEq(uint256(position.location()), uint256(PositionV2.Location.Quoted));
    }

    function testSwapWhilePulledReverts() public {
        _post(MID + MID * 60 / 10_000, 10);
        vm.prank(stranger);
        position.evaluate();

        vm.prank(buyer);
        vm.expectRevert(PositionV2.BadLocation.selector);
        position.swap(1 * WAD, type(uint256).max);
    }

    function testEvaluateReturnsToQuotedWhenBookComesBack() public {
        _post(MID + MID * 60 / 10_000, 10);
        vm.prank(stranger);
        position.evaluate();

        _post(MID, 10);
        vm.prank(stranger);
        PositionV2.Decision decision = position.evaluate();

        assertEq(uint256(decision), uint256(PositionV2.Decision.Stay));
        assertEq(uint256(position.location()), uint256(PositionV2.Location.Quoted));
    }

    function testMaxUsdcInProtectsBuyer() public {
        _post(MID + MID * 40 / 10_000, 10);

        vm.prank(buyer);
        vm.expectRevert(PositionV2.PriceMoved.selector);
        position.swap(1 * WAD, MID / 1e12);
    }

    function testStaleBookBlocksSwap() public {
        vm.warp(block.timestamp + 16);

        vm.prank(buyer);
        vm.expectRevert(KeeperBook.Stale.selector);
        position.swap(1 * WAD, type(uint256).max);
    }

    function testShiftRunsOnLiveReaderAndTokensStay() public {
        vm.prank(lp);
        position.setSpotLinked(true);

        uint256 held = base.balanceOf(address(position));
        vm.prank(lp);
        position.shift();

        assertEq(uint256(position.location()), uint256(PositionV2.Location.InTransit));
        assertEq(position.transitBase(), 25 * WAD);
        assertEq(position.elysiumBase(), 75 * WAD);
        assertEq(base.balanceOf(address(position)), held);

        vm.startPrank(lp);
        position.advanceScripted();
        assertEq(position.coreIdleBase(), 25 * WAD);
        position.advanceScripted();
        assertEq(position.restingBase(), 25 * WAD);
        position.returnScripted();
        vm.stopPrank();

        assertEq(position.elysiumBase(), 100 * WAD);
        assertEq(uint256(position.location()), uint256(PositionV2.Location.Quoted));
        assertEq(base.balanceOf(address(position)), held);
    }

    function testShiftChecksLiveSlippage() public {
        vm.prank(lp);
        position.setSpotLinked(true);
        _post(MID, 51);

        vm.prank(lp);
        vm.expectRevert(PositionV2.Slippage.selector);
        position.shift();
    }

    function testShiftNeedsSpotLinkAndOwner() public {
        vm.prank(lp);
        vm.expectRevert(PositionV2.SpotNotLinked.selector);
        position.shift();

        vm.prank(lp);
        position.setSpotLinked(true);
        vm.prank(stranger);
        vm.expectRevert(PositionV2.NotOwner.selector);
        position.shift();
    }

    function testLedgerLocationsBlockSwapEvaluateAndDeposit() public {
        vm.startPrank(lp);
        position.setSpotLinked(true);
        position.shift();
        vm.expectRevert(PositionV2.BadLocation.selector);
        position.deposit(1 * WAD, 0);
        vm.stopPrank();

        vm.prank(buyer);
        vm.expectRevert(PositionV2.BadLocation.selector);
        position.swap(1 * WAD, type(uint256).max);

        vm.prank(stranger);
        vm.expectRevert(PositionV2.BadLocation.selector);
        position.evaluate();
    }

    function testFirstDepositNeedsFreshBook() public {
        PositionV2 fresh = new PositionV2(lp, address(base), address(usdc), book);
        vm.warp(block.timestamp + 16);

        vm.startPrank(lp);
        base.approve(address(fresh), type(uint256).max);
        vm.expectRevert(KeeperBook.Stale.selector);
        fresh.deposit(1 * WAD, 0);
        vm.stopPrank();
    }

    function testSwapsStartClosed() public {
        PositionV2 fresh = new PositionV2(lp, address(base), address(usdc), book);
        assertFalse(fresh.swapsOpen());

        vm.startPrank(lp);
        base.approve(address(fresh), type(uint256).max);
        fresh.deposit(10 * WAD, 0);
        vm.stopPrank();

        vm.prank(buyer);
        vm.expectRevert(PositionV2.SwapsClosed.selector);
        fresh.swap(1 * WAD, type(uint256).max);
    }

    function testSwapsClosedRevertsBeforeReadingBook() public {
        vm.prank(lp);
        position.setSwapsOpen(false);
        vm.warp(block.timestamp + 16);

        vm.prank(buyer);
        vm.expectRevert(PositionV2.SwapsClosed.selector);
        position.swap(1 * WAD, type(uint256).max);
    }

    function testOnlyOwnerSetsSwapsOpen() public {
        vm.prank(stranger);
        vm.expectRevert(PositionV2.NotOwner.selector);
        position.setSwapsOpen(false);

        vm.expectEmit(false, false, false, true, address(position));
        emit PositionV2.SwapsOpenSet(false);
        vm.prank(lp);
        position.setSwapsOpen(false);
        assertFalse(position.swapsOpen());
    }

    function testClosedSwapsLeaveOtherCallsRunning() public {
        vm.startPrank(lp);
        position.setSwapsOpen(false);
        position.setSpotLinked(true);
        vm.stopPrank();

        vm.prank(stranger);
        position.evaluate();
        position.preview();

        vm.startPrank(lp);
        position.shift();
        position.advanceScripted();
        position.returnScripted();
        vm.stopPrank();

        assertEq(uint256(position.location()), uint256(PositionV2.Location.Quoted));
    }

    function testWithdrawSendsElysiumBalancesToOwner() public {
        vm.prank(buyer);
        position.swap(1 * WAD, type(uint256).max);
        uint256 quoteHeld = position.elysiumQuote();

        vm.expectEmit(false, false, false, true, address(position));
        emit PositionV2.Withdrawn(10 * WAD, quoteHeld);
        vm.prank(lp);
        position.withdraw(10 * WAD, quoteHeld);

        assertEq(position.elysiumBase(), 89 * WAD);
        assertEq(position.elysiumQuote(), 0);
        assertEq(base.balanceOf(lp), 910 * WAD);
        assertEq(usdc.balanceOf(lp), quoteHeld);
        assertEq(base.balanceOf(address(position)), 89 * WAD);
    }

    function testWithdrawWhilePulled() public {
        _post(MID + MID * 60 / 10_000, 10);
        vm.prank(stranger);
        position.evaluate();

        vm.prank(lp);
        position.withdraw(100 * WAD, 0);

        assertEq(position.elysiumBase(), 0);
        assertEq(uint256(position.location()), uint256(PositionV2.Location.Pulled));
        assertEq(position.quotedMidX18(), MID);
    }

    function testWithdrawRules() public {
        vm.prank(stranger);
        vm.expectRevert(PositionV2.NotOwner.selector);
        position.withdraw(1 * WAD, 0);

        vm.startPrank(lp);
        vm.expectRevert(PositionV2.ZeroAmount.selector);
        position.withdraw(0, 0);

        vm.expectRevert(PositionV2.InsufficientBalance.selector);
        position.withdraw(101 * WAD, 0);

        vm.expectRevert(PositionV2.InsufficientBalance.selector);
        position.withdraw(0, 1);
        vm.stopPrank();
    }

    function testWithdrawBlockedOnLedgerAndLeavesLedgerAlone() public {
        vm.startPrank(lp);
        position.setSpotLinked(true);
        position.shift();

        vm.expectRevert(PositionV2.BadLocation.selector);
        position.withdraw(1 * WAD, 0);

        position.advanceScripted();
        vm.expectRevert(PositionV2.BadLocation.selector);
        position.withdraw(1 * WAD, 0);

        position.advanceScripted();
        vm.expectRevert(PositionV2.BadLocation.selector);
        position.withdraw(1 * WAD, 0);

        position.returnScripted();
        position.withdraw(75 * WAD, 0);
        vm.stopPrank();

        assertEq(position.elysiumBase(), 25 * WAD);
        assertEq(position.transitBase(), 0);
        assertEq(position.coreIdleBase(), 0);
        assertEq(position.restingBase(), 0);
    }
}
