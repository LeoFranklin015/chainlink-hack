import {
	bytesToHex,
	consensusMedianAggregation,
	type CronPayload,
	cre,
	getNetwork,
	type HTTPSendRequester,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import type { Address } from 'viem'
import { z } from 'zod'
import { XStocksPriceReceiver } from '../contracts/evm/ts/generated/XStocksPriceReceiver'

const chainSchema = z.object({
	chainSelectorName: z.string(),
	priceReceiverAddress: z.string(),
	gasLimit: z.string(),
})

export const configSchema = z.object({
	schedule: z.string(),
	finnhubApiKey: z.string(),
	symbol: z.string(),
	chains: z.array(chainSchema),
})

type Config = z.infer<typeof configSchema>

interface FinnhubQuote {
	c: number  // current price
	d: number  // change
	dp: number // percent change
	h: number  // high
	l: number  // low
	o: number  // open
	pc: number // previous close
	t: number  // timestamp
}

const PRICE_DECIMALS = 8

interface FetchPriceConfig {
	symbol: string
	finnhubApiKey: string
}

const fetchPrice = (sendRequester: HTTPSendRequester, config: FetchPriceConfig): number => {
	const url = `https://finnhub.io/api/v1/quote?symbol=${config.symbol}&token=${config.finnhubApiKey}`
	const response = sendRequester.sendRequest({ method: 'GET', url }).result()

	if (response.statusCode !== 200) {
		throw new Error(`Finnhub API failed for ${config.symbol} with status: ${response.statusCode}`)
	}

	const responseText = Buffer.from(response.body).toString('utf-8')
	const quote: FinnhubQuote = JSON.parse(responseText)

	if (quote.c <= 0) {
		throw new Error(`Invalid price from Finnhub for ${config.symbol}: ${quote.c}`)
	}

	return Math.round(quote.c * 10 ** PRICE_DECIMALS)
}

const writePriceToChain = (
	runtime: Runtime<Config>,
	chainConfig: Config['chains'][0],
	priceReceiverAddress: string,
	symbol: string,
	priceScaled: bigint,
): void => {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: chainConfig.chainSelectorName,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(`Network not found for chain: ${chainConfig.chainSelectorName}`)
	}

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const receiver = new XStocksPriceReceiver(evmClient, priceReceiverAddress as Address)

	runtime.log(`Writing ${symbol} price ${priceScaled.toString()} to ${priceReceiverAddress} on ${chainConfig.chainSelectorName}`)

	const resp = receiver.writeReportFromUpdatePrice(
		runtime,
		priceScaled,
		{ gasLimit: chainConfig.gasLimit },
	)

	if (resp.txStatus !== TxStatus.SUCCESS) {
		throw new Error(`Failed to write ${symbol} price on ${chainConfig.chainSelectorName}: ${resp.errorMessage || resp.txStatus}`)
	}

	const txHash = resp.txHash || new Uint8Array(32)
	runtime.log(`${symbol} price update on ${chainConfig.chainSelectorName} succeeded: ${bytesToHex(txHash)}`)
}

export const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
	if (!payload.scheduledExecutionTime) {
		throw new Error('Scheduled execution time is required')
	}

	const { symbol, chains, finnhubApiKey } = runtime.config
	const httpClient = new cre.capabilities.HTTPClient()

	runtime.log(`Fetching ${symbol} price from Finnhub`)

	const priceScaled = httpClient
		.sendRequest(runtime, fetchPrice, consensusMedianAggregation())({ symbol, finnhubApiKey })
		.result()

	runtime.log(`${symbol} consensus price (${PRICE_DECIMALS} decimals): ${priceScaled}`)

	const priceBigInt = BigInt(priceScaled)

	for (const chainConfig of chains) {
		writePriceToChain(runtime, chainConfig, chainConfig.priceReceiverAddress, symbol, priceBigInt)
	}

	return `${symbol}=${priceScaled}`
}

export function initWorkflow(config: Config) {
	const cronTrigger = new cre.capabilities.CronCapability()

	return [
		cre.handler(
			cronTrigger.trigger({
				schedule: config.schedule,
			}),
			onCronTrigger,
		),
	]
}
