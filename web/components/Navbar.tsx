"use client"
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useAccount, useBalance } from "wagmi"
import { formatUnits } from "viem"
import { useConnect, useDisconnect } from "@jaw.id/wagmi"
import { config } from "@/config/wagmi"
import { Copy, LogOut, Check } from "lucide-react"

export function Navbar() {
  const { address, isConnected, chain } = useAccount()
  const { data: balance } = useBalance({ address })
  const [mounted, setMounted] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [dropdownOpen])

  const connectMutation = useConnect()
  const disconnectMutation = useDisconnect()

  const handleConnect = () => {
    const jawConnector = config.connectors[0]
    connectMutation.mutate({ connector: jawConnector })
  }

  const handleDisconnect = () => {
    disconnectMutation.mutate({})
    setDropdownOpen(false)
  }

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const formatBalance = (val: string) => {
    const num = parseFloat(val)
    if (num === 0) return "0"
    if (num < 0.0001) return "<0.0001"
    return num.toFixed(4)
  }

  return (
    <nav className="fixed top-4 inset-x-0 mx-auto z-50 w-[calc(100%-2rem)] max-w-4xl">
      <div
        className="flex items-center justify-between px-5 py-3 rounded-2xl border border-white/[0.08]"
        style={{
          background: "rgba(0, 0, 0, 0.5)",
          backdropFilter: "blur(16px) saturate(1.2)",
          WebkitBackdropFilter: "blur(16px) saturate(1.2)",
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          className="text-[15px] font-semibold text-white tracking-tight"
        >
          SynthStocks
        </Link>

        {/* Center nav links */}
        <div className="flex items-center gap-6">
          <Link
            href="/markets"
            className="text-[13px] text-white/70 hover:text-white transition-colors"
          >
            Markets
          </Link>
          <Link
            href="/portfolio"
            className="text-[13px] text-white/70 hover:text-white transition-colors"
          >
            Portfolio
          </Link>
          <Link
            href="/verify"
            className="text-[13px] text-white/70 hover:text-white transition-colors"
          >
            Verify
          </Link>
        </div>

        {/* Connect / Account */}
        {mounted && isConnected && address ? (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 text-[13px] text-white/80 bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2 hover:bg-white/[0.1] transition-colors cursor-pointer"
            >
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-violet-500 via-cyan-400 to-emerald-400" />
              {address.slice(0, 6)}...{address.slice(-4)}
            </button>

            {/* Account Dropdown */}
            {dropdownOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-white/[0.08] overflow-hidden"
                style={{
                  background: "rgba(12, 12, 12, 0.95)",
                  backdropFilter: "blur(20px)",
                }}
              >
                {/* Account header */}
                <div className="p-4 border-b border-white/[0.06]">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 via-cyan-400 to-emerald-400" />
                    <div>
                      <p className="text-[14px] font-medium text-white">
                        {address.slice(0, 6)}...{address.slice(-4)}
                      </p>
                      {chain && (
                        <p className="text-[11px] text-white/40">{chain.name}</p>
                      )}
                    </div>
                  </div>

                  {/* Balance */}
                  {balance && (
                    <div className="bg-white/[0.04] rounded-xl px-3 py-2.5">
                      <p className="text-[11px] text-white/40 mb-0.5">Balance</p>
                      <p className="text-[16px] font-semibold text-white">
                        {formatBalance(formatUnits(balance.value, balance.decimals))}{" "}
                        <span className="text-[12px] font-normal text-white/50">
                          {balance.symbol}
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="p-2">
                  <button
                    onClick={handleCopy}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] text-white/60 hover:bg-white/[0.06] hover:text-white/90 transition-colors cursor-pointer"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    {copied ? "Copied!" : "Copy Address"}
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] text-red-400/80 hover:bg-red-500/[0.08] hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Disconnect
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="text-[13px] text-white font-medium bg-white/[0.1] border border-white/[0.12] rounded-xl px-4 py-2 hover:bg-white/[0.15] transition-colors cursor-pointer"
          >
            Connect
          </button>
        )}
      </div>
    </nav>
  )
}
