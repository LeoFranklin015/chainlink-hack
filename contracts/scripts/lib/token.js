const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const ADDRESSES_PATH = path.resolve(__dirname, "../deployed-addresses.json");

const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_DECIMALS = 6;

const USDC_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const EXCHANGE_ABI = [
  "function buy(uint256 usdcAmount) external",
  "function sell(uint256 usdcAmount) external",
  "function verify(address signal, uint256 nullifier, uint256 action, uint64 rpId, uint256 nonce, uint256 signalHash, uint64 expiresAtMin, uint64 issuerSchemaId, uint256 credentialGenesisIssuedAtMin, uint256[5] calldata proof) external",
  "function verifyLegacy(address signal, uint256 root, uint256 nullifierHash, uint256[8] calldata proof) external",
  "function verifiedUsers(address) view returns (bool)",
  "function depositUsdc(uint256 amount) external",
  "function withdrawUsdc(uint256 amount) external",
  "function token() view returns (address)",
  "function usdc() view returns (address)",
  "function owner() view returns (address)",
  "function worldIdRouter() view returns (address)",
  "function worldIdVerifier() view returns (address)",
  "function externalNullifierHash() view returns (uint256)",
];

const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address account, uint256 amount)",
  "function burn(address account, uint256 amount)",
  "function multiplier() view returns (uint256)",
  "function getCurrentMultiplier() view returns (uint256 newMultiplier, uint256 periodsPassed, uint256 newMultiplierNonce)",
  "function updateMultiplierValue(uint256 newMultiplier, uint256 oldMultiplier)",
  "function minter() view returns (address)",
  "function burner() view returns (address)",
  "function owner() view returns (address)",
];

function loadAddresses() {
  if (!fs.existsSync(ADDRESSES_PATH)) {
    throw new Error(
      "deployed-addresses.json not found. Run the deploy script first."
    );
  }
  return JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));
}

function getProvider() {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";
  return new ethers.providers.JsonRpcProvider(rpcUrl);
}

function getSigner() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY not set in .env");
  }
  return new ethers.Wallet(process.env.PRIVATE_KEY, getProvider());
}

function getTokenContract(signerOrProvider) {
  const addresses = loadAddresses();
  return new ethers.Contract(
    addresses.token,
    TOKEN_ABI,
    signerOrProvider || getSigner()
  );
}

function getUsdcContract(signerOrProvider) {
  return new ethers.Contract(
    USDC_ADDRESS,
    USDC_ABI,
    signerOrProvider || getSigner()
  );
}

function getExchangeContract(signerOrProvider) {
  const addresses = loadAddresses();
  if (!addresses.exchange) {
    throw new Error(
      "Exchange address not found. Run deploy-exchange.js first."
    );
  }
  return new ethers.Contract(
    addresses.exchange,
    EXCHANGE_ABI,
    signerOrProvider || getSigner()
  );
}

async function getPrice() {
  const token = getTokenContract(getProvider());
  const [currentMultiplier] = await token.getCurrentMultiplier();
  const priceUsd = parseFloat(ethers.utils.formatEther(currentMultiplier));
  return priceUsd;
}

async function getBalance(address, signerOrProvider) {
  const token = getTokenContract(signerOrProvider || getProvider());
  const balance = await token.balanceOf(address);
  return parseFloat(ethers.utils.formatEther(balance));
}

async function buy(toAddress, usdcAmount) {
  const signer = getSigner();
  const signerAddress = await signer.getAddress();
  const exchange = getExchangeContract(signer);
  const token = getTokenContract(signer);
  const usdc = getUsdcContract(signer);

  const usdcAmountRaw = ethers.utils.parseUnits(usdcAmount.toString(), USDC_DECIMALS);

  // Check USDC balance
  const usdcBalance = await usdc.balanceOf(signerAddress);
  console.log(
    `USDC balance: ${ethers.utils.formatUnits(usdcBalance, USDC_DECIMALS)} USDC`
  );
  if (usdcBalance.lt(usdcAmountRaw)) {
    throw new Error(
      `Insufficient USDC. Have ${ethers.utils.formatUnits(usdcBalance, USDC_DECIMALS)}, need ${usdcAmount}`
    );
  }

  // Approve USDC to exchange
  const addresses = loadAddresses();
  console.log(`Approving ${usdcAmount} USDC to exchange...`);
  const approveTx = await usdc.approve(addresses.exchange, usdcAmountRaw);
  console.log(`Approve tx: ${approveTx.hash}`);
  await approveTx.wait();
  console.log("USDC approval confirmed!");

  // Preview token amount
  const [currentMultiplier] = await token.getCurrentMultiplier();
  const multiplierFloat = parseFloat(ethers.utils.formatEther(currentMultiplier));
  const tokenAmount = usdcAmount / multiplierFloat;

  // Buy via exchange (mints xAAPL to signer)
  console.log(
    `Buying ~${tokenAmount.toFixed(6)} xAAPL (${usdcAmount} USDC) via exchange...`
  );
  const tx = await exchange.buy(usdcAmountRaw);
  console.log(`Buy tx: ${tx.hash}`);
  await tx.wait();
  console.log("Buy confirmed!");

  // If toAddress differs from signer, transfer xAAPL
  if (toAddress.toLowerCase() !== signerAddress.toLowerCase()) {
    const tokenAmountWei = ethers.utils.parseEther(tokenAmount.toFixed(18));
    console.log(`Transferring xAAPL to ${toAddress}...`);
    const transferTx = await token.transfer(toAddress, tokenAmountWei);
    console.log(`Transfer tx: ${transferTx.hash}`);
    await transferTx.wait();
    console.log("Transfer confirmed!");
  }

  return tx;
}

