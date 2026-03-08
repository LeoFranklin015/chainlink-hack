const hre = require("hardhat");
const { readFileSync } = require("fs");
const path = require("path");

async function main() {
  const networkName = hre.network.name;
  const addresses = JSON.parse(readFileSync(path.resolve(__dirname, "../deployed-multichain.json"), "utf8"));
  const config = addresses[networkName];
  if (!config) throw new Error(`No addresses for ${networkName}`);

  const [deployer] = await hre.ethers.getSigners();
  const Exchange = await hre.ethers.getContractFactory("SynthStocksExchange");
  const exchange = Exchange.attach(config.exchange);

  const tx = await exchange.setVerifier(deployer.address);
  await tx.wait();
  console.log(`${networkName}: verifier set to ${deployer.address} on exchange ${config.exchange}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
