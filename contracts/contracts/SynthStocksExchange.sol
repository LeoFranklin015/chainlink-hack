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

contract SynthStocksExchange {
    using ByteHasher for bytes;

    ISynthStocksToken public token;
    IERC20 public usdc;
    address public owner;

    // Chainlink CRE price feed
    ISynthStocksPriceReceiver public priceFeed;
    uint256 public maxPriceStaleness; // max seconds before price is considered stale

    // Transfer lock (sanctions list that blocks direct P2P transfers)
    ITransferLock public transferLock;

    // Cross-chain supply control
    uint256 public globalSupplyCap;    // max tokens across ALL chains (18 decimals)
    uint256 public crossChainSupply;   // total supply on other chains (updated by CRE)
    address public crossChainUpdater;  // CRE DON address that can update cross-chain supply

    // Holding limits (like company stock ownership caps)
    uint256 public maxHoldingBps; // max % of total supply a single address can hold, in basis points (e.g. 500 = 5%)
    address public holdingMonitor; // CRE DON address that can flag violations
    mapping(address => bool) public flaggedHolders; // addresses that exceeded holding limit via transfer
    mapping(address => bool) public exemptAddresses; // addresses exempt from holding limits (e.g. exchange, treasury)

    // World ID v3 (legacy)
    IWorldID public worldIdRouter;
    uint256 public externalNullifierHash;

    // World ID v4
    IWorldIDVerifier public worldIdVerifier;

    // Offchain verification
    address public verifier; // backend signer that can verify users offchain

    // Shared state
    mapping(address => bool) public verifiedUsers;
    mapping(uint256 => bool) public nullifierHashes;

    event Buy(address indexed buyer, uint256 usdcAmount, uint256 tokenAmount);
    event Sell(address indexed seller, uint256 usdcAmount, uint256 tokenAmount);
    event HolderFlagged(address indexed holder, uint256 balance, uint256 totalSupply);
    event HolderUnflagged(address indexed holder);
    event CrossChainSupplyUpdated(uint256 crossChainSupply, uint256 localSupply);
    event UserVerified(address indexed user, uint256 nullifierHash);

    modifier onlyOwner() {
        require(msg.sender == owner, "SynthStocksExchange: Only owner");
        _;
    }

    modifier onlyHoldingMonitor() {
        require(msg.sender == holdingMonitor, "SynthStocksExchange: Only holding monitor");
        _;
    }

    constructor(
        address _token,
        address _usdc,
        address _worldIdRouter,
        uint256 _externalNullifierHash,
        address _worldIdVerifier,
        address _priceFeed,
        uint256 _maxPriceStaleness,
        uint256 _maxHoldingBps
    ) {
        token = ISynthStocksToken(_token);
        usdc = IERC20(_usdc);
        worldIdRouter = IWorldID(_worldIdRouter);
        externalNullifierHash = _externalNullifierHash;
        worldIdVerifier = IWorldIDVerifier(_worldIdVerifier);
        priceFeed = ISynthStocksPriceReceiver(_priceFeed);
        maxPriceStaleness = _maxPriceStaleness;
        maxHoldingBps = _maxHoldingBps;
        owner = msg.sender;
        exemptAddresses[address(this)] = true;
    }

    /**
     * @dev Verify a World ID v4 proof. Once verified, the signal address can buy xAAPL.
     */
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
            nullifier,
            action,
            rpId,
            nonce,
            signalHash,
            expiresAtMin,
            issuerSchemaId,
            credentialGenesisIssuedAtMin,
            proof
        );

        nullifierHashes[nullifier] = true;
        verifiedUsers[signal] = true;
    }

    /**
     * @dev Verify a World ID v3 (legacy) proof. Needed during migration period.
     * @param signal The wallet address being verified
     * @param root The World ID Merkle root
     * @param nullifierHash Unique nullifier for this user+app+action
     * @param proof The zero-knowledge proof
     */
    function verifyLegacy(
        address signal,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        require(!nullifierHashes[nullifierHash], "Nullifier already used");

        worldIdRouter.verifyProof(
            root,
            1, // groupId for Orb credentials
            abi.encodePacked(signal).hashToField(),
            nullifierHash,
            externalNullifierHash,
            proof
        );

        nullifierHashes[nullifierHash] = true;
        verifiedUsers[signal] = true;
    }

    /**
     * @dev Offchain verification: callable by verifier or owner.
     *      Records the nullifier hash, marks the user as verified, and emits
     *      UserVerified for CRE to propagate to other chains.
     */
    function verifyOffchain(address user, uint256 nullifierHash) external {
        require(msg.sender == verifier || msg.sender == owner || msg.sender == address(this), "SynthStocksExchange: Only verifier, owner, or self");
        require(!nullifierHashes[nullifierHash], "Nullifier already used");

        nullifierHashes[nullifierHash] = true;
        verifiedUsers[user] = true;

        emit UserVerified(user, nullifierHash);
    }

    /**
     * @dev Returns the current stock price from the CRE price feed, reverting if stale.
     */
    function getPrice() public view returns (uint256) {
        uint256 price = priceFeed.latestPrice();
        require(price > 0, "Price not available");
        require(
            block.timestamp - priceFeed.lastUpdatedAt() <= maxPriceStaleness,
            "Price is stale"
        );
        return price;
    }

    /**
     * @dev Buy xAAPL with USDC. Caller must approve USDC to this contract first.
     *      Uses Chainlink CRE price feed for real market price.
     * @param usdcAmount Amount of USDC (6 decimals) to spend
     */
    function buy(uint256 usdcAmount) external {
        require(verifiedUsers[msg.sender], "Not verified");
        require(!flaggedHolders[msg.sender], "Holder flagged: exceeds holding limit");
        require(usdc.transferFrom(msg.sender, address(this), usdcAmount), "USDC transfer failed");

        uint256 price = getPrice(); // 8 decimals
        // usdcAmount (6 dec) * 1e18 (token dec) * 1e8 (price precision) / price (8 dec) / 1e6 (usdc dec)
        // Simplified: usdcAmount * 1e20 / price
        uint256 xaaplAmount = usdcAmount * 1e20 / price;

        // Enforce global supply cap across all chains
        if (globalSupplyCap > 0) {
            uint256 localSupply = token.totalSupply();
            require(
                localSupply + crossChainSupply + xaaplAmount <= globalSupplyCap,
                "Exceeds global supply cap"
            );
        }

        // Enforce holding limit on buy
        if (maxHoldingBps > 0 && !exemptAddresses[msg.sender]) {
            uint256 newBalance = token.balanceOf(msg.sender) + xaaplAmount;
            uint256 supply = token.totalSupply() + xaaplAmount;
            require(
                newBalance * 10000 <= supply * maxHoldingBps,
                "Exceeds max holding limit"
            );
        }

        if (address(transferLock) != address(0)) transferLock.unlockTransfers();
        token.mint(msg.sender, xaaplAmount);
        if (address(transferLock) != address(0)) transferLock.lockTransfers();

        emit Buy(msg.sender, usdcAmount, xaaplAmount);
    }

    /**
     * @dev Sell xAAPL for USDC. Caller must approve xAAPL to this contract first.
     * @param usdcAmount Amount of USDC (6 decimals) to receive
     */
    function sell(uint256 usdcAmount) external {
        uint256 price = getPrice(); // 8 decimals
        uint256 xaaplAmount = usdcAmount * 1e20 / price;

        if (address(transferLock) != address(0)) transferLock.unlockTransfers();
        require(token.transferFrom(msg.sender, address(this), xaaplAmount), "xAAPL transfer failed");
        token.burn(address(this), xaaplAmount);
        if (address(transferLock) != address(0)) transferLock.lockTransfers();
        require(usdc.transfer(msg.sender, usdcAmount), "USDC transfer failed");

        emit Sell(msg.sender, usdcAmount, xaaplAmount);
    }

    // ===================== Holding Limit Enforcement =====================

    /**
     * @dev CRE holding monitor flags an address that exceeded the holding limit
     *      via a peer-to-peer transfer (which bypasses exchange buy() checks).
     *      Flagged addresses cannot buy more tokens until they sell below the limit.
     */
    function flagHolder(address holder) external onlyHoldingMonitor {
        require(!exemptAddresses[holder], "Cannot flag exempt address");
        uint256 balance = token.balanceOf(holder);
        uint256 supply = token.totalSupply();
        require(
            maxHoldingBps > 0 && balance * 10000 > supply * maxHoldingBps,
            "Holder does not exceed limit"
        );
        flaggedHolders[holder] = true;
        emit HolderFlagged(holder, balance, supply);
    }

    /**
     * @dev CRE holding monitor unflags an address once it sells below the limit.
     */
    function unflagHolder(address holder) external onlyHoldingMonitor {
        uint256 balance = token.balanceOf(holder);
        uint256 supply = token.totalSupply();
        require(
            maxHoldingBps == 0 || balance * 10000 <= supply * maxHoldingBps,
            "Holder still exceeds limit"
        );
        flaggedHolders[holder] = false;
        emit HolderUnflagged(holder);
    }

    /**
     * @dev View function: check if an address would exceed the holding limit
     */
    function exceedsHoldingLimit(address holder) public view returns (bool) {
        if (maxHoldingBps == 0 || exemptAddresses[holder]) return false;
        uint256 balance = token.balanceOf(holder);
        uint256 supply = token.totalSupply();
        return balance * 10000 > supply * maxHoldingBps;
    }

    // ===================== Admin Functions =====================

    function setCrossChainSupply(uint256 _crossChainSupply) external {
        require(msg.sender == crossChainUpdater || msg.sender == owner, "SynthStocksExchange: Only cross-chain updater or owner");
        crossChainSupply = _crossChainSupply;
        emit CrossChainSupplyUpdated(_crossChainSupply, token.totalSupply());
    }

    /**
     * @dev CRE Keystone forwarder calls onReport(metadata, report).
     */
    function onReport(bytes calldata, bytes calldata report) external {
        (bool success, ) = address(this).call(report);
        require(success, "SynthStocksExchange: onReport call failed");
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x805f2132;
    }

    function setCrossChainSupplyFromReport(uint256 _crossChainSupply) external {
        require(msg.sender == address(this), "SynthStocksExchange: Only self");
        crossChainSupply = _crossChainSupply;
        emit CrossChainSupplyUpdated(_crossChainSupply, token.totalSupply());
    }

    function setGlobalSupplyCap(uint256 _globalSupplyCap) external onlyOwner {
        globalSupplyCap = _globalSupplyCap;
    }

    function setCrossChainUpdater(address _crossChainUpdater) external onlyOwner {
        crossChainUpdater = _crossChainUpdater;
    }

    function setTransferLock(address _transferLock) external onlyOwner {
        transferLock = ITransferLock(_transferLock);
    }

    function setPriceFeed(address _priceFeed) external onlyOwner {
        priceFeed = ISynthStocksPriceReceiver(_priceFeed);
    }

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

    function setExemptAddress(address addr, bool exempt) external onlyOwner {
        exemptAddresses[addr] = exempt;
    }

    function setVerifier(address _verifier) external onlyOwner {
        verifier = _verifier;
    }

    /**
     * @dev Owner can manually verify a user (for testnet use only)
     */
    function setVerifiedUser(address user, bool verified) external onlyOwner {
        verifiedUsers[user] = verified;
    }

    /**
     * @dev Owner withdraws USDC from the pool
     */
    function withdrawUsdc(uint256 amount) external onlyOwner {
        require(usdc.transfer(msg.sender, amount), "USDC transfer failed");
    }

    /**
     * @dev Anyone can deposit USDC into the pool
     */
    function depositUsdc(uint256 amount) external {
        require(usdc.transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
    }
}
