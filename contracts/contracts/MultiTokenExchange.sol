// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IWorldID.sol";
import "./helpers/ByteHasher.sol";

interface ISynthStocksToken is IERC20 {
    function mint(address account, uint256 amount) external;
    function burn(address account, uint256 amount) external;
    function getCurrentMultiplier()
        external
        view
        returns (uint256 newMultiplier, uint256 periodsPassed, uint256 newMultiplierNonce);
}

interface ISynthStocksPriceReceiver {
    function latestPrice() external view returns (uint256);
    function lastUpdatedAt() external view returns (uint256);
}

interface ITransferLock {
    function unlockTransfers() external;
    function lockTransfers() external;
}

contract MultiTokenExchange {
    using ByteHasher for bytes;

    // ===================== Shared State =====================

    IERC20 public usdc;
    address public owner;
    uint256 public maxPriceStaleness;

    // World ID v3 (legacy)
    IWorldID public worldIdRouter;
    uint256 public externalNullifierHash;

    // World ID v4
    IWorldIDVerifier public worldIdVerifier;

    // Offchain verification
    address public verifier;

    // Shared verification state (verify once, trade any token)
    mapping(address => bool) public verifiedUsers;
    mapping(uint256 => bool) public nullifierHashes;

    // Holding limits (shared config, per-token enforcement)
    uint256 public maxHoldingBps;
    address public holdingMonitor;
    mapping(address => bool) public exemptAddresses;

    // Cross-chain updater
    address public crossChainUpdater;

    // ===================== Per-Token State =====================

    struct TokenInfo {
        ISynthStocksPriceReceiver priceFeed;
        ITransferLock transferLock;
        uint256 globalSupplyCap;
        uint256 crossChainSupply;
        bool active;
    }

    mapping(address => TokenInfo) public tokens;
    address[] public tokenList;

    // Per-token holding flags: token => holder => flagged
    mapping(address => mapping(address => bool)) public flaggedHolders;

    // ===================== Events =====================

    event TokenAdded(address indexed token, address priceFeed, address transferLock, uint256 supplyCap);
    event TokenRemoved(address indexed token);
    event Buy(address indexed token, address indexed buyer, uint256 usdcAmount, uint256 tokenAmount);
    event Sell(address indexed token, address indexed seller, uint256 usdcAmount, uint256 tokenAmount);
    event HolderFlagged(address indexed token, address indexed holder, uint256 balance, uint256 totalSupply);
    event HolderUnflagged(address indexed token, address indexed holder);
    event CrossChainSupplyUpdated(address indexed token, uint256 crossChainSupply, uint256 localSupply);
    event UserVerified(address indexed user, uint256 nullifierHash);

    // ===================== Modifiers =====================

    modifier onlyOwner() {
        require(msg.sender == owner, "MultiTokenExchange: Only owner");
        _;
    }

    modifier onlyHoldingMonitor() {
        require(msg.sender == holdingMonitor, "MultiTokenExchange: Only holding monitor");
        _;
    }

    modifier onlySupportedToken(address token) {
        require(tokens[token].active, "MultiTokenExchange: Token not supported");
        _;
    }

    // ===================== Constructor =====================

    constructor(
        address _usdc,
        address _worldIdRouter,
        uint256 _externalNullifierHash,
        address _worldIdVerifier,
        uint256 _maxPriceStaleness,
        uint256 _maxHoldingBps
    ) {
        usdc = IERC20(_usdc);
        worldIdRouter = IWorldID(_worldIdRouter);
        externalNullifierHash = _externalNullifierHash;
        worldIdVerifier = IWorldIDVerifier(_worldIdVerifier);
        maxPriceStaleness = _maxPriceStaleness;
        maxHoldingBps = _maxHoldingBps;
        owner = msg.sender;
        exemptAddresses[address(this)] = true;
    }

    // ===================== Token Management =====================

    function addToken(
        address _token,
        address _priceFeed,
        address _transferLock,
        uint256 _globalSupplyCap
    ) external onlyOwner {
        require(!tokens[_token].active, "MultiTokenExchange: Token already added");
        tokens[_token] = TokenInfo({
            priceFeed: ISynthStocksPriceReceiver(_priceFeed),
            transferLock: ITransferLock(_transferLock),
            globalSupplyCap: _globalSupplyCap,
            crossChainSupply: 0,
            active: true
        });
        tokenList.push(_token);
        emit TokenAdded(_token, _priceFeed, _transferLock, _globalSupplyCap);
    }

    function removeToken(address _token) external onlyOwner onlySupportedToken(_token) {
        tokens[_token].active = false;
        emit TokenRemoved(_token);
    }

    function getTokenCount() external view returns (uint256) {
        return tokenList.length;
    }

    function getTokenInfo(address _token) external view returns (
        address priceFeed,
        address transferLock,
        uint256 globalSupplyCap,
        uint256 crossChainSupply,
        bool active
    ) {
        TokenInfo storage info = tokens[_token];
        return (
            address(info.priceFeed),
            address(info.transferLock),
            info.globalSupplyCap,
            info.crossChainSupply,
            info.active
        );
    }

    // ===================== Verification (shared across all tokens) =====================

    function verify(
        address signal,
        uint256 nullifier,
        uint256 action,
        uint64 rpId,
        uint256 nonce,
        uint256 signalHash,
        uint64 expiresAtMin,
        uint64 issuerSchemaId,
        uint256 credentialGenesisIssuedAtMin,
        uint256[5] calldata proof
    ) external {
        require(!nullifierHashes[nullifier], "Nullifier already used");
        worldIdVerifier.verify(
            nullifier, action, rpId, nonce, signalHash,
            expiresAtMin, issuerSchemaId, credentialGenesisIssuedAtMin, proof
        );
        nullifierHashes[nullifier] = true;
        verifiedUsers[signal] = true;
    }

    function verifyLegacy(
        address signal,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        require(!nullifierHashes[nullifierHash], "Nullifier already used");
        worldIdRouter.verifyProof(
            root,
            1,
            abi.encodePacked(signal).hashToField(),
            nullifierHash,
            externalNullifierHash,
            proof
        );
        nullifierHashes[nullifierHash] = true;
        verifiedUsers[signal] = true;
    }

    function verifyOffchain(address user, uint256 nullifierHash) external {
        require(
            msg.sender == verifier || msg.sender == owner || msg.sender == address(this),
            "MultiTokenExchange: Only verifier, owner, or self"
        );
        require(!nullifierHashes[nullifierHash], "Nullifier already used");
        nullifierHashes[nullifierHash] = true;
        verifiedUsers[user] = true;
        emit UserVerified(user, nullifierHash);
    }

    // ===================== Price =====================

    function getPrice(address token) public view onlySupportedToken(token) returns (uint256) {
        ISynthStocksPriceReceiver feed = tokens[token].priceFeed;
        uint256 price = feed.latestPrice();
        require(price > 0, "Price not available");
        require(block.timestamp - feed.lastUpdatedAt() <= maxPriceStaleness, "Price is stale");
        return price;
    }

    // ===================== Buy / Sell =====================

    function buy(address token, uint256 usdcAmount) external onlySupportedToken(token) {
        require(verifiedUsers[msg.sender], "Not verified");
        require(!flaggedHolders[token][msg.sender], "Holder flagged: exceeds holding limit");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "USDC transfer failed");

        uint256 price = getPrice(token); // 8 decimals
        // usdcAmount (6 dec) * 1e18 (token dec) * 1e8 (price precision) / price (8 dec) / 1e6 (usdc dec)
        uint256 tokenAmount = usdcAmount * 1e20 / price;

        TokenInfo storage info = tokens[token];
        ISynthStocksToken t = ISynthStocksToken(token);

        // Enforce per-token global supply cap across all chains
        if (info.globalSupplyCap > 0) {
            uint256 localSupply = t.totalSupply();
            require(
                localSupply + info.crossChainSupply + tokenAmount <= info.globalSupplyCap,
                "Exceeds global supply cap"
            );
        }

        // Enforce holding limit
        if (maxHoldingBps > 0 && !exemptAddresses[msg.sender]) {
            uint256 newBalance = t.balanceOf(msg.sender) + tokenAmount;
            uint256 supply = t.totalSupply() + tokenAmount;
            require(
                newBalance * 10000 <= supply * maxHoldingBps,
                "Exceeds max holding limit"
            );
        }

        ITransferLock lock = info.transferLock;
        if (address(lock) != address(0)) lock.unlockTransfers();
        t.mint(msg.sender, tokenAmount);
        if (address(lock) != address(0)) lock.lockTransfers();

        emit Buy(token, msg.sender, usdcAmount, tokenAmount);
    }

    function sell(address token, uint256 usdcAmount) external onlySupportedToken(token) {
        uint256 price = getPrice(token);
        uint256 tokenAmount = usdcAmount * 1e20 / price;

        ISynthStocksToken t = ISynthStocksToken(token);
        ITransferLock lock = tokens[token].transferLock;

        if (address(lock) != address(0)) lock.unlockTransfers();
        require(t.transferFrom(msg.sender, address(this), tokenAmount), "Token transfer failed");
        t.burn(address(this), tokenAmount);
        if (address(lock) != address(0)) lock.lockTransfers();
        require(usdc.transfer(msg.sender, usdcAmount), "USDC transfer failed");

        emit Sell(token, msg.sender, usdcAmount, tokenAmount);
    }

    // ===================== Holding Limit Enforcement =====================

    function flagHolder(address token, address holder) external onlyHoldingMonitor onlySupportedToken(token) {
        require(!exemptAddresses[holder], "Cannot flag exempt address");
        ISynthStocksToken t = ISynthStocksToken(token);
        uint256 balance = t.balanceOf(holder);
        uint256 supply = t.totalSupply();
        require(
            maxHoldingBps > 0 && balance * 10000 > supply * maxHoldingBps,
            "Holder does not exceed limit"
        );
        flaggedHolders[token][holder] = true;
        emit HolderFlagged(token, holder, balance, supply);
    }

    function unflagHolder(address token, address holder) external onlyHoldingMonitor onlySupportedToken(token) {
        ISynthStocksToken t = ISynthStocksToken(token);
        uint256 balance = t.balanceOf(holder);
        uint256 supply = t.totalSupply();
        require(
            maxHoldingBps == 0 || balance * 10000 <= supply * maxHoldingBps,
            "Holder still exceeds limit"
        );
        flaggedHolders[token][holder] = false;
        emit HolderUnflagged(token, holder);
    }

    function exceedsHoldingLimit(address token, address holder) public view returns (bool) {
        if (maxHoldingBps == 0 || exemptAddresses[holder]) return false;
        ISynthStocksToken t = ISynthStocksToken(token);
        uint256 balance = t.balanceOf(holder);
        uint256 supply = t.totalSupply();
        return balance * 10000 > supply * maxHoldingBps;
    }

    // ===================== Cross-Chain Supply (per token) =====================

    function setCrossChainSupply(address token, uint256 _crossChainSupply) external onlySupportedToken(token) {
        require(
            msg.sender == crossChainUpdater || msg.sender == owner,
            "MultiTokenExchange: Only cross-chain updater or owner"
        );
        tokens[token].crossChainSupply = _crossChainSupply;
        emit CrossChainSupplyUpdated(token, _crossChainSupply, ISynthStocksToken(token).totalSupply());
    }

    function setCrossChainSupplyFromReport(address token, uint256 _crossChainSupply) external {
        require(msg.sender == address(this), "MultiTokenExchange: Only self");
        tokens[token].crossChainSupply = _crossChainSupply;
        emit CrossChainSupplyUpdated(token, _crossChainSupply, ISynthStocksToken(token).totalSupply());
    }

    // ===================== CRE Keystone =====================

    function onReport(bytes calldata, bytes calldata report) external {
        (bool success, ) = address(this).call(report);
        require(success, "MultiTokenExchange: onReport call failed");
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x805f2132;
    }

    // ===================== Per-Token Admin =====================

    function setPriceFeed(address token, address _priceFeed) external onlyOwner onlySupportedToken(token) {
        tokens[token].priceFeed = ISynthStocksPriceReceiver(_priceFeed);
    }

    function setTransferLock(address token, address _transferLock) external onlyOwner onlySupportedToken(token) {
        tokens[token].transferLock = ITransferLock(_transferLock);
    }

    function setGlobalSupplyCap(address token, uint256 _globalSupplyCap) external onlyOwner onlySupportedToken(token) {
        tokens[token].globalSupplyCap = _globalSupplyCap;
    }

    // ===================== Global Admin =====================

    function setMaxPriceStaleness(uint256 _maxPriceStaleness) external onlyOwner {
        maxPriceStaleness = _maxPriceStaleness;
    }

    function setMaxHoldingBps(uint256 _maxHoldingBps) external onlyOwner {
        require(_maxHoldingBps <= 10000, "Cannot exceed 100%");
        maxHoldingBps = _maxHoldingBps;
    }

    function setHoldingMonitor(address _holdingMonitor) external onlyOwner {
        holdingMonitor = _holdingMonitor;
    }

    function setCrossChainUpdater(address _crossChainUpdater) external onlyOwner {
        crossChainUpdater = _crossChainUpdater;
    }

    function setExemptAddress(address addr, bool exempt) external onlyOwner {
        exemptAddresses[addr] = exempt;
    }

    function setVerifier(address _verifier) external onlyOwner {
        verifier = _verifier;
    }

    function setVerifiedUser(address user, bool verified) external onlyOwner {
        verifiedUsers[user] = verified;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "MultiTokenExchange: Zero address");
        owner = newOwner;
    }

    function withdrawUsdc(uint256 amount) external onlyOwner {
        require(usdc.transfer(msg.sender, amount), "USDC transfer failed");
    }

    function depositUsdc(uint256 amount) external {
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
    }
}
