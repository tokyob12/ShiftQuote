// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IHyperCoreBook} from "./IHyperCoreBook.sol";

/// @notice Operator-set book used to fire Stay, Pull, and the scripted Shift
///         legs on cue. `read` stamps `block.timestamp`, so this book does not
///         go stale during a demo. The app must label it as scripted.
contract ScriptedBook is IHyperCoreBook {
    address public owner;
    uint256 public bidX18;
    uint256 public askX18;
    uint256 public slippageBps;
    uint64 public coreHeight;

    error NotOwner();
    error BadPrice();

    constructor(address owner_) {
        if (owner_ == address(0)) revert NotOwner();
        owner = owner_;
    }

    function set(uint256 bidX18_, uint256 askX18_, uint256 slippageBps_, uint64 coreHeight_) external {
        if (msg.sender != owner) revert NotOwner();
        if (bidX18_ == 0 || askX18_ < bidX18_) revert BadPrice();
        bidX18 = bidX18_;
        askX18 = askX18_;
        slippageBps = slippageBps_;
        coreHeight = coreHeight_;
    }

    function read(uint256) external view returns (Snapshot memory) {
        if (bidX18 == 0) revert BadPrice();
        return Snapshot({
            bidX18: bidX18,
            askX18: askX18,
            midX18: (bidX18 + askX18) / 2,
            slippageBps: slippageBps,
            coreHeight: coreHeight,
            timestamp: uint64(block.timestamp)
        });
    }

    function isScripted() external pure returns (bool) {
        return true;
    }
}
