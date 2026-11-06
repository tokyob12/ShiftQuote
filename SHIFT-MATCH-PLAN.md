# Shift Desk + Match + Community LP

Plan-e yekparche — 5 November 2026

## 1. Mahsul va hade MVP

Karbar USDC rooye Elysium dare va HYPE rooye HyperEVM mikhad. App baraye kole masir ye quote mide. Yek LP az community, WHYPE-e Elysium ro tamin mikone. Yek depositor HYPE rooye HyperEVM dare va HYPE rooye Elysium mikhad. Do karbar va LP sharayet-e yek fill ro ghabool mikonan.

Masir-e pilot USDC-e Elysium be native HYPE-e HyperEVM ast. Har fill yek exit-user, yek LP va yek depositor dare. Daftare quote mitune chand LP dashte bashe, vali har fill az yek position inventory migire. Karbar mitune amount-e pishnahadi-e koochiktar ro joda ghabool kone. Split-e yek order beyn-e chand LP baraye marhale-ye baad mimoone.

Hadaf-e moatabar baraye karbar yek minimum-e daryafti, hazine-ye roshan va refund-e darayi-e avvalie baraye fill-e anjam-nashode ast. Har do chain transaction va confirmation-e khodeshun ro daran. Pooshesh-e refund be sharayet-e timeout, finality va dastresi-e chain ke dar bakhsh-e 6 oomade vabaste ast.

## 2. Vaziyat-e repo dar shoroo

- PositionV2 mojudi-e har LP ro joda negah midare, owner-only deposit/withdraw dare va dar swap snapshot ro check mikone. Quote-e deploy-shode mUSDC ast. Reserve-e quote, factory-e LP, spread-e daramadzai va tasviye-ye tarkibi bayad ezafe beshan.
- KeeperBook sen-e post ro check mikone. Keeper ask-side ro baraye size-e pishfarz-e 10 HYPE hesab mikone. Ghadam-e badi bayad source timestamp, asset, direction va size-e quote ro ham bind kone.
- ElysiumMatch, HyperMatch, MatchFee, UI-e Match, watcher va test-e local dar repo hastan. Match-e alan native HYPE-be-HYPE ast. deployments/match.json har do address ro sefr neveshte. In file dalil-e deployment-e vaghei nemide.
- HyperMatch.lock alan ba reserveId-e adadi key mishe. Baraye noskhe-ye jadid bayad order identity va depositor-e emzakonande bind beshan ta kas-e digar natune yek ID ro ba lock-e na-monaseb eshghal kone.
- commit-e ElysiumMatch faghat hyperTimeout < reserveDeadline ro check mikone. Minimum-e fasele-ye amn beyn-e timeout-ha bayad enforce beshe.
- pilot-gate.ts alan CLI ro ba fillsByAddress-e khali va feeWei-e sefr ejra mikone. Baraye tasmim-e mahsul bayad be receipt-ha va data-ye taghaza vasl beshe.
- elysp-count.ts va data-ye zakhire-shode, shoroo-ye benchmark-an. State code, timestamp, version-e contract va mapping-e do leg ghabl az natije-giri validate beshan.

Source-ha baraye implementer:

- [PositionV2](/Users/arashbagherigolroodbari/Documents/Elysium/contracts/src/PositionV2.sol)
- [ElysiumMatch](/Users/arashbagherigolroodbari/Documents/Elysium/contracts/src/ElysiumMatch.sol)
- [HyperMatch](/Users/arashbagherigolroodbari/Documents/Elysium/contracts/src/HyperMatch.sol)
- [KeeperBook](/Users/arashbagherigolroodbari/Documents/Elysium/contracts/src/KeeperBook.sol)
- [Pilot gate](/Users/arashbagherigolroodbari/Documents/Elysium/keeper/src/pilot-gate.ts)

## 3. Naghsh-ha va masir-e pool

**Exit-user** USDC rooye Elysium mide va minimum-e native HYPE rooye HyperEVM ro entekhab mikone.

**Community LP** WHYPE rooye Elysium mizare. Dar fill-e moafagh, WHYPE mifrooshe va USDC migire. Bakhsh-e reserve-shode ta settle ya refund dar taahod mimune.

**Depositor** HYPE-e HyperEVM ro dar escrow lock mikone. Ba settlement, HYPE-e Elysium migire. Bonus-e u az ekhtelaf-e amount-ha miad va bayad ba gas-e khodesh moghayese beshe.

