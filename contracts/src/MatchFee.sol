// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Shared pricing for the two Match escrows. On a slice of Elysium HYPE,
///         the depositor locks `payment` on HyperEVM, receives `slice - fee` on
///         Elysium, and the treasury keeps `fee`. The example is 20 bps from the
///         exit user, 5 bps to Shift, and 15 bps left as the depositor's bonus.
library MatchFee {
    uint256 internal constant BPS = 10_000;

    function payment(uint256 slice, uint256 exitFeeBps) internal pure returns (uint256) {
        return slice * (BPS - exitFeeBps) / BPS;
    }

    function protocolFee(uint256 slice, uint256 protocolFeeBps) internal pure returns (uint256) {
        return slice * protocolFeeBps / BPS;
    }

    /// @notice Bonus is a share of the protocol fee, taken from the same WHYPE slice.
    ///         `bonusBps` is out of 10_000 of that fee. 2_000 means 20 percent.
    function splitFee(uint256 fee, uint256 bonusBps)
        internal
        pure
        returns (uint256 lpBonus, uint256 shiftFee)
    {
        if (bonusBps > BPS) revert BonusTooHigh();
        lpBonus = fee * bonusBps / BPS;
        shiftFee = fee - lpBonus;
    }

    error BonusTooHigh();
}
