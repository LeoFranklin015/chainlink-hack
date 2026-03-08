// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./SanctionsList.sol";

/**
 * @dev Sanctions list that blocks all addresses except the exchange.
 *      This effectively restricts token transfers to only go through the exchange
 *      (buy/sell), just like company stock that can only be traded on an exchange.
 *
 *      The token's _beforeTokenTransfer checks isSanctioned(from) and isSanctioned(to).
 *      Mint (from=0x0) and burn (to=0x0) also pass through since address(0) is not sanctioned here —
 *      but the token's minter/burner role restricts those to the exchange anyway.
 */
contract ExchangeOnlySanctionsList is SanctionsList {
    address public owner;
    address public exchange;
    bool public transfersUnlocked;

    modifier onlyOwner() {
        require(msg.sender == owner, "ExchangeOnlySanctionsList: Only owner");
        _;
    }

    address public token;

    constructor(address _exchange, address _token) {
        owner = msg.sender;
        exchange = _exchange;
        token = _token;
    }

    function isSanctioned(address addr) external view override returns (bool) {
        // During exchange operations (buy/sell), all transfers are allowed
        if (transfersUnlocked) return false;
        // Always allow mint/burn (from/to zero address), exchange, and token itself
        if (addr == address(0) || addr == exchange || addr == token) return false;
        // Block everyone else (no direct P2P transfers)
        return true;
    }

    /**
     * @dev Exchange calls this before mint/burn/transfer operations.
     */
    function unlockTransfers() external {
        require(msg.sender == exchange, "Only exchange");
        transfersUnlocked = true;
    }

    function lockTransfers() external {
        require(msg.sender == exchange, "Only exchange");
        transfersUnlocked = false;
    }

    function setExchange(address _exchange) external onlyOwner {
        exchange = _exchange;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
