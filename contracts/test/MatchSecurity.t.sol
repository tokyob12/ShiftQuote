// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {CommunityMatchTest} from "./CommunityMatch.t.sol";
import {SourceMatch} from "../src/SourceMatch.sol";
import {DestMatch} from "../src/DestMatch.sol";
import {DemoAsset} from "../src/DemoAsset.sol";
import {IShiftToken,LpPosition,LpFactory} from "../src/LpPosition.sol";

contract TestWrappedHype is DemoAsset {
 constructor() DemoAsset(address(this)) {}
 function deposit() external payable { this.mint(msg.sender,msg.value); }
 function withdraw(uint256 amount) external {
  balanceOf[msg.sender]-=amount;totalSupply-=amount;
  (bool ok,)=msg.sender.call{value:amount}("");require(ok);
 }
}
contract FakePositionForRegression {
 address public escrow;
 constructor(address target){escrow=target;}
}
contract MatchSecurityTest is CommunityMatchTest {
 function test_adminTransferRequiresNamedAcceptance() public {
  source.transferAdmin(lpA);
  vm.prank(stranger);vm.expectRevert(SourceMatch.BadTerms.selector);source.acceptAdmin();
  vm.prank(lpA);source.acceptAdmin();
  assertEq(source.admin(),lpA);
  vm.expectRevert(SourceMatch.BadTerms.selector);source.setPaused(true);
 }
 function test_lpOwnerTransferChangesSignerAndInvalidatesQuotes() public {
  uint256 nonce=lp1.quoteNonce();
  vm.prank(lpA);lp1.transferOwnership(lpB);
  vm.prank(stranger);vm.expectRevert(LpPosition.NotOwner.selector);lp1.acceptOwnership();
  vm.prank(lpB);lp1.acceptOwnership();
  assertEq(lp1.owner(),lpB);assertEq(lp1.signer(),lpB);assertEq(lp1.quoteNonce(),nonce+1);
  vm.prank(lpA);vm.expectRevert(LpPosition.NotOwner.selector);lp1.withdraw(1 ether,0);
 }
 function test_unregisteredPositionIsRejected() public {
  bytes32 secret=bytes32(uint256(90));
  uint64 t=uint64(block.timestamp+1 hours);
  LpPosition fake=LpPosition(address(new FakePositionForRegression(address(source))));
  SourceMatch.FundInput memory order=_order(lp1,exit,Q,keccak256(abi.encode(secret)),t,t+1 hours);
  vm.prank(exit);vm.expectRevert(SourceMatch.BadTerms.selector);
  source.fund(fake,order,"");
 }
 function test_lpSignatureBindsRefundDeadline() public {
  uint64 t=uint64(block.timestamp+1 hours);
  SourceMatch.FundInput memory order=_order(lp1,exit,Q,keccak256(abi.encode(bytes32(uint256(91)))),t,t+1 hours);
  bytes memory sig=_sign(lp1,order);
  order.refundAfter+=1 hours;
  vm.prank(exit);vm.expectRevert(SourceMatch.BadTerms.selector);
  source.fund(lp1,order,sig);
 }
 function test_lpSignatureBindsGasAndDepositor() public {
  uint64 t=uint64(block.timestamp+1 hours);
  SourceMatch.FundInput memory order=_order(lp1,exit,Q,keccak256(abi.encode(bytes32(uint256(92)))),t,t+1 hours);
  bytes memory sig=_sign(lp1,order);
  order.gasElysium=1 ether;order.depositor=stranger;
  vm.prank(exit);vm.expectRevert(SourceMatch.BadTerms.selector);
  source.fund(lp1,order,sig);
 }
 function test_longReservationRejectedEvenWhenSigned() public {
  uint64 t=uint64(block.timestamp+1 hours);
  SourceMatch.FundInput memory order=_order(lp1,exit,Q,keccak256(abi.encode(bytes32(uint256(93)))),t,t+3650 days);
  bytes memory sig=_sign(lp1,order);
  vm.prank(exit);vm.expectRevert(SourceMatch.BadTerms.selector);
  source.fund(lp1,order,sig);
 }
 function test_destinationRefundIncludesUnusedGas() public {
  bytes32 secret=bytes32(uint256(94));uint64 t=uint64(block.timestamp+1 hours);
  SourceMatch.FundInput memory order=_order(lp1,exit,Q,keccak256(abi.encode(secret)),t,t+1 hours);
  order.gasHyper=0.01 ether;
  bytes32 id=_submit(lp1,order);
  DestMatch.LockInput memory lockOrder=_lockOrder(lp1,exit,Q,order.secretHash,t,t+1 hours);
  lockOrder.gasHyper=order.gasHyper;
  vm.deal(depositor,10 ether);vm.prank(depositor);
  assertEq(dest.lock{value:9.99 ether}(lockOrder),id);
  vm.warp(t);vm.prank(depositor);dest.refund(id);
  assertEq(dest.credit(depositor),9.99 ether);
  dest.takeFor(depositor);assertEq(address(dest).balance,0);
 }
 function test_destinationDeploymentIsBoundToFillId() public {
  (bytes32 id,bytes32 secret)=_fund(lp1,Q);
  DestMatch other=new DestMatch(20,5);
  DestMatch.LockInput memory order=_lockOrder(lp1,exit,Q,keccak256(abi.encode(secret)),uint64(block.timestamp+1 hours),uint64(block.timestamp+2 hours));
  assertTrue(id!=other.preview(order,depositor));
 }
 function test_secretReuseRejected() public {
  (,bytes32 secret)=_fund(lp1,Q);
  uint64 t=uint64(block.timestamp+1 hours);
  SourceMatch.FundInput memory order=_order(lp1,exit,Q,keccak256(abi.encode(secret)),t,t+1 hours);
  bytes memory sig=_sign(lp1,order);
  vm.prank(exit);vm.expectRevert(SourceMatch.BadSecret.selector);
  source.fund(lp1,order,sig);
 }
 function test_bonusEndsAfterThirtyDays() public {
  vm.warp(block.timestamp+30 days);
  (bytes32 id,)=_fund(lp1,Q);
  assertEq(source.lpBonusOf(id),0);
 }
 function test_lpLimitsRestrictReservation() public {
  vm.prank(lpA);lp1.setLimits(1 ether,2 ether);
  bytes32 hash=keccak256(abi.encode(bytes32(uint256(95))));
  uint64 t=uint64(block.timestamp+1 hours);
  SourceMatch.FundInput memory order=_order(lp1,exit,Q,hash,t,t+1 hours);
  bytes memory sig=_sign(lp1,order);
  vm.prank(exit);vm.expectRevert(LpPosition.Insufficient.selector);
  source.fund(lp1,order,sig);
 }
 function test_nativeSettlementAndPermissionlessDelivery() public {
  TestWrappedHype wrapped=new TestWrappedHype();
  source=new SourceMatch(treasury,20,5,2000,1 hours,1 ether);
  factory=new LpFactory(address(source),IShiftToken(address(wrapped)),IShiftToken(address(usdc)));
  source.configure(factory,block.chainid,address(dest),true);
  vm.startPrank(lpA);lp1=factory.create();vm.stopPrank();
  vm.deal(lpA,20 ether);
  vm.startPrank(lpA);wrapped.deposit{value:20 ether}();wrapped.approve(address(lp1),20 ether);lp1.deposit(20 ether);vm.stopPrank();
  vm.prank(exit);usdc.approve(address(source),type(uint256).max);
  (bytes32 id,bytes32 secret)=_fund(lp1,Q);_lock(id,secret,lp1,Q);
  dest.claim(id,secret);source.settle(id,secret);
  assertEq(source.nativeCredit(depositor),9.995 ether);
  source.deliver(depositor);assertEq(depositor.balance,10 ether-9.98 ether+9.995 ether);
  assertEq(source.nativeCredit(depositor),0);
  assertEq(lp1.usdcEarned(),USDC);
 }
}
