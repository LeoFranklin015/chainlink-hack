// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./SanctionsList.sol";

contract MockSanctionsList is SanctionsList {
    function isSanctioned(address) external pure override returns (bool) {
        return false;
    }
}
