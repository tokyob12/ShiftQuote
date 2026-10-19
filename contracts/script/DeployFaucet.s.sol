// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {DemoAsset} from "../src/DemoAsset.sol";
import {Faucet} from "../src/Faucet.sol";
import {MockUsdc} from "../src/MockUsdc.sol";

/// @notice Deploys a drip faucet and funds it from the existing test balances.
contract DeployFaucet is Script {
    DemoAsset internal constant BASE = DemoAsset(0x35578CA58726E86BbFa10526dd7D571923ddD3d9);
    MockUsdc internal constant QUOTE = MockUsdc(0xf0A6345093eA6f04768B3CfeaBf50b65A9a3F0c9);

    function run() external {
        uint256 key = vm.envUint("SHIFT_PRIVATE_KEY");
        vm.startBroadcast(key);
        Faucet faucet = new Faucet(BASE, QUOTE);
        BASE.transfer(address(faucet), 100_000 ether);
        QUOTE.transfer(address(faucet), 100_000e6);
        vm.stopBroadcast();
        console.log("faucet", address(faucet));
    }
}
