const hre = require("hardhat");
const { readFileSync, writeFileSync } = require("fs");
const path = require("path");

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const WORLD_ID_ROUTER = "0x42FF98C4E85212a5D31358ACbFe76a621b50fC02"; // Base Sepolia (v3 legacy)
const WORLD_ID_VERIFIER = "0x0000000000000000000000000000000000000000"; // v4 not yet on Base Sepolia

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const addressesPath = path.resolve(__dirname, "../deployed-addresses.json");
  const addresses = JSON.parse(readFileSync(addressesPath, "utf8"));
  console.log("Token address:", addresses.token);

  // Compute externalNullifierHash from app_id + action
  const appId = "app_SynthStocks";
  const action = "buy_xaapl";
  const externalNullifierHash = hre.ethers.BigNumber.from(
    hre.ethers.utils.solidityKeccak256(
      ["bytes"],
      [hre.ethers.utils.solidityPack(
        ["bytes32", "bytes32"],
        [
          hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes(appId)),
          hre.ethers.utils.keccak256(hre.ethers.utils.toUtf8Bytes(action)),
        ]
      )]
    )
  ).shr(8);

  console.log("World ID Router (v3):", WORLD_ID_ROUTER);
  console.log("World ID Verifier (v4):", WORLD_ID_VERIFIER);
  console.log("External nullifier hash:", externalNullifierHash.toString());

  // 1. Deploy SynthStocksExchange
  console.log("\n--- Deploying SynthStocksExchange ---");
  const Exchange = await hre.ethers.getContractFactory("SynthStocksExchange");
  const exchange = await Exchange.deploy(
    addresses.token,
    USDC_ADDRESS,
    WORLD_ID_ROUTER,
    externalNullifierHash,
    WORLD_ID_VERIFIER
  );
  await exchange.deployed();
  console.log("SynthStocksExchange deployed to:", exchange.address);

  // 2. Transfer minter and burner roles to exchange
  console.log("\n--- Transferring roles to exchange ---");
  const token = await hre.ethers.getContractAt(
    "BackedAutoFeeTokenImplementation",
    addresses.token
  );

  let tx = await token.setMinter(exchange.address);
  await tx.wait();
  console.log("Minter set to exchange:", exchange.address);

  tx = await token.setBurner(exchange.address);
  await tx.wait();
  console.log("Burner set to exchange:", exchange.address);

  // 3. Save exchange address
  addresses.exchange = exchange.address;
  writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log("\nExchange address saved to deployed-addresses.json");

  console.log("\n=== Exchange Deployment Summary ===");
  console.log("SynthStocksExchange:", exchange.address);
  console.log("Token (xAAPL):", addresses.token);
  console.log("USDC:", USDC_ADDRESS);
  console.log("World ID Router (v3):", WORLD_ID_ROUTER);
  console.log("World ID Verifier (v4):", WORLD_ID_VERIFIER);
  console.log("Minter role: transferred to exchange");
  console.log("Burner role: transferred to exchange");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
