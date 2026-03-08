import { Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  Buy,
  Sell,
  UserVerified,
  HolderFlagged,
  HolderUnflagged,
  CrossChainSupplyUpdated,
} from "../generated/SynthStocksExchange/SynthStocksExchange";
import {
  Trade,
  UserVerification,
  HoldingLimitEvent,
  CrossChainSupplyUpdate,
  Holder,
} from "../generated/schema";
import { getOrCreateHolder, getOrCreateStats, ONE } from "./utils";

function eventId(txHash: Bytes, logIndex: BigInt): Bytes {
  return txHash.concatI32(logIndex.toI32());
}

export function handleBuy(event: Buy): void {
  let holder = getOrCreateHolder(event.params.buyer);
  holder.balance = holder.balance.plus(event.params.tokenAmount);
  holder.totalBought = holder.totalBought.plus(event.params.tokenAmount);
  holder.totalVolumeUSDC = holder.totalVolumeUSDC.plus(event.params.usdcAmount);
  holder.save();

  let trade = new Trade(eventId(event.transaction.hash, event.logIndex));
  trade.type = "BUY";
  trade.holder = holder.id;
  trade.usdcAmount = event.params.usdcAmount;
  trade.tokenAmount = event.params.tokenAmount;
  trade.blockNumber = event.block.number;
  trade.timestamp = event.block.timestamp;
  trade.transactionHash = event.transaction.hash;
  trade.save();

  let stats = getOrCreateStats();
  stats.totalTrades = stats.totalTrades.plus(ONE);
  stats.totalVolumeUSDC = stats.totalVolumeUSDC.plus(event.params.usdcAmount);
  stats.totalBought = stats.totalBought.plus(event.params.tokenAmount);
  stats.save();
}

export function handleSell(event: Sell): void {
  let holder = getOrCreateHolder(event.params.seller);
  holder.balance = holder.balance.minus(event.params.tokenAmount);
  holder.totalSold = holder.totalSold.plus(event.params.tokenAmount);
  holder.totalVolumeUSDC = holder.totalVolumeUSDC.plus(event.params.usdcAmount);
  holder.save();

  let trade = new Trade(eventId(event.transaction.hash, event.logIndex));
  trade.type = "SELL";
  trade.holder = holder.id;
  trade.usdcAmount = event.params.usdcAmount;
  trade.tokenAmount = event.params.tokenAmount;
  trade.blockNumber = event.block.number;
  trade.timestamp = event.block.timestamp;
  trade.transactionHash = event.transaction.hash;
  trade.save();

  let stats = getOrCreateStats();
  stats.totalTrades = stats.totalTrades.plus(ONE);
  stats.totalVolumeUSDC = stats.totalVolumeUSDC.plus(event.params.usdcAmount);
  stats.totalSold = stats.totalSold.plus(event.params.tokenAmount);
  stats.save();
}

export function handleUserVerified(event: UserVerified): void {
  let holder = getOrCreateHolder(event.params.user);
  holder.verified = true;
  holder.save();

  let verification = new UserVerification(
    eventId(event.transaction.hash, event.logIndex)
  );
  verification.user = event.params.user;
  verification.nullifierHash = event.params.nullifierHash;
  verification.blockNumber = event.block.number;
  verification.timestamp = event.block.timestamp;
  verification.transactionHash = event.transaction.hash;
  verification.save();

  let stats = getOrCreateStats();
  stats.verifiedUserCount = stats.verifiedUserCount.plus(ONE);
  stats.save();
}

export function handleHolderFlagged(event: HolderFlagged): void {
  let holder = Holder.load(event.params.holder);
  if (holder != null) {
    holder.flagged = true;
    holder.save();
  }

  let limitEvent = new HoldingLimitEvent(
    eventId(event.transaction.hash, event.logIndex)
  );
  limitEvent.holder = event.params.holder;
  limitEvent.flagged = true;
  limitEvent.balance = event.params.balance;
  limitEvent.totalSupply = event.params.totalSupply;
  limitEvent.blockNumber = event.block.number;
  limitEvent.timestamp = event.block.timestamp;
  limitEvent.transactionHash = event.transaction.hash;
  limitEvent.save();
}

export function handleHolderUnflagged(event: HolderUnflagged): void {
  let holder = Holder.load(event.params.holder);
  if (holder != null) {
    holder.flagged = false;
    holder.save();
  }

  let limitEvent = new HoldingLimitEvent(
    eventId(event.transaction.hash, event.logIndex)
  );
  limitEvent.holder = event.params.holder;
  limitEvent.flagged = false;
  limitEvent.balance = null;
  limitEvent.totalSupply = null;
  limitEvent.blockNumber = event.block.number;
  limitEvent.timestamp = event.block.timestamp;
  limitEvent.transactionHash = event.transaction.hash;
  limitEvent.save();
}

export function handleCrossChainSupplyUpdated(
  event: CrossChainSupplyUpdated
): void {
  let update = new CrossChainSupplyUpdate(
    eventId(event.transaction.hash, event.logIndex)
  );
  update.crossChainSupply = event.params.crossChainSupply;
  update.localSupply = event.params.localSupply;
  update.blockNumber = event.block.number;
  update.timestamp = event.block.timestamp;
  update.transactionHash = event.transaction.hash;
  update.save();
}
