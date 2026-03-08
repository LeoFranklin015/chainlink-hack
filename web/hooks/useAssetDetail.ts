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

async function fetchChart(
  symbol: string,
  range: string
): Promise<{ chart: { time: number; value: number }[]; price: number | null }> {
  try {
    const res = await fetch(`/api/chart?symbol=${symbol}&range=${range}`)
    if (!res.ok) return { chart: [], price: null }
    const json = await res.json()
    return { chart: json.chart ?? [], price: json.price ?? null }
  } catch {
    return { chart: [], price: null }
  }
}

export function useAssetDetail(asset: AssetData, range: string = "1M"): AssetDetailData {
  const { prices } = useFinnhubPrices([asset.ticker])
  const [candles, setCandles] = useState<{ time: number; value: number }[]>([])
  const [yahooPrice, setYahooPrice] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const liveTradesRef = useRef<{ time: number; value: number }[]>([])

  // Fetch chart from API route (proxies Yahoo Finance)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    liveTradesRef.current = []

    fetchChart(asset.ticker, range).then(({ chart, price }) => {
      if (!cancelled) {
        setCandles(chart)
        setYahooPrice(price)
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
    // Priority: live WS price > Yahoo regularMarketPrice > last candle > static price
    const currentPrice = livePrice?.price
      ?? yahooPrice
      ?? (candles.length ? candles[candles.length - 1].value : asset.price)
    const isLive = !!livePrice

    const chartData = candles.length > 0
      ? [...candles, ...liveTradesRef.current]
      : []

    const openPrice = chartData[0]?.value ?? asset.price
    const change24h = currentPrice - openPrice
    const change24hPercent = openPrice ? (change24h / openPrice) * 100 : 0
    const sparklineData = chartData.length > 0 ? chartData.map((d) => d.value) : [currentPrice]

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
  }, [asset, livePrice, yahooPrice, candles, loading, range])
}
