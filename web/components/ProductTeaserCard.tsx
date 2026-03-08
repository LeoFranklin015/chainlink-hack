"use client"
import { motion } from "framer-motion"
import { ArrowUpRight } from "lucide-react"
import Link from "next/link"

type ProductTeaserCardProps = {
  topLabel?: string
  headline?: string
  subheadline?: string
  videoSrc?: string
  posterSrc?: string
  primaryButtonText?: string
  primaryButtonHref?: string
}

const ease = [0.645, 0.045, 0.355, 1] as const

// @component: ProductTeaserCard
export const ProductTeaserCard = (props: ProductTeaserCardProps) => {
  const {
    topLabel = "POWERED BY CRE",
    headline = "Trade Real-World\nStocks On-Chain",
    subheadline = "Access synthetic equities with on-chain settlement, powered by CRE. Verify once with World ID — trade compliantly, forever.",
    videoSrc = "/candles.mp4",
    posterSrc = "",
    primaryButtonText = "Start Trading",
    primaryButtonHref = "/trade",
  } = props

  // @return
  return (
    <section className="relative w-full min-h-screen overflow-hidden" style={{ background: "#000000" }}>
      {/* Dot particle field — Convergence style */}
      <div className="absolute inset-0 pointer-events-none hero-dots" />

      {/* Central glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 55% at 50% 45%, rgba(255,255,255,0.03) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-[1320px] mx-auto px-6 sm:px-8 pt-32 sm:pt-40 pb-24">
        <div className="grid grid-cols-12 gap-6 lg:gap-10 items-center">
          {/* Left: Copy */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease }}
            className="col-span-12 lg:col-span-6 flex"
          >
            <div className="flex flex-col justify-center w-full">
              {/* Top label */}
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease, delay: 0.2 }}
                className="text-[12px] uppercase tracking-[0.2em] text-white/40 mb-8 font-mono"
              >
                {topLabel}
              </motion.p>

              {/* Headline */}
              <h1
                className="text-[clamp(42px,5.8vw,68px)] leading-[1.04] tracking-[-0.025em] text-white max-w-[600px] mb-7"
                style={{
                  fontWeight: 600,
                  fontFamily: "var(--font-geist-sans), 'Geist Sans', sans-serif",
                  whiteSpace: "pre-line",
                }}
              >
                {headline}
              </h1>

              {/* Subheadline */}
              <p className="text-[17px] leading-[1.7] text-white/50 max-w-[480px] mb-10">
                {subheadline}
              </p>

              {/* CTAs */}
              <div className="flex gap-3 flex-wrap">
                <Link
                  href={primaryButtonHref}
                  className="group inline-flex items-center gap-2 text-white bg-white/10 border border-white/20 rounded-full px-7 py-3.5 text-[15px] leading-4 whitespace-nowrap font-medium tracking-wide transition-all duration-200 ease-out hover:bg-white/[0.15] hover:border-white/30"
                >
                  {primaryButtonText}
                  <ArrowUpRight className="w-4 h-4 opacity-60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              </div>
            </div>
          </motion.div>

          {/* Right: Video */}
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              duration: 0.8,
              ease: [0.21, 0.8, 0.35, 1],
              delay: 0.15,
            }}
            className="col-span-12 lg:col-span-6 flex relative"
          >
            <div className="relative w-full aspect-[16/11]">
              <video
                src={videoSrc}
                autoPlay
                muted
                loop
                playsInline
                poster={posterSrc || undefined}
                className="relative h-full w-full object-cover rounded-xl"
                style={{
                  maskImage:
                    "radial-gradient(ellipse 90% 90% at 50% 48%, black 50%, transparent 88%)",
                  WebkitMaskImage:
                    "radial-gradient(ellipse 90% 90% at 50% 48%, black 50%, transparent 88%)",
                }}
              />

            </div>
          </motion.div>
        </div>

        {/* Scrolling stock ticker */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-20 overflow-hidden border-y border-white/[0.06]"
        >
          <div className="relative py-5">
            {/* Gradient fades */}
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-linear-to-r from-black to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-24 bg-linear-to-l from-black to-transparent z-10 pointer-events-none" />

            {/* Ticker tape */}
            <div className="flex gap-10 animate-scroll-left whitespace-nowrap">
              {[...STOCK_TICKERS, ...STOCK_TICKERS].map((stock, i) => (
                <div
                  key={`${stock.ticker}-${i}`}
                  className="flex items-center gap-3 shrink-0"
                >
                  <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                    <img
                      src={`https://img.logokit.com/ticker/${stock.ticker}?token=pk_frfbe2dd55bc04b3d4d1bc`}
                      alt={stock.ticker}
                      className="w-6 h-6 rounded-full object-cover"
                      onError={(e) => {
                        const parent = e.currentTarget.parentElement
                        if (parent) {
                          e.currentTarget.style.display = "none"
                          parent.innerHTML = `<span class="text-[9px] font-mono text-white/30">${stock.ticker.slice(0, 2)}</span>`
                        }
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-white/60">
                    {stock.ticker}
                  </span>
                  <span className="text-xs text-white/25">{stock.name}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

const STOCK_TICKERS = [
  { ticker: "AAPL", name: "Apple" },
  { ticker: "AMZN", name: "Amazon" },
  { ticker: "GOOG", name: "Alphabet" },
  { ticker: "MSFT", name: "Microsoft" },
  { ticker: "TSLA", name: "Tesla" },
  { ticker: "NVDA", name: "NVIDIA" },
  { ticker: "PFE", name: "Pfizer" },
  { ticker: "INTC", name: "Intel" },
  { ticker: "SOFI", name: "SoFi" },
  { ticker: "OPEN", name: "Opendoor" },
  { ticker: "META", name: "Meta" },
  { ticker: "NFLX", name: "Netflix" },
  { ticker: "AMD", name: "AMD" },
  { ticker: "JPM", name: "JPMorgan" },
]
