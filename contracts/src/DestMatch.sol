// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MatchFee} from "./MatchFee.sol";

/// @notice HyperEVM side. The lock id includes the depositor, so a stranger
///         cannot take that id. The secret credits the stored recipient.
///         After `claimBefore`, the depositor refunds. A failed native send
///         leaves the credit in place.
contract DestMatch {
    enum Status {
        None,
        Locked,
        Claimed,
        Refunded
    }

    struct Lock {
        address depositor;
        address recipient;
        uint256 payment;
        uint256 gasHyper;
        bytes32 secretHash;
        uint64 claimBefore;
        Status status;
    }

    uint256 public immutable exitFeeBps;
    uint256 public immutable protocolFeeBps;
    mapping(bytes32 => Lock) public locks;
    mapping(address => uint256) public credit;

    error BadTerms();
    error NotDepositor();
    error BadSecret();
    error BadStatus();
    error TooEarly();
    error Expired();
    error TransferFailed();

    event Locked(bytes32 indexed fillId, address indexed depositor, uint256 payment);
    event Claimed(bytes32 indexed fillId, address indexed recipient, uint256 payment);
    event Refunded(bytes32 indexed fillId, address indexed depositor, uint256 payment);

    constructor(uint256 exitFeeBps_, uint256 protocolFeeBps_) {
        if (
            exitFeeBps_ == 0 || exitFeeBps_ >= 1_000 || protocolFeeBps_ == 0
                || protocolFeeBps_ >= exitFeeBps_
        ) {
            revert BadTerms();
        }
        exitFeeBps = exitFeeBps_;
        protocolFeeBps = protocolFeeBps_;
    }

    struct LockInput {
        uint256 sourceChainId;
        address source;
        address position;
        address exitUser;
        address recipient;
        uint256 usdc;
        uint256 whype;
        bytes32 secretHash;
        uint64 claimBefore;
        uint64 refundAfter;
        uint256 gasElysium;
        uint256 gasHyper;
        uint256 nonce;
        uint64 quotedAt;
        uint8 direction;
        uint256 expectedBonus;
    }

    function lock(LockInput calldata input) external payable returns (bytes32 fillId) {
        if (input.recipient == address(0) || input.secretHash == bytes32(0) || input.claimBefore <= block.timestamp) {
            revert BadTerms();
        }
        fillId = this.preview(input, msg.sender);
        Lock storage row = locks[fillId];
        if (row.status != Status.None) revert BadStatus();
        uint256 due = MatchFee.payment(input.whype, exitFeeBps);
        if (due == 0 || input.gasHyper > msg.value || msg.value != due + input.gasHyper) revert BadTerms();
        row.depositor = msg.sender;
        row.recipient = input.recipient;
        row.payment = due;
        row.gasHyper = input.gasHyper;
        row.secretHash = input.secretHash;
        row.claimBefore = input.claimBefore;
        row.status = Status.Locked;
        emit Locked(fillId, msg.sender, due);
    }

    function preview(LockInput calldata input, address depositor) external view returns (bytes32) {
        bytes32 left = keccak256(
            abi.encode(
                keccak256(abi.encode(input.sourceChainId, input.source, input.position)),
                keccak256(abi.encode(input.exitUser, depositor, input.recipient))
            )
        );
        bytes32 right =
            keccak256(abi.encode(input.usdc, input.whype, input.secretHash, input.claimBefore, input.refundAfter));
        bytes32 extra =
            keccak256(abi.encode(input.gasElysium, input.gasHyper, input.nonce, input.quotedAt, input.direction, input.expectedBonus));
        return keccak256(abi.encode(left, right, extra, exitFeeBps, protocolFeeBps, block.chainid, address(this)));
    }

    function claim(bytes32 fillId, bytes32 secret) external {
        Lock storage row = locks[fillId];
        if (row.status != Status.Locked) revert BadStatus();
        if (block.timestamp >= row.claimBefore) revert Expired();
        if (keccak256(abi.encode(secret)) != row.secretHash) revert BadSecret();
        row.status = Status.Claimed;
        credit[row.recipient] += row.payment;
        if (row.gasHyper > 0) credit[msg.sender] += row.gasHyper;
        emit Claimed(fillId, row.recipient, row.payment);
    }

    function take() external { _take(msg.sender); }

    function takeFor(address beneficiary) external { _take(beneficiary); }

    function _take(address beneficiary) internal {
        uint256 amount = credit[beneficiary];
        if (amount == 0) revert BadStatus();
        credit[beneficiary] = 0;
        (bool ok,) = beneficiary.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function refund(bytes32 fillId) external {
        Lock storage row = locks[fillId];
        if (row.status != Status.Locked) revert BadStatus();
        if (msg.sender != row.depositor) revert NotDepositor();
        if (block.timestamp < row.claimBefore) revert TooEarly();
        row.status = Status.Refunded;
        credit[row.depositor] += row.payment + row.gasHyper;
        emit Refunded(fillId, row.depositor, row.payment);
    }
}
