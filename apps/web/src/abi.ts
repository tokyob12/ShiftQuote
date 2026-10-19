export const positionAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "reader", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "location", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "lastDecision", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "quotedMidX18", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "spotLinked", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "elysiumBase", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "elysiumQuote", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transitBase", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "coreIdleBase", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "restingBase", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "BAND_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "preview",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "decision", type: "uint8" },
      { name: "midX18", type: "uint256" },
      { name: "slippageBps", type: "uint256" },
      { name: "timestamp", type: "uint64" },
    ],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "baseAmount", type: "uint256" },
      { name: "quoteAmount", type: "uint256" },
    ],
    outputs: [],
  },
  { type: "function", name: "evaluate", stateMutability: "nonpayable", inputs: [], outputs: [{ type: "uint8" }] },
  {
    type: "function",
    name: "swap",
    stateMutability: "nonpayable",
    inputs: [{ name: "baseOut", type: "uint256" }],
    outputs: [],
  },
  { type: "function", name: "shift", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "advanceScripted", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "returnScripted", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "setSpotLinked",
    stateMutability: "nonpayable",
    inputs: [{ name: "linked", type: "bool" }],
    outputs: [],
  },
] as const;

export const bookAbi = [
  { type: "function", name: "isScripted", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "bidX18", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "askX18", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "slippageBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "postedAt", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] },
  {
    type: "function",
    name: "read",
    stateMutability: "view",
    inputs: [{ name: "size", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "bidX18", type: "uint256" },
          { name: "askX18", type: "uint256" },
          { name: "midX18", type: "uint256" },
          { name: "slippageBps", type: "uint256" },
          { name: "coreHeight", type: "uint64" },
          { name: "timestamp", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "set",
    stateMutability: "nonpayable",
    inputs: [
      { name: "bidX18_", type: "uint256" },
      { name: "askX18_", type: "uint256" },
      { name: "slippageBps_", type: "uint256" },
      { name: "coreHeight_", type: "uint64" },
    ],
    outputs: [],
  },
] as const;

export const faucetAbi = [
  {
    type: "function",
    name: "drip",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

export const erc20Abi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "minter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
