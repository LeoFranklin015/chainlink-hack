/**
 * CRE Backend Server (Multichain / Multi-Token)
 *
 * Long-running process that:
 *   1. Calls price-feed CRE workflow every 30 seconds for each token
 *   2. Watches for UserVerified events on primary chain → triggers verify-sync
 *   3. Watches for Buy/Sell events on all chains → triggers supply-sync
 *
 * Usage:
 *   node scripts/cre-backend.js              # runs all 6 tokens
 *   node scripts/cre-backend.js sAAPL sNVDA  # runs only specified tokens
 */
require("dotenv").config();
const { ethers } = require("ethers");
const { readFileSync, copyFileSync } = require("fs");
const { execSync, exec } = require("child_process");
const http = require("http");
const path = require("path");

// ─── Config ──────────────────────────────────────────────────────────────────
const CRE_DIR = path.resolve(__dirname, "../../cre");

const CHAINS = [
  {
    key: "baseSepolia",
    name: "Base Sepolia",
    rpc: "https://sepolia.base.org",
  },
  {
    key: "arbSepolia",
    name: "Arb Sepolia",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
  },
  {
    key: "avalancheFuji",
    name: "Avalanche Fuji",
    rpc: "https://api.avax-test.network/ext/bc/C/rpc",
  },
];

const PRIMARY_CHAIN = CHAINS[0]; // Base Sepolia is primary for verify-sync

const ALL_TOKENS = ["sAAPL", "sNVDA", "sTSLA", "sAMZN", "sMETA", "sGOOG"];

const SYMBOL_TO_CONFIG = {
  sAAPL: "aapl",
  sNVDA: "nvda",
  sTSLA: "tsla",
  sAMZN: "amzn",
  sMETA: "meta",
  sGOOG: "goog",
};

const EXCHANGE_ABI = [
  "event UserVerified(address indexed user, uint256 nullifierHash)",
  "event Buy(address indexed buyer, uint256 usdcAmount, uint256 tokenAmount)",
  "event Sell(address indexed seller, uint256 usdcAmount, uint256 tokenAmount)",
  "function verifyOffchain(address user, uint256 nullifierHash) external",
  "function verifiedUsers(address) view returns (bool)",
];

// Unified exchange addresses (one per chain, shared across all tokens)
const UNIFIED_EXCHANGES = {
  baseSepolia: "0x06a26BCd49421952c8791cEf860c9824B6b45106",
  arbSepolia: "0xCEA1Ff3051DF8c6AeB1613726E33F9096897d90E",
  avalancheFuji: "0x6d1ea244c4b6C3d62488b7FDa0955Bdd354D1613",
};

const HTTP_PORT = process.env.CRE_BACKEND_PORT || 3100;

const PRICE_FEED_INTERVAL_MS = 30_000;
const SUPPLY_SYNC_INTERVAL_MS = 60_000;

// Select tokens from CLI args or default to all
const selectedTokens = process.argv.length > 2
  ? process.argv.slice(2).filter((t) => ALL_TOKENS.includes(t))
  : ALL_TOKENS;

// ─── CRE runner ──────────────────────────────────────────────────────────────
const creRunning = {};

function buildCreCmd(workflowName, args, configFile) {
  // CRE CLI doesn't support --config-file; copy per-symbol config to config.json
  if (configFile) {
    const src = path.join(CRE_DIR, workflowName, configFile);
    const dst = path.join(CRE_DIR, workflowName, "config.json");
    copyFileSync(src, dst);
  }

  return [
    "cre workflow simulate",
    workflowName,
    "--target staging-settings",
    "--non-interactive",
    ...args,
    "--broadcast",
  ]
    .filter(Boolean)
    .join(" ");
}

function parseCreOutput(output, label) {
  const logLines = output.split("\n").filter((l) => l.includes("[USER LOG]"));
  logLines.forEach((l) => console.log(`  [${label}] ${l.trim()}`));
  const resultMatch = output.match(/Workflow Simulation Result:\n"(.+)"/);
  if (resultMatch) {
    console.log(`  [${label}] Result: ${resultMatch[1]}`);
  }
  console.log(`  [${label}] Done.\n`);
}

