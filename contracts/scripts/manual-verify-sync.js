/**
 * Watches for UserVerified events on Base Sepolia and triggers the
 * CRE verify-sync workflow via `cre workflow simulate --broadcast`.
 *
 * Usage: node scripts/manual-verify-sync.js
 */
const { ethers } = require("ethers");
const { readFileSync } = require("fs");
const { execSync } = require("child_process");
const path = require("path");

const addresses = JSON.parse(readFileSync(path.resolve(__dirname, "../deployed-multichain.json"), "utf8"));

const EXCHANGE_ABI = [
  "event UserVerified(address indexed user, uint256 nullifierHash)",
];

const CRE_WORKFLOW_DIR = path.resolve(__dirname, "../cre/verify-sync");

async function main() {
  const provider = new ethers.providers.JsonRpcProvider("https://sepolia.base.org");
  const exchange = new ethers.Contract(addresses.baseSepolia.exchange, EXCHANGE_ABI, provider);

  console.log("=== Manual Verify Sync (CRE workflow trigger) ===");
  console.log("Exchange:", addresses.baseSepolia.exchange);
  console.log("CRE workflow:", CRE_WORKFLOW_DIR);
  console.log("\nWatching for UserVerified events...\n");

  exchange.on("UserVerified", async (user, nullifierHash, event) => {
    const txHash = event.transactionHash;
    console.log(`\n[${new Date().toISOString()}] UserVerified event detected!`);
    console.log(`  User: ${user}`);
    console.log(`  NullifierHash: ${nullifierHash.toString()}`);
    console.log(`  Tx: ${txHash}`);
    console.log(`\n  Triggering CRE workflow simulate --broadcast ...`);

    try {
      const cmd = [
        "cre workflow simulate",
        path.relative(path.resolve(__dirname, "../cre"), CRE_WORKFLOW_DIR),
        "--target staging-settings",
        "--non-interactive",
        "--trigger-index 0",
        `--evm-tx-hash ${txHash}`,
        "--evm-event-index 0",
        "--broadcast",
      ].join(" ");

      console.log(`  $ ${cmd}\n`);

      const output = execSync(cmd, {
        cwd: path.resolve(__dirname, "../cre"),
        encoding: "utf8",
        timeout: 120000,
      });

      console.log(output);
      console.log("  CRE workflow completed successfully.\n");
    } catch (e) {
      console.error("  CRE workflow failed:", e.message);
      if (e.stdout) console.log(e.stdout);
      if (e.stderr) console.error(e.stderr);
    }

    console.log("Continuing to watch...\n");
  });

  process.on("SIGINT", () => {
    console.log("\nStopping watcher...");
    process.exit(0);
  });
}

main().catch(console.error);
