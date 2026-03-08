const { buy, sell, getBalance, getPrice, getSigner } = require("./lib/token");

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log("Usage:");
    console.log("  node scripts/trade.js buy  <address> <usdcAmount>");
    console.log("  node scripts/trade.js sell <address> <usdcAmount>");
    console.log("\nExamples:");
    console.log("  node scripts/trade.js buy  0x1234... 10    # Pay 10 USDC, receive xAAPL");
    console.log("  node scripts/trade.js sell 0x1234... 10    # Sell xAAPL, receive 10 USDC");
    process.exit(1);
  }

  const [action, address, amount] = args;
  const numAmount = parseFloat(amount);

  if (isNaN(numAmount) || numAmount <= 0) {
    console.error("Error: amount must be a positive number");
    process.exit(1);
  }

  const currentPrice = await getPrice();
  console.log(`Current xAAPL price: $${currentPrice.toFixed(2)}\n`);

  const signer = getSigner();

  if (action === "buy") {
    await buy(address, numAmount);
    const newBalance = await getBalance(address, signer);
    console.log(`\nNew balance of ${address}: ${newBalance.toFixed(6)} xAAPL`);
  } else if (action === "sell") {
    const balanceBefore = await getBalance(address, signer);
    console.log(`Current balance of ${address}: ${balanceBefore.toFixed(6)} xAAPL`);
    await sell(address, numAmount);
    const balanceAfter = await getBalance(address, signer);
    console.log(`\nNew balance of ${address}: ${balanceAfter.toFixed(6)} xAAPL`);
  } else {
    console.error(`Unknown action: ${action}. Use "buy" or "sell".`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