**Shift** quote-ha ro match mikone, UI va watcher ro mide, va az fill-e settled fee migire. Sarmaye-ye WHYPE az LP va HYPE-e HyperEVM az depositor miad. LP-e bishtar zarfiat-e Desk ro ziad mikone. Match hamchenan voroodi-e HyperEVM mikhad.

## 4. Hesabdari va fee ba adad-e sarih

Tamame adad-e in bakhsh farzi va parameter-e pilot-an.

U = USDC-ye pardakhti-e exit-user.
Q = WHYPE-i ke LP baraye U quote dade.
x = takhfif-e khorooj, mesalan 20 bps.
f = fee-e protocol, mesalan 5 bps.
X = floor(Q * x / 10000).
F = floor(Q * f / 10000).
P = Q - X, HYPE-ye exit-user rooye HyperEVM.
G_E = hazine-ye quoted-e relayer rooye Elysium.
G_H = hazine-ye quoted-e relayer rooye HyperEVM.
D = Q - F - G_E, HYPE-ye depositor rooye Elysium.

Depositor rooye HyperEVM P + G_H lock mikone. Exit-user P ro migire. Relayer-e maghsad G_H ro migire. Dar Elysium, D be depositor, G_E be relayer va F be hesab-e fee mire. Hazine-ye transaction-i ke wallet khodesh mide ham dar moghayese-ye quote neshun dade mishe.

**Mesal-e asli ba G_E = G_H = 0** — U = 800 USDC, Q = 10 WHYPE, x = 20 va f = 5. Exit-user 9.98 HYPE migire. Depositor 9.98 HYPE mide va 9.995 HYPE migire. F = 0.005 HYPE. LP 800 USDC migire. Mojoodi-e WHYPE-e LP 10 kam mishe.

**Mesal-e gas** — agar G_E = 0.0003 HYPE va G_H = 0, depositor 9.9947 HYPE migire. Bonus-e u 0.0147 HYPE ghabl az gas-e transaction-e lock-e khodeshe. Majmoo-e D + G_E + F hamishe Q ast.

U/Q gheymat-e all-in-e LP ast va spread-e LP dakhel-e hamin gheymat gharaar migire. Mesal-e 800/10 be tanhayi sood-e LP ro sabet nemikone. Cost basis, taghir-e gheymat, gas va hazine-ye taghziye-ye dobare-ye inventory dar natije-ye LP moassere.

Mablagh-ha dar contract ba integer-e smallest unit hesab mishan. USDC-e taidshode 6 decimal va WHYPE/HYPE 18 decimal dare. MinOut-e har taraf az hamin calculation miad. Amount-e dust, output-e sefr, overflow va budget-e gas-e bishtar az output reject mishan. Rounding dar do chain va UI bayad az yek spec biad.

## 5. Tajrobe-ye karbar va LP

### Exit-user

1. USDC amount, HyperEVM recipient, minimum-e HYPE va mohlat-e entezar ro entekhab mikone.
2. App quote-e LP, fee-e Match, gas-e do chain, HYPE-ye nahayi va moh­lat-e freeze-e quote ro neshun mide.
3. Ta vaghti LP va depositor-e moshakhas peyda nashodan, intent mishe laghv beshe va pool dar wallet mimune.
4. Vaghti taraf-ha amade-an, user taahod-e source ro taid mikone. USDC va WHYPE dar escrow-e Elysium ghofl mishan.
5. Pas az verify-e lock-e HyperEVM, claim ra anjam mide. UI status-e har do leg ro neshun mide.
6. Dar expire-e mojad, refund-e USDC az safhe-ye recovery anjam mishe. Gas-e masraf-shode joda hesab mishe.

### Depositor

1. Amount-e HYPE, Elysium recipient va minimum-e daryafti ro mizane.
2. App daryafti-ye net-e Match va daryafti-ye canonical-e hamoon amount ro neshun mide.
3. User source escrow va taahod-e LP ro check mikone, bad lock-e HyperEVM ro taid mikone.
4. HYPE-e Elysium ba claim-e relayer ya khodesh be address-e fixed-e u mire.
5. Age exit-user ta mohlat claim nakone, refund-e HYPE-e HyperEVM faal mishe.

### Community LP

