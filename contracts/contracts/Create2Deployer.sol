// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

contract Create2Deployer {
    event Deployed(address addr, bytes32 salt);

    function deploy(bytes memory bytecode, bytes32 salt) external returns (address addr) {
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(addr)) { revert(0, 0) }
        }
        emit Deployed(addr, salt);
    }

    /**
     * @dev Deploy via CREATE2 and immediately call the deployed contract.
     *      Used to transfer ownership after deploying proxies/admins since
     *      msg.sender in CREATE2 context is this contract, not the EOA.
     */
    function deployAndCall(bytes memory bytecode, bytes32 salt, bytes memory afterCall) external returns (address addr) {
        assembly {
            addr := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(addr)) { revert(0, 0) }
        }
        if (afterCall.length > 0) {
            (bool success, ) = addr.call(afterCall);
            require(success, "Create2Deployer: Post-deploy call failed");
        }
        emit Deployed(addr, salt);
    }

    function computeAddress(bytes memory bytecode, bytes32 salt) external view returns (address) {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
        );
        return address(uint160(uint256(hash)));
    }
}
