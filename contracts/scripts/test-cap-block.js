const hre = require("hardhat");
const { readFileSync } = require("fs");
const path = require("path");

async function main() {
  const allAddresses = JSON.parse(readFileSync(path.resolve(__dirname, "../deployed-multichain.json"), "utf8"));
  const base = allAddresses.baseSepolia;
  const [deployer] = await hre.ethers.getSigners();

  const TokenImpl = await hre.ethers.getContractFactory("BackedAutoFeeTokenImplementation");
  const Exchange = await hre.ethers.getContractFactory("SynthStocksExchange");
  const token = TokenImpl.attach(base.token);
  const exchange = Exchange.attach(base.exchange);
  const usdc = await hre.ethers.getContractAt("IERC20", base.usdc);

  const localSupply = await token.totalSupply();
  console.log(`Local supply: ${hre.ethers.utils.formatEther(localSupply)}`);

  // Set crossChainSupply so that local + cross = 999, only 1 token room left
  const crossChainVal = hre.ethers.utils.parseEther("1000").sub(localSupply).sub(hre.ethers.utils.parseEther("0.5"));
  let tx = await exchange.setCrossChainSupply(crossChainVal); await tx.wait();
  console.log(`Set crossChainSupply to ${hre.ethers.utils.formatEther(crossChainVal)}`);
  console.log(`Room left: 0.5 tokens`);

  tx = await exchange.setMaxHoldingBps(10000); await tx.wait();

  // Try buy 1 USDC = 1 token (should FAIL: exceeds cap by 0.5)
  console.log("\n--- Buy 1 token (should FAIL: 0.5 room, trying 1) ---");
  tx = await usdc.approve(base.exchange, 1000000); await tx.wait();
  try {
    tx = await exchange.buy(1000000, { gasLimit: 500000 });
    await tx.wait();
    console.log("FAIL: Should have been blocked!");
  } catch (e) {
    console.log("PASS: Buy blocked by global supply cap");
  }

  // Reset
  tx = await exchange.setCrossChainSupply(0); await tx.wait();
  tx = await exchange.setMaxHoldingBps(500); await tx.wait();
  console.log("\nReset complete");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