1. Wallet vasl mikone va position-e standard-e khodesh ro misaze.
2. WHYPE deposit mikone. Native HYPE mitune ba wrapper-e verified dar hamin flow wrap beshe.
3. Saghf-e har fill, saghf-e kole reserved, spread-e minimum va tol-e reservation ro moshakhas mikone.
4. Dashboard available WHYPE, reserved WHYPE, USDC-e daryafti, bonus-e LP va mark-to-market-e position ro joda neshun mide.
5. Pool-e azad ro mitune bardare. Pause-e LP quote-haye jadid ro mibande. Taahod-e fill-haye ghabli bayad anjam beshe.
6. LP ba USDC-e jam-shode mitune khodesh WHYPE bekhare va top-up kone. Noskhe-ye baadi mitune rebalance-e opt-in ezafe kone.

P&L-e LP bayad ba holding-e hamoon inventory-e avvalie moghayese beshe. Daryafti-e USDC-e forush, revenue-e bonus va sood-e khales label-e joda daran. APR faghat ba data-ye realized va time window-e roshan namayesh dade beshe.

## 6. Tasviye-ye do chain va moh­lat-ha

Spec-e pishnahadi baraye testnet az hashlock ba escrow-e do-chain estefade mikone. Secret dar wallet-e exit-user sakhte mishe. Backend faghat hash ro migire. Har fill secret-e jadid dare.

State-e Elysium az Draft be Funded va baad be Settled ya Refunded mire. State-e HyperEVM az Unfunded be Locked va baad be Claimed ya Refunded mire. Status-e UI az har do chain sakhte mishe.

1. **Quote va emza.** Exit-user, LP va depositor amount-ha, recipient-ha, hash va expiry-ha ro ghabool mikonan.
2. **Source funding.** Dar yek transaction-e Elysium, USDC az user va WHYPE az available-e position be escrow-e fill mire. Agar har kodam fail shod, hame-ye transaction revert mishe. U hanooz be LP credited nashode.
3. **Verification va destination funding.** Depositor source code/address, filled amounts, named parties, hash va deadlines ro mostaghim verify mikone. Pas az sat'h-e confirmation-e pishfarz, P + G_H rooye HyperEVM lock mishe.
4. **Destination claim.** Exit-user hamin fields va amount-e lock ro dobare check mikone. Pas az taid-e finality-e lazem va ba fasele-ye amn az expiry, secret ro baraye claim-e P rooye HyperEVM reveal mikone. Receiver az aval fixed ast.
5. **Source settlement.** Secret ke az claim dide mishe, settle-e Elysium ro baz mikone. USDC be credit-e LP mire. WHYPE unwrap mishe va D, G_E va F be beneficiary-haye fixed credited mishan.
6. **Refund.** Agar HyperEVM claim ta T_H anjam nashod, depositor payment ro pas migire. Agar Elysium settle ta T_E anjam nashod, USDC be exit-user va WHYPE be position-e LP bargardoonde mishe.

T_E bayad az T_H be andaze-ye buffer-e kafi bozorgtar bashe. Buffer shamel finality-e HyperEVM, observation delay, retry budget, Elysium inclusion va clock skew ast. Contract minimum-e in fasele ro enforce mikone. QuoteAcceptUntil, FundBy, ClaimBefore-e UI, T_H va T_E maani-ye joda daran. Window-e 5 daghighe baraye peyda kardan-e match, timeout-e amniati ro tayin nemikone.

Mainnet parameter-e finality va timeout ba azmayesh-e RPC/inclusion va review tayin mishe. Data-ye soft-confirmed-e sequencer, batch-e finalized rooye parent va assertion-e finalized sat'h-haye mokhtalef-an. Docs-e Arbitrum latencies-e Ethereum ro mesal mizane. In adad-ha bayad baraye HyperEVM/Elysium andaze-giri beshan. [Arbitrum finality](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/finality)

**Had-e guarantee** — refund-e original asset faghat baraye state-e mojad ast. Agar user payment-e HyperEVM ro claim karde bashe vali Elysium bishtar az buffer az dastres kharej bemune, dar HTLC risk-e unfair settlement vojud dare. Hamchenin secret-i ke dar transaction-e revert-shode ya reorg-shode afsha shode mitune leg-e dige ro baz kone. Early cutoff, finality policy va recovery executor in risk ro mahdood mikonan. In failure model bayad ghabl az mainnet ba review-e mostaghel ghabool ya design eslah beshe. Eddeaye refund-e bedoon-e shart dar UI majaz nist.

