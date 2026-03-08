const hre = require("hardhat");
const { readFileSync, writeFileSync } = require("fs");
const path = require("path");

// The well-known deterministic deployment proxy (available on all major chains)
// See: https://github.com/Arachnid/deterministic-deployment-proxy
const DETERMINISTIC_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

const SYMBOLS = ["AAPL", "NVDA", "GOOG", "META"];

function getSalt(symbol) {
  return hre.ethers.utils.keccak256(
    hre.ethers.utils.toUtf8Bytes(`SynthStocks-price-receiver-${symbol}-v1`)
  );
}

function getCreate2Address(deployer, salt, initCodeHash) {
  return hre.ethers.utils.getCreate2Address(deployer, salt, initCodeHash);
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  console.log(`\n=== [${network}] Deploying Price Receivers via CREATE2 ===`);
  console.log(`Account: ${signer.address}`);

  const balance = await signer.getBalance();
  console.log(`Balance: ${hre.ethers.utils.formatEther(balance)} ETH`);

  if (balance.isZero()) {
    console.error(`[${network}] Account has no funds, skipping.`);
    process.exit(1);
  }

  // Check deterministic deployer exists
  const deployerCode = await hre.ethers.provider.getCode(DETERMINISTIC_DEPLOYER);
  if (deployerCode === "0x") {
    console.error(`[${network}] Deterministic deployer not available at ${DETERMINISTIC_DEPLOYER}`);
    process.exit(1);
  }

  const PriceReceiver = await hre.ethers.getContractFactory("SynthStocksPriceReceiver");

  // Constructor arg: updater = deployer (can be changed later via setUpdater)
  const constructorArgs = hre.ethers.utils.defaultAbiCoder.encode(
    ["address"],
    [signer.address]
  );
  const initCode = PriceReceiver.bytecode + constructorArgs.slice(2);
  const initCodeHash = hre.ethers.utils.keccak256(initCode);

  // Load addresses
  const addressesPath = path.resolve(__dirname, "../deployed-addresses.json");
  const addresses = JSON.parse(readFileSync(addressesPath, "utf8"));
  if (!addresses.priceReceivers) addresses.priceReceivers = {};
  if (!addresses.priceReceivers[network]) addresses.priceReceivers[network] = {};

  for (const symbol of SYMBOLS) {
    const salt = getSalt(symbol);
    const expectedAddress = getCreate2Address(DETERMINISTIC_DEPLOYER, salt, initCodeHash);
    console.log(`\n--- ${symbol} ---`);
    console.log(`Salt: ${salt}`);
    console.log(`Expected address: ${expectedAddress}`);

    // Check if already deployed
    const existingCode = await hre.ethers.provider.getCode(expectedAddress);
    if (existingCode !== "0x") {
      console.log(`Already deployed at ${expectedAddress}, skipping.`);
      addresses.priceReceivers[network][symbol] = expectedAddress;
      continue;
    }

    // Deploy via deterministic deployer: send salt + initCode as raw tx data
    const deployData = salt + initCode.slice(2);
    console.log(`Deploying ${symbol} price receiver...`);

    const tx = await signer.sendTransaction({
      to: DETERMINISTIC_DEPLOYER,
      data: deployData,
      gasLimit: 2000000,
    });
    const receipt = await tx.wait();
    console.log(`Deployed! tx: ${receipt.transactionHash}`);

    // Verify
    const deployedCode = await hre.ethers.provider.getCode(expectedAddress);
    if (deployedCode === "0x") {
      console.error(`ERROR: No code at expected address ${expectedAddress}`);
      process.exit(1);
    }
    console.log(`Verified at: ${expectedAddress}`);
    addresses.priceReceivers[network][symbol] = expectedAddress;
  }

  writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log(`\n=== [${network}] All price receivers deployed ===`);
  console.log(JSON.stringify(addresses.priceReceivers[network], null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
