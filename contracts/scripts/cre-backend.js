/**
 * CRE Backend Server
 *
 * Long-running process that:
 *   1. Calls price-feed CRE workflow every 30 seconds
 *   2. Watches for UserVerified events → triggers verify-sync CRE workflow
 *   3. Watches for Buy events → triggers supply-sync CRE workflow
 *
 * Usage: node scripts/cre-backend.js
 */
const { ethers } = require("ethers");
const { readFileSync } = require("fs");
const { execSync } = require("child_process");
const path = require("path");

// ─── Config ──────────────────────────────────────────────────────────────────
const CRE_DIR = path.resolve(__dirname, "../cre");
const addresses = JSON.parse(
  readFileSync(path.resolve(__dirname, "../deployed-multichain.json"), "utf8")
);

const CHAINS = [
  {
    name: "Base Sepolia",
    rpc: "https://sepolia.base.org",
    exchange: addresses.baseSepolia.exchange,
  },
  {
    name: "Arb Sepolia",
    rpc: "https://sepolia-rollup.arbitrum.io/rpc",
    exchange: addresses.arbSepolia.exchange,
  },
];

const PRIMARY_CHAIN = CHAINS[0]; // Base Sepolia is primary

const EXCHANGE_ABI = [
  "event UserVerified(address indexed user, uint256 nullifierHash)",
  "event Buy(address indexed buyer, uint256 usdcAmount, uint256 tokenAmount)",
  "event Sell(address indexed seller, uint256 usdcAmount, uint256 tokenAmount)",
];

const PRICE_FEED_INTERVAL_MS = 30_000;

// ─── CRE runner ──────────────────────────────────────────────────────────────
let creRunning = { priceFeed: false, verifySync: false, supplySync: false };

function runCre(workflowName, args, label) {
  const cmd = [
    "cre workflow simulate",
    workflowName,
    "--target staging-settings",
    "--non-interactive",
    ...args,
    "--broadcast",
  ].join(" ");

  console.log(`  [${label}] $ ${cmd}`);

  try {
    const output = execSync(cmd, {
      cwd: CRE_DIR,
      encoding: "utf8",
      timeout: 180_000,
    });
    // Print all USER LOG lines
    const logLines = output.split("\n").filter((l) => l.includes("[USER LOG]"));
    logLines.forEach((l) => console.log(`  [${label}] ${l.trim()}`));
    // Print result
    const resultMatch = output.match(/Workflow Simulation Result:\n"(.+)"/);
    if (resultMatch) {
      console.log(`  [${label}] Result: ${resultMatch[1]}`);
    }
    console.log(`  [${label}] Done.\n`);
  } catch (e) {
    console.error(`  [${label}] FAILED: ${e.message}`);
    if (e.stdout) {
      const lines = e.stdout.split("\n").filter((l) => l.trim());
      lines.slice(-5).forEach((l) => console.error(`  [${label}]   ${l}`));
    }
    console.log();
  }
}

// ─── 1. Price Feed (every 30s) ──────────────────────────────────────────────
function startPriceFeed() {
  async function tick() {
    if (creRunning.priceFeed) {
      console.log("[price-feed] Previous run still active, skipping.\n");
      return;
    }
    const ts = new Date().toISOString();
    console.log(`[${ts}] Running price-feed...`);
    creRunning.priceFeed = true;
    try {
      runCre("price-feed", ["--trigger-index 0"], "price-feed");
    } finally {
      creRunning.priceFeed = false;
    }
  }

  // Run immediately, then every 30s
  tick();
  setInterval(tick, PRICE_FEED_INTERVAL_MS);
  console.log(
    `[price-feed] Scheduled every ${PRICE_FEED_INTERVAL_MS / 1000}s\n`
  );
}

