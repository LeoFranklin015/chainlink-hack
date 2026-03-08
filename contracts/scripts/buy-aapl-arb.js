const hre = require("hardhat");

const EXCHANGE = "0xCEA1Ff3051DF8c6AeB1613726E33F9096897d90E";
const USDC = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
const AAPL_TOKEN = "0x2149bD489aaC80CAD09108A4D137ECDE76a5245f";

async function main() {
  const [wallet] = await hre.ethers.getSigners();
  console.log("Wallet:", wallet.address);

  const exchange = new hre.ethers.Contract(EXCHANGE, [
    "function verifiedUsers(address) view returns (bool)",
    "function setVerifiedUser(address user, bool verified)",
    "function buy(address token, uint256 usdcAmount)",
    "function getPrice(address token) view returns (uint256)",
    "function owner() view returns (address)",
  ], wallet);

  // 1. Verify user if needed
  const isVerified = await exchange.verifiedUsers(wallet.address);
  console.log("Already verified:", isVerified);

  if (!isVerified) {
    console.log("Verifying user...");
    const tx = await exchange.setVerifiedUser(wallet.address, true);
    await tx.wait();
    console.log("User verified!");
  }

  // 2. Check USDC balance
  const usdc = new hre.ethers.Contract(USDC, [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)",
  ], wallet);

  const usdcBal = await usdc.balanceOf(wallet.address);
  console.log("USDC balance:", hre.ethers.utils.formatUnits(usdcBal, 6));

  const amount = hre.ethers.utils.parseUnits("1", 6); // 1 USDC
  if (usdcBal.lt(amount)) {
    console.log("ERROR: Not enough USDC. Need 1 but have", hre.ethers.utils.formatUnits(usdcBal, 6));
    return;
  }

  // 2b. Exempt deployer from holding limit (needed when supply is 0)
  const isExempt = await new hre.ethers.Contract(EXCHANGE, [
    "function exemptAddresses(address) view returns (bool)",
    "function setExemptAddress(address,bool)",
  ], wallet).exemptAddresses(wallet.address);
  if (!isExempt) {
    console.log("Setting deployer as exempt from holding limit...");
    const exemptExchange = new hre.ethers.Contract(EXCHANGE, [
      "function setExemptAddress(address,bool)",
    ], wallet);
    const tx2 = await exemptExchange.setExemptAddress(wallet.address, true);
    await tx2.wait();
    console.log("Deployer exempted");
  }

  // 3. Refresh price (it may be stale from deployment)
  const AAPL_PRICE_FEED = "0xdF85A3eE71272a85B08dC7F7818Db27741336964";
  const priceFeed = new hre.ethers.Contract(AAPL_PRICE_FEED, [
    "function updatePrice(uint256 _price)",
    "function latestPrice() view returns (uint256)",
    "function lastUpdatedAt() view returns (uint256)",
  ], wallet);

  const lastUpdated = await priceFeed.lastUpdatedAt();
  const now = Math.floor(Date.now() / 1000);
  if (now - lastUpdated.toNumber() > 3500) {
    console.log("Price is stale, refreshing...");
    const updateTx = await priceFeed.updatePrice(22748000000); // $227.48
    await updateTx.wait();
    console.log("Price updated to $227.48");
  }

  const price = await exchange.getPrice(AAPL_TOKEN);
  console.log("sAAPL price: $" + hre.ethers.utils.formatUnits(price, 8));

  // 4. Approve USDC
  const allowance = await usdc.allowance(wallet.address, EXCHANGE);
  if (allowance.lt(amount)) {
    console.log("Approving USDC...");
    const approveTx = await usdc.approve(EXCHANGE, hre.ethers.constants.MaxUint256);
    await approveTx.wait();
    console.log("USDC approved");
  }

  // 5. Buy 1 USDC worth of sAAPL
  console.log("Buying 1 USDC worth of sAAPL...");
  const buyTx = await exchange.buy(AAPL_TOKEN, amount, { gasLimit: 500000 });
  const receipt = await buyTx.wait();
  console.log("Buy tx:", receipt.transactionHash);
  console.log("Status:", receipt.status === 1 ? "SUCCESS" : "FAILED");

  // 6. Check sAAPL balance
  const token = new hre.ethers.Contract(AAPL_TOKEN, [
    "function balanceOf(address) view returns (uint256)",
  ], wallet.provider);
  const tokenBal = await token.balanceOf(wallet.address);
  console.log("sAAPL balance:", hre.ethers.utils.formatEther(tokenBal));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
