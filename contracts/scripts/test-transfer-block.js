const hre = require("hardhat");
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const TokenImpl = await hre.ethers.getContractFactory("BackedAutoFeeTokenImplementation");
  const token = TokenImpl.attach("0xeA77b677b5B41aaB01abD7c37804707D51e94079");

  const balance = await token.balanceOf(deployer.address);
  console.log("Token balance:", hre.ethers.utils.formatEther(balance));

  // Test 1: Direct transfer (should FAIL)
  console.log("\n--- Test 1: Direct transfer ---");
  try {
    const tx = await token.transfer("0x000000000000000000000000000000000000dEaD", hre.ethers.utils.parseEther("0.1"), { gasLimit: 200000 });
    await tx.wait();
    console.log("FAIL: Direct transfer succeeded (should have been blocked!)");
  } catch (e) {
    console.log("PASS: Direct transfer blocked:", e.reason || "reverted");
  }

  // Test 2: Exchange buy (should SUCCEED)
  console.log("\n--- Test 2: Exchange buy ---");
  const usdc = await hre.ethers.getContractAt("IERC20", "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  const usdcBal = await usdc.balanceOf(deployer.address);
  console.log("USDC balance:", usdcBal.toString());

  if (usdcBal.gte(1000000)) {
    const Exchange = await hre.ethers.getContractFactory("SynthStocksExchange");
    const exchange = Exchange.attach("0x7FAEFA4eac0522749E841C34d9E503420468D5Ac");
    
    let tx = await usdc.approve(exchange.address, 1000000);
    await tx.wait();
    
    try {
      tx = await exchange.buy(1000000, { gasLimit: 500000 }); // 1 USDC
      await tx.wait();
      const newBal = await token.balanceOf(deployer.address);
      console.log("PASS: Exchange buy succeeded! New balance:", hre.ethers.utils.formatEther(newBal));
    } catch (e) {
      console.log("FAIL: Exchange buy failed:", e.reason || e.message);
    }
  } else {
    console.log("SKIP: Not enough USDC");
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
