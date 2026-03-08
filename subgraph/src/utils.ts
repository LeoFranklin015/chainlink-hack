import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { User, Position, ExchangeStats, Token } from "../generated/schema";

export let ZERO = BigInt.fromI32(0);
export let ONE = BigInt.fromI32(1);

export function getOrCreateUser(address: Address): User {
  let user = User.load(address);
  if (user == null) {
    user = new User(address);
    user.verified = false;
    user.save();

    let stats = getOrCreateStats();
    stats.userCount = stats.userCount.plus(ONE);
    stats.save();
  }
  return user;
}

export function getOrCreatePosition(token: Address, user: Address): Position {
  let id = token.concat(user);
  let position = Position.load(id);
  if (position == null) {
    position = new Position(id);
    position.token = token;
    position.user = user;
    position.balance = ZERO;
    position.totalBought = ZERO;
    position.totalSold = ZERO;
    position.totalVolumeUSDC = ZERO;
    position.flagged = false;
    position.save();
  }
  return position;
}

export function getOrCreateStats(): ExchangeStats {
  let stats = ExchangeStats.load("stats");
  if (stats == null) {
    stats = new ExchangeStats("stats");
    stats.totalTrades = ZERO;
    stats.totalVolumeUSDC = ZERO;
    stats.totalBought = ZERO;
    stats.totalSold = ZERO;
    stats.tokenCount = ZERO;
    stats.userCount = ZERO;
    stats.verifiedUserCount = ZERO;
    stats.save();
  }
  return stats;
}
