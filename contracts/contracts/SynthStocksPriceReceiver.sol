// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

contract SynthStocksPriceReceiver {
    address public owner;
    address public updater;

    uint256 public latestPrice;    // price in 8 decimals (e.g. 25747000000 = $257.47)
    uint256 public lastUpdatedAt;

    event PriceUpdated(uint256 price, uint256 timestamp);

    modifier onlyOwner() {
        require(msg.sender == owner, "SynthStocksPriceReceiver: Only owner");
        _;
    }

    modifier onlyUpdater() {
        require(msg.sender == updater, "SynthStocksPriceReceiver: Only updater");
        _;
    }

    constructor(address _updater) {
        owner = msg.sender;
        updater = _updater;
    }

    function updatePrice(uint256 _price) external {
        require(
            msg.sender == updater || msg.sender == owner,
            "SynthStocksPriceReceiver: Only updater or owner"
        );
        require(_price > 0, "SynthStocksPriceReceiver: Invalid price");
        latestPrice = _price;
        lastUpdatedAt = block.timestamp;
        emit PriceUpdated(_price, block.timestamp);
    }

    /**
     * @dev CRE Keystone forwarder calls onReport(metadata, report).
     *      report = abi.encode(calldata) where calldata is the encoded function call.
     *      We decode and execute via self-call.
     */
    function onReport(bytes calldata, bytes calldata report) external {
        // report contains the raw calldata built by CRE encodeFunctionData
        (bool success, ) = address(this).call(report);
        require(success, "SynthStocksPriceReceiver: onReport call failed");
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == 0x01ffc9a7 || interfaceId == 0x805f2132;
    }

    /**
     * @dev Called internally via onReport self-call. No access control needed
     *      since only onReport can trigger the self-call.
     */
    function updatePriceFromReport(uint256 _price) external {
        require(msg.sender == address(this), "SynthStocksPriceReceiver: Only self");
        require(_price > 0, "SynthStocksPriceReceiver: Invalid price");
        latestPrice = _price;
        lastUpdatedAt = block.timestamp;
        emit PriceUpdated(_price, block.timestamp);
    }

    function setUpdater(address _updater) external onlyOwner {
        updater = _updater;
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "SynthStocksPriceReceiver: Zero address");
        owner = _newOwner;
    }
}