// Synchronous version — used by price-feed (runs sequentially in tick loop)
function runCre(workflowName, args, label, configFile) {
  const cmd = buildCreCmd(workflowName, args, configFile);
  console.log(`  [${label}] $ ${cmd}`);

  try {
    const output = execSync(cmd, {
      cwd: CRE_DIR,
      encoding: "utf8",
      timeout: 180_000,
    });
    parseCreOutput(output, label);
  } catch (e) {
    console.error(`  [${label}] FAILED: ${e.message}`);
    if (e.stdout) {
      const lines = e.stdout.split("\n").filter((l) => l.trim());
      lines.slice(-5).forEach((l) => console.error(`  [${label}]   ${l}`));
    }
    console.log();
  }
}

// Async version — used by event handlers so they don't block the event loop
function runCreAsync(workflowName, args, label, configFile) {
  return new Promise((resolve) => {
    const cmd = buildCreCmd(workflowName, args, configFile);
    console.log(`  [${label}] $ ${cmd}`);

    exec(cmd, { cwd: CRE_DIR, encoding: "utf8", timeout: 180_000 }, (err, stdout, stderr) => {
      if (err) {
        console.error(`  [${label}] FAILED: ${err.message}`);
        if (stdout) {
          const lines = stdout.split("\n").filter((l) => l.trim());
          lines.slice(-5).forEach((l) => console.error(`  [${label}]   ${l}`));
        }
        console.log();
      } else {
        parseCreOutput(stdout, label);
      }
      resolve();
    });
  });
}

// ─── 1. Price Feed (every 30s, one per token) ───────────────────────────────
function startPriceFeed() {
  async function tick() {
    const ts = new Date().toISOString();
    for (const token of selectedTokens) {
      const runKey = `priceFeed:${token}`;
      if (creRunning[runKey]) {
        console.log(`[price-feed:${token}] Previous run still active, skipping.`);
        continue;
      }
      console.log(`[${ts}] Running price-feed for ${token}...`);
      creRunning[runKey] = true;
      try {
        const configFile = `config.${SYMBOL_TO_CONFIG[token]}.json`;
        runCre("price-feed", ["--trigger-index 0"], `price-feed:${token}`, configFile);
      } finally {
        creRunning[runKey] = false;
      }
    }
  }

  tick();
  setInterval(tick, PRICE_FEED_INTERVAL_MS);
  console.log(
    `[price-feed] Scheduled every ${PRICE_FEED_INTERVAL_MS / 1000}s for ${selectedTokens.length} tokens\n`
  );
}

// ─── 2. Verify Sync (event-driven on primary chain) ─────────────────────────
function startVerifyWatcher() {
  const provider = new ethers.providers.JsonRpcProvider(PRIMARY_CHAIN.rpc);
  const exchangeAddr = UNIFIED_EXCHANGES[PRIMARY_CHAIN.key];

  if (!exchangeAddr) {
    console.error("[verify-sync] No exchange address for primary chain, skipping.");
    return;
  }

  const exchange = new ethers.Contract(exchangeAddr, EXCHANGE_ABI, provider);

  console.log(
    `[verify-sync] Watching UserVerified on ${PRIMARY_CHAIN.name} (${exchangeAddr})`
  );

  exchange.on("UserVerified", async (user, nullifierHash, event) => {
    const txHash = event.transactionHash;
    const ts = new Date().toISOString();
    console.log(`[${ts}] UserVerified!`);
    console.log(`  User: ${user}, Tx: ${txHash}`);

    // Only run verify-sync ONCE — the exchange is unified (same on all chains),
    // so all per-token configs point to the same exchange addresses.
    const runKey = "verifySync";
    if (creRunning[runKey]) {
      console.log(`  [verify-sync] Previous run still active, skipping.`);
      return;
    }
    creRunning[runKey] = true;
    // Use any token's config (all have the same exchange addresses)
    const configFile = `config.${SYMBOL_TO_CONFIG[selectedTokens[0]]}.json`;
    runCreAsync(
      "verify-sync",
      [
        "--trigger-index 0",
        `--evm-tx-hash ${txHash}`,
        "--evm-event-index 0",
      ],
      "verify-sync",
      configFile
    ).finally(() => {
      creRunning[runKey] = false;
    });
  });

  provider.on("error", (err) => {
    console.error("[verify-sync] Provider error:", err.message);
  });

  console.log();
}

