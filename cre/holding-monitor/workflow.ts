import {
	bytesToHex,
	cre,
	getNetwork,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import type { Address } from 'viem'
import { z } from 'zod'
import { IERC20, type DecodedLog, type TransferDecoded } from '../contracts/evm/ts/generated/IERC20'
import { XStocksExchange } from '../contracts/evm/ts/generated/XStocksExchange'

export const configSchema = z.object({
	tokenAddress: z.string(),
	exchangeAddress: z.string(),
	chainSelectorName: z.string(),
	gasLimit: z.string(),
})

type Config = z.infer<typeof configSchema>

export const onTransferTrigger = (
	runtime: Runtime<Config>,
	payload: DecodedLog<TransferDecoded>,
): string => {
	const { tokenAddress, exchangeAddress, chainSelectorName, gasLimit } = runtime.config
	const { from, to, value } = payload.data

	runtime.log(`Transfer detected: ${from} -> ${to}, amount: ${value.toString()}`)

	// Skip mint (from=0x0) and burn (to=0x0) — those go through the exchange
	if (from === '0x0000000000000000000000000000000000000000' ||
		to === '0x0000000000000000000000000000000000000000') {
		runtime.log('Mint/burn transfer, skipping holding check')
		return 'skip:mint_or_burn'
	}

	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName,
		isTestnet: true,
	})
	if (!network) {
		throw new Error(`Network not found: ${chainSelectorName}`)
	}

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const exchange = new XStocksExchange(evmClient, exchangeAddress as Address)

	// Check if the recipient now exceeds the holding limit
	const recipientExceeds = exchange.exceedsHoldingLimit(runtime, to)
	const recipientAlreadyFlagged = exchange.flaggedHolders(runtime, to)

	if (recipientExceeds && !recipientAlreadyFlagged) {
		runtime.log(`Flagging ${to}: exceeds holding limit after receiving transfer`)
		const resp = exchange.writeReportFromFlagHolder(runtime, to, { gasLimit })
		if (resp.txStatus !== TxStatus.SUCCESS) {
			throw new Error(`Failed to flag holder ${to}: ${resp.errorMessage || resp.txStatus}`)
		}
		const txHash = resp.txHash || new Uint8Array(32)
		runtime.log(`Flagged ${to}, tx: ${bytesToHex(txHash)}`)
	}

	// Check if the sender dropped below the limit and can be unflagged
	const senderExceeds = exchange.exceedsHoldingLimit(runtime, from)
	const senderIsFlagged = exchange.flaggedHolders(runtime, from)

	if (!senderExceeds && senderIsFlagged) {
		runtime.log(`Unflagging ${from}: no longer exceeds holding limit after transfer`)
		const resp = exchange.writeReportFromUnflagHolder(runtime, from, { gasLimit })
		if (resp.txStatus !== TxStatus.SUCCESS) {
			throw new Error(`Failed to unflag holder ${from}: ${resp.errorMessage || resp.txStatus}`)
		}
		const txHash = resp.txHash || new Uint8Array(32)
		runtime.log(`Unflagged ${from}, tx: ${bytesToHex(txHash)}`)
	}

	const actions: string[] = []
	if (recipientExceeds && !recipientAlreadyFlagged) actions.push(`flagged:${to}`)
	if (!senderExceeds && senderIsFlagged) actions.push(`unflagged:${from}`)
	if (actions.length === 0) actions.push('no_action')

	return actions.join(',')
}

export function initWorkflow(config: Config) {
	const network = getNetwork({
		chainFamily: 'evm',
		chainSelectorName: config.chainSelectorName,
		isTestnet: true,
	})

	if (!network) {
		throw new Error(`Network not found: ${config.chainSelectorName}`)
	}

	const evmClient = new cre.capabilities.EVMClient(network.chainSelector.selector)
	const token = new IERC20(evmClient, config.tokenAddress as Address)

	return [
		cre.handler(
			token.logTriggerTransfer(), // triggers on any Transfer event
			onTransferTrigger,
		),
	]
}
