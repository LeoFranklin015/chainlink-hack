const hre = require("hardhat");

const TOKEN_ADDRESS = "0xeA77b677b5B41aaB01abD7c37804707D51e94079";
const EXCHANGE_ADDRESS = "0x7FAEFA4eac0522749E841C34d9E503420468D5Ac";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Deploy ExchangeOnlySanctionsList
  const SanctionsList = await hre.ethers.getContractFactory("ExchangeOnlySanctionsList");
  const sanctionsList = await SanctionsList.deploy(EXCHANGE_ADDRESS);
  await sanctionsList.deployed();
  console.log("ExchangeOnlySanctionsList deployed:", sanctionsList.address);

  // 2. Allow the token contract itself (needed for setSanctionsList check)
  let tx = await sanctionsList.setAllowed(TOKEN_ADDRESS, true);
  await tx.wait();
  console.log("Token address whitelisted in sanctions list");

  // 3. Set it on the token
  const TokenImpl = await hre.ethers.getContractFactory("BackedAutoFeeTokenImplementation");
  const token = TokenImpl.attach(TOKEN_ADDRESS);
  tx = await token.setSanctionsList(sanctionsList.address);
  await tx.wait();
  console.log("SanctionsList set on token");

  // 4. Test: try direct transfer (should fail)
  const balance = await token.balanceOf(deployer.address);
  console.log("\nDeployer token balance:", hre.ethers.utils.formatEther(balance));

  try {
    const tx2 = await token.transfer("0x000000000000000000000000000000000000dEaD", hre.ethers.utils.parseEther("0.1"));
    await tx2.wait();
    console.log("ERROR: Direct transfer succeeded (should have failed!)");
  } catch (e) {
    console.log("Direct transfer BLOCKED as expected");
  }

  // 5. Test: buy via exchange (should still work)
  const usdcAddress = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const usdc = await hre.ethers.getContractAt("IERC20", usdcAddress);
  const usdcBalance = await usdc.balanceOf(deployer.address);
  console.log("Deployer USDC balance:", usdcBalance.toString());

  if (usdcBalance.gte(1000000)) {
    const Exchange = await hre.ethers.getContractFactory("SynthStocksExchange");
    const exchange = Exchange.attach(EXCHANGE_ADDRESS);

    const approveTx = await usdc.approve(EXCHANGE_ADDRESS, 1000000);
    await approveTx.wait();

    try {
      const buyTx = await exchange.buy(1000000, { gasLimit: 500000 });
      await buyTx.wait();
      console.log("Exchange buy SUCCEEDED!");
      const newBalance = await token.balanceOf(deployer.address);
      console.log("New token balance:", hre.ethers.utils.formatEther(newBalance));
    } catch (e) {
      console.log("Exchange buy failed:", e.reason || e.message);
    }
  } else {
    console.log("Not enough USDC to test buy");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error(error); process.exit(1); });
