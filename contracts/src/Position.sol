// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IHyperCoreBook} from "./IHyperCoreBook.sol";

/// @notice One LP's inventory. Reserves are not shared with any other LP.
///         Stay and Pull run against whichever reader is attached. The Shift
///         legs only run when that reader is the scripted book, and the moved
///         base stays inside this contract on a scripted ledger.
contract Position {
    enum Location {
        Uninitialized,
        Quoted,
        Pulled,
        InTransit,
        OnCoreIdle,
        Resting
    }

    enum Decision {
        None,
        Stay,
        Pull,
        Shift
    }

    uint256 public constant BAND_BPS = 50;
    uint256 public constant MAX_SLICE_BPS = 2500;
    uint256 public constant BPS = 10_000;

    address public owner;
    address public base;
    address public quote;
    IHyperCoreBook public reader;

    bool public spotLinked;
    Location public location;
    Decision public lastDecision;
    uint256 public quotedMidX18;

    uint256 public elysiumBase;
    uint256 public elysiumQuote;
    uint256 public transitBase;
    uint256 public coreIdleBase;
    uint256 public restingBase;

    error NotOwner();
    error BadLocation();
    error NotScripted();
    error SpotNotLinked();
    error Slippage();
    error ZeroAmount();
    error TransferFailed();

    event Deposited(uint256 baseAmount, uint256 quoteAmount);
    event Evaluated(Decision decision, uint256 midX18);
    event Swapped(address indexed buyer, uint256 baseOut, uint256 usdcIn);
    event Shifted(uint256 slice);
    event Advanced(Location location);
    event Returned(uint256 amount);
    event SpotLinkSet(bool linked);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, address base_, address quote_, IHyperCoreBook reader_) {
        if (owner_ == address(0)) revert NotOwner();
        owner = owner_;
        base = base_;
        quote = quote_;
        reader = reader_;
    }

    function setSpotLinked(bool linked) external onlyOwner {
        spotLinked = linked;
        emit SpotLinkSet(linked);
    }

    /// @dev First deposit reads the book and starts Quoted at that mid.
    function deposit(uint256 baseAmount, uint256 quoteAmount) external onlyOwner {
        if (baseAmount == 0 && quoteAmount == 0) revert ZeroAmount();
        if (location != Location.Uninitialized && location != Location.Quoted && location != Location.Pulled) {
            revert BadLocation();
        }
        if (baseAmount > 0) {
            _pull(base, msg.sender, baseAmount);
            elysiumBase += baseAmount;
        }
        if (quoteAmount > 0) {
            _pull(quote, msg.sender, quoteAmount);
            elysiumQuote += quoteAmount;
        }
        if (location == Location.Uninitialized) {
            IHyperCoreBook.Snapshot memory snap = reader.read(elysiumBase);
            if (snap.midX18 == 0) revert ZeroAmount();
            quotedMidX18 = snap.midX18;
            location = Location.Quoted;
            lastDecision = Decision.Stay;
        }
        emit Deposited(baseAmount, quoteAmount);
    }

    /// @notice Reprices between Quoted and Pulled. Other locations revert.
    function evaluate() external returns (Decision decision) {
        if (location != Location.Quoted && location != Location.Pulled) revert BadLocation();
        IHyperCoreBook.Snapshot memory snap = reader.read(elysiumBase);
        decision = _decide(snap);
        if (decision == Decision.Pull) {
            location = Location.Pulled;
        } else {
            location = Location.Quoted;
            quotedMidX18 = snap.midX18;
        }
        lastDecision = decision;
        emit Evaluated(decision, snap.midX18);
    }

    /// @notice What `evaluate` would do. Reverts on a stale keeper snapshot.
    function preview()
        external
        view
        returns (Decision decision, uint256 midX18, uint256 slippageBps, uint64 timestamp)
    {
        if (location != Location.Quoted && location != Location.Pulled) {
            return (lastDecision, quotedMidX18, 0, 0);
        }
        IHyperCoreBook.Snapshot memory snap = reader.read(elysiumBase);
        return (_decide(snap), snap.midX18, snap.slippageBps, snap.timestamp);
    }

    /// @notice Buy `baseOut` of the base token at the quoted mid. Reverts unless Quoted.
    function swap(uint256 baseOut) external {
        if (location != Location.Quoted) revert BadLocation();
        if (baseOut == 0 || baseOut > elysiumBase) revert ZeroAmount();
        uint256 usdcIn = _usdcForBase(baseOut, quotedMidX18);
        if (usdcIn == 0) revert ZeroAmount();
        _pull(quote, msg.sender, usdcIn);
        elysiumQuote += usdcIn;
        elysiumBase -= baseOut;
        _push(base, msg.sender, baseOut);
        emit Swapped(msg.sender, baseOut, usdcIn);
    }

    /// @notice Moves 25% of the Elysium base onto the scripted in-transit ledger.
    function shift() external onlyOwner {
        _requireScripted();
        if (!spotLinked) revert SpotNotLinked();
        if (location != Location.Quoted && location != Location.Pulled) revert BadLocation();
        IHyperCoreBook.Snapshot memory snap = reader.read(elysiumBase);
        if (snap.slippageBps > BAND_BPS) revert Slippage();
        uint256 slice = elysiumBase * MAX_SLICE_BPS / BPS;
        if (slice == 0) revert ZeroAmount();
        elysiumBase -= slice;
        transitBase += slice;
        location = Location.InTransit;
        lastDecision = Decision.Shift;
        emit Shifted(slice);
    }

    /// @notice InTransit -> OnCoreIdle -> Resting. Scripted ledger only.
    function advanceScripted() external onlyOwner {
        _requireScripted();
        if (location == Location.InTransit) {
            if (transitBase == 0) revert ZeroAmount();
            coreIdleBase += transitBase;
            transitBase = 0;
            location = Location.OnCoreIdle;
        } else if (location == Location.OnCoreIdle) {
            if (coreIdleBase == 0) revert ZeroAmount();
            restingBase += coreIdleBase;
            coreIdleBase = 0;
            location = Location.Resting;
        } else {
            revert BadLocation();
        }
        emit Advanced(location);
    }

    /// @notice Returns every scripted-ledger token to the Elysium balance.
    function returnScripted() external onlyOwner {
        _requireScripted();
        uint256 amount = transitBase + coreIdleBase + restingBase;
        if (amount == 0) revert ZeroAmount();
        transitBase = 0;
        coreIdleBase = 0;
        restingBase = 0;
        elysiumBase += amount;
        location = Location.Quoted;
        lastDecision = Decision.Stay;
        emit Returned(amount);
    }

    function _decide(IHyperCoreBook.Snapshot memory snap) internal view returns (Decision) {
        if (snap.midX18 == 0 || quotedMidX18 == 0) revert ZeroAmount();
        uint256 deviation = _absDiff(snap.midX18, quotedMidX18) * BPS / quotedMidX18;
        if (deviation > BAND_BPS || snap.slippageBps > BAND_BPS) return Decision.Pull;
        return Decision.Stay;
    }

    function _requireScripted() internal view {
        if (!reader.isScripted()) revert NotScripted();
    }

    /// @dev midX18 is USDC per whole base token, scaled by 1e18. Quote token has 6 decimals.
    function _usdcForBase(uint256 baseOut, uint256 midX18) internal pure returns (uint256) {
        return baseOut * midX18 / 1e30;
    }

    function _absDiff(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a - b : b - a;
    }

    function _pull(address token, address from, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd, from, address(this), amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _push(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
