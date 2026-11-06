// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MatchFee} from "./MatchFee.sol";

/// @notice HyperEVM half of Shift Match. The depositor locks the payment for a
///         named Elysium reserve. The exit user reveals the secret here to take
///         that payment. If the secret never arrives before `hyperTimeout`, the
///         depositor refunds. This contract does not message Elysium.
contract HyperMatch {
    enum LockStatus {
        None,
        Locked,
        Claimed,
        Refunded
    }

    struct Lock {
        address depositor;
        address maker;
        uint256 slice;
        uint256 payment;
        bytes32 secretHash;
        uint64 hyperTimeout;
        LockStatus status;
    }

    uint256 public immutable exitFeeBps;
    mapping(uint256 => Lock) public locks;

    error BadFee();
    error WrongPayment();
    error BadTimeout();
    error BadStatus();
    error BadSecret();
    error TooEarly();
    error TransferFailed();

    event Locked(
        uint256 indexed reserveId,
        address indexed depositor,
        address indexed maker,
        uint256 slice,
        uint256 payment,
        bytes32 secretHash,
        uint64 hyperTimeout
    );
    event Claimed(uint256 indexed reserveId, address indexed maker, uint256 payment);
    event Refunded(uint256 indexed reserveId, address indexed depositor, uint256 payment);

    constructor(uint256 exitFeeBps_) {
        if (exitFeeBps_ == 0 || exitFeeBps_ >= 1_000) revert BadFee();
        exitFeeBps = exitFeeBps_;
    }

    function paymentFor(uint256 slice) external view returns (uint256) {
        return MatchFee.payment(slice, exitFeeBps);
    }

    function lock(
        uint256 reserveId,
        address maker,
        uint256 slice,
        bytes32 secretHash,
        uint64 hyperTimeout
    ) external payable {
        Lock storage row = locks[reserveId];
        if (row.status != LockStatus.None) revert BadStatus();
        if (maker == address(0) || secretHash == bytes32(0)) revert BadSecret();
        if (hyperTimeout <= block.timestamp) revert BadTimeout();
        uint256 due = MatchFee.payment(slice, exitFeeBps);
        if (due == 0 || msg.value != due) revert WrongPayment();
        row.depositor = msg.sender;
        row.maker = maker;
        row.slice = slice;
        row.payment = due;
        row.secretHash = secretHash;
        row.hyperTimeout = hyperTimeout;
        row.status = LockStatus.Locked;
        emit Locked(reserveId, msg.sender, maker, slice, due, secretHash, hyperTimeout);
    }

    /// @notice Reveals the secret and pays the maker. The same secret releases the Elysium slice.
    function claim(uint256 reserveId, bytes32 secret) external {
        Lock storage row = locks[reserveId];
        if (row.status != LockStatus.Locked) revert BadStatus();
        if (block.timestamp >= row.hyperTimeout) revert BadTimeout();
        if (keccak256(abi.encode(secret)) != row.secretHash) revert BadSecret();
        row.status = LockStatus.Claimed;
        emit Claimed(reserveId, row.maker, row.payment);
        _send(row.maker, row.payment);
    }

    function refund(uint256 reserveId) external {
        Lock storage row = locks[reserveId];
        if (row.status != LockStatus.Locked) revert BadStatus();
        if (block.timestamp < row.hyperTimeout) revert TooEarly();
        row.status = LockStatus.Refunded;
        emit Refunded(reserveId, row.depositor, row.payment);
        _send(row.depositor, row.payment);
    }

    function _send(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
