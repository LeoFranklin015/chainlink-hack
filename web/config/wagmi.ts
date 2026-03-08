import { createConfig, http } from "wagmi"
import { baseSepolia, arbitrumSepolia, avalancheFuji } from "wagmi/chains"
import { jaw } from "@jaw.id/wagmi"
import { Mode } from "@jaw.id/core"
import { ReactUIHandler } from "@jaw.id/ui"

const uiHandler = typeof window !== "undefined" ? new ReactUIHandler() : undefined

export const config = createConfig({
  chains: [baseSepolia, arbitrumSepolia, avalancheFuji],
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
      paymasters: {
        [baseSepolia.id]: {
          url: `https://api.pimlico.io/v2/${baseSepolia.id}/rpc?apikey=${process.env.NEXT_PUBLIC_PAYMASTER_API_KEY!}`,
          context: {
            sponsorshipPolicyId: process.env.NEXT_PUBLIC_POLICY_ID!,
          },
        },
        [arbitrumSepolia.id]: {
          url: `https://api.pimlico.io/v2/${arbitrumSepolia.id}/rpc?apikey=${process.env.NEXT_PUBLIC_PAYMASTER_API_KEY!}`,
          context: {
            sponsorshipPolicyId: process.env.NEXT_PUBLIC_POLICY_ID!,
          },
        },
        [avalancheFuji.id]: {
          url: `https://api.pimlico.io/v2/${avalancheFuji.id}/rpc?apikey=${process.env.NEXT_PUBLIC_PAYMASTER_API_KEY!}`,
          context: {
            sponsorshipPolicyId: process.env.NEXT_PUBLIC_POLICY_ID!,
          },
        },
      },
    }),
  ],
  transports: {
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [avalancheFuji.id]: http(),
  },
})
