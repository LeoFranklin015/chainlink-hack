const hre = require("hardhat");
const { readFileSync } = require("fs");
const path = require("path");

async function main() {
  const networkName = hre.network.name;
  const allAddresses = JSON.parse(readFileSync(path.resolve(__dirname, "../deployed-multichain.json"), "utf8"));
  const addrs = allAddresses[networkName];
  if (!addrs) throw new Error(`No addresses for ${networkName}`);

  const [deployer] = await hre.ethers.getSigners();
  const TokenImpl = await hre.ethers.getContractFactory("BackedAutoFeeTokenImplementation");
  const token = TokenImpl.attach(addrs.token);
  const Exchange = await hre.ethers.getContractFactory("SynthStocksExchange");
  const exchange = Exchange.attach(addrs.exchange);

  // Set holding limit to 100% for bootstrap
  let tx = await exchange.setMaxHoldingBps(10000); await tx.wait();

  // Approve + buy 5 USDC worth
  const usdc = await hre.ethers.getContractAt("IERC20", addrs.usdc);
  const usdcBal = await usdc.balanceOf(deployer.address);
  console.log(`${networkName} USDC balance: ${usdcBal.toString()}`);

  if (usdcBal.gte(5000000)) {
    tx = await usdc.approve(addrs.exchange, 5000000); await tx.wait();
    tx = await exchange.buy(5000000, { gasLimit: 500000 }); await tx.wait(); // 5 USDC = 5 tokens
    console.log("Bought 5 tokens");
  } else {
    console.log("Not enough USDC, skipping buy");
  }

  // Restore holding limit
  tx = await exchange.setMaxHoldingBps(500); await tx.wait();

  const tokenBal = await token.balanceOf(deployer.address);
  const totalSupply = await token.totalSupply();
  const crossChain = await exchange.crossChainSupply();
  const globalCap = await exchange.globalSupplyCap();
  console.log(`${networkName} results:`);
  console.log(`  Token balance: ${hre.ethers.utils.formatEther(tokenBal)}`);
  console.log(`  Total supply:  ${hre.ethers.utils.formatEther(totalSupply)}`);
  console.log(`  CrossChain:    ${hre.ethers.utils.formatEther(crossChain)}`);
  console.log(`  Global cap:    ${hre.ethers.utils.formatEther(globalCap)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
