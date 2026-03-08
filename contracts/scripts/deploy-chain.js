const hre = require("hardhat");
const { writeFileSync, readFileSync, existsSync } = require("fs");
const path = require("path");

// USDC addresses per network (use mock if no official USDC available)
const USDC_ADDRESSES = {
  baseSepolia: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  arbSepolia: "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

const WORLD_ID_ROUTER = "0x42FF98C4E85212a5D31358ACbFe76a621b50fC02";
const WORLD_ID_VERIFIER = "0x0000000000000000000000000000000000000000";
const GLOBAL_SUPPLY_CAP = hre.ethers.utils.parseEther("1000"); // 1000 tokens max across all chains

async function main() {
  const networkName = hre.network.name;
  const usdcAddress = USDC_ADDRESSES[networkName];
  if (!usdcAddress) {
    throw new Error(`No USDC address configured for ${networkName}`);
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log(`\n=== Deploying on ${networkName} ===`);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.utils.formatEther(await deployer.getBalance()), "ETH");

  // 1. Token Implementation
  console.log("\n--- Token Implementation ---");
  const TokenImpl = await hre.ethers.getContractFactory("BackedAutoFeeTokenImplementation");
  const tokenImpl = await TokenImpl.deploy();
  await tokenImpl.deployed();
  console.log("Deployed:", tokenImpl.address);

  // 2. ProxyAdmin
  console.log("\n--- ProxyAdmin ---");
  const ProxyAdmin = await hre.ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.deployed();
  console.log("Deployed:", proxyAdmin.address);

  // 3. Token Proxy
  console.log("\n--- Token Proxy ---");
  const initData = TokenImpl.interface.encodeFunctionData(
    "initialize(string,string,uint256,uint256,uint256)",
    ["xAAPL Test", "xAAPL", 86400, Math.floor(Date.now() / 1000), 0]
  );
  const Proxy = await hre.ethers.getContractFactory("BackedTokenProxy");
  const proxy = await Proxy.deploy(tokenImpl.address, proxyAdmin.address, initData, { gasLimit: 2_000_000 });
  await proxy.deployed();
  const tokenAddress = proxy.address;
  console.log("Token:", tokenAddress);

  const token = TokenImpl.attach(tokenAddress);

  // 4. Price Receiver ($1.00 test price)
  console.log("\n--- PriceReceiver ---");
  const PriceReceiver = await hre.ethers.getContractFactory("SynthStocksPriceReceiver");
  const priceReceiver = await PriceReceiver.deploy(deployer.address);
  await priceReceiver.deployed();
  let tx = await priceReceiver.updatePrice(100000000, { gasLimit: 100000 }); // $1.00
  await tx.wait();
  console.log("Deployed:", priceReceiver.address, "price=$1.00");

  // 5. Exchange
  console.log("\n--- SynthStocksExchange ---");
  const appId = "app_SynthStocks_test";
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

  const Exchange = await hre.ethers.getContractFactory("SynthStocksExchange");
  const exchange = await Exchange.deploy(
    tokenAddress,
    usdcAddress,
    WORLD_ID_ROUTER,
    externalNullifierHash,
    WORLD_ID_VERIFIER,
    priceReceiver.address,
    3600,
    500     // maxHoldingBps: 5%
  );
  await exchange.deployed();
  console.log("Deployed:", exchange.address);

  // 6. ExchangeOnlySanctionsList
  console.log("\n--- ExchangeOnlySanctionsList ---");
  const SanctionsList = await hre.ethers.getContractFactory("ExchangeOnlySanctionsList");
  const sanctionsList = await SanctionsList.deploy(exchange.address, tokenAddress);
  await sanctionsList.deployed();
  console.log("Deployed:", sanctionsList.address);

  // 7. Set token roles
  tx = await token.setSanctionsList(sanctionsList.address, { gasLimit: 200000 }); await tx.wait();
  tx = await token.setPauser(deployer.address); await tx.wait();
  tx = await token.setMinter(exchange.address); await tx.wait();
  tx = await token.setBurner(exchange.address); await tx.wait();
  console.log("Token roles set");

  // 8. Configure exchange
  tx = await exchange.setTransferLock(sanctionsList.address); await tx.wait();
  tx = await exchange.setVerifiedUser(deployer.address, true); await tx.wait();
  tx = await exchange.setGlobalSupplyCap(GLOBAL_SUPPLY_CAP); await tx.wait();
  // Owner can also update cross-chain supply initially
  console.log("Exchange configured (transferLock, verified user, globalSupplyCap=1000)");

  // Save addresses
  const addresses = {
    network: networkName,
    deployer: deployer.address,
    token: tokenAddress,
    implementation: tokenImpl.address,
    proxyAdmin: proxyAdmin.address,
    priceReceiver: priceReceiver.address,
    exchange: exchange.address,
    sanctionsList: sanctionsList.address,
    usdc: usdcAddress,
    globalSupplyCap: "1000",
    maxHoldingBps: 500,
    testPrice: "$1.00",
    deployedAt: new Date().toISOString(),
  };

  // Load existing multi-chain addresses file
  const addressesPath = path.resolve(__dirname, "../deployed-multichain.json");
  let allAddresses = {};
  if (existsSync(addressesPath)) {
    allAddresses = JSON.parse(readFileSync(addressesPath, "utf8"));
  }
  allAddresses[networkName] = addresses;
  writeFileSync(addressesPath, JSON.stringify(allAddresses, null, 2));

  console.log(`\n=== ${networkName} Deployment Complete ===`);
  console.log(JSON.stringify(addresses, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
