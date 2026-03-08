import { NextResponse } from "next/server"

type ChartResult = {
  symbol: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
}

// Try fetching chart data for a given range, return null if no usable data
async function fetchChart(symbol: string, range: string, interval: string): Promise<ChartResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    if (!res.ok) return null
    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result?.meta?.regularMarketPrice) return null

    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? []
    const highs: (number | null)[] = result?.indicators?.quote?.[0]?.high ?? []
    const lows: (number | null)[] = result?.indicators?.quote?.[0]?.low ?? []

    const validCloses = closes.filter((c): c is number => c != null)
    if (validCloses.length < 2) return null

    const currentPrice = result.meta.regularMarketPrice
    const openPrice = validCloses[0]
    const change = currentPrice - openPrice
    const changePercent = openPrice ? (change / openPrice) * 100 : 0

    const validHighs = highs.filter((h): h is number => h != null)
    const validLows = lows.filter((l): l is number => l != null)

    return {
      symbol,
      price: currentPrice,
      change,
      changePercent,
      high: validHighs.length ? Math.max(...validHighs) : currentPrice,
      low: validLows.length ? Math.min(...validLows) : currentPrice,
    }
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbols = searchParams.get("symbols")?.split(",") ?? []

  if (symbols.length === 0) {
    return NextResponse.json({ quotes: {} })
  }

  // Fetch all symbols in parallel, with 24h → 48h → 72h fallback
  const quotes: Record<string, ChartResult> = {}

  await Promise.all(
    symbols.map(async (symbol) => {
      // Try 1 day first
      let result = await fetchChart(symbol, "1d", "5m")
      // If no data (weekend/holiday), try 2 days
      if (!result) result = await fetchChart(symbol, "2d", "15m")
      // If still nothing, try 3 days
      if (!result) result = await fetchChart(symbol, "5d", "1d")

      if (result) {
        quotes[symbol] = result
      }
    })
  )

  return NextResponse.json({ quotes }, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  })
}
