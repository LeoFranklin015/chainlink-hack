const hre = require("hardhat");
const { readFileSync } = require("fs");
const path = require("path");
async function main() {
  const networkName = hre.network.name;
  const addresses = JSON.parse(readFileSync(path.resolve(__dirname, "../deployed-multichain.json"), "utf8"));
  const config = addresses[networkName];
  if (!config) throw new Error("No addresses for " + networkName);
  const PriceReceiver = await hre.ethers.getContractFactory("SynthStocksPriceReceiver");
  const pr = PriceReceiver.attach(config.priceReceiver);
  const tx = await pr.updatePrice(100000000, { gasLimit: 100000 });
  await tx.wait();
  console.log(networkName + ": Price updated to $1.00 on " + config.priceReceiver);
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
