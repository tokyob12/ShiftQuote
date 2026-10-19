// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DemoAsset} from "../src/DemoAsset.sol";
import {IHyperCoreBook} from "../src/IHyperCoreBook.sol";
import {KeeperBook} from "../src/KeeperBook.sol";
import {MockUsdc} from "../src/MockUsdc.sol";
import {Position} from "../src/Position.sol";
import {ScriptedBook} from "../src/ScriptedBook.sol";

contract PositionTest is Test {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant USDC = 1e6;

    DemoAsset internal base;
    MockUsdc internal usdc;
    ScriptedBook internal book;
    KeeperBook internal keeperBook;
    Position internal position;
    Position internal other;
    Position internal keeperPosition;

    address internal lp = address(0xA11CE);
    address internal buyer = address(0xB0B);
    address internal stranger = address(0xBEEF);

    function setUp() public {
        base = new DemoAsset(address(this));
        usdc = new MockUsdc(address(this));
        book = new ScriptedBook(address(this));
        keeperBook = new KeeperBook(address(this));

        book.set(WAD, WAD, 10, 1);
        keeperBook.setSnapshot(WAD, WAD, 10, 1);

        position = new Position(lp, address(base), address(usdc), book);
        other = new Position(lp, address(base), address(usdc), book);
        keeperPosition = new Position(lp, address(base), address(usdc), keeperBook);

        base.mint(lp, 10_000 * WAD);
        usdc.mint(lp, 10_000 * USDC);
        usdc.mint(buyer, 10_000 * USDC);

        vm.startPrank(lp);
        base.approve(address(position), type(uint256).max);
        usdc.approve(address(position), type(uint256).max);
        base.approve(address(other), type(uint256).max);
        usdc.approve(address(other), type(uint256).max);
        base.approve(address(keeperPosition), type(uint256).max);
        usdc.approve(address(keeperPosition), type(uint256).max);
        position.deposit(1000 * WAD, 1000 * USDC);
        other.deposit(1000 * WAD, 1000 * USDC);
        keeperPosition.deposit(1000 * WAD, 1000 * USDC);
        vm.stopPrank();

        vm.prank(buyer);
        usdc.approve(address(position), type(uint256).max);
    }

    function testStayInsideBand() public {
        book.set(WAD + 4e15, WAD + 4e15, 10, 2);

        vm.prank(stranger);
        Position.Decision decision = position.evaluate();

        assertEq(uint256(decision), uint256(Position.Decision.Stay));
        assertEq(uint256(position.location()), uint256(Position.Location.Quoted));
        assertEq(uint256(position.lastDecision()), uint256(Position.Decision.Stay));
        assertEq(position.quotedMidX18(), WAD + 4e15);
    }

    function testPullAboveBandAndSwapReverts() public {
        uint256 quoted = position.quotedMidX18();
        book.set(WAD + 6e15, WAD + 6e15, 10, 3);

        vm.prank(lp);
        position.evaluate();

        assertEq(uint256(position.location()), uint256(Position.Location.Pulled));
        assertEq(uint256(position.lastDecision()), uint256(Position.Decision.Pull));
        assertEq(position.quotedMidX18(), quoted);
        assertEq(position.elysiumBase(), 1000 * WAD);

        vm.prank(buyer);
        vm.expectRevert(Position.BadLocation.selector);
        position.swap(1 * WAD);
    }

    function testSwapWhileQuoted() public {
        vm.prank(buyer);
        position.swap(1 * WAD);

        assertEq(base.balanceOf(buyer), 1 * WAD);
        assertEq(position.elysiumBase(), 999 * WAD);
        assertEq(position.elysiumQuote(), 1001 * USDC);
        assertEq(usdc.balanceOf(buyer), 9999 * USDC);
    }

    function testPullOnHighSlippage() public {
        book.set(WAD, WAD, 51, 4);

        vm.prank(lp);
        position.evaluate();

        assertEq(uint256(position.location()), uint256(Position.Location.Pulled));
        assertEq(position.quotedMidX18(), WAD);
    }

    function testStaleSnapshotReverts() public {
        vm.warp(block.timestamp + 16);

        vm.prank(lp);
        vm.expectRevert(KeeperBook.Stale.selector);
        keeperPosition.evaluate();

        assertEq(uint256(keeperPosition.location()), uint256(Position.Location.Quoted));
    }

    function testShiftRequiresLink() public {
        vm.prank(lp);
        vm.expectRevert(Position.SpotNotLinked.selector);
        position.shift();
    }

    function testShiftRevertsOnKeeperBook() public {
        vm.prank(lp);
        keeperPosition.setSpotLinked(true);

        vm.prank(lp);
        vm.expectRevert(Position.NotScripted.selector);
        keeperPosition.shift();
    }

    function testShiftRevertsWhenSlippageWide() public {
        book.set(WAD, WAD, 51, 5);
        vm.prank(lp);
        position.setSpotLinked(true);

        vm.prank(lp);
        vm.expectRevert(Position.Slippage.selector);
        position.shift();
    }

    function testShiftMovesQuarterToTransit() public {
        vm.startPrank(lp);
        position.setSpotLinked(true);
        position.shift();
        vm.stopPrank();

        assertEq(position.elysiumBase(), 750 * WAD);
        assertEq(position.transitBase(), 250 * WAD);
        assertEq(position.coreIdleBase(), 0);
        assertEq(position.restingBase(), 0);
        assertEq(uint256(position.location()), uint256(Position.Location.InTransit));
        assertEq(uint256(position.lastDecision()), uint256(Position.Decision.Shift));
        assertEq(base.balanceOf(address(position)), 1000 * WAD);
    }

    function testScriptedLegsAdvanceToRestingAndReturn() public {
        vm.startPrank(lp);
        position.setSpotLinked(true);
        position.shift();
        position.advanceScripted();
        assertEq(uint256(position.location()), uint256(Position.Location.OnCoreIdle));
        assertEq(position.coreIdleBase(), 250 * WAD);
        position.advanceScripted();
        assertEq(uint256(position.location()), uint256(Position.Location.Resting));
        assertEq(position.restingBase(), 250 * WAD);
        position.returnScripted();
        vm.stopPrank();

        assertEq(uint256(position.location()), uint256(Position.Location.Quoted));
        assertEq(position.elysiumBase(), 1000 * WAD);
        assertEq(position.transitBase(), 0);
        assertEq(position.restingBase(), 0);
    }

    function testPositionsAreIsolated() public {
        vm.startPrank(lp);
        position.setSpotLinked(true);
        position.shift();
        vm.stopPrank();

        assertEq(other.elysiumBase(), 1000 * WAD);
        assertEq(other.transitBase(), 0);
        assertEq(uint256(other.location()), uint256(Position.Location.Quoted));
        assertEq(base.balanceOf(address(other)), 1000 * WAD);
    }

    function testAdvanceOnlyOwner() public {
        vm.prank(lp);
        position.setSpotLinked(true);
        vm.prank(lp);
        position.shift();

        vm.prank(stranger);
        vm.expectRevert(Position.NotOwner.selector);
        position.advanceScripted();
    }

    function testAdvanceRevertsOnKeeperBook() public {
        vm.prank(lp);
        vm.expectRevert(Position.NotScripted.selector);
        keeperPosition.advanceScripted();

        vm.prank(lp);
        vm.expectRevert(Position.NotScripted.selector);
        keeperPosition.returnScripted();
    }

    function testPullThenStayRestoresSwap() public {
        book.set(WAD + 6e15, WAD + 6e15, 10, 6);
        vm.prank(lp);
        position.evaluate();

        book.set(WAD, WAD, 10, 7);
        vm.prank(lp);
        position.evaluate();

        assertEq(uint256(position.location()), uint256(Position.Location.Quoted));

        vm.prank(buyer);
        position.swap(1 * WAD);
        assertEq(base.balanceOf(buyer), 1 * WAD);
    }
}
