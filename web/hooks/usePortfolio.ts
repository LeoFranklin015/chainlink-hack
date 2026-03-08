"use client"

import { useState, useEffect, useCallback } from "react"
import { useAccount } from "wagmi"
import { querySubgraph, SUPPORTED_CHAIN_IDS } from "@/lib/subgraph"
import { ASSETS, type AssetData } from "@/lib/assets"

// ── Subgraph response types ──

interface SubgraphPosition {
  id: string
  token: { id: string }
  balance: string
  totalBought: string
  totalSold: string
  totalVolumeUSDC: string
  flagged: boolean
}

interface SubgraphTrade {
  id: string
  type: "BUY" | "SELL"
  token: { id: string }
  usdcAmount: string
  tokenAmount: string
  timestamp: string
  transactionHash: string
}

interface SubgraphUser {
  id: string
  verified: boolean
  positions: SubgraphPosition[]
  trades: SubgraphTrade[]
}

// ── Exported types ──

export interface PortfolioPosition {
  asset: AssetData
  tokenAddress: string
  balance: number
  totalBought: number
  totalSold: number
  totalVolumeUSDC: number
  flagged: boolean
  currentPrice: number
  value: number
  chainId: number
}

export interface PortfolioTrade {
  id: string
  type: "BUY" | "SELL"
  asset: AssetData | undefined
  tokenAddress: string
  usdcAmount: number
  tokenAmount: number
  timestamp: number
  transactionHash: string
  chainId: number
}

export interface PortfolioData {
  positions: PortfolioPosition[]
  trades: PortfolioTrade[]
  verified: boolean
  totalValue: number
  totalVolumeUSDC: number
  loading: boolean
  error: string | null
  refetch: () => void
}

const PORTFOLIO_QUERY = `
  query GetPortfolio($user: Bytes!) {
    user(id: $user) {
      id
      verified
      positions(where: { balance_gt: "0" }, orderBy: totalVolumeUSDC, orderDirection: desc) {
        id
        token { id }
        balance
        totalBought
        totalSold
        totalVolumeUSDC
        flagged
      }
      trades(first: 20, orderBy: timestamp, orderDirection: desc) {
        id
        type
        token { id }
        usdcAmount
        tokenAmount
        timestamp
        transactionHash
      }
    }
  }
`

function toHuman18(raw: string): number {
  return Number(raw) / 1e18
}

function toHuman6(raw: string): number {
  return Number(raw) / 1e6
}

function findAssetByAddress(address: string): AssetData | undefined {
  return ASSETS.find(
    (a) => a.address?.toLowerCase() === address.toLowerCase()
  )
}

async function fetchLivePrices(): Promise<Record<string, number>> {
  try {
    const symbols = ASSETS.map((a) => a.ticker).join(",")
    const res = await fetch(`/api/quotes?symbols=${symbols}`)
    if (!res.ok) return {}
    const json = await res.json()
    const prices: Record<string, number> = {}
    for (const [symbol, data] of Object.entries(json.quotes ?? {})) {
      const q = data as { price?: number }
      if (q.price) prices[symbol] = q.price
    }
    return prices
  } catch {
    return {}
  }
}

export function usePortfolio(): PortfolioData {
  const { address, isConnected } = useAccount()
  const [positions, setPositions] = useState<PortfolioPosition[]>([])
  const [trades, setTrades] = useState<PortfolioTrade[]>([])
  const [verified, setVerified] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPortfolio = useCallback(async () => {
    if (!isConnected || !address) {
      setPositions([])
      setTrades([])
      setVerified(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch live prices + subgraph data in parallel
      const [livePrices, ...results] = await Promise.all([
        fetchLivePrices(),
        ...SUPPORTED_CHAIN_IDS.map((chainId) =>
          querySubgraph<{ user: SubgraphUser | null }>(
            chainId,
            PORTFOLIO_QUERY,
            { user: address.toLowerCase() }
          ).then((data) => ({ chainId, data })).catch(() => null)
        ),
      ])

      let allPositions: PortfolioPosition[] = []
      let allTrades: PortfolioTrade[] = []
      let isVerified = false

      for (const result of results) {
        if (!result) continue
        const { chainId, data } = result
        if (!data.user) continue

        if (data.user.verified) isVerified = true

        const chainPositions = data.user.positions
          .map((p) => {
            const tokenAddr = p.token.id
            const asset = findAssetByAddress(tokenAddr)
            if (!asset) return null
            const balance = toHuman18(p.balance)
            const currentPrice = livePrices[asset.ticker] ?? asset.price
            return {
              asset,
              tokenAddress: tokenAddr,
              balance,
              totalBought: toHuman18(p.totalBought),
              totalSold: toHuman18(p.totalSold),
              totalVolumeUSDC: toHuman6(p.totalVolumeUSDC),
              flagged: p.flagged,
              currentPrice,
              value: balance * currentPrice,
              chainId,
            }
          })
          .filter((p): p is PortfolioPosition => p !== null)

        const chainTrades = data.user.trades.map((t) => ({
          id: `${chainId}-${t.id}`,
          type: t.type,
          asset: findAssetByAddress(t.token.id),
          tokenAddress: t.token.id,
          usdcAmount: toHuman6(t.usdcAmount),
          tokenAmount: toHuman18(t.tokenAmount),
          timestamp: Number(t.timestamp),
          transactionHash: t.transactionHash,
          chainId,
        }))

        allPositions = allPositions.concat(chainPositions)
        allTrades = allTrades.concat(chainTrades)
      }

      allPositions.sort((a, b) => b.value - a.value)
      allTrades.sort((a, b) => b.timestamp - a.timestamp)

      setVerified(isVerified)
      setPositions(allPositions)
      setTrades(allTrades.slice(0, 20))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio")
    } finally {
      setLoading(false)
    }
  }, [address, isConnected])

  useEffect(() => {
    fetchPortfolio()
  }, [fetchPortfolio])

  const totalValue = positions.reduce((s, p) => s + p.value, 0)
  const totalVolumeUSDC = positions.reduce((s, p) => s + p.totalVolumeUSDC, 0)

  return {
    positions,
    trades,
    verified,
    totalValue,
    totalVolumeUSDC,
    loading,
    error,
    refetch: fetchPortfolio,
  }
}
