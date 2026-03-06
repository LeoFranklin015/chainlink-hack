import {
	bytesToHex,
	cre,
	getNetwork,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import type { Address } from 'viem'
import { z } from 'zod'
import { XStocksExchange, type DecodedLog, type UserVerifiedDecoded } from '../contracts/evm/ts/generated/XStocksExchange'

const chainSchema = z.object({
	chainSelectorName: z.string(),
	exchangeAddress: z.string(),
	gasLimit: z.string(),
})

export const configSchema = z.object({
	primaryChain: chainSchema,
	targetChains: z.array(chainSchema),
})

type Config = z.infer<typeof configSchema>

export const onUserVerifiedTrigger = (
	runtime: Runtime<Config>,
	payload: DecodedLog<UserVerifiedDecoded>,
): string => {
	const { targetChains } = runtime.config
	const { user, nullifierHash } = payload.data

	runtime.log(`UserVerified event: user=${user}, nullifierHash=${nullifierHash.toString()}`)

	const results: string[] = []

	for (const chain of targetChains) {
		const network = getNetwork({
			chainFamily: 'evm',
			chainSelectorName: chain.chainSelectorName,
			isTestnet: true,
		})
		if (!network) {
			runtime.log(`Network not found: ${chain.chainSelectorName}, skipping`)
			continue
		}

		const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
		const exchange = new XStocksExchange(evmClient, chain.exchangeAddress as Address)

		runtime.log(`Syncing verification to ${chain.chainSelectorName}`)
		const resp = exchange.writeReportFromVerifyOffchain(runtime, user, nullifierHash, {
			gasLimit: chain.gasLimit,
		})

		if (resp.txStatus !== TxStatus.SUCCESS) {
			throw new Error(`Failed to verify on ${chain.chainSelectorName}: ${resp.errorMessage || resp.txStatus}`)
		}

		const txHash = resp.txHash || new Uint8Array(32)
		runtime.log(`Verified on ${chain.chainSelectorName}, tx: ${bytesToHex(txHash)}`)
		results.push(`synced:${chain.chainSelectorName}`)
	}

	if (results.length === 0) results.push('no_targets')
	return results.join(',')
}

export function initWorkflow(config: Config) {
	const { primaryChain } = config

	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: primaryChain.chainSelectorName,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(`Primary network not found: ${primaryChain.chainSelectorName}`)
	}

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const exchange = new XStocksExchange(evmClient, primaryChain.exchangeAddress as Address)

	return [
		cre.handler(
			exchange.logTriggerUserVerified(),
			onUserVerifiedTrigger,
		),
	]
}
