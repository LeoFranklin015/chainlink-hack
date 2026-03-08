const hre = require("hardhat");
const { readFileSync, writeFileSync } = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // For now, the updater is the deployer itself.
  // Once CRE DON forwarder address is known, call setUpdater() to change it.
  const updater = deployer.address;

  console.log("\n--- Deploying SynthStocksPriceReceiver ---");
  const PriceReceiver = await hre.ethers.getContractFactory("SynthStocksPriceReceiver");
  const priceReceiver = await PriceReceiver.deploy(updater);
  await priceReceiver.deployed();
  console.log("SynthStocksPriceReceiver deployed to:", priceReceiver.address);

  // Save address
  const addressesPath = path.resolve(__dirname, "../deployed-addresses.json");
  const addresses = JSON.parse(readFileSync(addressesPath, "utf8"));
  addresses.priceReceiver = priceReceiver.address;
  writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log("Price receiver address saved to deployed-addresses.json");

  console.log("\n=== Price Receiver Deployment Summary ===");
  console.log("SynthStocksPriceReceiver:", priceReceiver.address);
  console.log("Updater:", updater);
  console.log("\nNote: Call setUpdater() with the CRE DON forwarder address once known.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
