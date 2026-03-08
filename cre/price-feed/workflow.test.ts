import { describe, expect } from 'bun:test'
import { cre, getNetwork, TxStatus } from '@chainlink/cre-sdk'
import { EvmMock, newTestRuntime, test } from '@chainlink/cre-sdk/test'
import type { Address } from 'viem'
import { XStocksPriceReceiver } from '../contracts/evm/ts/generated/XStocksPriceReceiver'
import { newXStocksPriceReceiverMock } from '../contracts/evm/ts/generated/XStocksPriceReceiver_mock'
import { initWorkflow, onCronTrigger } from './workflow'

const CHAIN_SELECTOR = 16015286601757825753n // ethereum-testnet-sepolia
const AAPL_RECEIVER = '0x25572a2D382c54B5F477D94F509BEF36EDecB1A3' as Address

describe('onCronTrigger', () => {
	test('throws when scheduledExecutionTime is missing', () => {
		const runtime = newTestRuntime()
		expect(() => onCronTrigger(runtime as any, {} as any)).toThrow(
			'Scheduled execution time is required',
		)
	})
})

describe('XStocksPriceReceiver contract wrapper', () => {
	test('reads latestPrice from contract via mock', async () => {
		const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
		const priceReceiverMock = newXStocksPriceReceiverMock(AAPL_RECEIVER, evmMock)
		priceReceiverMock.latestPrice = () => 25747000000n // $257.47

		const runtime = newTestRuntime()
		const network = getNetwork({
			chainFamily: 'evm',
			chainSelectorName: 'ethereum-testnet-sepolia',
			isTestnet: true,
		})
		expect(network).toBeDefined()
		if (!network) return

		const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
		const receiver = new XStocksPriceReceiver(evmClient, AAPL_RECEIVER)
		const price = receiver.latestPrice(runtime)
		expect(price).toBe(25747000000n)
	})

	test('writes price update via writeReport mock', async () => {
		const evmMock = EvmMock.testInstance(CHAIN_SELECTOR)
		const priceReceiverMock = newXStocksPriceReceiverMock(AAPL_RECEIVER, evmMock)
		priceReceiverMock.writeReport = () => ({
			txStatus: TxStatus.SUCCESS,
			txHash: new Uint8Array(32),
		})

		const runtime = newTestRuntime()
		const network = getNetwork({
			chainFamily: 'evm',
			chainSelectorName: 'ethereum-testnet-sepolia',
			isTestnet: true,
		})
		expect(network).toBeDefined()
		if (!network) return

		const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
		const receiver = new XStocksPriceReceiver(evmClient, AAPL_RECEIVER)
		const resp = receiver.writeReportFromUpdatePrice(
			runtime,
			25747000000n,
			{ gasLimit: '500000' },
		)
		expect(resp.txStatus).toBe(TxStatus.SUCCESS)
	})
})

describe('initWorkflow', () => {
	test('registers cron trigger handler for single-symbol multi-chain config', () => {
		const config = {
			schedule: '*/60 * * * * *',
			finnhubApiKey: 'test-key',
			symbol: 'AAPL',
			priceReceiverAddress: AAPL_RECEIVER,
			chains: [
				{ chainSelectorName: 'ethereum-testnet-sepolia', gasLimit: '500000' },
				{ chainSelectorName: 'ethereum-testnet-sepolia-base-1', gasLimit: '500000' },
			],
		}
		const handlers = initWorkflow(config)

		expect(handlers).toHaveLength(1)
		expect(handlers[0].fn).toBe(onCronTrigger)

		const cronTrigger = handlers[0].trigger as { config?: { schedule?: string } }
		expect(cronTrigger.config?.schedule).toBe(config.schedule)
	})
})
