const hre = require("hardhat");
const { readFileSync } = require("fs");
const path = require("path");

async function main() {
  const allAddresses = JSON.parse(readFileSync(path.resolve(__dirname, "../deployed-multichain.json"), "utf8"));
  const base = allAddresses.baseSepolia;
  const arb = allAddresses.arbSepolia;

  const [deployer] = await hre.ethers.getSigners();
  const TokenImpl = await hre.ethers.getContractFactory("BackedAutoFeeTokenImplementation");
  const Exchange = await hre.ethers.getContractFactory("SynthStocksExchange");

  if (hre.network.name === "baseSepolia") {
    const token = TokenImpl.attach(base.token);
    const exchange = Exchange.attach(base.exchange);

    const localSupply = await token.totalSupply();
    const globalCap = await exchange.globalSupplyCap();
    const crossChain = await exchange.crossChainSupply();

    console.log("=== Base Sepolia State ===");
    console.log(`Local supply:    ${hre.ethers.utils.formatEther(localSupply)}`);
    console.log(`CrossChain:      ${hre.ethers.utils.formatEther(crossChain)}`);
    console.log(`Global cap:      ${hre.ethers.utils.formatEther(globalCap)}`);

    // Simulate CRE setting crossChainSupply (pretend Arb Sepolia has 990 tokens)
    console.log("\n--- Simulating CRE: set crossChainSupply to 990 tokens ---");
    let tx = await exchange.setCrossChainSupply(hre.ethers.utils.parseEther("990"));
    await tx.wait();

    const newCrossChain = await exchange.crossChainSupply();
    console.log(`CrossChain now:  ${hre.ethers.utils.formatEther(newCrossChain)}`);

    // Try to buy 6 more tokens (local=5, cross=990, total would be 1001 > 1000 cap)
    console.log("\n--- Test: buy 6 tokens (should FAIL: 5+990+6=1001 > 1000 cap) ---");
    const usdc = await hre.ethers.getContractAt("IERC20", base.usdc);
    tx = await exchange.setMaxHoldingBps(10000); await tx.wait(); // temp remove holding limit

    const usdcBal = await usdc.balanceOf(deployer.address);
    if (usdcBal.gte(6000000)) {
      tx = await usdc.approve(base.exchange, 6000000); await tx.wait();
      try {
        tx = await exchange.buy(6000000, { gasLimit: 500000 });
        await tx.wait();
        console.log("FAIL: Buy succeeded but should have been blocked!");
      } catch (e) {
        console.log("PASS: Buy blocked — Exceeds global supply cap");
      }
    }

    // Try to buy 4 tokens (local=5, cross=990, total would be 999 <= 1000 cap)
    console.log("\n--- Test: buy 4 tokens (should SUCCEED: 5+990+4=999 <= 1000 cap) ---");
    if (usdcBal.gte(4000000)) {
      tx = await usdc.approve(base.exchange, 4000000); await tx.wait();
      try {
        tx = await exchange.buy(4000000, { gasLimit: 500000 });
        await tx.wait();
        const newBal = await token.balanceOf(deployer.address);
        console.log(`PASS: Buy succeeded! Token balance: ${hre.ethers.utils.formatEther(newBal)}`);
      } catch (e) {
        console.log("FAIL: Buy should have succeeded:", e.reason || e.message);
      }
    }

    // Reset crossChainSupply to 0 for clean state
    tx = await exchange.setCrossChainSupply(0); await tx.wait();
    tx = await exchange.setMaxHoldingBps(500); await tx.wait();
    console.log("\nReset: crossChainSupply=0, maxHoldingBps=500");

    const finalSupply = await token.totalSupply();
    console.log(`Final local supply: ${hre.ethers.utils.formatEther(finalSupply)}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
