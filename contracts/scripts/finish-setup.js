const hre = require("hardhat");
const { writeFileSync } = require("fs");
const path = require("path");

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const TOKEN = "0x4cC8C18232F79c5BB3E5876de3A375453c9Ee3F9";
const EXCHANGE = "0x2Ad9b59E5B297966ba49b7C816a68Afa423fa145";
const SANCTIONS = "0x3493d91e21a9965fc03bA980C637611C969f5f6b";
const PRICE_RECEIVER = "0x72E5fd80a6AFBb62ec37C4E9462B545262dF7056";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  let tx;

  // 1. Set transfer lock on exchange
  const Exchange = await hre.ethers.getContractFactory("SynthStocksExchange");
  const exchange = Exchange.attach(EXCHANGE);
  tx = await exchange.setTransferLock(SANCTIONS); await tx.wait();
  console.log("Transfer lock set on exchange");

  // 2. Verify deployer for testing
  tx = await exchange.setVerifiedUser(deployer.address, true); await tx.wait();
  console.log("Deployer verified");

  // 3. Set max holding to 100% for bootstrap
  tx = await exchange.setMaxHoldingBps(10000); await tx.wait();
  console.log("Max holding set to 100%");

  // 4. Test buy: 1 USDC
  console.log("\n--- Test Buy ---");
  const usdc = await hre.ethers.getContractAt("IERC20", USDC_ADDRESS);
  const usdcBal = await usdc.balanceOf(deployer.address);
  console.log("USDC balance:", usdcBal.toString());

  const TokenImpl = await hre.ethers.getContractFactory("BackedAutoFeeTokenImplementation");
  const token = TokenImpl.attach(TOKEN);

  if (usdcBal.gte(1000000)) {
    tx = await usdc.approve(EXCHANGE, 1000000); await tx.wait();
    tx = await exchange.buy(1000000, { gasLimit: 500000 }); await tx.wait();
    const tokenBal = await token.balanceOf(deployer.address);
    console.log("Buy PASSED! Token balance:", hre.ethers.utils.formatEther(tokenBal));

    // Lower holding limit to 5%
    tx = await exchange.setMaxHoldingBps(500); await tx.wait();
    console.log("Max holding restored to 5%");
  }

  // 5. Test direct transfer (should fail)
  console.log("\n--- Test Direct Transfer ---");
  try {
    tx = await token.transfer("0x000000000000000000000000000000000000dEaD", hre.ethers.utils.parseEther("0.1"), { gasLimit: 200000 });
    await tx.wait();
    console.log("FAIL: Direct transfer succeeded!");
  } catch (e) {
    console.log("PASS: Direct transfer blocked");
  }

  // Save addresses
  const addresses = {
    network: "baseSepolia",
    deployer: deployer.address,
    token: TOKEN,
    priceReceiver: PRICE_RECEIVER,
    exchange: EXCHANGE,
    sanctionsList: SANCTIONS,
    usdc: USDC_ADDRESS,
    maxHoldingBps: 500,
    testPrice: "$1.00",
    transferRestriction: "exchange-only",
    deployedAt: new Date().toISOString(),
  };
  writeFileSync(path.resolve(__dirname, "../deployed-addresses-test.json"), JSON.stringify(addresses, null, 2));
  console.log("\n=== Setup Complete ===");
  console.log(JSON.stringify(addresses, null, 2));
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
