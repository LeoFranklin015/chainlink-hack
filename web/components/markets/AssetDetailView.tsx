"use client"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import { ChevronDown, ArrowDown, HelpCircle, Loader2 } from "lucide-react"
import type { AssetData } from "@/lib/assets"
import { useAssetDetail } from "@/hooks/useAssetDetail"
import { cn, getStockLogoUrl } from "@/lib/utils"
import { useAccount } from "wagmi"
import { useConnect } from "@jaw.id/wagmi"
import { config } from "@/config/wagmi"
import { toast } from "sonner"

const CHART_RANGES = [
  { key: "1D", label: "1D" },
  { key: "1W", label: "1W" },
  { key: "1M", label: "1M" },
  { key: "3M", label: "3M" },
  { key: "1Y", label: "1Y" },
  { key: "ALL", label: "ALL" },
]

export function AssetDetailView({ asset }: { asset: AssetData }) {
  const [chartRange, setChartRange] = useState("1M")
  const liveData = useAssetDetail(asset, chartRange)
  const [payAmount, setPayAmount] = useState("")
  const [receiveAmount, setReceiveAmount] = useState("")
  const [activeTab, setActiveTab] = useState<"buy" | "sell">("buy")
  const [showMore, setShowMore] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const { address, isConnected } = useAccount()
  const connectMutation = useConnect()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const chartData = useMemo(() => {
    if (liveData.chartData?.length) {
      return liveData.chartData
    }
    return []
  }, [liveData.chartData])

  const positive = liveData.change24h >= 0

  const handlePayChange = (val: string) => {
    setPayAmount(val)
    if (parseFloat(val)) {
      const receiveQty = parseFloat(val) / liveData.price
      setReceiveAmount(receiveQty.toFixed(6))
    } else {
      setReceiveAmount("")
    }
  }

  const handleReceiveChange = (val: string) => {
    setReceiveAmount(val)
    if (parseFloat(val)) {
      const payQty = parseFloat(val) * liveData.price
      setPayAmount(payQty.toFixed(2))
    } else {
      setPayAmount("")
    }
  }

  const handleAction = async () => {
    if (!(mounted && isConnected)) {
      const jawConnector = config.connectors[0]
      connectMutation.mutate({ connector: jawConnector })
      return
    }

    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid amount")
      return
    }

    setIsProcessing(true)
    try {
      // Simulate order placement
      await new Promise((resolve) => setTimeout(resolve, 1500))
      toast.success(
        `${activeTab === "buy" ? "Bought" : "Sold"} ${receiveAmount} ${asset.ticker} for $${payAmount}`
      )
      setPayAmount("")
      setReceiveAmount("")
    } catch (err) {
      toast.error(`Trade failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const aboutText = `${asset.name} (${asset.ticker}) is a tokenized representation of the underlying equity, enabling on-chain trading with instant settlement. Powered by Chainlink price feeds for accurate, tamper-proof pricing data.`

  const open24h = liveData.price - liveData.change24h
  const high24h = Math.max(open24h, liveData.price) * 1.012
  const low24h = Math.min(open24h, liveData.price) * 0.988

  const categoryTags = [...new Set([liveData.category, ...liveData.categories])].slice(0, 3)

  return (
    <div className="max-w-7xl mx-auto">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Left: Chart + Info */}
        <div className="xl:col-span-2 space-y-6">
          {/* Asset header */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#171717] overflow-hidden">
              <img
                src={getStockLogoUrl(liveData.ticker)}
                alt={liveData.ticker}
                className="w-12 h-12 object-cover"
              />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-[#ededed]">
                {liveData.name}{" "}
                <span className="text-[#737373]">{liveData.ticker}</span>
              </h1>
              <p className="text-xs text-[#737373] mt-1">
                {liveData.isLive ? (
                  <span className="text-emerald-400">Live</span>
                ) : (
                  "Market Closed"
                )}
              </p>
              <div className="flex items-baseline gap-4 mt-3">
                {liveData.isLoading ? (
                  <span className="text-3xl font-bold text-[#737373] animate-pulse">---</span>
                ) : (
                  <>
                    <span className="text-3xl font-bold text-[#ededed] tabular-nums">
                      ${liveData.price.toFixed(2)}
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1 text-sm font-medium",
                        positive ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {positive ? "+" : ""}${liveData.change24h.toFixed(2)} (
                      {positive ? "+" : ""}
                      {liveData.change24hPercent.toFixed(2)}%) 24H
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Chart timeframe */}
          <div className="flex gap-2">
            {CHART_RANGES.map((range) => (
              <button
                key={range.key}
                type="button"
                onClick={() => setChartRange(range.key)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  chartRange === range.key
                    ? "bg-white text-black"
                    : "bg-[#171717] text-[#737373] hover:bg-[#171717]/80 hover:text-[#ededed]"
                )}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] p-6">
            <div className="h-[360px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`cg-${liveData.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={positive ? "#22c55e" : "#ef4444"} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={positive ? "#22c55e" : "#ef4444"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" vertical={false} />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 11, fill: "#737373" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(t) => {
                      const d = new Date(t)
                      if (chartRange === "1D") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      if (chartRange === "1W") return d.toLocaleDateString([], { weekday: "short" })
                      if (chartRange === "1Y" || chartRange === "ALL") return d.toLocaleDateString([], { month: "short", year: "2-digit" })
                      return d.toLocaleDateString([], { month: "short", day: "numeric" })
                    }}
                  />
                  <YAxis
                    orientation="right"
                    tick={{ fontSize: 11, fill: "#737373" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                    domain={["dataMin - 2", "dataMax + 2"]}
                    width={60}
                  />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.[0] ? (
                        <div className="bg-[#0c0c0c] px-4 py-2 rounded-lg shadow-lg border border-[#1e1e1e]">
                          <p className="text-sm font-semibold text-[#ededed] tabular-nums">
                            ${Number(payload[0].value).toFixed(2)}
                          </p>
                        </div>
                      ) : null
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={positive ? "#22c55e" : "#ef4444"}
                    strokeWidth={2}
                    fill={`url(#cg-${liveData.id})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* About */}
          <div className="rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] p-6">
            <h2 className="text-lg font-bold text-[#ededed] mb-4">About</h2>
            <p className="text-sm text-[#737373] leading-relaxed mb-4">
              {showMore ? aboutText : aboutText.slice(0, 150) + "..."}{" "}
              <button
                type="button"
                onClick={() => setShowMore(!showMore)}
                className="text-[#ededed] font-medium hover:underline"
              >
                {showMore ? "Show Less" : "Show More"}
              </button>
            </p>
            <div className="flex gap-2 flex-wrap">
              {categoryTags.map((cat) => (
                <span
                  key={cat}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-[#171717] text-[#737373]"
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>

          {/* Statistics */}
          <div className="rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] p-6">
            <h2 className="text-lg font-bold text-[#ededed] mb-6">Statistics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-6 border-b border-[#1e1e1e]">
              <div className="space-y-3">
                <p className="text-sm font-medium text-[#ededed] mb-3">24H Price</p>
                {[
                  ["Open", open24h],
                  ["High", high24h],
                  ["Low", low24h],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex justify-between text-sm">
                    <span className="text-[#737373]">{label}</span>
                    <span className="text-[#ededed] font-medium tabular-nums">
                      ${(val as number).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium text-[#ededed] mb-3">Market Data</p>
                {[
                  ["Market Cap", liveData.marketCap ?? "---"],
                  ["Category", liveData.category],
                  ["Shares Per Token", "1.0000"],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-[#737373]">{label}</span>
                    <span className="text-[#ededed] font-medium">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Buy/Sell Panel */}
        <div className="xl:col-span-1">
          <div className="sticky top-20 rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-[#1e1e1e]">
              {(["buy", "sell"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex-1 py-4 text-sm font-semibold transition-colors capitalize",
                    activeTab === tab
                      ? tab === "buy"
                        ? "bg-emerald-500 text-white"
                        : "bg-red-500 text-white"
                      : "text-[#737373] hover:bg-[#171717] hover:text-[#ededed]"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-4">
              {/* Pay */}
              <div>
                <p className="text-xs text-[#737373] mb-2">
                  {activeTab === "buy" ? "You Pay" : "You Sell"}
                </p>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#171717]/40 border border-[#1e1e1e] focus-within:border-white/20 transition-colors">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={activeTab === "buy" ? payAmount : receiveAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, "")
                      activeTab === "buy" ? handlePayChange(val) : handleReceiveChange(val)
                    }}
                    className="flex-1 bg-transparent text-[#ededed] text-lg font-medium focus:outline-none min-w-0 placeholder:text-[#737373]"
                    placeholder="0.00"
                  />
                  <div className="flex items-center gap-2 flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#171717]">
                    {activeTab === "buy" ? (
                      <>
                        <img src="/usdc.png" alt="USDC" className="w-5 h-5 rounded-full" />
                        <span className="text-sm font-medium text-[#ededed]">USD</span>
                      </>
                    ) : (
                      <>
                        <img src={getStockLogoUrl(asset.ticker)} alt={asset.ticker} className="w-5 h-5 rounded-full" />
                        <span className="text-sm font-medium text-[#ededed]">{asset.ticker}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <div className="w-10 h-10 rounded-full bg-[#171717] border border-[#1e1e1e] flex items-center justify-center">
                  <ArrowDown className="w-5 h-5 text-[#737373]" />
                </div>
              </div>

              {/* Receive */}
              <div>
                <p className="text-xs text-[#737373] mb-2">
                  {activeTab === "buy" ? "You Receive" : "You Get"}
                </p>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-[#171717]/40 border border-[#1e1e1e] focus-within:border-white/20 transition-colors">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={activeTab === "buy" ? receiveAmount : payAmount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.]/g, "")
                      activeTab === "buy" ? handleReceiveChange(val) : handlePayChange(val)
                    }}
                    className="flex-1 bg-transparent text-[#ededed] text-lg font-medium focus:outline-none min-w-0 placeholder:text-[#737373]"
                    placeholder="0.00"
                  />
                  <div className="flex items-center gap-2 flex-shrink-0 px-3 py-1.5 rounded-lg bg-[#171717]">
                    {activeTab === "buy" ? (
                      <>
                        <img src={getStockLogoUrl(asset.ticker)} alt={asset.ticker} className="w-5 h-5 rounded-full" />
                        <span className="text-sm font-medium text-[#ededed]">{asset.ticker}</span>
                      </>
                    ) : (
                      <>
                        <img src="/usdc.png" alt="USDC" className="w-5 h-5 rounded-full" />
                        <span className="text-sm font-medium text-[#ededed]">USD</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Rate info */}
              <div className="space-y-2 pt-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#737373]">Price</span>
                  <span className="text-[#ededed] tabular-nums">
                    1 {asset.ticker} = ${liveData.price.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#737373]">Total Value</span>
                  <span className="text-[#ededed] tabular-nums">
                    ${(parseFloat(payAmount || "0")).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#737373] flex items-center gap-1">
                    Fee <HelpCircle className="w-3 h-3" />
                  </span>
                  <span className="text-emerald-400 text-xs font-medium">Free</span>
                </div>
              </div>

              {/* Action button */}
              <button
                type="button"
                onClick={handleAction}
                disabled={isProcessing}
                className={cn(
                  "w-full py-4 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2",
                  !(mounted && isConnected)
                    ? "bg-white text-black hover:bg-white/90"
                    : activeTab === "buy"
                    ? "bg-emerald-500 text-white hover:bg-emerald-600"
                    : "bg-red-500 text-white hover:bg-red-600"
                )}
              >
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                {!(mounted && isConnected)
                  ? "Connect Wallet"
                  : activeTab === "buy"
                  ? `Buy ${asset.ticker}`
                  : `Sell ${asset.ticker}`}
              </button>

              <p className="text-[11px] text-[#737373] leading-relaxed text-center">
                Synthetic asset prices powered by Chainlink oracles. Settlement on Arbitrum Sepolia.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
