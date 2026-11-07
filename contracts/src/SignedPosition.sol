// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {PositionV2} from "./PositionV2.sol";
import {IHyperCoreBook} from "./IHyperCoreBook.sol";

/// @notice Desk policy with per-action signed snapshots instead of periodic keeper writes.
/// Existing PositionV2 deployments are unaffected. The HyperCore inventory leg remains scripted.
contract SignedPosition is PositionV2 {
    struct Quote {
        uint8 action; // 1 swap, 2 deposit, 3 evaluate, 4 requote, 5 shift
        address caller;
        uint256 size;
        uint256 bidX18;
        uint256 askX18;
        uint256 slippageBps;
        uint64 coreHeight;
        uint64 observedAt;
        uint64 validUntil;
        uint256 epoch;
        bytes32 nonce;
    }
    bytes32 public constant QUOTE_TYPEHASH = keccak256("Quote(uint8 action,address caller,uint256 size,uint256 bidX18,uint256 askX18,uint256 slippageBps,uint64 coreHeight,uint64 observedAt,uint64 validUntil,uint256 epoch,bytes32 nonce)");
    address public quoteSigner;
    uint256 public signerEpoch;
    mapping(bytes32 => bool) public usedQuotes;
    bool private active;
    address private activeCaller;
    IHyperCoreBook.Snapshot private current;
    error SignedQuoteRequired();
    error InvalidSignedQuote();
    event QuoteSignerSet(address signer, uint256 epoch);

    constructor(address owner_,address base_,address quote_,address signer_)
        PositionV2(owner_,base_,quote_,IHyperCoreBook(address(0))) {
        if(signer_==address(0))revert InvalidSignedQuote();
        quoteSigner=signer_;
    }
    function setQuoteSigner(address signer_) external onlyOwner {
        if(signer_==address(0))revert InvalidSignedQuote();
        quoteSigner=signer_;signerEpoch++;emit QuoteSignerSet(signer_,signerEpoch);
    }
    function invalidateSignedQuotes() external onlyOwner { signerEpoch++; }
    function quoteDigest(Quote calldata q) public view returns(bytes32) {
        bytes32 domain=keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),keccak256("Shift Signed Desk"),keccak256("1"),block.chainid,address(this)));
        return keccak256(abi.encodePacked("\x19\x01",domain,keccak256(abi.encode(QUOTE_TYPEHASH,q))));
    }
    modifier signed(Quote calldata q,bytes calldata signature,uint8 action,uint256 size) {
        if(active||q.caller!=msg.sender||q.action!=action||q.size!=size||q.epoch!=signerEpoch||q.nonce==bytes32(0)||q.bidX18==0||q.askX18<q.bidX18||q.askX18>type(uint128).max||q.observedAt>block.timestamp||block.timestamp-q.observedAt>15||q.validUntil<block.timestamp||q.validUntil<q.observedAt||q.validUntil-q.observedAt>15)revert InvalidSignedQuote();
        bytes32 digest=quoteDigest(q);
        if(usedQuotes[digest]||signature.length!=65)revert InvalidSignedQuote();
        bytes32 r;bytes32 s;uint8 v;
        assembly{r:=calldataload(signature.offset) s:=calldataload(add(signature.offset,32)) v:=byte(0,calldataload(add(signature.offset,64)))}
        if(uint256(s)>0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0||(v!=27&&v!=28)||ecrecover(digest,v,r,s)!=quoteSigner)revert InvalidSignedQuote();
        usedQuotes[digest]=true;active=true;activeCaller=msg.sender;
        current=IHyperCoreBook.Snapshot(q.bidX18,q.askX18,(q.bidX18+q.askX18)/2,q.slippageBps,q.coreHeight,q.observedAt);
        _;
        delete current;active=false;activeCaller=address(0);
    }
    function swapSigned(uint256 amount,uint256 maxUsdc,Quote calldata q,bytes calldata signature) external signed(q,signature,1,amount) returns(bool){return super.swap(amount,maxUsdc);}
    function depositSigned(uint256 baseAmount,uint256 quoteAmount,Quote calldata q,bytes calldata signature) external signed(q,signature,2,baseAmount){super.deposit(baseAmount,quoteAmount);}
    function evaluateSigned(Quote calldata q,bytes calldata signature) external signed(q,signature,3,elysiumBase) returns(Decision){return super.evaluate();}
    function requoteSigned(Quote calldata q,bytes calldata signature) external signed(q,signature,4,elysiumBase) returns(uint256){return super.requote();}
    function shiftSigned(Quote calldata q,bytes calldata signature) external signed(q,signature,5,elysiumBase){super.shift();}
    function _read(uint256) internal view override returns(IHyperCoreBook.Snapshot memory){if(!active||msg.sender!=activeCaller)revert SignedQuoteRequired();return current;}
    // Prevent callbacks or direct calls from reusing a primed snapshot with other amounts.
    function swap(uint256,uint256) public pure override returns(bool){revert SignedQuoteRequired();}
    function deposit(uint256,uint256) public pure override {revert SignedQuoteRequired();}
    function evaluate() public pure override returns(Decision){revert SignedQuoteRequired();}
    function requote() public pure override returns(uint256){revert SignedQuoteRequired();}
    function shift() public pure override {revert SignedQuoteRequired();}
}