Claim/refund permissionless call mishe vali beneficiary az data-ye emzashode miad. Gas bounty be executor-e vaghei ke function ro ejra mikone credited mishe, ta front-run-e ejra natune receiver-e asli ro avaz kone. Failed native transfer bayad credit-e ghabele claim ro hefz kone. Fee credit ham bayad settlement ro az revert-e treasury joda kone. UI credit-e claimable va balance-e received ro joda neshun mide.

Reveal-e secret yek authorization-e hassase. UI ghabl az har reveal va simulation, lock-e HyperEVM ro verify mikone. Secret ro be logging, analytics, URL ya RPC-e public-e simulation nemifereste. Backup-e recovery encrypted va user-controlled ast. Ghom shodan-e secret ghabl az claim be expire/refund monjar mishe.

## 7. Order identity va concurrency

Har fill ye hash-e domain-separated az version, do chainId, do escrow address, position address, token-ha, amount-ha, har do recipient, depositor, LP, secretHash, nonce va timeout-ha dare. EIP-712 baraye emzaha estefade beshe. Lock-e parent bayad signature-haye parties va named depositor ro validate kone. Kas-e digar ba ID-ye adadi ya fields-e avazshode natune trade ro eshghal kone.

Har quote yekbar funded mishe. Har fill yekbar settle ya refund mishe. Reserved inventory dar samte position az available kam mishe. Har fill state-e mostaghel dare ta settlement-e yek fill baqie-ye position ro nabande. Do tab, restart-e keeper, duplicate event va repeated tx bayad be haman natije beresan.

Quote-e fixed baraye LP risk-e option misaze. Saghf-e amount, expiry-e koochak, maximum-e concurrent reservation va authentication-e depositor baraye MVP lazem-an. Replay-e market bayad zarar-e reservation-e expired dar noosan ro ham besanje. Agar griefing geran shod, bond-e depositor ba design-e claim/refund-e review-shode dar marhale-ye baadi barresi beshe.

## 8. Gheymat va data

Price service snapshot-e HyperCore HYPE/USDC ba source timestamp va direction-e dorost migire. Baraye forush-e WHYPE-e LP, hazine-ye jaygozin kardan-e base az ask-side baraye hamoon size moheme. Quote-e LP size, mojudi, spread va risk-e reservation ro dar nazar migire.

Market ID va token mapping bayad az metadata verify beshan. Data-ye kohne, depth-e nakafi ya fee budget-e manfi quote ro reject mikone. KeeperBook-e alan size ro nadide migire. Ba haman adad-e 10 HYPE baraye hame-ye order-ha quote nadim.

Quote-e indicative har chand sanie refresh mishe. Quote-e executable ba inventory-e LP va signature/taahod-e on-chain reserve mishe. Baad az funding, price update ya pause-e keeper nabayad minOut-e fill-e accepted ro avaz kone. Dar mainnet, address va decimals va behavior-e USDC/WHYPE verify beshe. Token-e test faghat ba label-e testnet dar demo estefade mishe.

## 9. Moshavegh-e LP va daramad-e Shift

Daramad-e asli-e LP spread-e quote ast. Baraye bootstrap, pishnahad 20% az F-e har fill-e settled be LP-e haman fill ast. Bonus az fee-ye haman fill funded mishe. Parameters dar quote hash bind mishan.

Dar mesal F = 0.005 HYPE, bonus = 0.001 HYPE va baqie = 0.004 HYPE. Hazine-ye protocol va partner az baqie hesab mishan. Dar pilot referral share pishfarz sefr ast. Agar partner share ghabool shod, kole shares bayad ba F reconcile beshe.

Pishfarz-e azmayeshi bonus 30 rooz ba cap-e 1 HYPE baraye kole campaign ast. Adad-ha config-e pilot-an. Dar funding, bonus-e maximum-e haman fill az campaign budget reserve mishe. Dar settle pardakht va dar refund azad mishe. Fill-haye accepted bonus-e emzashode ro migiran, hatta agar campaign baadan baste beshe. Quote-haye jadid bad az tamoom shodan-e cap bonus-e sefr neshun midan.

Padashe deposit, volume-e kham ya tx count nadashtan. Har payout be fee-ye vasool-shode mahdood ast. Same-address trades va self-routing ro filter kon, vali wallet-haye joda ro proof-e user-e mostaghel hesab nakon. Hatta dar self-trade, bonus nabayad az fee-ha va hazine-i ke haman actor pardakhte bishtar beshe. Paid-pilot metrics az trade-haye team va subsidized activity joda beshan.