async function sell(fromAddress, usdcAmount) {
  const signer = getSigner();
  const signerAddress = await signer.getAddress();
  const exchange = getExchangeContract(signer);
  const token = getTokenContract(signer);
  const usdc = getUsdcContract(signer);

  const usdcAmountRaw = ethers.utils.parseUnits(usdcAmount.toString(), USDC_DECIMALS);

  // Calculate xAAPL needed
  const [currentMultiplier] = await token.getCurrentMultiplier();
  const multiplierFloat = parseFloat(ethers.utils.formatEther(currentMultiplier));
  const tokenAmount = usdcAmount / multiplierFloat;
  const tokenAmountWei = ethers.utils.parseEther(tokenAmount.toFixed(18));

  // Check xAAPL balance
  const xaaplBalance = await token.balanceOf(signerAddress);
  if (xaaplBalance.lt(tokenAmountWei)) {
    throw new Error(
      `Insufficient xAAPL. Have ${parseFloat(ethers.utils.formatEther(xaaplBalance)).toFixed(6)}, need ${tokenAmount.toFixed(6)}`
    );
  }

  // Check exchange USDC pool
  const addresses = loadAddresses();
  const exchangeUsdcBalance = await usdc.balanceOf(addresses.exchange);
  console.log(
    `Exchange USDC pool: ${ethers.utils.formatUnits(exchangeUsdcBalance, USDC_DECIMALS)} USDC`
  );
  if (exchangeUsdcBalance.lt(usdcAmountRaw)) {
    throw new Error(
      `Insufficient USDC in exchange pool. Have ${ethers.utils.formatUnits(exchangeUsdcBalance, USDC_DECIMALS)}, need ${usdcAmount}`
    );
  }

  // Approve xAAPL to exchange
  console.log(`Approving ${tokenAmount.toFixed(6)} xAAPL to exchange...`);
  const approveTx = await token.approve(addresses.exchange, tokenAmountWei);
  console.log(`Approve tx: ${approveTx.hash}`);
  await approveTx.wait();
  console.log("xAAPL approval confirmed!");

  // Sell via exchange (burns xAAPL, sends USDC to signer)
  console.log(
    `Selling ${tokenAmount.toFixed(6)} xAAPL (${usdcAmount} USDC) via exchange...`
  );
  const tx = await exchange.sell(usdcAmountRaw);
  console.log(`Sell tx: ${tx.hash}`);
  await tx.wait();
  console.log("Sell confirmed!");

  // If fromAddress differs from signer, transfer USDC
  if (fromAddress.toLowerCase() !== signerAddress.toLowerCase()) {
    console.log(`Forwarding ${usdcAmount} USDC to ${fromAddress}...`);
    const transferTx = await usdc.transfer(fromAddress, usdcAmountRaw);
    console.log(`Transfer tx: ${transferTx.hash}`);
    await transferTx.wait();
    console.log("USDC forwarded!");
  }

  return tx;
}

async function verifyWorldId(signal, root, nullifierHash, proof) {
  const signer = getSigner();
  const exchange = getExchangeContract(signer);

  console.log(`Verifying World ID for ${signal}...`);
  const tx = await exchange.verify(signal, root, nullifierHash, proof);
  console.log(`Verify tx: ${tx.hash}`);
  await tx.wait();
  console.log("World ID verification confirmed!");

  return tx;
}

async function updatePrice(newPriceUsd) {
  const signer = getSigner();
  const token = getTokenContract(signer);

  const newMultiplier = ethers.utils.parseEther(newPriceUsd.toString());
  const [oldMultiplier] = await token.getCurrentMultiplier();

  console.log(
    `Updating multiplier: ${ethers.utils.formatEther(oldMultiplier)} -> ${newPriceUsd}`
  );
  const tx = await token.updateMultiplierValue(newMultiplier, oldMultiplier);
  console.log(`Transaction: ${tx.hash}`);
  await tx.wait();
  console.log("Confirmed!");

  return tx;
}

module.exports = {
  loadAddresses,
  getProvider,
  getSigner,
  getTokenContract,
  getUsdcContract,
  getExchangeContract,
  getPrice,
  getBalance,
  buy,
  sell,
  verifyWorldId,
  updatePrice,
  TOKEN_ABI,
  EXCHANGE_ABI,
  USDC_ADDRESS,
  USDC_DECIMALS,
};
