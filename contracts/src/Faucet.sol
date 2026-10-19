// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {DemoAsset} from "./DemoAsset.sol";
import {MockUsdc} from "./MockUsdc.sol";

/// @notice Sends a connected test wallet 1,000 SDA and 1,000 mUSDC.
///         The contract only transfers tokens it already holds. It cannot mint.
contract Faucet {
    DemoAsset public immutable base;
    MockUsdc public immutable quote;
    uint256 public constant BASE_DRIP = 1_000 ether;
    uint256 public constant QUOTE_DRIP = 1_000e6;
    uint256 public constant COOLDOWN = 1 hours;

    mapping(address => uint256) public lastDrip;

    error CoolingDown();

    event Dripped(address indexed to, uint256 baseAmount, uint256 quoteAmount);

    constructor(DemoAsset base_, MockUsdc quote_) {
        base = base_;
        quote = quote_;
    }

    function drip() external {
        if (lastDrip[msg.sender] != 0 && block.timestamp < lastDrip[msg.sender] + COOLDOWN) {
            revert CoolingDown();
        }
        lastDrip[msg.sender] = block.timestamp;
        base.transfer(msg.sender, BASE_DRIP);
        quote.transfer(msg.sender, QUOTE_DRIP);
        emit Dripped(msg.sender, BASE_DRIP, QUOTE_DRIP);
    }
}