// ─── 3. Supply Sync (timer-based, every 60s) ────────────────────────────────
// Event listeners on free public RPCs are unreliable (timeouts, block skew).
// Instead, run supply-sync on a timer — the CRE workflow reads totalSupply
// from all chains and reconciles, so it's idempotent and safe to run often.
function startSupplySync() {
  async function tick() {
    const ts = new Date().toISOString();
    for (const token of selectedTokens) {
      const runKey = `supplySync:${token}`;
      if (creRunning[runKey]) {
        console.log(`[supply-sync:${token}] Previous run still active, skipping.`);
        continue;
      }
      console.log(`[${ts}] Running supply-sync for ${token}...`);
      creRunning[runKey] = true;
      try {
        const configFile = `config.${SYMBOL_TO_CONFIG[token]}.json`;
        runCre("supply-sync", ["--trigger-index 0"], `supply-sync:${token}`, configFile);
      } finally {
        creRunning[runKey] = false;
      }
    }
  }

  // Run first tick after a short delay (let price-feed go first)
  setTimeout(tick, 5000);
  setInterval(tick, SUPPLY_SYNC_INTERVAL_MS);
  console.log(
    `[supply-sync] Scheduled every ${SUPPLY_SYNC_INTERVAL_MS / 1000}s for ${selectedTokens.length} tokens\n`
  );
}

// ─── 4. HTTP API for on-chain allowlisting ───────────────────────────────────
function startHttpServer() {
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  if (!PRIVATE_KEY) {
    console.error("[http] WARNING: PRIVATE_KEY not set — /allowlist endpoint will fail");
  }

  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/allowlist") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { walletAddress, nullifierHash } = JSON.parse(body);
          if (!walletAddress || !nullifierHash) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing walletAddress or nullifierHash" }));
            return;
          }

          // Only call verifyOffchain on the PRIMARY chain (Base Sepolia).
          // The UserVerified event will trigger the verify-sync CRE workflow
          // which propagates verification to the other chains automatically.
          const primaryChain = PRIMARY_CHAIN;
          const exchangeAddr = UNIFIED_EXCHANGES[primaryChain.key];

          console.log(`[allowlist] Verifying user ${walletAddress} on ${primaryChain.name} (verify-sync will propagate)...`);

          const results = [];
          try {
            const provider = new ethers.providers.JsonRpcProvider(primaryChain.rpc);
            const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
            const exchange = new ethers.Contract(exchangeAddr, EXCHANGE_ABI, wallet);

            // Check if already verified
            const alreadyVerified = await exchange.verifiedUsers(walletAddress);
            if (alreadyVerified) {
              console.log(`  [allowlist] ${primaryChain.name}: already verified`);
              results.push({ chain: primaryChain.name, status: "already_verified" });
            } else {
              const tx = await exchange.verifyOffchain(walletAddress, nullifierHash);
              console.log(`  [allowlist] ${primaryChain.name}: tx ${tx.hash}`);
              await tx.wait();
              console.log(`  [allowlist] ${primaryChain.name}: confirmed (verify-sync will propagate to other chains)`);
              results.push({ chain: primaryChain.name, status: "verified", txHash: tx.hash });
              // verify-sync CRE will handle Arb Sepolia + Avalanche Fuji
              results.push({ chain: "Arb Sepolia", status: "pending_sync" });
              results.push({ chain: "Avalanche Fuji", status: "pending_sync" });
            }
          } catch (err) {
            console.error(`  [allowlist] ${primaryChain.name}: FAILED — ${err.message}`);
            results.push({ chain: primaryChain.name, status: "error", error: err.message });
          }

          const allOk = results.every((r) => r.status !== "error");
          res.writeHead(allOk ? 200 : 500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: allOk, results }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(HTTP_PORT, () => {
    console.log(`[http] Allowlist API listening on http://localhost:${HTTP_PORT}/allowlist\n`);
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────
function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║       xStocks CRE Backend Server (Multichain)   ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log(`Tokens: ${selectedTokens.join(", ")}`);
  console.log(`Chains: ${CHAINS.map((c) => c.name).join(", ")}`);
  console.log(`Primary chain: ${PRIMARY_CHAIN.name}`);
  console.log(`CRE dir: ${CRE_DIR}\n`);

  startHttpServer();
  startVerifyWatcher();
  startSupplySync();
  startPriceFeed();

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });
}

main();
