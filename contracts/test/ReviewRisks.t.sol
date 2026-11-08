// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {CommunityMatchTest} from "./CommunityMatch.t.sol";
import {DestMatch} from "../src/DestMatch.sol";
import {SourceMatch} from "../src/SourceMatch.sol";
contract ReviewClaimForwarder {
    function forward(DestMatch dest,bytes32 id,bytes32 secret) external {dest.claim(id,secret);}
}
/// Diagnostic probes: passing means the observed risky behavior exists, not that it is safe.
contract ReviewRisks is CommunityMatchTest {
    function testReview_ClaimedDestinationCanStillRefundSourceAfterOutage() public {
        (bytes32 id,bytes32 secret)=_fund(lp1,Q);_lock(id,secret,lp1,Q);
        dest.claim(id,secret);vm.prank(exit);dest.take();
        vm.warp(source.getFill(id).refundAfter);source.refund(id);
        assertEq(exit.balance,9.98 ether);assertEq(usdc.balanceOf(exit),10_000e6);
        assertEq(whype.balanceOf(depositor),0);assertEq(lp1.usdcEarned(),0);
        assertEq(uint256(source.getFill(id).status),uint256(SourceMatch.Status.Refunded));
    }
    function testReview_SourceCanSettleWithoutAnyDestinationLock() public {
        (bytes32 id,bytes32 secret)=_fund(lp1,Q);source.settle(id,secret);
        assertEq(whype.balanceOf(depositor),9.995 ether);assertEq(lp1.usdcEarned(),USDC);
        (,,,,,,DestMatch.Status status)=dest.locks(id);assertEq(uint256(status),0);
        assertEq(usdc.balanceOf(exit),10_000e6-USDC);assertEq(exit.balance,0);
    }
    function testReview_ClaimViaForwarderEmitsRealDestinationClaim() public {
        (bytes32 id,bytes32 secret)=_fund(lp1,Q);_lock(id,secret,lp1,Q);
        ReviewClaimForwarder relay=new ReviewClaimForwarder();relay.forward(dest,id,secret);
        (,,,,,,DestMatch.Status status)=dest.locks(id);assertEq(uint256(status),uint256(DestMatch.Status.Claimed));
        assertEq(dest.credit(exit),9.98 ether);
    }
}
