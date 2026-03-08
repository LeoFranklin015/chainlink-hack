const hre = require("hardhat");
const { writeFileSync } = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await deployer.getBalance();
  console.log(
    "Account balance:",
    hre.ethers.utils.formatEther(balance),
    "ETH"
  );

  // 1. Deploy MockSanctionsList
  console.log("\n--- Deploying MockSanctionsList ---");
  const MockSanctionsList = await hre.ethers.getContractFactory(
    "MockSanctionsList"
  );
  const sanctionsList = await MockSanctionsList.deploy();
  await sanctionsList.deployed();
  console.log("MockSanctionsList deployed to:", sanctionsList.address);

  // 2. Deploy BackedAutoFeeTokenImplementation (logic contract)
  console.log("\n--- Deploying Implementation ---");
  const Implementation = await hre.ethers.getContractFactory(
    "BackedAutoFeeTokenImplementation"
  );
  const implementation = await Implementation.deploy();
  await implementation.deployed();
  console.log("Implementation deployed to:", implementation.address);

  // 3. Deploy ProxyAdmin
  console.log("\n--- Deploying ProxyAdmin ---");
  const ProxyAdmin = await hre.ethers.getContractFactory("ProxyAdmin");
  const proxyAdmin = await ProxyAdmin.deploy();
  await proxyAdmin.deployed();
  console.log("ProxyAdmin deployed to:", proxyAdmin.address);

  // 4. Deploy TransparentUpgradeableProxy pointing to implementation
  console.log("\n--- Deploying Token Proxy ---");
  const initData = Implementation.interface.encodeFunctionData(
    "initialize(string,string,uint256,uint256,uint256)",
    [
      "SynthStocks Apple", // name
      "xAAPL", // symbol
      86400, // periodLength (1 day)
      Math.floor(Date.now() / 1000), // lastTimeFeeApplied
      0, // feePerPeriod (no auto fees for testnet)
    ]
  );

  const Proxy = await hre.ethers.getContractFactory("BackedTokenProxy");
  const proxy = await Proxy.deploy(
    implementation.address,
    proxyAdmin.address,
    initData,
    { gasLimit: 2_000_000 }
  );
  await proxy.deployed();
  console.log("Proxy deployed to:", proxy.address);

  // 5. Connect to the token through the proxy
  const token = Implementation.attach(proxy.address);

  // 6. Set roles
  console.log("\n--- Setting roles ---");

  let tx = await token.setMinter(deployer.address);
  await tx.wait();
  console.log("Minter set to:", deployer.address);

  tx = await token.setBurner(deployer.address);
  await tx.wait();
  console.log("Burner set to:", deployer.address);

  tx = await token.setPauser(deployer.address);
  await tx.wait();
  console.log("Pauser set to:", deployer.address);

  tx = await token.setMultiplierUpdater(deployer.address);
  await tx.wait();
  console.log("MultiplierUpdater set to:", deployer.address);

  tx = await token.setSanctionsList(sanctionsList.address);
  await tx.wait();
  console.log("SanctionsList set to:", sanctionsList.address);

  // 7. Verify
  const name = await token.name();
  const symbol = await token.symbol();
  const [multiplier] = await token.getCurrentMultiplier();
  console.log(`\nToken: ${name} (${symbol})`);
  console.log("Multiplier:", hre.ethers.utils.formatEther(multiplier));

  // 8. Save addresses
  const addresses = {
    sanctionsList: sanctionsList.address,
    implementation: implementation.address,
    proxyAdmin: proxyAdmin.address,
    token: proxy.address,
    deployer: deployer.address,
    network: hre.network.name,
    deployedAt: new Date().toISOString(),
  };

  const addressesPath = path.resolve(__dirname, "../deployed-addresses.json");
  writeFileSync(addressesPath, JSON.stringify(addresses, null, 2));
  console.log("\nAddresses saved to deployed-addresses.json");

  console.log("\n=== Deployment Summary ===");
  console.log("MockSanctionsList:", sanctionsList.address);
  console.log("Implementation:", implementation.address);
  console.log("ProxyAdmin:", proxyAdmin.address);
  console.log("xAAPL Token (proxy):", proxy.address);
  console.log("Deployer:", deployer.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
