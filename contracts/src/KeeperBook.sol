// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IHyperCoreBook} from "./IHyperCoreBook.sol";

/// @notice Snapshot posted by the off-chain keeper from a live HyperCore book.
///         `read` reverts when the post is older than 15 seconds instead of
///         returning the previous price.
contract KeeperBook is IHyperCoreBook {
    uint256 public constant FRESHNESS_SECONDS = 15;

    address public keeper;
    uint256 public bidX18;
    uint256 public askX18;
    uint256 public slippageBps;
    uint64 public coreHeight;
    uint64 public postedAt;

    error NotKeeper();
    error Stale();
    error BadPrice();

    constructor(address keeper_) {
        if (keeper_ == address(0)) revert NotKeeper();
        keeper = keeper_;
    }

    function setSnapshot(uint256 bidX18_, uint256 askX18_, uint256 slippageBps_, uint64 coreHeight_) external {
        if (msg.sender != keeper) revert NotKeeper();
        if (bidX18_ == 0 || askX18_ < bidX18_) revert BadPrice();
        bidX18 = bidX18_;
        askX18 = askX18_;
        slippageBps = slippageBps_;
        coreHeight = coreHeight_;
        postedAt = uint64(block.timestamp);
    }

    function read(uint256) external view returns (Snapshot memory) {
        if (bidX18 == 0 || block.timestamp - postedAt > FRESHNESS_SECONDS) revert Stale();
        return Snapshot({
            bidX18: bidX18,
            askX18: askX18,
            midX18: (bidX18 + askX18) / 2,
            slippageBps: slippageBps,
            coreHeight: coreHeight,
            timestamp: postedAt
        });
    }

    function isScripted() external pure returns (bool) {
        return false;
    }
}
