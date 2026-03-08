import { createConfig, http } from "wagmi"
import { base, arbitrumSepolia } from "wagmi/chains"
import { jaw } from "@jaw.id/wagmi"
import { Mode } from "@jaw.id/core"
import { ReactUIHandler } from "@jaw.id/ui"

const uiHandler = typeof window !== "undefined" ? new ReactUIHandler() : undefined

export const config = createConfig({
  chains: [base, arbitrumSepolia],
  connectors: [
    jaw({
      apiKey: process.env.NEXT_PUBLIC_JAW_API_KEY!,
      appName: "Synthetic Stocks",
      defaultChainId: arbitrumSepolia.id,
      preference: {
        mode: Mode.AppSpecific,
        uiHandler: uiHandler as ReactUIHandler,
        showTestnets: true,
      },
    }),
  ],
  transports: {
    [base.id]: http(),
    [arbitrumSepolia.id]: http(),
  },
})
