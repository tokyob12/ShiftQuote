// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Book snapshot the policy reads. The same shape is what a later
///         HyperCore precompile adapter must return. v1 never calls the empty
///         precompile addresses.
interface IHyperCoreBook {
    struct Snapshot {
        uint256 bidX18;
        uint256 askX18;
        uint256 midX18;
        uint256 slippageBps;
        uint64 coreHeight;
        uint64 timestamp;
    }

    /// @param size Base-token wei the policy is quoting or trying to move.
    function read(uint256 size) external view returns (Snapshot memory);

    /// @dev True only for the demo book. KeeperBook returns false, and the
    ///      position refuses the HyperCore legs on that reader.
    function isScripted() external view returns (bool);
}
