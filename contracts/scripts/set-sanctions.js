const hre = require("hardhat");
async function main() {
  const TokenImpl = await hre.ethers.getContractFactory("BackedAutoFeeTokenImplementation");
  const token = TokenImpl.attach("0xeA77b677b5B41aaB01abD7c37804707D51e94079");
  
  // Try with explicit gas limit
  const tx = await token.setSanctionsList("0x5Ff920D4458FCA8456d2801377E69a12F25bD817", { gasLimit: 200000 });
  const receipt = await tx.wait();
  console.log("Success! tx:", receipt.transactionHash);
}
main().then(() => process.exit(0)).catch(e => { console.error(e.reason || e.message); process.exit(1); });
