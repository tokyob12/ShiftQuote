// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MatchFee} from "./MatchFee.sol";

interface IArbSys {
    function sendTxToL1(address destination, bytes calldata data) external payable returns (uint256);
}

/// @notice Elysium half of Shift Match. An exit user locks native HYPE here.
///         A depositor reserves a named slice. The exit user commits a fresh
///         hash for that slice. The secret revealed on HyperMatch releases the
///         slice to that depositor. This contract does not call PositionV2, and
///         it does not settle through a bridge message.
///         `fallbackUnreserved` sends only the unreserved remainder to L1.
contract ElysiumMatch {
    enum ReserveStatus {
        None,
        Reserved,
        Committed,
        Released,
        Reclaimed
    }

    struct Offer {
        address maker;
        uint256 remaining;
        uint256 reserved;
        uint64 expiry;
        bool open;
    }

    struct Reserve {
        uint256 offerId;
        address depositor;
        uint256 amount;
        bytes32 secretHash;
        uint64 reserveDeadline;
        uint64 hyperTimeout;
        ReserveStatus status;
    }

    uint256 public immutable exitFeeBps;
    uint256 public immutable protocolFeeBps;
    address public immutable treasury;
    address public immutable arbSys;
    uint64 public immutable reserveWindow;

    uint256 public nextOfferId = 1;
    uint256 public nextReserveId = 1;
    /// @notice HYPE still owed to live reserves. Fallback must leave at least this much.
    uint256 public reservedLiabilities;

    mapping(uint256 => Offer) public offers;
    mapping(uint256 => Reserve) public reserves;
    mapping(bytes32 => bool) public hashUsed;

    error BadFee();
    error BadWindow();
    error ZeroAmount();
    error Dust();
    error NotMaker();
    error NotOpen();
    error Expired();
    error TooEarly();
    error BadStatus();
    error BadSecret();
    error HashUsed();
    error TransferFailed();

    event OfferOpened(
        uint256 indexed offerId, address indexed maker, uint256 amount, uint64 expiry
    );
    event OfferCancelled(uint256 indexed offerId, uint256 amount);
    event Reserved(
        uint256 indexed reserveId,
        uint256 indexed offerId,
        address indexed depositor,
        uint256 amount,
        uint64 reserveDeadline
    );
    event Committed(uint256 indexed reserveId, bytes32 secretHash, uint64 hyperTimeout);
    event Released(
        uint256 indexed reserveId, address indexed depositor, uint256 payout, uint256 fee
    );
    event Reclaimed(uint256 indexed reserveId, uint256 amount);
    event UnreservedFallback(uint256 indexed offerId, address indexed l1Recipient, uint256 amount);

    constructor(
        address treasury_,
        address arbSys_,
        uint256 exitFeeBps_,
        uint256 protocolFeeBps_,
        uint64 reserveWindow_
    ) {
        if (treasury_ == address(0) || arbSys_ == address(0)) {
            revert BadFee();
        }
        if (protocolFeeBps_ == 0 || protocolFeeBps_ >= exitFeeBps_ || exitFeeBps_ >= 1_000) {
            revert BadFee();
        }
        if (reserveWindow_ < 5 minutes || reserveWindow_ > 1 days) revert BadWindow();
        treasury = treasury_;
        arbSys = arbSys_;
        exitFeeBps = exitFeeBps_;
        protocolFeeBps = protocolFeeBps_;
        reserveWindow = reserveWindow_;
    }

    function quote(uint256 slice)
        external
        view
        returns (uint256 depositorPays, uint256 depositorReceives, uint256 fee)
    {
        fee = MatchFee.protocolFee(slice, protocolFeeBps);
        depositorReceives = slice - fee;
        depositorPays = MatchFee.payment(slice, exitFeeBps);
    }

    function openOffer(uint64 expiry) external payable returns (uint256 offerId) {
        if (msg.value < 0.001 ether) revert Dust();
        if (expiry < block.timestamp + reserveWindow || expiry > block.timestamp + 7 days) {
            revert BadWindow();
        }
        offerId = nextOfferId++;
        offers[offerId] = Offer({
            maker: msg.sender, remaining: msg.value, reserved: 0, expiry: expiry, open: true
        });
        emit OfferOpened(offerId, msg.sender, msg.value, expiry);
    }

    /// @notice Returns the unreserved remainder to the maker on Elysium.
    function cancel(uint256 offerId) external {
        Offer storage offer = offers[offerId];
        if (msg.sender != offer.maker) revert NotMaker();
        uint256 amount = offer.remaining;
        if (amount == 0) revert ZeroAmount();
        offer.remaining = 0;
        if (offer.reserved == 0) offer.open = false;
        _send(offer.maker, amount);
        emit OfferCancelled(offerId, amount);
    }

    function reserve(uint256 offerId, uint256 amount) external returns (uint256 reserveId) {
        Offer storage offer = offers[offerId];
        if (!offer.open) revert NotOpen();
        if (block.timestamp >= offer.expiry) revert Expired();
        if (amount < 0.001 ether || amount > offer.remaining) revert Dust();
        uint64 deadline = uint64(block.timestamp) + reserveWindow;
        if (deadline > offer.expiry) deadline = offer.expiry;
        if (deadline <= block.timestamp + 1 minutes) revert BadWindow();
        offer.remaining -= amount;
        offer.reserved += amount;
        reservedLiabilities += amount;
        reserveId = nextReserveId++;
        reserves[reserveId] = Reserve({
            offerId: offerId,
            depositor: msg.sender,
            amount: amount,
            secretHash: bytes32(0),
            reserveDeadline: deadline,
            hyperTimeout: 0,
            status: ReserveStatus.Reserved
        });
        emit Reserved(reserveId, offerId, msg.sender, amount, deadline);
    }

    /// @notice The maker binds a fresh secret hash. One revealed secret cannot open another slice.
    function commit(uint256 reserveId, bytes32 secretHash, uint64 hyperTimeout) external {
        Reserve storage reservation = reserves[reserveId];
        Offer storage offer = offers[reservation.offerId];
        if (msg.sender != offer.maker) revert NotMaker();
        if (reservation.status != ReserveStatus.Reserved || reservation.secretHash != bytes32(0)) {
            revert BadStatus();
        }
        if (secretHash == bytes32(0) || hashUsed[secretHash]) revert HashUsed();
        if (hyperTimeout <= block.timestamp || hyperTimeout >= reservation.reserveDeadline) {
            revert BadWindow();
        }
        hashUsed[secretHash] = true;
        reservation.secretHash = secretHash;
        reservation.hyperTimeout = hyperTimeout;
        reservation.status = ReserveStatus.Committed;
        emit Committed(reserveId, secretHash, hyperTimeout);
    }

    /// @notice Anyone may submit the secret. The HYPE is paid to the named depositor.
    function release(uint256 reserveId, bytes32 secret) external {
        Reserve storage reservation = reserves[reserveId];
        if (reservation.status != ReserveStatus.Committed) revert BadStatus();
        if (block.timestamp >= reservation.reserveDeadline) revert Expired();
        if (keccak256(abi.encode(secret)) != reservation.secretHash) revert BadSecret();
        Offer storage offer = offers[reservation.offerId];
        reservation.status = ReserveStatus.Released;
        offer.reserved -= reservation.amount;
        reservedLiabilities -= reservation.amount;
        if (offer.remaining == 0 && offer.reserved == 0) offer.open = false;
        uint256 fee = MatchFee.protocolFee(reservation.amount, protocolFeeBps);
        uint256 payout = reservation.amount - fee;
        emit Released(reserveId, reservation.depositor, payout, fee);
        _send(reservation.depositor, payout);
        _send(treasury, fee);
    }

    /// @notice After the reserve deadline the slice returns to the unreserved remainder.
    function reclaim(uint256 reserveId) external {
        Reserve storage reservation = reserves[reserveId];
        if (
            reservation.status != ReserveStatus.Reserved
                && reservation.status != ReserveStatus.Committed
        ) {
            revert BadStatus();
        }
        if (block.timestamp < reservation.reserveDeadline) revert TooEarly();
        Offer storage offer = offers[reservation.offerId];
        reservation.status = ReserveStatus.Reclaimed;
        offer.reserved -= reservation.amount;
        offer.remaining += reservation.amount;
        reservedLiabilities -= reservation.amount;
        emit Reclaimed(reserveId, reservation.amount);
    }

    /// @notice Canonical withdrawal of HYPE no live reserve has a claim on.
    function fallbackUnreserved(uint256 offerId, address l1Recipient) external {
        Offer storage offer = offers[offerId];
        if (msg.sender != offer.maker) revert NotMaker();
        if (l1Recipient == address(0)) revert ZeroAmount();
        uint256 amount = offer.remaining;
        if (amount == 0) revert ZeroAmount();
        offer.remaining = 0;
        if (offer.reserved == 0) offer.open = false;
        emit UnreservedFallback(offerId, l1Recipient, amount);
        IArbSys(arbSys).sendTxToL1{value: amount}(l1Recipient, "");
    }

    function _send(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
