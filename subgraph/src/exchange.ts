import { Bytes, BigInt } from "@graphprotocol/graph-ts";
import {
  TokenAdded,
  TokenRemoved,
  Buy,
  Sell,
  UserVerified,
  HolderFlagged,
  HolderUnflagged,
  CrossChainSupplyUpdated,
} from "../generated/MultiTokenExchange/MultiTokenExchange";
import {
  Token,
  Trade,
  Position,
  UserVerification,
  HoldingLimitEvent,
  CrossChainSupplyUpdate,
} from "../generated/schema";
import {
  getOrCreateUser,
  getOrCreatePosition,
  getOrCreateStats,
  ONE,
  ZERO,
} from "./utils";

function eventId(txHash: Bytes, logIndex: BigInt): Bytes {
  return txHash.concatI32(logIndex.toI32());
}

export function handleTokenAdded(event: TokenAdded): void {
  let token = new Token(event.params.token);
  token.priceFeed = event.params.priceFeed;
  token.transferLock = event.params.transferLock;
  token.supplyCap = event.params.supplyCap;
  token.active = true;
  token.save();

  let stats = getOrCreateStats();
  stats.tokenCount = stats.tokenCount.plus(ONE);
  stats.save();
}

export function handleTokenRemoved(event: TokenRemoved): void {
  let token = Token.load(event.params.token);
  if (token != null) {
    token.active = false;
    token.save();
  }
}

export function handleBuy(event: Buy): void {
  let user = getOrCreateUser(event.params.buyer);
  let position = getOrCreatePosition(event.params.token, event.params.buyer);

  position.balance = position.balance.plus(event.params.tokenAmount);
  position.totalBought = position.totalBought.plus(event.params.tokenAmount);
  position.totalVolumeUSDC = position.totalVolumeUSDC.plus(
    event.params.usdcAmount
  );
  position.save();

  let trade = new Trade(eventId(event.transaction.hash, event.logIndex));
  trade.type = "BUY";
  trade.token = event.params.token;
  trade.user = user.id;
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
  let user = getOrCreateUser(event.params.seller);
  let position = getOrCreatePosition(event.params.token, event.params.seller);

  position.balance = position.balance.minus(event.params.tokenAmount);
  position.totalSold = position.totalSold.plus(event.params.tokenAmount);
  position.totalVolumeUSDC = position.totalVolumeUSDC.plus(
    event.params.usdcAmount
  );
  position.save();

  let trade = new Trade(eventId(event.transaction.hash, event.logIndex));
  trade.type = "SELL";
  trade.token = event.params.token;
  trade.user = user.id;
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
  let user = getOrCreateUser(event.params.user);
  user.verified = true;
  user.save();

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
  let position = Position.load(event.params.token.concat(event.params.holder));
  if (position != null) {
    position.flagged = true;
    position.save();
  }

  let limitEvent = new HoldingLimitEvent(
    eventId(event.transaction.hash, event.logIndex)
  );
  limitEvent.token = event.params.token;
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
  let position = Position.load(event.params.token.concat(event.params.holder));
  if (position != null) {
    position.flagged = false;
    position.save();
  }

  let limitEvent = new HoldingLimitEvent(
    eventId(event.transaction.hash, event.logIndex)
  );
  limitEvent.token = event.params.token;
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
  update.token = event.params.token;
  update.crossChainSupply = event.params.crossChainSupply;
  update.localSupply = event.params.localSupply;
  update.blockNumber = event.block.number;
  update.timestamp = event.block.timestamp;
  update.transactionHash = event.transaction.hash;
  update.save();
}
