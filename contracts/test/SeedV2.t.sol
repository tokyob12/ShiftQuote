// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {KeeperBook} from "../src/KeeperBook.sol";
import {MockUsdc} from "../src/MockUsdc.sol";
import {PositionV2} from "../src/PositionV2.sol";
import {SeedV2} from "../script/SeedV2.s.sol";

/// @dev Minimal WETH-style wrapper with the WHYPE surface the seed script uses.
contract MockWhype {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract SeedV2Test is Test {
    uint256 internal constant KEY = 0xA11CE;
    uint256 internal constant MID = 81 ether;

    MockWhype internal whype;
    KeeperBook internal book;
    PositionV2 internal position;
    SeedV2 internal seeder;
    address internal deployer;

    function setUp() public {
        vm.warp(1_000_000);
        deployer = vm.addr(KEY);
        whype = new MockWhype();
        book = new KeeperBook(address(this));
        book.setSnapshot(MID, MID, 0, 1);
        position = new PositionV2(deployer, address(whype), address(new MockUsdc(address(this))), book);
        seeder = new SeedV2();
        vm.deal(deployer, 10 ether);
    }

    function _holdWhype(uint256 amount) internal {
        vm.prank(deployer);
        whype.deposit{value: amount}();
    }

    function testHeldWhypeIsUsedAndNothingIsWrapped() public {
        _holdWhype(0.1 ether);
        uint256 nativeBefore = deployer.balance;

        uint256 wrapped = seeder.seed(position, KEY, 0.1 ether);

        assertEq(wrapped, 0);
        assertEq(deployer.balance, nativeBefore);
        assertEq(whype.balanceOf(deployer), 0);
        assertEq(whype.balanceOf(address(position)), 0.1 ether);
        assertEq(position.elysiumBase(), 0.1 ether);
        assertEq(uint256(position.location()), uint256(PositionV2.Location.Quoted));
    }

    function testHoldingMoreThanAmountWrapsNothing() public {
        _holdWhype(1 ether);
        uint256 nativeBefore = deployer.balance;

        uint256 wrapped = seeder.seed(position, KEY, 0.4 ether);

        assertEq(wrapped, 0);
        assertEq(deployer.balance, nativeBefore);
        assertEq(whype.balanceOf(deployer), 0.6 ether);
        assertEq(position.elysiumBase(), 0.4 ether);
    }

    function testOnlyTheShortfallIsWrapped() public {
        _holdWhype(0.1 ether);
        uint256 nativeBefore = deployer.balance;

        uint256 wrapped = seeder.seed(position, KEY, 5 ether);

        assertEq(wrapped, 4.9 ether);
        assertEq(deployer.balance, nativeBefore - 4.9 ether);
        assertEq(whype.balanceOf(deployer), 0);
        assertEq(position.elysiumBase(), 5 ether);
    }

    function testNoWhypeWrapsTheWholeAmount() public {
        uint256 nativeBefore = deployer.balance;

        uint256 wrapped = seeder.seed(position, KEY, 2 ether);

        assertEq(wrapped, 2 ether);
        assertEq(deployer.balance, nativeBefore - 2 ether);
        assertEq(position.elysiumBase(), 2 ether);
    }

    function testStaleSnapshotStopsBeforeAnyTransaction() public {
        _holdWhype(0.1 ether);
        vm.warp(block.timestamp + 16);

        vm.expectRevert(bytes("no fresh spot snapshot: start the keeper and wait for a post"));
        seeder.seed(position, KEY, 0.1 ether);

        assertEq(whype.balanceOf(deployer), 0.1 ether);
        assertEq(position.elysiumBase(), 0);
    }
}