Baraye LP hazine-ye gas, inventory conversion va zarar-e quote-e kohne ro sabt kon. Baraye Shift net contribution = F - LP bonus - partner share - gas-e subsidized - retry cost - marginal infra. RPC, monitoring, security review va support hazine-ye sabet ya operating-e joda-an.

Ba $200k fill-e vaghei dar rooz va 5 bps, gross fee $100 ast. Ba 20% bonus, $80 ghabl az hazine-ha mimoone. In ye scenario-ye hesabdari ast. Ba volume-e roozane-ye daghigh va darayi-ye reference-e moshakhas dashboard besaz.

## 10. Contract-ha va reuse

**Desk position + factory.** Yek implementation-e standard ba owner-e har LP, available/reserved inventory, quote nonce, limit-ha va withdraw-e available. Inventory-e reserved vaghean be escrow-e fill mire. Position dar reserve ledger saghf va claim ro sabt mikone. Wallet-e LP ya signer-e mahdood quote ro emza mikone. Signer-e quote ejaze-ye withdraw nadare.

**ElysiumMatch.** Barebone-e reserve/settle/refund-e feli ro baraye do asset-e USDC va WHYPE takmil kon. Source funding be position-e registered mahdood ast. Balances-e owed, fee credit va bonus budget bar asas har fill hesab mishan. Unwrap faghat az wrapper-e allowlisted anjam mishe. Refund-e tarkibi USDC va WHYPE ro be malek-e avvalie mide.

**HyperMatch.** Hash-e kamel-e fill, depositor-e named, payment va gas cap ro enforce kone. Secret claim-e payment ro baz mikone. Bad az timeout, refund be depositor mire. Recipient-ha az payam-e emzashode gerefte mishan.

**MatchFee.** Yek specification-e rounding baraye do contract va helper-e frontend. Golden-vector test bayad amount-ha ro daghighan motabegh kone.

Reentrancy guard, safe ERC20 transfers, zero-address/code checks va checks-effects-interactions dar masir-e custody lazem-an. Pause be new funding va quote generation emal beshe. Recovery-e taahod-haye existing bayad dar dastres bashe. Administrator ejaze-ye avaz kardan-e beneficiary-e fill-e funded ro nadare.

## 11. UI, API va operation

Safhe-ha Exit, Deposit, Provide Liquidity va Activity/Recovery-an. Form-e karbar amount, destination va minimum receive ro migire. Quote-breakdown dar hamoon safhe available ast. Quote-e tasviye-nashode va output-e daryaft-shode label-e joda daran.

SDK-e aval yek quote request, build transaction, get status va recovery helper dare. Quote request asset/chain/amount/recipient/minOut/deadline ro migire. Response quoteId, full terms, net outputs, gas payer, expiry va executable capacity mide. Match service bar asas behtarin net outcome ba quote-e motabar route ro entekhab mikone.

Watcher-e feli health-check-e yek-daghighei dare. Claim executor-e jadid bayad block/event ro ba polling-e fallback donbal kone. Confirmation policy, retry ba idempotency, nonce management, restart recovery va alternate RPC lazeme. Hazine-ye polling dar budget-e infra hesab beshe.

Event indexer block hash va log index ro zakhire mikone, reorg ro rollback va do leg ro ba fill hash jor mikone. Alarm-ha source/destination lock-e na-hamahang, expiry-e nazdik, claim credit-e deliver-nashode, low gas va liabilities-e bishtar az balances-an. Data-ye recovery az state-e chain bazsazi beshe.

## 12. Test-ha va meyar-e amniat

