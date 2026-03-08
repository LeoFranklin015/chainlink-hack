import { Address, BigInt } from "@graphprotocol/graph-ts";
import { Holder, ExchangeStats } from "../generated/schema";

export let ZERO = BigInt.fromI32(0);
export let ONE = BigInt.fromI32(1);

export function getOrCreateHolder(address: Address): Holder {
  let holder = Holder.load(address);
  if (holder == null) {
    holder = new Holder(address);
    holder.balance = ZERO;
    holder.totalBought = ZERO;
    holder.totalSold = ZERO;
    holder.totalVolumeUSDC = ZERO;
    holder.verified = false;
    holder.flagged = false;
    holder.save();

    let stats = getOrCreateStats();
    stats.holderCount = stats.holderCount.plus(ONE);
    stats.save();
  }
  return holder;
}

export function getOrCreateStats(): ExchangeStats {
  let stats = ExchangeStats.load("stats");
  if (stats == null) {
    stats = new ExchangeStats("stats");
    stats.totalTrades = ZERO;
    stats.totalVolumeUSDC = ZERO;
    stats.totalBought = ZERO;
    stats.totalSold = ZERO;
    stats.holderCount = ZERO;
    stats.verifiedUserCount = ZERO;
    stats.save();
  }
  return stats;
}
