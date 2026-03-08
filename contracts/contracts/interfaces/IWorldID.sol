// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

/// @title IWorldID (v3 Legacy)
/// @notice Interface for the WorldIDRouter used in World ID 3.0 on-chain verification.
interface IWorldID {
    function verifyProof(
        uint256 root,
        uint256 groupId,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 externalNullifierHash,
        uint256[8] calldata proof
    ) external view;
}

/// @title IWorldIDVerifier (v4)
/// @notice Interface for the WorldIDVerifier used in World ID 4.0 on-chain verification.
interface IWorldIDVerifier {
    function verify(
        uint256 nullifier,
        uint256 action,
        uint64 rpId,
        uint256 nonce,
        uint256 signalHash,
        uint64 expiresAtMin,
        uint64 issuerSchemaId,
        uint256 credentialGenesisIssuedAtMin,
        uint256[5] calldata zeroKnowledgeProof
    ) external view;
}
