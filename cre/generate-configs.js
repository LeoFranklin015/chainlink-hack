#!/usr/bin/env node
/**
 * Generate all CRE workflow config files from deployed-unified.json
 */
const fs = require("fs");
const path = require("path");

const deployed = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../contracts/deployed-unified.json"), "utf8")
);

const FINNHUB_API_KEY = "d5vipc9r01qqiqhvae20d5vipc9r01qqiqhvae2g";

const CHAINS = [
  { key: "baseSepolia", selector: "ethereum-testnet-sepolia-base-1" },
  { key: "arbSepolia", selector: "ethereum-testnet-sepolia-arbitrum-1" },
  { key: "avalancheFuji", selector: "avalanche-testnet-fuji" },
];

const TOKENS = {
  sAAPL: { symbol: "AAPL", configKey: "aapl" },
  sNVDA: { symbol: "NVDA", configKey: "nvda" },
  sTSLA: { symbol: "TSLA", configKey: "tsla" },
  sAMZN: { symbol: "AMZN", configKey: "amzn" },
  sMETA: { symbol: "META", configKey: "meta" },
  sGOOG: { symbol: "GOOG", configKey: "goog" },
};

const PRIMARY_CHAIN_KEY = "baseSepolia";

for (const [tokenKey, { symbol, configKey }] of Object.entries(TOKENS)) {
  // --- price-feed config ---
  const priceFeedConfig = {
    schedule: "*/60 * * * * *",
    finnhubApiKey: FINNHUB_API_KEY,
    symbol,
    chains: CHAINS.map((chain) => ({
      chainSelectorName: chain.selector,
      priceReceiverAddress: deployed[chain.key].tokens[tokenKey].priceFeed,
      gasLimit: "500000",
    })),
  };

  const pfPath = path.join(__dirname, "price-feed", `config.${configKey}.json`);
  fs.writeFileSync(pfPath, JSON.stringify(priceFeedConfig, null, 2) + "\n");
  console.log(`Wrote ${pfPath}`);

  // --- supply-sync config ---
  const supplySyncConfig = {
    schedule: "*/60 * * * * *",
    chains: CHAINS.map((chain) => ({
      chainSelectorName: chain.selector,
      tokenAddress: deployed[chain.key].tokens[tokenKey].token,
      exchangeAddress: deployed[chain.key].exchange,
      gasLimit: "500000",
    })),
  };

  const ssPath = path.join(__dirname, "supply-sync", `config.${configKey}.json`);
  fs.writeFileSync(ssPath, JSON.stringify(supplySyncConfig, null, 2) + "\n");
  console.log(`Wrote ${ssPath}`);

  // --- verify-sync config ---
  const primaryChain = CHAINS.find((c) => c.key === PRIMARY_CHAIN_KEY);
  const targetChains = CHAINS.filter((c) => c.key !== PRIMARY_CHAIN_KEY);

  const verifySyncConfig = {
    primaryChain: {
      chainSelectorName: primaryChain.selector,
      exchangeAddress: deployed[primaryChain.key].exchange,
      gasLimit: "500000",
    },
    targetChains: targetChains.map((chain) => ({
      chainSelectorName: chain.selector,
      exchangeAddress: deployed[chain.key].exchange,
      gasLimit: "500000",
    })),
  };

  const vsPath = path.join(__dirname, "verify-sync", `config.${configKey}.json`);
  fs.writeFileSync(vsPath, JSON.stringify(verifySyncConfig, null, 2) + "\n");
  console.log(`Wrote ${vsPath}`);
}

// Also write base config.json for each workflow (copy from first token as default)
for (const dir of ["price-feed", "supply-sync", "verify-sync"]) {
  const first = fs.readFileSync(path.join(__dirname, dir, "config.aapl.json"), "utf8");
  fs.writeFileSync(path.join(__dirname, dir, "config.json"), first);
  console.log(`Wrote ${path.join(__dirname, dir, "config.json")} (default = aapl)`);
}

console.log("\nDone! All configs regenerated from deployed-unified.json");
