import { arbitrumSepolia } from "wagmi/chains"
import type { Address } from "viem"

// Deployed addresses from deployed-unified.json (Arb Sepolia — default chain)
export const CHAIN_ID = arbitrumSepolia.id

export const USDC_ADDRESS = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d" as Address
export const EXCHANGE_ADDRESS = "0xCEA1Ff3051DF8c6AeB1613726E33F9096897d90E" as Address

export const USDC_DECIMALS = 6

// Token addresses (same on all chains via CREATE2)
export const TOKEN_ADDRESSES: Record<string, Address> = {
  NVDA: "0xE9fDDe38E64771468885c173878B211DA71d1078",
  TSLA: "0xc60a1a5Af73F576FB4436C8BD0BD9E2379eae921",
  AMZN: "0x76B096A372c7E87F58dd94ec75f79182DC5e864F",
  META: "0x6e0d008Be276eC5e9b91DCB56B55Ea6A15Be96b3",
  AAPL: "0x2149bD489aaC80CAD09108A4D137ECDE76a5245f",
  GOOG: "0x1b265F2268D26bb8Bb463DA9048148C4185021b3",
}

export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

export const EXCHANGE_ABI = [
  {
    name: "buy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "usdcAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "sell",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "usdcAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "verifiedUsers",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getPrice",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const
