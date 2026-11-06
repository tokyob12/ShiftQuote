// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {HyperMatch} from "../src/HyperMatch.sol";

/// @notice Testnet only. Broadcast against HyperEVM testnet (chain 998).
contract DeployHyperMatch is Script {
    function run() external {
        uint256 key = vm.envUint("SHIFT_PRIVATE_KEY");
        vm.startBroadcast(key);
        HyperMatch match_ = new HyperMatch(20);
        vm.stopBroadcast();
        console.log("hyperMatch", address(match_));
    }
}
