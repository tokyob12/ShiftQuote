// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IHyperCoreBook} from "../src/IHyperCoreBook.sol";
import {KeeperBook} from "../src/KeeperBook.sol";
import {PositionV2} from "../src/PositionV2.sol";

/// @notice Deploys the second position next to the submitted one. Base is
///         canonical WHYPE, quote is the existing mUSDC, and the reader is a
///         new KeeperBook that the keeper fills from HyperCore spot pair 107
///         (HYPE/USDC). Nothing from the first deployment is changed, and
///         apps/web/src/deployments.ts is not written. Addresses go to
///         deployments/v2.json. Seed the position with SeedV2 once the keeper
///         is posting.
contract DeployV2 is Script {
    address internal constant WHYPE = 0xCD57F65c2B0e5881CFC2E609F7CD53b746E1F234;
    address internal constant MUSDC = 0xf0A6345093eA6f04768B3CfeaBf50b65A9a3F0c9;

    function run() external {
        uint256 key = vm.envUint("SHIFT_PRIVATE_KEY");
        address deployer = vm.addr(key);

        vm.startBroadcast(key);
        KeeperBook spotBook = new KeeperBook(deployer);
        PositionV2 position = new PositionV2(deployer, WHYPE, MUSDC, IHyperCoreBook(address(spotBook)));
        vm.stopBroadcast();

        console.log("deployer", deployer);
        console.log("spotKeeperBook", address(spotBook));
        console.log("positionV2", address(position));

        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return;

        string memory obj = "v2";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "deployer", deployer);
        vm.serializeAddress(obj, "base", WHYPE);
        vm.serializeAddress(obj, "quote", MUSDC);
        vm.serializeString(obj, "spotCoin", "@107");
        vm.serializeAddress(obj, "spotKeeperBook", address(spotBook));
        string memory json = vm.serializeAddress(obj, "positionV2", address(position));
        vm.createDir("deployments", true);
        vm.writeJson(json, "deployments/v2.json");
    }
}
