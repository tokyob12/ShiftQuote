export const deployments = {
  chainId: 99801,
  demoAsset: "0x35578CA58726E86BbFa10526dd7D571923ddD3d9",
  quote: "0xf0A6345093eA6f04768B3CfeaBf50b65A9a3F0c9",
  quoteSymbol: "mUSDC",
  quoteIsMock: true,
  scriptedBook: "0x3E6E2654Fb3ea12c5772Cc35284C7e226160B7e8",
  keeperBook: "0x52F59Cb79042Dfe6Fe7f12826180318CBb0a283d",
  position: "0x8e3dfb663603D5D21Bfd1BfE1BD470Da2b396815",
  faucet: "0x7E5B845DE6D74123cC0C2Bf36Aa3440f110C0A85",
  v2: {
    position: "0x46093Bb711fD739386D24DE2172a59606040aEd7",
    keeperBook: "0x96440aA2511Dc4457b9bbb1508F935cE40220Fc5",
    base: "0xCD57F65c2B0e5881CFC2E609F7CD53b746E1F234",
    baseSymbol: "WHYPE",
    spotCoin: "@107",
    hasRequote: false,
  },
} as const;
