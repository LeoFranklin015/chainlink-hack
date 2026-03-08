"use client"

import { useMemo, useRef, useCallback, useState, useEffect } from "react"
import { ASSETS, type AssetData } from "@/lib/assets"
import { useFinnhubPrices } from "./useFinnhubPrices"

export type AssetWithQuote = AssetData & {
  price: number
  change24h: number
  change24hPercent: number
  sparklineData: number[]
  isLive: boolean
  high24h?: number
  low24h?: number
}

type QuoteData = {
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  sparkline: number[]
}

// Fetch real quotes via our API route (proxies Yahoo Finance, with 24h→48h→72h fallback)
async function fetchQuotes(symbols: string[]): Promise<Record<string, QuoteData>> {
  try {
    const res = await fetch(`/api/quotes?symbols=${symbols.join(",")}`)
    if (!res.ok) return {}
    const json = await res.json()
    return json.quotes ?? {}
  } catch {
    return {}
  }
}

// Placeholder sparkline while loading (flat line at base price)
function flatSparkline(price: number, points: number = 24): number[] {
  return Array(points).fill(price)
}

export function useStockQuotes() {
  const symbols = useMemo(() => ASSETS.map((a) => a.ticker), [])
  const { prices, connected } = useFinnhubPrices(symbols)
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({})
  const [loading, setLoading] = useState(true)

  // Fetch real quote data on mount
  useEffect(() => {
    fetchQuotes(symbols).then((q) => {
      setQuotes(q)
      setLoading(false)
    })
  }, [symbols])

  // Track price history for sparklines
  const historyRef = useRef<Record<string, number[]>>({})

  const updateHistory = useCallback(
    (ticker: string, price: number) => {
      if (!historyRef.current[ticker]) {
        historyRef.current[ticker] = []
      }
      const hist = historyRef.current[ticker]
      hist.push(price)
      if (hist.length > 30) hist.shift()
    },
    []
  )

  const assets: AssetWithQuote[] = useMemo(() => {
    return ASSETS.map((asset) => {
      const livePrice = prices[asset.ticker]
      const quote = quotes[asset.ticker]

      // Priority: live WS price > Yahoo quote > static price
      const currentPrice = livePrice?.price ?? quote?.price ?? asset.price
      const isLive = !!livePrice

      if (isLive) {
        updateHistory(asset.ticker, currentPrice)
      }

      // Use real Yahoo change data, or compute from live vs static price
      const change24h = quote?.change ?? (currentPrice - asset.price)
      const change24hPercent = quote?.changePercent ?? (asset.price ? ((currentPrice - asset.price) / asset.price) * 100 : 0)

      // Priority: live WS history > real Yahoo sparkline > flat placeholder
      const sparklineData =
        historyRef.current[asset.ticker]?.length > 2
          ? historyRef.current[asset.ticker]
          : quote?.sparkline?.length
            ? quote.sparkline
            : flatSparkline(currentPrice)

      const high24h = quote?.high ?? Math.max(...sparklineData)
      const low24h = quote?.low ?? Math.min(...sparklineData)

      return {
        ...asset,
        price: currentPrice,
        change24h,
        change24hPercent,
        sparklineData,
        isLive,
        high24h,
        low24h,
      }
    })
  }, [prices, quotes, updateHistory])

  return {
    assets,
    loading,
    error: connected ? null : (!process.env.NEXT_PUBLIC_FINNHUB_API_KEY ? "No Finnhub API key — showing static prices." : null),
    refetch: () => {
      fetchQuotes(symbols).then(setQuotes)
    },
  }
}