- Conservation baraye USDC, WHYPE/native HYPE, LP inventory, fee va bonus ba har sequence-e deposit/reserve/settle/refund/withdraw.
- Na ghabele settle va refund boodan-e hamzaman-e yek fill. No reuse-e secret va nonce dar fill-e dige.
- Maker, depositor, LP, chain, token ya amount-e eshtebah dar signature rad beshe. Lock squatting va replay rad beshe.
- LP withdrawal faghat available ro masraf kone. Partial settlement-e ye fill taahod-e fill-e dige ro naghire.
- No match ghabl az lock, depositor missing bad az source lock, exit-user missing bad az destination lock, claim ghabl/rooye/baad az boundary.
- Har do chain ba clock-e mostaghel simulate beshan. Reorg, delay, relay outage va recovery az restart test beshe.
- Secret dar failed claim ya reorg-shode, gap-e na-kafi va chain downtime-e toolani be onvan-e failure model reproduce beshan. Risk-e hal-nashode mainnet gate ro mibande.
- LP quote expired/cancelled, stale feed, bad decimals, insufficient USDC, fee dust, paused token, failed native receiver va reentrancy.
- Campaign cap, concurrent funding, refund-e reserved bonus, rounding va self-trade economics.
- E2E ba wallet-haye joda va relayer, se senario-ye success/refund/stalled recovery. Balance-e wallet va claimable credit dar do chain ba receipt-ha reconcile beshe.
- Local tests ba mock ArbSys faghat mantegh-e local ro mipoo­shoonan. Timing va finality bayad rooye do network-e test joda ham sanjide beshan.

## 13. Demo-ye bartari nesbat be ElysP

Demo az amount-e yeksan-e USDC-e Elysium shoroo mishe va ba native HYPE dar HyperEVM tamoom mishe. Benchmark, behtarin quote-e local swap + ElysP OTC ya route-e yekparche-ye raghib ast agar available bood. Hamoon amount, lahze, minOut va gas convention ro estefade kon.

Neshun bede chand HYPE vaghean daryaft shod, chand emza lazem bood, cheghadr zaman ta receipt-e parent va ta settlement-e har do leg gozasht, va dar failure che darayie ghabele refund shod. No-offer ro joda sabt kon. Median faghat rooye successful fills selection bias dare. Darsad-e fail/timeout ro ham report kon.

