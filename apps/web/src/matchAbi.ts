export const sourceAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "treasury_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "exitFeeBps_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "protocolFeeBps_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "bonusBps_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minGap_",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "bonusCap_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "receive",
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "acceptAdmin",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "admin",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bonusBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bonusRemaining",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "campaignEnds",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "configure",
    "inputs": [
      {
        "name": "next",
        "type": "address",
        "internalType": "contract LpFactory"
      },
      {
        "name": "chain",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "target",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "native_",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deliver",
    "inputs": [
      {
        "name": "beneficiary",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "destination",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "destinationChain",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "domainSeparator",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "exitFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "factory",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract LpFactory"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "fund",
    "inputs": [
      {
        "name": "position",
        "type": "address",
        "internalType": "contract LpPosition"
      },
      {
        "name": "input",
        "type": "tuple",
        "internalType": "struct SourceMatch.FundInput",
        "components": [
          {
            "name": "depositor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "usdc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "whype",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "secretHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "claimBefore",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "refundAfter",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "exitUser",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "gasElysium",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "gasHyper",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quotedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "direction",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "expectedBonus",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "quoteSig",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "fundDigest",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "fundFor",
    "inputs": [
      {
        "name": "position",
        "type": "address",
        "internalType": "contract LpPosition"
      },
      {
        "name": "input",
        "type": "tuple",
        "internalType": "struct SourceMatch.FundInput",
        "components": [
          {
            "name": "depositor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "usdc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "whype",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "secretHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "claimBefore",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "refundAfter",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "exitUser",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "gasElysium",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "gasHyper",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quotedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "direction",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "expectedBonus",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "quoteSig",
        "type": "bytes",
        "internalType": "bytes"
      },
      {
        "name": "exitSig",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getFill",
    "inputs": [
      {
        "name": "id",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct SourceMatch.Fill",
        "components": [
          {
            "name": "position",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "exitUser",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "depositor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "usdc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "whype",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "payment",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "depositorOut",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lpBonus",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "shiftFee",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "gasElysium",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "executor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "secretHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "claimBefore",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "refundAfter",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "status",
            "type": "uint8",
            "internalType": "enum SourceMatch.Status"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hashFill",
    "inputs": [
      {
        "name": "position",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "exitUser",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "input",
        "type": "tuple",
        "internalType": "struct SourceMatch.FundInput",
        "components": [
          {
            "name": "depositor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "usdc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "whype",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "secretHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "claimBefore",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "refundAfter",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "exitUser",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "gasElysium",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "gasHyper",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quotedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "direction",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "expectedBonus",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "leftHash",
    "inputs": [
      {
        "name": "position",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "exitUser",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "depositor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lpBonusOf",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "minGap",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nativeCredit",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nativePayouts",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "partHash",
    "inputs": [
      {
        "name": "left",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "input",
        "type": "tuple",
        "internalType": "struct SourceMatch.FundInput",
        "components": [
          {
            "name": "depositor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "usdc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "whype",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "secretHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "claimBefore",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "refundAfter",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "exitUser",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "gasElysium",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "gasHyper",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quotedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "direction",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "expectedBonus",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pay",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "pendingAdmin",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewBonus",
    "inputs": [
      {
        "name": "whype",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteDigest",
    "inputs": [
      {
        "name": "position",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "input",
        "type": "tuple",
        "internalType": "struct SourceMatch.FundInput",
        "components": [
          {
            "name": "depositor",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "usdc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "whype",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "secretHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "claimBefore",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "refundAfter",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "exitUser",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "gasElysium",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "gasHyper",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quotedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "direction",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "expectedBonus",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "refund",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPaused",
    "inputs": [
      {
        "name": "value",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settle",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "secret",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "shiftFeeOf",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "takeNative",
    "inputs": [
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address payable"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "transferAdmin",
    "inputs": [
      {
        "name": "next",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usedSecrets",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Funded",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "exitUser",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "position",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "usdc",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "whype",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Refunded",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Settled",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "depositorOut",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "lpBonus",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "shiftFee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BadSecret",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadStatus",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadTerms",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Expired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TooEarly",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  }
] as const;
export const destAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "exitFeeBps_",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "protocolFeeBps_",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "claim",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "secret",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "credit",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "exitFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "lock",
    "inputs": [
      {
        "name": "input",
        "type": "tuple",
        "internalType": "struct DestMatch.LockInput",
        "components": [
          {
            "name": "sourceChainId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "source",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "position",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "exitUser",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "usdc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "whype",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "secretHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "claimBefore",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "refundAfter",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "gasElysium",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "gasHyper",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quotedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "direction",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "expectedBonus",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "payable"
  },
  {
    "type": "function",
    "name": "locks",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "depositor",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "recipient",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "payment",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "gasHyper",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "secretHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "claimBefore",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum DestMatch.Status"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "preview",
    "inputs": [
      {
        "name": "input",
        "type": "tuple",
        "internalType": "struct DestMatch.LockInput",
        "components": [
          {
            "name": "sourceChainId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "source",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "position",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "exitUser",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "recipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "usdc",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "whype",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "secretHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "claimBefore",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "refundAfter",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "gasElysium",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "gasHyper",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nonce",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "quotedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "direction",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "expectedBonus",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "depositor",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolFeeBps",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "refund",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "take",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "takeFor",
    "inputs": [
      {
        "name": "beneficiary",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Claimed",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "recipient",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "payment",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Locked",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "depositor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "payment",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Refunded",
    "inputs": [
      {
        "name": "fillId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "depositor",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "payment",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BadSecret",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadStatus",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BadTerms",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Expired",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotDepositor",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TooEarly",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  }
] as const;
export const positionAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "owner_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "whype_",
        "type": "address",
        "internalType": "contract IShiftToken"
      },
      {
        "name": "usdc_",
        "type": "address",
        "internalType": "contract IShiftToken"
      },
      {
        "name": "escrow_",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "acceptOwnership",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "available",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "consume",
    "inputs": [
      {
        "name": "whypeAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "usdcAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "consumeNonce",
    "inputs": [
      {
        "name": "nonce",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "escrow",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "invalidateQuotes",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "maxFill",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "maxReserved",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "owner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingOwner",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "quoteNonce",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "release",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reserve",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reserved",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setLimits",
    "inputs": [
      {
        "name": "perFill",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "totalReserved",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setPaused",
    "inputs": [
      {
        "name": "paused_",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setSigner",
    "inputs": [
      {
        "name": "next",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "signer",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "transferOwnership",
    "inputs": [
      {
        "name": "next",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "usdc",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IShiftToken"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usdcEarned",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "whype",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IShiftToken"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "withdraw",
    "inputs": [
      {
        "name": "whypeAmount",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "usdcAmount",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "event",
    "name": "Consumed",
    "inputs": [
      {
        "name": "whypeAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "usdcAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Deposited",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PauseSet",
    "inputs": [
      {
        "name": "paused",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Released",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Reserved",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SignerSet",
    "inputs": [
      {
        "name": "signer",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Withdrawn",
    "inputs": [
      {
        "name": "whypeAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "usdcAmount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "BadNonce",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Insufficient",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotEscrow",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotOwner",
    "inputs": []
  },
  {
    "type": "error",
    "name": "Paused",
    "inputs": []
  },
  {
    "type": "error",
    "name": "TransferFailed",
    "inputs": []
  }
] as const;
export const factoryAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "escrow_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "whype_",
        "type": "address",
        "internalType": "contract IShiftToken"
      },
      {
        "name": "usdc_",
        "type": "address",
        "internalType": "contract IShiftToken"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "create",
    "inputs": [],
    "outputs": [
      {
        "name": "position",
        "type": "address",
        "internalType": "contract LpPosition"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "escrow",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isPosition",
    "inputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "usdc",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IShiftToken"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "whype",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IShiftToken"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "Created",
    "inputs": [
      {
        "name": "position",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "owner",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "NotOwner",
    "inputs": []
  }
] as const;
