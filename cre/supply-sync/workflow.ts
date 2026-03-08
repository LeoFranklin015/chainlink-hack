import {
	bytesToHex,
	type CronPayload,
	cre,
	getNetwork,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import type { Address } from 'viem'
import { z } from 'zod'
import { IERC20 } from '../contracts/evm/ts/generated/IERC20'
import { XStocksExchange } from '../contracts/evm/ts/generated/XStocksExchange'

const chainSchema = z.object({
	chainSelectorName: z.string(),
	tokenAddress: z.string(),
	exchangeAddress: z.string(),
	gasLimit: z.string(),
})

export const configSchema = z.object({
	schedule: z.string(),
	chains: z.array(chainSchema),
})

type Config = z.infer<typeof configSchema>

export const onCronTrigger = (runtime: Runtime<Config>, payload: CronPayload): string => {
	if (!payload.scheduledExecutionTime) {
		throw new Error('Scheduled execution time is required')
	}

	const { chains } = runtime.config

	// Step 1: Read totalSupply from each chain
	const supplies: bigint[] = []
	for (const chain of chains) {
		const network = getNetwork({
			chainFamily: 'evm',
			chainSelectorName: chain.chainSelectorName,
			isTestnet: true,
		})
		if (!network) {
			throw new Error(`Network not found: ${chain.chainSelectorName}`)
		}

		const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
		const token = new IERC20(evmClient, chain.tokenAddress as Address)

		let supply: bigint
		try {
			supply = token.totalSupply(runtime)
		} catch (e) {
			runtime.log(`Failed to read totalSupply on ${chain.chainSelectorName}, defaulting to 0`)
			supply = BigInt(0)
		}
		supplies.push(supply)
		runtime.log(`${chain.chainSelectorName} totalSupply: ${supply.toString()}`)
	}

	// Step 2: Compute total supply across all chains
	let totalGlobalSupply = BigInt(0)
	for (const supply of supplies) {
		totalGlobalSupply += supply
	}
	runtime.log(`Total global supply: ${totalGlobalSupply.toString()}`)

	// Step 3: For each chain, write crossChainSupply = total - local
	for (let i = 0; i < chains.length; i++) {
		const chain = chains[i]
		const localSupply = supplies[i]
		const crossChainSupply = totalGlobalSupply - localSupply

		const network = getNetwork({
			chainFamily: 'evm',
			chainSelectorName: chain.chainSelectorName,
			isTestnet: true,
		})
		if (!network) {
			throw new Error(`Network not found: ${chain.chainSelectorName}`)
		}

		const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
		const exchange = new XStocksExchange(evmClient, chain.exchangeAddress as Address)

		runtime.log(`Writing crossChainSupply=${crossChainSupply.toString()} to ${chain.chainSelectorName}`)

		const resp = exchange.writeReportFromSetCrossChainSupply(
			runtime,
			crossChainSupply,
			{ gasLimit: chain.gasLimit },
		)

		if (resp.txStatus !== TxStatus.SUCCESS) {
			throw new Error(`Failed to set crossChainSupply on ${chain.chainSelectorName}: ${resp.errorMessage || resp.txStatus}`)
		}

		const txHash = resp.txHash || new Uint8Array(32)
		runtime.log(`crossChainSupply updated on ${chain.chainSelectorName}: ${bytesToHex(txHash)}`)
	}

	return `global=${totalGlobalSupply.toString()},chains=${chains.length}`
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
