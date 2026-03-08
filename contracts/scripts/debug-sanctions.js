const hre = require("hardhat");
async function main() {
  const SanctionsList = await hre.ethers.getContractFactory("ExchangeOnlySanctionsList");
  // The last deployed one
  const sl = SanctionsList.attach("0x5Ff920D4458FCA8456d2801377E69a12F25bD817");
  
  const tokenAddr = "0xeA77b677b5B41aaB01abD7c37804707D51e94079";
  const allowed = await sl.allowedAddresses(tokenAddr);
  const sanctioned = await sl.isSanctioned(tokenAddr);
  console.log("Token allowed:", allowed);
  console.log("Token sanctioned:", sanctioned);
  
  const owner = await sl.owner();
  console.log("SanctionsList owner:", owner);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
