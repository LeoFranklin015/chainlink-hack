"use client"

import { useMemo, useRef, useEffect, useState } from "react"
import { type AssetData } from "@/lib/assets"
import { useFinnhubPrices } from "./useFinnhubPrices"

export type AssetDetailData = AssetData & {
  price: number
  change24h: number
  change24hPercent: number
  sparklineData: number[]
  chartData: { time: number; value: number }[]
  isLive: boolean
  isLoading: boolean
}

const RANGE_MAP: Record<string, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "1W": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1wk" },
  ALL: { range: "5y", interval: "1mo" },
}

async function fetchYahooChart(
  symbol: string,
  range: string
): Promise<{ time: number; value: number }[]> {
  const config = RANGE_MAP[range] ?? RANGE_MAP["1M"]
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${config.range}&interval=${config.interval}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    if (!res.ok) return []
    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) return []

    const timestamps: number[] = result.timestamp
    const closes: (number | null)[] = result.indicators.quote[0].close

    return timestamps
      .map((t, i) => ({
        time: t * 1000,
        value: closes[i],
      }))
      .filter((d): d is { time: number; value: number } => d.value != null)
  } catch {
    return []
  }
}

// Fallback: deterministic chart from base price
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function generateFallbackChart(
  ticker: string,
  basePrice: number,
  range: string
): { time: number; value: number }[] {
  const now = Date.now()
  const seed = ticker.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  const config: Record<string, { points: number; intervalMs: number; volatility: number }> = {
    "1D": { points: 78, intervalMs: 5 * 60 * 1000, volatility: 0.002 },
    "1W": { points: 35, intervalMs: 4 * 60 * 60 * 1000, volatility: 0.004 },
    "1M": { points: 30, intervalMs: 24 * 60 * 60 * 1000, volatility: 0.008 },
    "3M": { points: 90, intervalMs: 24 * 60 * 60 * 1000, volatility: 0.01 },
    "1Y": { points: 52, intervalMs: 7 * 24 * 60 * 60 * 1000, volatility: 0.015 },
    ALL: { points: 60, intervalMs: 30 * 24 * 60 * 60 * 1000, volatility: 0.02 },
  }
  const { points, intervalMs, volatility } = config[range] ?? config["1M"]
  let price = basePrice
  const prices: number[] = [price]
  for (let i = 1; i < points; i++) {
    const r = seededRandom(seed + i * 7 + range.charCodeAt(0)) - 0.48
    price = price / (1 + r * volatility)
    prices.unshift(price)
  }
  return prices.map((p, i) => ({ time: now - (points - 1 - i) * intervalMs, value: p }))
}

export function useAssetDetail(asset: AssetData, range: string = "1M"): AssetDetailData {
  const { prices } = useFinnhubPrices([asset.ticker])
  const [candles, setCandles] = useState<{ time: number; value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const liveTradesRef = useRef<{ time: number; value: number }[]>([])

  // Fetch chart from Yahoo Finance
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    liveTradesRef.current = []

    fetchYahooChart(asset.ticker, range).then((data) => {
      if (!cancelled) {
        setCandles(data)
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [asset.ticker, range])

  // Append live WS trades
  const livePrice = prices[asset.ticker]
  if (livePrice) {
    const last = liveTradesRef.current[liveTradesRef.current.length - 1]
    if (!last || last.time !== livePrice.timestamp) {
      liveTradesRef.current.push({ time: livePrice.timestamp, value: livePrice.price })
      if (liveTradesRef.current.length > 500) liveTradesRef.current.shift()
    }
  }

  return useMemo(() => {
    const currentPrice = livePrice?.price
      ?? (candles.length ? candles[candles.length - 1].value : asset.price)
    const isLive = !!livePrice

    // Use Yahoo data, fallback to generated, then layer live trades on top
    const baseChart = candles.length > 0
      ? candles
      : generateFallbackChart(asset.ticker, currentPrice, range)

    const chartData = [...baseChart, ...liveTradesRef.current]

    const openPrice = chartData[0]?.value ?? asset.price
    const change24h = currentPrice - openPrice
    const change24hPercent = openPrice ? (change24h / openPrice) * 100 : 0
    const sparklineData = chartData.map((d) => d.value)

    return {
      ...asset,
      price: currentPrice,
      change24h,
      change24hPercent,
      sparklineData,
      chartData,
      isLive,
      isLoading: loading && candles.length === 0,
    }
  }, [asset, livePrice, candles, loading, range])
}
