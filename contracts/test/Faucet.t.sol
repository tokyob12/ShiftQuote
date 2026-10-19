// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DemoAsset} from "../src/DemoAsset.sol";
import {Faucet} from "../src/Faucet.sol";
import {MockUsdc} from "../src/MockUsdc.sol";

contract FaucetTest is Test {
    DemoAsset internal base;
    MockUsdc internal usdc;
    Faucet internal faucet;
    address internal user = address(0xB0B);

    function setUp() public {
        base = new DemoAsset(address(this));
        usdc = new MockUsdc(address(this));
        faucet = new Faucet(base, usdc);
        base.mint(address(this), 5_000 ether);
        usdc.mint(address(this), 5_000e6);
        base.transfer(address(faucet), 2_000 ether);
        usdc.transfer(address(faucet), 2_000e6);
    }

    function testDripThenCooldown() public {
        vm.prank(user);
        faucet.drip();
        assertEq(base.balanceOf(user), 1_000 ether);
        assertEq(usdc.balanceOf(user), 1_000e6);

        vm.prank(user);
        vm.expectRevert(Faucet.CoolingDown.selector);
        faucet.drip();

        vm.warp(block.timestamp + 1 hours);
        vm.prank(user);
        faucet.drip();
        assertEq(base.balanceOf(user), 2_000 ether);
    }
}
