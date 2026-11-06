// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {DestMatch} from "../src/DestMatch.sol";

/// @notice HyperEVM testnet, chain 998. The deployer needs HYPE on that chain for gas.
contract DeployDestMatch is Script {
    function run() external {
        uint256 key = vm.envUint("SHIFT_PRIVATE_KEY");
        vm.startBroadcast(key);
        DestMatch dest = new DestMatch(20, 5);
        vm.stopBroadcast();
        console.log("dest", address(dest));
    }
}
