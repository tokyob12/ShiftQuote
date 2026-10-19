// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {DemoAsset} from "../src/DemoAsset.sol";
import {IHyperCoreBook} from "../src/IHyperCoreBook.sol";
import {KeeperBook} from "../src/KeeperBook.sol";
import {MockUsdc} from "../src/MockUsdc.sol";
import {Position} from "../src/Position.sol";
import {ScriptedBook} from "../src/ScriptedBook.sol";

interface IQuoteMeta {
    function decimals() external view returns (uint8);
    function balanceOf(address) external view returns (uint256);
    function symbol() external view returns (string memory);
}

/// @notice Deploys the demo stack and writes apps/web/src/deployments.ts.
///         Canonical testnet USDC is used only when the deployer already holds it.
///         Otherwise a labeled MockUsdc is deployed so deposit and swap can run.
contract Deploy is Script {
    address internal constant CANONICAL_USDC = 0x7D29d8047B905000459c0E80c34a26CeedcB47b2;

    function run() external {
        uint256 key = vm.envUint("SHIFT_PRIVATE_KEY");
        address deployer = vm.addr(key);

        vm.startBroadcast(key);

        bool quoteIsMock = true;
        address quote = CANONICAL_USDC;
        string memory quoteSymbol = "USDC";
        if (_canonicalUsdcUsable(deployer)) {
            quoteIsMock = false;
        } else {
            MockUsdc mock = new MockUsdc(deployer);
            quote = address(mock);
            quoteSymbol = "mUSDC";
            mock.mint(deployer, 1_000_000e6);
        }

        DemoAsset asset = new DemoAsset(deployer);
        asset.mint(deployer, 1_000_000 ether);

        ScriptedBook scripted = new ScriptedBook(deployer);
        KeeperBook keeper = new KeeperBook(deployer);
        scripted.set(0.99e18, 1.01e18, 10, 1);

        Position position = new Position(deployer, address(asset), quote, IHyperCoreBook(address(scripted)));
        asset.approve(address(position), type(uint256).max);
        _approve(quote, address(position));
        position.deposit(1_000 ether, 1_000e6);

        vm.stopBroadcast();

        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return;

        string memory file = string.concat(
            "export const deployments = {\n",
            "  chainId: 99801,\n",
            '  demoAsset: "',
            vm.toString(address(asset)),
            '",\n',
            '  quote: "',
            vm.toString(quote),
            '",\n',
            '  quoteSymbol: "',
            quoteSymbol,
            '",\n',
            "  quoteIsMock: ",
            quoteIsMock ? "true" : "false",
            ",\n",
            '  scriptedBook: "',
            vm.toString(address(scripted)),
            '",\n',
            '  keeperBook: "',
            vm.toString(address(keeper)),
            '",\n',
            '  position: "',
            vm.toString(address(position)),
            '",\n',
            "} as const;\n"
        );
        vm.writeFile("apps/web/src/deployments.ts", file);

        console.log("deployer", deployer);
        console.log("demoAsset", address(asset));
        console.log("quote", quote);
        console.log("quoteIsMock", quoteIsMock);
        console.log("scriptedBook", address(scripted));
        console.log("keeperBook", address(keeper));
        console.log("position", address(position));
    }

    function _canonicalUsdcUsable(address deployer) internal view returns (bool) {
        if (CANONICAL_USDC.code.length == 0) return false;
        try IQuoteMeta(CANONICAL_USDC).decimals() returns (uint8 decimals) {
            if (decimals != 6) return false;
        } catch {
            return false;
        }
        try IQuoteMeta(CANONICAL_USDC).balanceOf(deployer) returns (uint256 balance) {
            return balance >= 1_000e6;
        } catch {
            return false;
        }
    }

    function _approve(address token, address spender) internal {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(0x095ea7b3, spender, type(uint256).max));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "approve");
    }
}
