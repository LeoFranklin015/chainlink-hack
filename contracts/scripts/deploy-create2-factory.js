const hre = require("hardhat");
const { readFileSync, writeFileSync } = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  console.log(`[${network}] Deploying Create2Deployer with account: ${deployer.address}`);

  const balance = await deployer.getBalance();
  console.log(`[${network}] Balance: ${hre.ethers.utils.formatEther(balance)} ETH`);

  if (balance.isZero()) {
    console.error(`[${network}] Account has no funds, skipping.`);
    process.exit(1);
  }

  const Factory = await hre.ethers.getContractFactory("Create2Deployer");

  // Use nonce 0 to get deterministic address (if account is fresh)
  const nonce = await deployer.getTransactionCount();
  console.log(`[${network}] Deployer nonce: ${nonce}`);

  const factory = await Factory.deploy();
  await factory.deployed();
  console.log(`[${network}] Create2Deployer deployed to: ${factory.address}`);

  // Save
  const addressesPath = path.resolve(__dirname, "../deployed-addresses.json");
  const addresses = JSON.parse(readFileSync(addressesPath, "utf8"));
  if (!addresses.create2Deployer) addresses.create2Deployer = {};
  addresses.create2Deployer[network] = factory.address;
  writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
