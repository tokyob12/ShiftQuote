// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IShiftToken, LpPosition, LpFactory} from "./LpPosition.sol";
import {MatchFee} from "./MatchFee.sol";

/// @notice Elysium side of a community fill. One transaction pulls the exit
///         user's USDC and the LP's WHYPE. Settlement pays the quoted amounts.
///         Refund after `refundAfter` returns both assets. This contract cannot
///         see HyperEVM, so a claimed destination plus a late Elysium outage is
///         the known timing risk and is not a blanket refund promise.
///         A relayer may submit `fundFor` with the exit user's EIP-712 signature.
///         Quoted gas is paid from the same slice. Native settlement uses pull credits.
interface IWrappedMatch { function withdraw(uint256 amount) external; }
contract SourceMatch {
    address public admin;
    address public pendingAdmin;
    LpFactory public factory;
    uint256 public destinationChain;
    address public destination;
    uint64 public immutable campaignEnds;
    bool public paused;
    bool public nativePayouts;
    uint256 private entered;
    mapping(bytes32 => bool) public usedSecrets;
    mapping(address => uint256) public nativeCredit;
    modifier nonReentrant() {
        if (entered != 0) revert BadStatus();
        entered = 1;
        _;
        entered = 0;
    }
    modifier onlyAdmin() { if (msg.sender != admin) revert BadTerms(); _; }
    receive() external payable {
        if (address(factory) == address(0) || msg.sender != address(factory.whype())) revert BadTerms();
    }
    function configure(LpFactory next, uint256 chain, address target, bool native_) external onlyAdmin {
        if (address(factory) != address(0) || address(next.escrow()) != address(this)
            || chain == 0 || target == address(0)) revert BadTerms();
        factory = next;
        destinationChain = chain;
        destination = target;
        nativePayouts = native_;
    }
    function transferAdmin(address next) external onlyAdmin {
        if (next == address(0)) revert BadTerms();
        pendingAdmin = next;
    }
    function acceptAdmin() external {
        if (msg.sender != pendingAdmin) revert BadTerms();
        admin = msg.sender;
        pendingAdmin = address(0);
    }
    function setPaused(bool value) external onlyAdmin { paused = value; }
    function getFill(bytes32 id) external view returns (Fill memory) { return fills[id]; }
    function takeNative(address payable recipient) external nonReentrant {
        if (recipient == address(0)) revert BadTerms();
        uint256 amount = nativeCredit[msg.sender];
        if (amount == 0) revert BadStatus();
        nativeCredit[msg.sender] = 0;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
    function deliver(address beneficiary) external nonReentrant {
        uint256 amount = nativeCredit[beneficiary];
        if (amount == 0) revert BadStatus();
        nativeCredit[beneficiary] = 0;
        (bool ok,) = beneficiary.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    enum Status {
        None,
        Funded,
        Settled,
        Refunded
    }

    struct Fill {
        address position;
        address exitUser;
        address depositor;
        address recipient;
        uint256 usdc;
        uint256 whype;
        uint256 payment;
        uint256 depositorOut;
        uint256 lpBonus;
        uint256 shiftFee;
        uint256 gasElysium;
        address executor;
        bytes32 secretHash;
        uint64 claimBefore;
        uint64 refundAfter;
        Status status;
    }

    struct FundInput {
        address depositor;
        address recipient;
        uint256 usdc;
        uint256 whype;
        bytes32 secretHash;
        uint64 claimBefore;
        uint64 refundAfter;
        address exitUser;
        uint256 gasElysium;
        uint256 gasHyper;
        uint64 quotedAt;
        uint8 direction;
        uint256 nonce;
        uint256 expectedBonus;
    }

    uint256 public immutable exitFeeBps;
    uint256 public immutable protocolFeeBps;
    uint256 public immutable bonusBps;
    uint64 public immutable minGap;
    address public immutable treasury;
    uint256 public bonusRemaining;

    /// @dev Not public: a getter for every field overflows the compiler stack.
    mapping(bytes32 => Fill) internal fills;

    error BadTerms();
    error BadSecret();
    error BadStatus();
    error TooEarly();
    error Expired();
    error TransferFailed();

    event Funded(
        bytes32 indexed fillId, address indexed exitUser, address indexed position, uint256 usdc, uint256 whype
    );
    event Settled(bytes32 indexed fillId, uint256 depositorOut, uint256 lpBonus, uint256 shiftFee);
    event Refunded(bytes32 indexed fillId);

    constructor(
        address treasury_,
        uint256 exitFeeBps_,
        uint256 protocolFeeBps_,
        uint256 bonusBps_,
        uint64 minGap_,
        uint256 bonusCap_
    ) {
        if (treasury_ == address(0) || minGap_ == 0 || bonusCap_ == 0) revert BadTerms();
        if (protocolFeeBps_ == 0 || protocolFeeBps_ >= exitFeeBps_ || exitFeeBps_ >= 1_000) revert BadTerms();
        if (bonusBps_ > MatchFee.BPS) revert BadTerms();
        admin = msg.sender;
        campaignEnds = uint64(block.timestamp + 30 days);
        treasury = treasury_;
        exitFeeBps = exitFeeBps_;
        protocolFeeBps = protocolFeeBps_;
        bonusBps = bonusBps_;
        minGap = minGap_;
        bonusRemaining = bonusCap_;
    }

    function previewBonus(uint256 whype) public view returns (uint256) {
        if (block.timestamp >= campaignEnds) return 0;
        uint256 amount = MatchFee.protocolFee(whype, protocolFeeBps) * bonusBps / MatchFee.BPS;
        return amount > bonusRemaining ? bonusRemaining : amount;
    }

    function lpBonusOf(bytes32 fillId) external view returns (uint256) {
        return fills[fillId].lpBonus;
    }

    function shiftFeeOf(bytes32 fillId) external view returns (uint256) {
        return fills[fillId].shiftFee;
    }

    function hashFill(address position, address exitUser, FundInput calldata input) external view returns (bytes32) {
        return this.partHash(this.leftHash(position, exitUser, input.depositor, input.recipient), input);
    }

    function leftHash(address position, address exitUser, address depositor, address recipient)
        external
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                keccak256(abi.encode(block.chainid, address(this), position)),
                keccak256(abi.encode(exitUser, depositor, recipient))
            )
        );
    }

    function partHash(bytes32 left, FundInput calldata input) external view returns (bytes32) {
        return _join(left, _right(input), _extra(input));
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Shift Match"),
                keccak256("2"),
                block.chainid,
                address(this)
            )
        );
    }

    function fundDigest(bytes32 fillId) public view returns (bytes32) {
        bytes32 fundType = keccak256("Fund(bytes32 fillId)");
        return keccak256(abi.encodePacked(hex"1901", domainSeparator(), keccak256(abi.encode(fundType, fillId))));
    }

    function quoteDigest(address position, FundInput calldata input) external view returns (bytes32) {
        bytes32 id = this.hashFill(position, input.exitUser, input);
        return keccak256(abi.encodePacked(hex"1901", domainSeparator(),
            keccak256(abi.encode(keccak256("Quote(bytes32 fillId)"), id))));
    }

    function fund(LpPosition position, FundInput calldata input, bytes calldata quoteSig)
        external nonReentrant
        returns (bytes32 fillId)
    {
        if (input.exitUser != msg.sender) revert BadTerms();
        _check(position, input);
        _consumeQuote(position, input, quoteSig);
        return _open(position, input);
    }

    function fundFor(
        LpPosition position,
        FundInput calldata input,
        bytes calldata quoteSig,
        bytes calldata exitSig
    ) external nonReentrant returns (bytes32 fillId) {
        _check(position, input);
        bytes32 id = this.hashFill(address(position), input.exitUser, input);
        if (_recover(fundDigest(id), exitSig) != input.exitUser) revert BadTerms();
        _consumeQuote(position, input, quoteSig);
        return _open(position, input);
    }

    function _check(LpPosition position, FundInput calldata input) internal view {
        if (paused || address(factory) == address(0) || !factory.isPosition(address(position))
            || address(position.whype()) != address(factory.whype())
            || address(position.usdc()) != address(factory.usdc())
            || address(position.escrow()) != address(this)) revert BadTerms();
        if (input.exitUser == address(0) || input.depositor == address(0) || input.recipient == address(0)) {
            revert BadTerms();
        }
        if (input.secretHash == bytes32(0) || input.usdc == 0 || input.whype < 0.001 ether) revert BadTerms();
        if (usedSecrets[input.secretHash]) revert BadSecret();
        if (input.direction != 1) revert BadTerms();
        if (input.quotedAt > block.timestamp || block.timestamp - input.quotedAt > 10 minutes) revert BadTerms();
        if (input.claimBefore <= block.timestamp || input.refundAfter < input.claimBefore + minGap || input.refundAfter > block.timestamp + 1 days) revert BadTerms();
        if (input.gasElysium + MatchFee.protocolFee(input.whype, protocolFeeBps) >= input.whype) revert BadTerms();
    }

    function _open(LpPosition position, FundInput calldata input) internal returns (bytes32 fillId) {
        fillId = this.hashFill(address(position), input.exitUser, input);
        if (fills[fillId].status != Status.None) revert BadStatus();
        usedSecrets[input.secretHash] = true;
        _record(fillId, position, input);
        if (!position.usdc().transferFrom(input.exitUser, address(this), input.usdc)) revert TransferFailed();
        position.reserve(input.whype);
        emit Funded(fillId, input.exitUser, address(position), input.usdc, input.whype);
    }

    function _record(bytes32 fillId, LpPosition position, FundInput calldata input) internal {
        Fill storage fill = fills[fillId];
        fill.position = address(position);
        fill.exitUser = input.exitUser;
        fill.depositor = input.depositor;
        fill.recipient = input.recipient;
        fill.usdc = input.usdc;
        fill.whype = input.whype;
        fill.secretHash = input.secretHash;
        fill.claimBefore = input.claimBefore;
        fill.refundAfter = input.refundAfter;
        _writePrice(fillId, input.whype, input.gasElysium, input.expectedBonus);
    }

    function _writePrice(bytes32 fillId, uint256 whype, uint256 gasElysium, uint256 expectedBonus) internal {
        uint256 fee = MatchFee.protocolFee(whype, protocolFeeBps);
        uint256 bonus = block.timestamp < campaignEnds ? fee * bonusBps / MatchFee.BPS : 0;
        if (bonus > bonusRemaining) bonus = bonusRemaining;
        if (bonus != expectedBonus) revert BadTerms();
        uint256 payout = whype - fee - gasElysium;
        uint256 payment = MatchFee.payment(whype, exitFeeBps);
        if (payout == 0 || payment == 0) revert BadTerms();
        bonusRemaining -= bonus;
        Fill storage fill = fills[fillId];
        fill.payment = payment;
        fill.depositorOut = payout;
        fill.lpBonus = bonus;
        fill.shiftFee = fee - bonus;
        fill.gasElysium = gasElysium;
        fill.status = Status.Funded;
    }

    /// @notice Anyone may submit the secret. Recipients stay the ones stored at funding.
    function settle(bytes32 fillId, bytes32 secret) external nonReentrant {
        Fill storage fill = fills[fillId];
        if (fill.status != Status.Funded) revert BadStatus();
        if (block.timestamp >= fill.refundAfter) revert Expired();
        if (keccak256(abi.encode(secret)) != fill.secretHash) revert BadSecret();
        fill.executor = msg.sender;
        fill.status = Status.Settled;
        this.pay(fillId);
    }

    function pay(bytes32 fillId) external {
        if (msg.sender != address(this)) revert BadStatus();
        Fill storage fill = fills[fillId];
        LpPosition position = LpPosition(fill.position);
        uint256 usdcAmount = fill.usdc;
        address depositor = fill.depositor;
        uint256 payout = fill.depositorOut;
        uint256 bonus = fill.lpBonus;
        uint256 shiftFee = fill.shiftFee;
        uint256 gasPay = fill.gasElysium;
        address executor = fill.executor;
        if (!position.usdc().approve(address(position), usdcAmount)) revert TransferFailed();
        position.consume(fill.whype, usdcAmount);
        if (nativePayouts) {
            IWrappedMatch(address(position.whype())).withdraw(fill.whype);
            nativeCredit[depositor] += payout;
            nativeCredit[position.owner()] += bonus;
            nativeCredit[treasury] += shiftFee;
            nativeCredit[executor] += gasPay;
        } else {
            _push(position.whype(), depositor, payout);
            if (bonus > 0) _push(position.whype(), position.owner(), bonus);
            if (shiftFee > 0) _push(position.whype(), treasury, shiftFee);
            if (gasPay > 0) _push(position.whype(), executor, gasPay);
        }
        emit Settled(fillId, payout, bonus, shiftFee);
    }

    function refund(bytes32 fillId) external nonReentrant {
        Fill storage fill = fills[fillId];
        if (fill.status != Status.Funded) revert BadStatus();
        if (block.timestamp < fill.refundAfter) revert TooEarly();
        fill.status = Status.Refunded;
        bonusRemaining += fill.lpBonus;
        LpPosition position = LpPosition(fill.position);
        _push(position.usdc(), fill.exitUser, fill.usdc);
        _push(position.whype(), address(position), fill.whype);
        position.release(fill.whype);
        emit Refunded(fillId);
    }

    function _push(IShiftToken token, address to, uint256 amount) internal {
        if (!token.transfer(to, amount)) revert TransferFailed();
    }

    function _right(FundInput calldata input) internal pure returns (bytes32) {
        return keccak256(abi.encode(input.usdc, input.whype, input.secretHash, input.claimBefore, input.refundAfter));
    }

    function _extra(FundInput calldata input) internal pure returns (bytes32) {
        return keccak256(abi.encode(input.gasElysium, input.gasHyper, input.nonce, input.quotedAt, input.direction, input.expectedBonus));
    }

    function _join(bytes32 left, bytes32 right, bytes32 extra) internal view returns (bytes32) {
        return keccak256(abi.encode(left, right, extra, exitFeeBps, protocolFeeBps, destinationChain, destination));
    }

    function _consumeQuote(LpPosition position, FundInput calldata input, bytes calldata quoteSig) internal {
        if (_recover(this.quoteDigest(address(position), input), quoteSig) != position.signer()) revert BadTerms();
        position.consumeNonce(input.nonce);
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert BadTerms();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) revert BadTerms();
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) revert BadTerms();
        return recovered;
    }
}
