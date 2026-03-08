"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { useAccount } from "wagmi"
import { useConnect, useDisconnect } from "@jaw.id/wagmi"
import { config } from "@/config/wagmi"

export function Navbar() {
  const { address, isConnected } = useAccount()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const connectMutation = useConnect()
  const disconnectMutation = useDisconnect()

  const handleConnect = () => {
    const jawConnector = config.connectors[0]
    connectMutation.mutate({ connector: jawConnector })
  }

  const handleDisconnect = () => {
    disconnectMutation.mutate({})
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
        <div className="hidden sm:flex items-center gap-6">
          <Link
            href="/trade"
            className="text-[13px] text-white/50 hover:text-white/80 transition-colors"
          >
            Trade
          </Link>
          <Link
            href="/portfolio"
            className="text-[13px] text-white/50 hover:text-white/80 transition-colors"
          >
            Portfolio
          </Link>
          <Link
            href="/verify"
            className="text-[13px] text-white/50 hover:text-white/80 transition-colors"
          >
            Verify
          </Link>
        </div>

        {/* Connect / Account */}
        {mounted && isConnected ? (
          <button
            onClick={handleDisconnect}
            className="text-[13px] text-white/70 bg-white/[0.06] border border-white/[0.08] rounded-xl px-4 py-2 hover:bg-white/[0.1] transition-colors cursor-pointer"
          >
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </button>
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
