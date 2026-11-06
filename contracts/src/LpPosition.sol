// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IShiftToken {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice One community LP. Available WHYPE can be withdrawn. Reserved WHYPE
///         stays until the Match escrow settles or refunds the fill.
///         The quote signer is not this contract. Only the owner withdraws.
contract LpPosition {
    address public immutable owner;
    IShiftToken public immutable whype;
    IShiftToken public immutable usdc;
    address public immutable escrow;

    address public signer;
    uint256 public quoteNonce;
    uint256 public available;
    uint256 public reserved;
    uint256 public usdcEarned;
    bool public paused;

    error NotOwner();
    error NotEscrow();
    error Paused();
    error Insufficient();
    error BadNonce();
    error TransferFailed();

    event Deposited(uint256 amount);
    event Withdrawn(uint256 whypeAmount, uint256 usdcAmount);
    event Reserved(uint256 amount);
    event Released(uint256 amount);
    event Consumed(uint256 whypeAmount, uint256 usdcAmount);
    event PauseSet(bool paused);
    event SignerSet(address signer);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert NotEscrow();
        _;
    }

    constructor(address owner_, IShiftToken whype_, IShiftToken usdc_, address escrow_) {
        if (owner_ == address(0) || escrow_ == address(0)) revert NotOwner();
        owner = owner_;
        signer = owner_;
        whype = whype_;
        usdc = usdc_;
        escrow = escrow_;
    }

    /// @notice The signer can price a fill. Withdrawal stays with the owner.
    function setSigner(address next) external onlyOwner {
        if (next == address(0)) revert NotOwner();
        signer = next;
        emit SignerSet(next);
    }

    function consumeNonce(uint256 nonce) external onlyEscrow {
        if (nonce != quoteNonce) revert BadNonce();
        quoteNonce += 1;
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PauseSet(paused_);
    }

    function deposit(uint256 amount) external onlyOwner {
        if (amount == 0) revert Insufficient();
        available += amount;
        _pull(whype, msg.sender, amount);
        emit Deposited(amount);
    }

    /// @notice Withdraws only WHYPE that is not reserved, and USDC already earned.
    function withdraw(uint256 whypeAmount, uint256 usdcAmount) external onlyOwner {
        if (whypeAmount > available || usdcAmount > usdcEarned) revert Insufficient();
        available -= whypeAmount;
        usdcEarned -= usdcAmount;
        if (whypeAmount > 0) _push(whype, owner, whypeAmount);
        if (usdcAmount > 0) _push(usdc, owner, usdcAmount);
        emit Withdrawn(whypeAmount, usdcAmount);
    }

    function reserve(uint256 amount) external onlyEscrow {
        if (paused) revert Paused();
        if (amount == 0 || amount > available) revert Insufficient();
        available -= amount;
        reserved += amount;
        _push(whype, escrow, amount);
        emit Reserved(amount);
    }

    /// @notice Accounting only. The escrow sends the WHYPE back in the same transaction.
    function release(uint256 amount) external onlyEscrow {
        if (amount > reserved) revert Insufficient();
        reserved -= amount;
        available += amount;
        emit Released(amount);
    }

    function consume(uint256 whypeAmount, uint256 usdcAmount) external onlyEscrow {
        if (whypeAmount > reserved) revert Insufficient();
        reserved -= whypeAmount;
        usdcEarned += usdcAmount;
        if (usdcAmount > 0) _pull(usdc, escrow, usdcAmount);
        emit Consumed(whypeAmount, usdcAmount);
    }

    function _pull(IShiftToken token, address from, uint256 amount) internal {
        if (!token.transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _push(IShiftToken token, address to, uint256 amount) internal {
        if (!token.transfer(to, amount)) revert TransferFailed();
    }
}

/// @notice Each LP calls this and receives a position only they own.
contract LpFactory {
    address public immutable escrow;
    IShiftToken public immutable whype;
    IShiftToken public immutable usdc;

    event Created(address indexed position, address indexed owner);

    constructor(address escrow_, IShiftToken whype_, IShiftToken usdc_) {
        if (escrow_ == address(0)) revert LpPosition.NotOwner();
        escrow = escrow_;
        whype = whype_;
        usdc = usdc_;
    }

    function create() external returns (LpPosition position) {
        position = new LpPosition(msg.sender, whype, usdc, escrow);
        emit Created(address(position), msg.sender);
    }
}
