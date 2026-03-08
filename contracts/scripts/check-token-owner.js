const hre = require("hardhat");
async function main() {
  const TokenImpl = await hre.ethers.getContractFactory("BackedAutoFeeTokenImplementation");
  const token = TokenImpl.attach("0xeA77b677b5B41aaB01abD7c37804707D51e94079");
  const owner = await token.owner();
  console.log("Token owner:", owner);
  const sanctionsListAddr = await token.sanctionsList();
  console.log("Current sanctionsList:", sanctionsListAddr);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
