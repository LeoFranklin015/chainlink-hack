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
  LAST_FINALIZED_BLOCK_NUMBER,
  prepareReportRequest,
  type EVMLog,
  type Runtime,
} from '@chainlink/cre-sdk'

export interface DecodedLog<T> extends Omit<EVMLog, 'data'> { data: T }

export type PriceUpdatedTopics = {}

export type PriceUpdatedDecoded = {
  price: bigint
  timestamp: bigint
}

export const XStocksPriceReceiverABI = [
  {"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"price","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"timestamp","type":"uint256"}],"name":"PriceUpdated","type":"event"},
  {"inputs":[],"name":"latestPrice","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"lastUpdatedAt","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"_price","type":"uint256"}],"name":"updatePrice","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"_price","type":"uint256"}],"name":"updatePriceFromReport","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"updater","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"_updater","type":"address"}],"name":"setUpdater","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"_newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
] as const

export class XStocksPriceReceiver {
  constructor(
    private readonly client: EVMClient,
    public readonly address: Address,
  ) {}

  latestPrice(
    runtime: Runtime<unknown>,
  ): bigint {
    const callData = encodeFunctionData({
      abi: XStocksPriceReceiverABI,
      functionName: 'latestPrice' as const,
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: XStocksPriceReceiverABI,
      functionName: 'latestPrice' as const,
      data: bytesToHex(result.data),
    }) as bigint
  }

  lastUpdatedAt(
    runtime: Runtime<unknown>,
  ): bigint {
    const callData = encodeFunctionData({
      abi: XStocksPriceReceiverABI,
      functionName: 'lastUpdatedAt' as const,
    })

    const result = this.client
      .callContract(runtime, {
        call: encodeCallMsg({ from: zeroAddress, to: this.address, data: callData }),
        blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
      })
      .result()

    return decodeFunctionResult({
      abi: XStocksPriceReceiverABI,
      functionName: 'lastUpdatedAt' as const,
      data: bytesToHex(result.data),
    }) as bigint
  }

  writeReportFromUpdatePrice(
    runtime: Runtime<unknown>,
    price: bigint,
    gasConfig?: { gasLimit?: string },
  ) {
    const callData = encodeFunctionData({
      abi: XStocksPriceReceiverABI,
      functionName: 'updatePriceFromReport' as const,
      args: [price],
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

  writeReport(
    runtime: Runtime<unknown>,
    callData: Hex,
    gasConfig?: { gasLimit?: string },
  ) {
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

  logTriggerPriceUpdated(
    filters?: PriceUpdatedTopics[],
  ) {
    let topics: { values: string[] }[]
    if (!filters || filters.length === 0) {
      const encoded = encodeEventTopics({
        abi: XStocksPriceReceiverABI,
        eventName: 'PriceUpdated' as const,
      })
      topics = encoded.map((t) => ({ values: [hexToBase64(t)] }))
    } else {
      const encoded = encodeEventTopics({
        abi: XStocksPriceReceiverABI,
        eventName: 'PriceUpdated' as const,
      })
      topics = encoded.map((t) => ({ values: [hexToBase64(t)] }))
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
      adapt: (rawOutput: EVMLog): DecodedLog<PriceUpdatedDecoded> => contract.decodePriceUpdated(rawOutput),
    }
  }

  decodePriceUpdated(log: EVMLog): DecodedLog<PriceUpdatedDecoded> {
    const decoded = decodeEventLog({
      abi: XStocksPriceReceiverABI,
      data: bytesToHex(log.data),
      topics: log.topics.map((t) => bytesToHex(t)) as readonly Hex[],
    })
    const { data: _, ...rest } = log
    return { ...rest, data: decoded.args as unknown as PriceUpdatedDecoded }
  }
}
