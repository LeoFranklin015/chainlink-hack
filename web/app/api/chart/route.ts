import { NextResponse } from "next/server"

const RANGE_MAP: Record<string, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "1W": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1wk" },
  ALL: { range: "5y", interval: "1mo" },
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get("symbol")
  const range = searchParams.get("range") ?? "1M"

  if (!symbol) {
    return NextResponse.json({ chart: [], price: null })
  }

  const config = RANGE_MAP[range] ?? RANGE_MAP["1M"]
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${config.range}&interval=${config.interval}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    })
    if (!res.ok) {
      return NextResponse.json({ chart: [], price: null })
    }

    const json = await res.json()
    const result = json?.chart?.result?.[0]
    if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) {
      return NextResponse.json({ chart: [], price: result?.meta?.regularMarketPrice ?? null })
    }

    const timestamps: number[] = result.timestamp
    const closes: (number | null)[] = result.indicators.quote[0].close
    const currentPrice: number | null = result.meta?.regularMarketPrice ?? null

    const chart = timestamps
      .map((t: number, i: number) => ({
        time: t * 1000,
        value: closes[i],
      }))
      .filter((d: { time: number; value: number | null }): d is { time: number; value: number } => d.value != null)

    return NextResponse.json({ chart, price: currentPrice }, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    })
  } catch {
    return NextResponse.json({ chart: [], price: null })
  }
}
