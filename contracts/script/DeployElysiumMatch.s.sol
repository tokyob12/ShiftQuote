// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ElysiumMatch} from "../src/ElysiumMatch.sol";

/// @notice Testnet only. Broadcast against Elysium testnet (chain 99801).
///         ArbSys is the canonical precompile. Do not point this at mainnet
///         until the Match pilot gate has passed.
contract DeployElysiumMatch is Script {
    address internal constant ARB_SYS = 0x0000000000000000000000000000000000000064;

    function run() external {
        uint256 key = vm.envUint("SHIFT_PRIVATE_KEY");
        address treasury = vm.envOr("SHIFT_MATCH_TREASURY", vm.addr(key));
        vm.startBroadcast(key);
        ElysiumMatch match_ = new ElysiumMatch(treasury, ARB_SYS, 20, 5, 30 minutes);
        vm.stopBroadcast();
        console.log("elysiumMatch", address(match_));
        console.log("treasury", treasury);
    }
}
