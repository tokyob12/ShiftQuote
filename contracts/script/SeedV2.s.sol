// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IHyperCoreBook} from "../src/IHyperCoreBook.sol";
import {PositionV2} from "../src/PositionV2.sol";

interface IWHYPE {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Deposits base into the second position. WHYPE the deployer already
///         holds is used first, and only the shortfall is wrapped from native
///         HYPE. The first deposit reads the spot book, so the script reads the
///         KeeperBook snapshot before any transaction and stops if there is
///         none or it is older than 15 seconds. The deposit is base only.
///         Buyers pay in mUSDC from the faucet.
contract SeedV2 is Script {
    uint256 internal constant FRESHNESS_SECONDS = 15;

    function run() external {
        uint256 key = vm.envUint("SHIFT_PRIVATE_KEY");
        uint256 amount = vm.envOr("SHIFT_V2_BASE", uint256(5 ether));
        string memory json = vm.readFile("deployments/v2.json");
        PositionV2 position = PositionV2(vm.parseJsonAddress(json, ".positionV2"));

        uint256 wrapped = seed(position, key, amount);

        console.log("positionV2", address(position));
        console.log("deposited WHYPE wei", amount);
        console.log("wrapped from native HYPE wei", wrapped);
        console.log("quotedMidX18", position.quotedMidX18());
    }

    /// @return wrapped Native HYPE wrapped to cover what the deployer's WHYPE balance lacked.
    function seed(PositionV2 position, uint256 key, uint256 amount) public returns (uint256 wrapped) {
        IWHYPE whype = IWHYPE(position.base());
        address deployer = vm.addr(key);

        _requireFreshSnapshot(position.reader(), amount);

        uint256 held = whype.balanceOf(deployer);
        wrapped = held >= amount ? 0 : amount - held;

        vm.startBroadcast(key);
        if (wrapped > 0) whype.deposit{value: wrapped}();
        whype.approve(address(position), amount);
        position.deposit(amount, 0);
        vm.stopBroadcast();
    }

    function _requireFreshSnapshot(IHyperCoreBook book, uint256 size) internal view {
        try book.read(size) returns (IHyperCoreBook.Snapshot memory snap) {
            require(snap.midX18 != 0, "no spot snapshot: start the keeper first");
            require(block.timestamp - snap.timestamp <= FRESHNESS_SECONDS, "spot snapshot older than 15s");
            console.log("spot snapshot age seconds", block.timestamp - snap.timestamp);
        } catch {
            revert("no fresh spot snapshot: start the keeper and wait for a post");
        }
    }
}
