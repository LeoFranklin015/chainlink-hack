"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import {
  ArrowUpRight,
  Wallet,
  Clock,
  ChevronRight,
  ChevronDown,
  Loader2,
  AlertCircle,
} from "lucide-react"
import { Navbar } from "@/components/Navbar"
import { getStockLogoUrl, cn } from "@/lib/utils"
import { usePortfolio, type PortfolioPosition } from "@/hooks/usePortfolio"
import { useUsdcBalances } from "@/hooks/useUsdcBalances"
import { CHAIN_CONTRACTS } from "@/lib/contracts"

const ALLOC_COLORS = [
  "#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4",
]

function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(timestamp * 1000).toLocaleDateString()
}

export default function PortfolioPage() {
  const [activeTab, setActiveTab] = useState<"holdings" | "activity">("holdings")
  const { positions, trades, totalValue, totalVolumeUSDC, loading, error } = usePortfolio()
  const { balances: usdcBalances, totalUsdc } = useUsdcBalances()
  const [showUsdcBreakdown, setShowUsdcBreakdown] = useState(false)
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null)

  // Group positions by ticker for multi-chain tree view
  const groupedPositions = useMemo(() => {
    const groups: Record<string, { positions: PortfolioPosition[]; totalBalance: number; totalValue: number; totalVolume: number; currentPrice: number; asset: PortfolioPosition["asset"] }> = {}
    for (const p of positions) {
      const key = p.asset.ticker
      if (!groups[key]) {
        groups[key] = { positions: [], totalBalance: 0, totalValue: 0, totalVolume: 0, currentPrice: p.currentPrice, asset: p.asset }
      }
      groups[key].positions.push(p)
      groups[key].totalBalance += p.balance
      groups[key].totalValue += p.value
      groups[key].totalVolume += p.totalVolumeUSDC
    }
    return Object.values(groups).sort((a, b) => b.totalValue - a.totalValue)
  }, [positions])

  function getChainInfo(chainId: number) {
    return CHAIN_CONTRACTS.find((c) => c.chainId === chainId)
  }

  const allocData = positions.map((p, i) => ({
    name: p.asset.ticker,
    value: p.value,
    color: ALLOC_COLORS[i % ALLOC_COLORS.length],
    percent: totalValue > 0 ? (p.value / totalValue) * 100 : 0,
  }))

  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <main className="pt-28 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">

          {/* ── Header ── */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-10"
          >
            <div className="flex items-center gap-3 mb-1">
              <Wallet className="w-5 h-5 text-[#737373]" />
              <p className="text-sm text-[#737373] font-medium tracking-wide uppercase">Portfolio</p>
            </div>
            <div className="flex items-baseline gap-5 mt-2">
              <h1 className="text-5xl font-bold text-[#ededed] tabular-nums tracking-tight">
                ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h1>
            </div>
            <div className="flex items-center gap-4 mt-3">
              <div
                className="relative"
                onMouseEnter={() => setShowUsdcBreakdown(true)}
                onMouseLeave={() => setShowUsdcBreakdown(false)}
              >
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0c0c0c] border border-[#1e1e1e] cursor-default">
                  <div className="flex -space-x-1.5">
                    {usdcBalances.map((b) => (
                      <img key={b.chainId} src={b.icon} alt={b.chainName} className="w-4 h-4 rounded-full ring-1 ring-black" />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-[#ededed] tabular-nums">
                    {totalUsdc.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                  </span>
                </div>

                {showUsdcBreakdown && (
                  <div className="absolute top-full left-0 mt-2 w-56 rounded-xl bg-[#0c0c0c] border border-[#1e1e1e] p-3 shadow-xl z-50">
                    <p className="text-[10px] text-[#737373] uppercase tracking-wider font-medium mb-2.5">Balance by chain</p>
                    <div className="space-y-2.5">
                      {usdcBalances.map((b) => (
                        <div key={b.chainId} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <img src={b.icon} alt={b.chainName} className="w-4 h-4 rounded-full" />
                            <span className="text-xs text-[#737373]">{b.chainName}</span>
                          </div>
                          <span className="text-xs text-[#ededed] font-medium tabular-nums">
                            {b.balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <span className="text-xs text-[#737373]">
                Volume: ${totalVolumeUSDC.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
              </span>
            </div>
          </motion.div>

          {/* ── Loading / Error / Empty ── */}
          {loading && (
            <div className="flex items-center justify-center gap-3 py-24">
              <Loader2 className="w-5 h-5 text-[#737373] animate-spin" />
              <p className="text-sm text-[#737373]">Loading portfolio from subgraph...</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 py-24 justify-center">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && positions.length === 0 && (
            <div className="text-center py-24">
              <Wallet className="w-10 h-10 text-[#737373] mx-auto mb-4" />
              <p className="text-[#737373] text-sm">
                No positions found. Connect your wallet and buy some synthetic stocks!
              </p>
              <Link href="/markets" className="text-sm text-blue-400 hover:underline mt-2 inline-block">
                Go to Markets &rarr;
              </Link>
            </div>
          )}

          {!loading && !error && positions.length > 0 && (
            <>
              {/* ── Top Stats Row ── */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10"
              >
                {[
                  { label: "Total Volume", val: `$${totalVolumeUSDC.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                  { label: "Current Value", val: `$${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                  { label: "Positions", val: String(positions.length) },
                  { label: "Trades", val: String(trades.length) },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] p-5"
                  >
                    <p className="text-xs text-[#737373] mb-1.5">{stat.label}</p>
                    <p className="text-lg font-semibold text-[#ededed] tabular-nums">{stat.val}</p>
                  </div>
                ))}
              </motion.div>

              {/* ── Main Grid: Holdings + Allocation ── */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* Left: Holdings / Activity */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="xl:col-span-2"
                >
                  <div className="rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] overflow-hidden">
                    {/* Tabs */}
                    <div className="flex border-b border-[#1e1e1e]">
                      {(["holdings", "activity"] as const).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setActiveTab(tab)}
                          className={cn(
                            "flex-1 py-4 text-sm font-medium transition-colors capitalize",
                            activeTab === tab
                              ? "text-[#ededed] border-b-2 border-[#ededed]"
                              : "text-[#737373] hover:text-[#ededed]"
                          )}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    {activeTab === "holdings" ? (
                      <div className="divide-y divide-[#1e1e1e]">
                        {/* Table header */}
                        <div className="grid grid-cols-12 gap-4 px-6 py-3 text-xs text-[#737373] font-medium">
                          <div className="col-span-4">Asset</div>
                          <div className="col-span-2 text-right">Price</div>
                          <div className="col-span-2 text-right">Holdings</div>
                          <div className="col-span-2 text-right">Value</div>
                          <div className="col-span-2 text-right">Volume</div>
                        </div>

                        {groupedPositions.map((group, i) => {
                          const isExpanded = expandedAsset === group.asset.ticker
                          return (
                            <div key={group.asset.ticker}>
                              <Link href={`/markets/assets/${group.asset.ticker}`}>
                                <motion.div
                                  initial={{ opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ duration: 0.35, delay: 0.08 * i }}
                                  className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-[#171717]/50 transition-colors cursor-pointer"
                                >
                                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                                    <div className="w-9 h-9 rounded-lg bg-[#171717] overflow-hidden flex-shrink-0">
                                      <img src={getStockLogoUrl(group.asset.ticker)} alt={group.asset.ticker} className="w-9 h-9 object-cover" />
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-semibold text-[#ededed] truncate">{group.asset.ticker}</p>
                                      <p className="text-xs text-[#737373] truncate">{group.asset.name}</p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setExpandedAsset(isExpanded ? null : group.asset.ticker)
                                      }}
                                      className="ml-auto flex-shrink-0 p-1 rounded-md hover:bg-[#1e1e1e] transition-colors cursor-pointer"
                                    >
                                      <ChevronDown className={cn("w-4 h-4 text-[#737373] transition-transform duration-200", isExpanded && "rotate-180")} />
                                    </button>
                                  </div>
                                <div className="col-span-2 text-right">
                                  <p className="text-sm text-[#ededed] tabular-nums font-medium">${group.currentPrice.toFixed(2)}</p>
                                </div>
                                <div className="col-span-2 text-right">
                                  <p className="text-sm text-[#ededed] tabular-nums">{group.totalBalance.toFixed(group.totalBalance % 1 === 0 ? 0 : 4)}</p>
                                  <p className="text-[10px] text-[#737373]">tokens</p>
                                </div>
                                <div className="col-span-2 text-right">
                                  <p className="text-sm text-[#ededed] tabular-nums font-medium">${group.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                <div className="col-span-2 text-right">
                                  <p className="text-sm text-[#737373] tabular-nums">${group.totalVolume.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                                </div>
                                </motion.div>
                              </Link>

                              {/* Per-chain breakdown */}
                              {isExpanded && (
                                <div className="bg-[#0a0a0a] border-t border-[#1e1e1e]/50">
                                  {group.positions.map((p) => {
                                    const chain = getChainInfo(p.chainId)
                                    return (
                                      <Link
                                        key={`${p.chainId}-${p.tokenAddress}`}
                                        href={`/markets/assets/${group.asset.ticker}`}
                                      >
                                        <div className="grid grid-cols-12 gap-4 px-6 py-2.5 items-center text-xs hover:bg-[#171717]/30 transition-colors">
                                          <div className="col-span-4 flex items-center gap-2.5 pl-12">
                                            {chain && <img src={chain.icon} alt={chain.name} className="w-4 h-4 rounded-full" />}
                                            <span className="text-[#ededed] font-medium">{chain?.name ?? `Chain ${p.chainId}`}</span>
                                          </div>
                                          <div className="col-span-2 text-right">
                                            <span className="text-[#737373] tabular-nums">${p.currentPrice.toFixed(2)}</span>
                                          </div>
                                          <div className="col-span-2 text-right">
                                            <span className="text-[#ededed] tabular-nums">{p.balance.toFixed(p.balance % 1 === 0 ? 0 : 4)}</span>
                                          </div>
                                          <div className="col-span-2 text-right">
                                            <span className="text-[#ededed] tabular-nums">${p.value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                          </div>
                                          <div className="col-span-2 text-right">
                                            <span className="text-[#737373] tabular-nums">${p.totalVolumeUSDC.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                          </div>
                                        </div>
                                      </Link>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="divide-y divide-[#1e1e1e]">
                        {trades.length === 0 ? (
                          <div className="py-12 text-center">
                            <p className="text-sm text-[#737373]">No trades yet</p>
                          </div>
                        ) : (
                          trades.map((tx, i) => (
                            <motion.div
                              key={tx.id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.35, delay: 0.08 * i }}
                              className="flex items-center gap-4 px-6 py-4"
                            >
                              <div className={cn(
                                "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0",
                                tx.type === "BUY" ? "bg-emerald-500/15" : "bg-red-500/15"
                              )}>
                                <ArrowUpRight className={cn(
                                  "w-4 h-4",
                                  tx.type === "BUY" ? "text-emerald-400" : "text-red-400 rotate-180"
                                )} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-[#ededed]">{tx.type === "BUY" ? "Buy" : "Sell"}</p>
                                  <p className="text-sm text-[#737373]">{tx.asset?.ticker ?? tx.tokenAddress.slice(0, 8)}</p>
                                </div>
                                <p className="text-xs text-[#737373]">
                                  {tx.tokenAmount.toFixed(4)} tokens for ${tx.usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-medium text-[#ededed] tabular-nums">
                                  ${tx.usdcAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <p className="text-[10px] text-[#737373] flex items-center justify-end gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatTimeAgo(tx.timestamp)}
                                </p>
                              </div>
                            </motion.div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Right: Allocation */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.15 }}
                  className="xl:col-span-1 space-y-6"
                >
                  {/* Donut chart */}
                  <div className="rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] p-6">
                    <h3 className="text-sm font-semibold text-[#ededed] mb-5">Allocation</h3>
                    <div className="w-full aspect-square max-w-[220px] mx-auto mb-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={allocData}
                            cx="50%"
                            cy="50%"
                            innerRadius="65%"
                            outerRadius="90%"
                            paddingAngle={3}
                            dataKey="value"
                            strokeWidth={0}
                          >
                            {allocData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) =>
                              active && payload?.[0] ? (
                                <div className="bg-[#0c0c0c] px-3 py-2 rounded-lg shadow-lg border border-[#1e1e1e]">
                                  <p className="text-xs font-medium text-[#ededed]">
                                    {payload[0].name}: {(payload[0].payload as { percent: number }).percent.toFixed(1)}%
                                  </p>
                                </div>
                              ) : null
                            }
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Legend */}
                    <div className="space-y-3">
                      {allocData.map((item) => (
                        <div key={item.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="text-sm text-[#ededed] font-medium">{item.name}</span>
                          </div>
                          <span className="text-sm text-[#737373] tabular-nums">{item.percent.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="rounded-2xl bg-[#0c0c0c] border border-[#1e1e1e] p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-[#ededed] mb-2">Overview</h3>
                    {[
                      ["Avg. Position", positions.length > 0 ? `$${(totalValue / positions.length).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"],
                      ["Largest Holding", allocData[0] ? `${allocData[0].name} (${allocData[0].percent.toFixed(1)}%)` : "—"],
                      ["Total Trades", String(trades.length)],
                      ["Data Source", "The Graph"],
                    ].map(([label, val]) => (
                      <div key={label} className="flex justify-between text-sm">
                        <span className="text-[#737373]">{label}</span>
                        <span className="text-[#ededed] font-medium">{val}</span>
                      </div>
                    ))}

                  </div>
                </motion.div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