// ─── 2. Verify Sync (event-driven) ─────────────────────────────────────────
function startVerifyWatcher() {
  const provider = new ethers.providers.JsonRpcProvider(PRIMARY_CHAIN.rpc);
  const exchange = new ethers.Contract(
    PRIMARY_CHAIN.exchange,
    EXCHANGE_ABI,
    provider
  );

  console.log(
    `[verify-sync] Watching UserVerified on ${PRIMARY_CHAIN.name} (${PRIMARY_CHAIN.exchange})\n`
  );

  exchange.on("UserVerified", async (user, nullifierHash, event) => {
    const txHash = event.transactionHash;
    const ts = new Date().toISOString();
    console.log(`[${ts}] UserVerified detected!`);
    console.log(`  User: ${user}`);
    console.log(`  Nullifier: ${nullifierHash.toString().slice(0, 20)}...`);
    console.log(`  Tx: ${txHash}`);

    if (creRunning.verifySync) {
      console.log(
        "  [verify-sync] Previous run still active, queuing skipped.\n"
      );
      return;
    }
    creRunning.verifySync = true;
    try {
      runCre(
        "verify-sync",
        [
          "--trigger-index 0",
          `--evm-tx-hash ${txHash}`,
          "--evm-event-index 0",
        ],
        "verify-sync"
      );
    } finally {
      creRunning.verifySync = false;
    }
  });

  // Reconnect on error
  provider.on("error", (err) => {
    console.error("[verify-sync] Provider error:", err.message);
  });
}

// ─── 3. Supply Sync (event-driven on Buy/Sell) ─────────────────────────────
function startSupplySyncWatcher() {
  for (const chain of CHAINS) {
    const provider = new ethers.providers.JsonRpcProvider(chain.rpc);
    const exchange = new ethers.Contract(
      chain.exchange,
      EXCHANGE_ABI,
      provider
    );

    console.log(
      `[supply-sync] Watching Buy/Sell on ${chain.name} (${chain.exchange})\n`
    );

    exchange.on("Buy", async (buyer, usdcAmount, tokenAmount, event) => {
      const ts = new Date().toISOString();
      console.log(`[${ts}] Buy detected on ${chain.name}!`);
      console.log(`  Buyer: ${buyer}, USDC: ${ethers.utils.formatUnits(usdcAmount, 6)}, xAAPL: ${ethers.utils.formatUnits(tokenAmount, 18)}`);
      console.log(`  Tx: ${event.transactionHash}`);

      if (creRunning.supplySync) {
        console.log("  [supply-sync] Previous run still active, skipping.\n");
        return;
      }
      creRunning.supplySync = true;
      try {
        runCre("supply-sync", ["--trigger-index 0"], "supply-sync");
      } finally {
        creRunning.supplySync = false;
      }
    });

    exchange.on("Sell", async (seller, usdcAmount, tokenAmount, event) => {
      const ts = new Date().toISOString();
      console.log(`[${ts}] Sell detected on ${chain.name}!`);
      console.log(`  Seller: ${seller}, USDC: ${ethers.utils.formatUnits(usdcAmount, 6)}, xAAPL: ${ethers.utils.formatUnits(tokenAmount, 18)}`);
      console.log(`  Tx: ${event.transactionHash}`);

      if (creRunning.supplySync) {
        console.log("  [supply-sync] Previous run still active, skipping.\n");
        return;
      }
      creRunning.supplySync = true;
      try {
        runCre("supply-sync", ["--trigger-index 0"], "supply-sync");
      } finally {
        creRunning.supplySync = false;
      }
    });

    provider.on("error", (err) => {
      console.error(`[supply-sync] ${chain.name} provider error:`, err.message);
    });
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║          SynthStocks CRE Backend Server             ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log(`Primary chain: ${PRIMARY_CHAIN.name} (${PRIMARY_CHAIN.exchange})`);
  console.log(`Chains: ${CHAINS.map((c) => c.name).join(", ")}`);
  console.log(`CRE dir: ${CRE_DIR}\n`);

  startVerifyWatcher();
  startSupplySyncWatcher();
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