ElysP rooye safhe-ye barresi-shode HYPE-be-HYPE, partial fill, reservation, auto-settle va 3% fee ro neshun mide. Data-ye safhe be tanhayi quality-e execution ro sabet nemikone. [ElysP OTC](https://otc.elysp.com/)

## 14. Milestone-ha va tahvil-ha

Zaman-bandi rooye in list nist. Coder faghat Arash ast. Hassan Samimi rooye Twitter faal ast va kar-e fanni-e contract ya UI nadarad. Har chizi ke bedune mainnet sakhte mishavad alan sakhte mishavad. In-ha mimanand baraye vaghti mainnet-e rasmi bala ast: address-e vaghei-e USDC va WHYPE, andaze-ye finality, review-e mostaghel, deploy-e mainnet, va LP-e pool-e omumi.

[x] M0 — schema-ye fill, fasele-ye minimum-e `refundAfter` va `claimBefore`, va masir-e settle/refund dar contract-e local.
[x] M1 — factory va position-e LP. Available va reserved joda hastand. Withdraw faqat available ast. Do LP dar test joda mimanand.
[x] M2 — yek transaction rooye Elysium USDC-e karbar va WHYPE-e LP ra migirad. HyperEVM faqat depositor-e haman fill ra ghofl mikonad. Refund-e asl-e darayi baad az `refundAfter` ast.
[x] M3 — fee-e 20 va 5 bps, bonus-e 20 darsad az haman fee, va saghf-e hesabi-e 1 HYPE. Fill-e baadi baad az saghf bonus-e sefr darad. Float-e joda nist.
[ ] M4 — safhe-haye Exit, Deposit, LP va Recovery.
[ ] M5 — deploy-e testnet-e do chain. In deploy be kelid-e deployer niyaz darad va ta amade-shodan-e contract-ha anjam nemishavad.
[ ] Mainnet — address, finality, review, va LP-e omumi.

Bakhsh-haye bala rooye test-e Foundry sabt shode-and. `shift()` hanooz Match ra shoru nemikonad.

## 15. Validation-e 14 rooze, movazi ba sakht

In kar-e outreach ast, na code. Hassan rooye Twitter ba wallet va LP harf mizane. Replay va 30 darkhast-e staging vaghti safhe-ye testnet amade shod anjam mishavad, bedune taqvim-e sakht.

Rooz 4–7, replay-e flow-e zamani ba 5% va 10% share-e voroodi anjam mishe. Size va USDC-to-HYPE intent-ha joda sabt mishan. Sum-e saat be saat faghat ceiling-e volume mide. Replay har HYPE ro yek bar masraf mikone.

Rooz 8–14, quote-e labelled azmayeshi ro dar staging neshun bede. 30 darkhast-e independently submitted hadaf-e avalie ast. Duplicate-wallet, team activity va campaign traffic ro tag kon. Interview-e enseraf-ha va data-ye LP baraye quote freeze moheman.

Meyar-e edame-ye research, yek partner-e pilot, yek LP-e amade, bonus-e depositor baad az gas mosbat, contribution-e modeled-e Shift mosbat, va coverage-e ghabele ghabool dar sahm-e 5% ast. Hadaf-e farzi 70% coverage dar 5 daghighe baraye size-e entekhab-shode ast. In metric baraye matching ast va delivery/settlement latency joda andaze gerefte mishe.

Agar inventory-e LP kafi ast vali depositor nist, efzayesh-e bonus-e LP moshkel ro hal nemikone. Agar LP dar quote-haye kootah ham zarar mikone, spread va reservation window ro eslah kon. Agar daramad-e 5bps pas az hazine manfie, tariff ya minimum size ro ghabl az scale avaz kon.

## 16. Pilot-e mainnet va shart-e scale

Token addresses, chain IDs, contract bytecode, timeout/finality parameters, maximum fill, maximum in-flight inventory va daily relayer gas budget bayad ghabl az mainnet ba maghadir-e moatabar set beshan. Har parameter-e unresolved launch gate ro mibande.

Independent settlement review, closure-e critical/high findings, verified contracts va recovery rehearsal shart-e pilot-e pool-e vagheie. Pilot ba yek LP va cap-e opt-in shoroo mishe. Public LP creation pas az azmayesh-e factory, withdrawal va reserve isolation baz mishe.

Saghf-e pool bar asas exposure-i ke LP va users explicit ghabool mikonan tayin mishe. Daily report gross fee, LP bonus, gas, net contribution, fail rate va time-in-escrow mide. Hadeaghal 5 karbar-e repeat ba 2 fill dar 30 rooz, yek partner-e active va LP-e top-up-konande signal-e edame-an. Poole test ya self-trade be demand-e mainnet tabdil namishe.

Meyar-e afzayesh-e cap, settlement-e moatabar dar stress-e test-shode, contribution-e realized-e mosbat, va LP return-e ghabele ghabool pas az inventory changes ast. Raqabat ba ElysP ba receipt-ha va quote-haye hamzaman sanjide mishe.

## 17. Hazine va masooliat-e team

Coder-e team Arash ast. Hassan Samimi rooye Twitter kar mikonad: sohbat ba wallet va LP, va post. Ou contract, indexer, ya deploy ra barname-nevisi nemikonad.

Hazine-ye baghi-mande RPC, VPS, gas-e relayer, va review-e mostaghel ast. USDC va WHYPE-e test in hazine ra hazf nemikonad. Sarmaye-ye LP az mojoudi-e team joda ast. Kelid-e deploy dast-e Arash mimanad.

## 18. Definition of Done

- [ ] LP-e community position-e khodesh ro besaze, WHYPE deposit va available ro withdraw kone.
- [ ] Har quote har do net output, fee, LP spread convention, gas payer va deadline ro neshun bede.
- [ ] User ba USDC-e Elysium, HYPE-e HyperEVM ro dar fill-e successful begire.
- [ ] LP USDC, depositor HYPE-e Elysium va Shift fee ro daghighan motabegh-e quote begiran.
- [ ] Refund-e mojad original asset-ha ro bargardoone va cost-e gas ro joda report kone.
- [ ] Fill/claim/reward hichvaght dobar masraf nashe va reserved inventory hamzaman withdraw nashe.
- [ ] Bonus-e LP faghat az fee-e settled va dar cap-e reserved pardakht beshe.
- [ ] Recovery dar outage-e keeper az wallet/relayer-e dige ejra beshe.
- [ ] Finality, secret leakage va timeout assumptions review va dar UI moaser reflect beshan.
- [ ] Benchmark-e HYPE-ye khales, matching wait, settlement time va failed intents available bashe.
- [ ] Partner va LP-e vaghei willingness-e pilot ro taid konan.
- [ ] Launch gates va addresses az state-e chain verify beshan.

Manba-ye messaging baraye joziyat-e retryable va address aliasing. [Arbitrum parent-to-child messaging](https://docs.arbitrum.io/how-arbitrum-works/deep-dives/l1-to-l2-messaging)
