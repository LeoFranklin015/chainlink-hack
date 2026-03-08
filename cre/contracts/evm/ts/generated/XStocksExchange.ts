import {
  decodeFunctionResult,
  decodeEventLog,
  encodeEventTopics,
  encodeFunctionData,
  zeroAddress,
} from 'viem'
import type { Address, Hex } from 'viem'
import {
  bytesToHex,
  encodeCallMsg,
  EVMClient,
  hexToBase64,
  LATEST_BLOCK_NUMBER,
  prepareReportRequest,
  type EVMLog,
  type Runtime,
} from '@chainlink/cre-sdk'

export interface DecodedLog<T> extends Omit<EVMLog, 'data'> { data: T }

/**
 * Filter params for UserVerified. Only indexed fields can be used for filtering.
 */
export type UserVerifiedTopics = {
  user?: `0x${string}`
}

/**
 * Decoded UserVerified event data.
 */
export type UserVerifiedDecoded = {
  user: `0x${string}`
  nullifierHash: bigint
}

export const XStocksExchangeABI = [
  {"inputs":[{"internalType":"address","name":"holder","type":"address"}],"name":"flagHolder","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"holder","type":"address"}],"name":"unflagHolder","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"holder","type":"address"}],"name":"exceedsHoldingLimit","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"flaggedHolders","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"maxHoldingBps","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"crossChainSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"globalSupplyCap","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"_crossChainSupply","type":"uint256"}],"name":"setCrossChainSupply","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"_crossChainSupply","type":"uint256"}],"name":"setCrossChainSupplyFromReport","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"holder","type":"address"},{"indexed":false,"internalType":"uint256","name":"balance","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"totalSupply","type":"uint256"}],"name":"HolderFlagged","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"holder","type":"address"}],"name":"HolderUnflagged","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"crossChainSupply","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"localSupply","type":"uint256"}],"name":"CrossChainSupplyUpdated","type":"event"},
  {"inputs":[{"internalType":"address","name":"user","type":"address"},{"internalType":"uint256","name":"nullifierHash","type":"uint256"}],"name":"verifyOffchain","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":false,"internalType":"uint256","name":"nullifierHash","type":"uint256"}],"name":"UserVerified","type":"event"},
] as const

export class XStocksExchange {
  constructor(
    private readonly client: EVMClient,
    public readonly address: Address,
  ) {}

  exceedsHoldingLimit(
    runtime: Runtime<unknown>,
    holder: Address,
  ): boolean {
    const callData = encodeFunctionData({
      abi: XStocksExchangeABI,
      functionName: 'exceedsHoldingLimit' as const,
      args: [holder],
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LATEST_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: XStocksExchangeABI,
      functionName: 'exceedsHoldingLimit' as const,
      data: bytesToHex(result.data),
    }) as boolean
  }

  flaggedHolders(
    runtime: Runtime<unknown>,
    holder: Address,
  ): boolean {
    const callData = encodeFunctionData({
      abi: XStocksExchangeABI,
      functionName: 'flaggedHolders' as const,
      args: [holder],
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LATEST_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: XStocksExchangeABI,
      functionName: 'flaggedHolders' as const,
      data: bytesToHex(result.data),
    }) as boolean
  }

  crossChainSupplyValue(
    runtime: Runtime<unknown>,
  ): bigint {
    const callData = encodeFunctionData({
      abi: XStocksExchangeABI,
      functionName: 'crossChainSupply' as const,
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LATEST_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: XStocksExchangeABI,
      functionName: 'crossChainSupply' as const,
      data: bytesToHex(result.data),
    }) as bigint
  }

  writeReportFromSetCrossChainSupply(
    runtime: Runtime<unknown>,
    crossChainSupply: bigint,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: XStocksExchangeABI,
      functionName: 'setCrossChainSupplyFromReport' as const,
      args: [crossChainSupply],
    })

    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  writeReportFromFlagHolder(
    runtime: Runtime<unknown>,
    holder: Address,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: XStocksExchangeABI,
      functionName: 'flagHolder' as const,
      args: [holder],
    })

    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  writeReportFromUnflagHolder(
    runtime: Runtime<unknown>,
    holder: Address,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: XStocksExchangeABI,
      functionName: 'unflagHolder' as const,
      args: [holder],
    })

    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  writeReportFromVerifyOffchain(
    runtime: Runtime<unknown>,
    user: Address,
    nullifierHash: bigint,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: XStocksExchangeABI,
      functionName: 'verifyOffchain' as const,
      args: [user, nullifierHash],
    })

    const reportResponse = runtime
      .report(prepareReportRequest(callData))
      .result()

    return this.client
      .writeReport(runtime, {
        receiver: this.address,
        report: reportResponse,
        gasConfig,
      })
      .result()
  }

  /**
   * Creates a log trigger for UserVerified events.
   */
  logTriggerUserVerified(
    filters?: UserVerifiedTopics[],
  ) {
    let topics: { values: string[] }[]
    if (!filters || filters.length === 0) {
      const encoded = encodeEventTopics({
        abi: XStocksExchangeABI,
        eventName: 'UserVerified' as const,
      })
      topics = encoded.map((t) => ({ values: [hexToBase64(t)] }))
    } else if (filters.length === 1) {
      const f = filters[0]
      const args = { user: f.user }
      const encoded = encodeEventTopics({
        abi: XStocksExchangeABI,
        eventName: 'UserVerified' as const,
        args,
      })
      topics = encoded.map((t) => ({ values: [hexToBase64(t)] }))
    } else {
      const allEncoded = filters.map((f) => {
        const args = { user: f.user }
        return encodeEventTopics({
          abi: XStocksExchangeABI,
          eventName: 'UserVerified' as const,
          args,
        })
      })
      topics = allEncoded[0].map((_, i) => ({
        values: [...new Set(allEncoded.map((row) => hexToBase64(row[i])))],
      }))
    }
    const baseTrigger = this.client.logTrigger({
      addresses: [hexToBase64(this.address)],
      topics,
    })
    const contract = this
    return {
      capabilityId: () => baseTrigger.capabilityId(),
      method: () => baseTrigger.method(),
      outputSchema: () => baseTrigger.outputSchema(),
      configAsAny: () => baseTrigger.configAsAny(),
      adapt: (rawOutput: EVMLog): DecodedLog<UserVerifiedDecoded> => contract.decodeUserVerified(rawOutput),
    }
  }

  /**
   * Decodes a log into UserVerified data, preserving all log metadata.
   */
  decodeUserVerified(log: EVMLog): DecodedLog<UserVerifiedDecoded> {
    const decoded = decodeEventLog({
      abi: XStocksExchangeABI,
      data: bytesToHex(log.data),
      topics: log.topics.map((t) => bytesToHex(t)) as readonly Hex[],
    })
    const { data: _, ...rest } = log
    return { ...rest, data: decoded.args as unknown as UserVerifiedDecoded }
  }
}
