const hre = require("hardhat");
async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await deployer.getBalance();
  console.log(`${hre.network.name}: ${deployer.address} = ${hre.ethers.utils.formatEther(balance)} ETH`);
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
