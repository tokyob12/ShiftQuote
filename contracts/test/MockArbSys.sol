// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IArbSys} from "../src/ElysiumMatch.sol";

contract MockArbSys is IArbSys {
    event Sent(address indexed dest, uint256 value);

    function sendTxToL1(address destination, bytes calldata) external payable returns (uint256) {
        emit Sent(destination, msg.value);
        return 1;
    }
}
