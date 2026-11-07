// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IShiftToken, LpFactory, LpPosition} from "../src/LpPosition.sol";
import {SourceMatch} from "../src/SourceMatch.sol";

interface IWHYPE {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Elysium testnet only. DestMatch is a separate HyperEVM deploy.
///         Wraps 0.2 HYPE into the first LP position and leaves the rest as gas.
contract DeployCommunityMatch is Script {
    address internal constant WHYPE = 0xCD57F65c2B0e5881CFC2E609F7CD53b746E1F234;
    address internal constant MUSDC = 0xf0A6345093eA6f04768B3CfeaBf50b65A9a3F0c9;
    uint256 internal constant SEED = 0.2 ether;

    function run() external {
        uint256 key = vm.envUint("SHIFT_PRIVATE_KEY");
        address treasury = vm.envOr("SHIFT_MATCH_TREASURY", vm.addr(key));
        require(block.chainid == 99801, "testnet only");
        address dest = vm.envAddress("SHIFT_MATCH_DEST");
        vm.startBroadcast(key);
        SourceMatch source = new SourceMatch(treasury, 20, 5, 2_000, 5 minutes, 1 ether);
        LpFactory factory = new LpFactory(address(source), IShiftToken(WHYPE), IShiftToken(MUSDC));
        source.configure(factory, 998, dest, true);
        LpPosition position = factory.create();
        IWHYPE whype = IWHYPE(WHYPE);
        whype.deposit{value: SEED}();
        if (!whype.approve(address(position), SEED)) revert SourceMatch.TransferFailed();
        position.deposit(SEED);
        position.setSigner(treasury);
        position.transferOwnership(treasury);
        source.transferAdmin(treasury);
        vm.stopBroadcast();
        console.log("source", address(source));
        console.log("factory", address(factory));
        console.log("position", address(position));
        console.log("treasury", treasury);
    }
}
