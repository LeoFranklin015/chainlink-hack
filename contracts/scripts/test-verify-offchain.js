const hre = require("hardhat");
const { readFileSync } = require("fs");
const path = require("path");

async function main() {
  const networkName = hre.network.name;
  const addresses = JSON.parse(readFileSync(path.resolve(__dirname, "../deployed-multichain.json"), "utf8"));
  const config = addresses[networkName];
  if (!config) throw new Error(`No addresses for ${networkName}`);

  const [deployer] = await hre.ethers.getSigners();
  const Exchange = await hre.ethers.getContractFactory("SynthStocksExchange");
  const exchange = Exchange.attach(config.exchange);

  // Use a test nullifier hash
  const testNullifierHash = hre.ethers.BigNumber.from(
    hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes("test-nullifier-verify-sync"))
  );

  // Test address to verify
  const testUser = "0x000000000000000000000000000000000000dEaD";

  console.log("Exchange:", config.exchange);
  console.log("Calling verifyOffchain for", testUser);
  const tx = await exchange.verifyOffchain(testUser, testNullifierHash, { gasLimit: 200000 });
  const receipt = await tx.wait();
  console.log("Tx hash:", receipt.transactionHash);
  console.log("Block:", receipt.blockNumber);

  // Check event
  const event = receipt.events.find(e => e.event === "UserVerified");
  if (event) {
    console.log("UserVerified event emitted!");
    console.log("  user:", event.args.user);
    console.log("  nullifierHash:", event.args.nullifierHash.toString());
  }

  // Verify it worked
  const isVerified = await exchange.verifiedUsers(testUser);
  console.log("verifiedUsers[testUser]:", isVerified);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
