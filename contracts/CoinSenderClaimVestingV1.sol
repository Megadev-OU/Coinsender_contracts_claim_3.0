// SPDX-License-Identifier: Apache-2.0

// Copyright 2023 CoinSender

/**
 * @title CoinSenderClaim
 * @dev This contract allows for non-custodial transfer of tokens.
 *
 * Company: CoinSender
 * Developed by: Manchenko V
 *
 * The CoinSender contract includes functionalities of tracking token transfers,
 * cancelling pending transfers, and claiming tokens by the recipient.
 * It utilizes OpenZeppelin's contracts library for secure and standardized
 * Ethereum contract development.
 *
 * For questions and further details, contact:
 * - company: CoinSender, https://coinsender.io/
 */

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";


// import "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import "@thirdweb-dev/contracts/openzeppelin-presets/metatx/ERC2771ContextUpgradeable.sol";

import "./lib/CurrencyTransferLib.sol";

contract CoinSenderClaimVestingV1 is
    Initializable,
    UUPSUpgradeable,
    ERC2771ContextUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    AccessControlEnumerableUpgradeable
{

    // Use OpenZeppelin's EnumerableSet for uint256.
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using CountersUpgradeable for CountersUpgradeable.Counter;

    event CoinSent(address indexed coinAddress, uint256[] id);
    event CoinClaimed(address indexed claimer, uint256 id);
    event CancelTransfer(address indexed sender, uint256 id);
    event BankAddressChanged(address indexed oldBank, address indexed newBank);
    event MinFeeChanged(uint256 oldMinFee, uint256 newMinFee);

    modifier onlyPermittedUser(address user) {
        require(_msgSender() == user || hasRole(OPERATOR_ROLE, _msgSender()), "Not the authorized user or operator");
        _;
    }

    /// @dev transferId => Transfer
    mapping(uint256 => Transfer) private transfers;

    /// @dev id counter for transfers
    CountersUpgradeable.Counter private transferIdCounter;

    /// @dev Declare the maps
    mapping(address => EnumerableSetUpgradeable.UintSet) private senderTransfers;
    mapping(address => EnumerableSetUpgradeable.UintSet) private recipientTransfers;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    string public constant name = "CoinSenderClaim";
    string public constant version = "2";

    address public bank;
    uint256 public minFee;

    struct Transfer {
        uint256 id;
        address sender;
        // recipient of tokens after they are released
        address recipient;
        // token address or native token
        address coin;
        // total amount of tokens to be released at the end of the vesting
        uint256 amount;
        // cliff time of the vesting start in seconds since the UNIX epoch
        uint256 cliff;
        // start time of the vesting period in seconds since the UNIX epoch
        uint256 start;
        // duration of the vesting period in seconds
        uint256 duration;
        // duration of a slice period for the vesting in seconds
        uint256 slicePeriodSeconds;
        // whether or not the vesting is revocable
        bool revocable;
        // amount of tokens released
        uint256 released;
        // whether or not the vesting has been revoked
        bool revoked;
    }

    struct SendCoinsData {
        address currency;
        address[] recipient;
        uint256[] amount;
        uint256 cliff;
        uint256 start;
        uint256 duration;
        uint256 slicePeriodSeconds;
        bool revocable; /// true
        uint256 fee;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {}

    function _authorizeUpgrade(address newImplementation)
    internal
    virtual
    override
    onlyOwner
    {}

    /**
    * @notice Initializes the contract with an owner and a minimum fee
    * @param _owner The owner's address for the contract
    * @param _minFee The minimum fee for contract operations
    */
    function initialize(address _owner, uint256 _minFee) public initializer {
        require(_owner != address(0), "CoinSenderV2: Owner address is not set");

        __Ownable_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __AccessControlEnumerable_init();

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(OPERATOR_ROLE, _owner);
        _setupRole(PAUSER_ROLE, _owner);

        transferOwnership(_owner);
        bank = _owner;
        minFee = _minFee;
    }

    /**
    * @dev Sets the bank address
    *
    * @param _bank The new bank address
    */
    function changeBankAddress(address _bank) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_bank != address(0), "CoinSenderV2: Bank address is not be zero");
        address oldBank = bank;
        bank = _bank;
        emit BankAddressChanged(oldBank, _bank);
    }

    /**
    * @dev Sets the minimum fee
    *
    * @param _minFee The new minimum fee
    */
    function setMinFee(uint256 _minFee) public onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 oldMinFee = minFee;
        minFee = _minFee;
        emit MinFeeChanged(oldMinFee, _minFee);
    }

    function sendCoins(SendCoinsData memory data) external payable nonReentrant whenNotPaused
    {
        require(data.currency != address(0), "CoinSenderClaim: Token address cannot be zero address");
        require(data.recipient.length > 0, "CoinSenderClaim: Recipients array cannot be empty");
        require(data.recipient.length == data.amount.length, "CoinSenderClaim: Recipients and amounts arrays should have the same length");
        require(data.duration > 0, "CoinSenderClaim: duration must be > 0");
        require(
            data.slicePeriodSeconds >= 1,
            "TokenVesting: slicePeriodSeconds must be >= 1"
        );
        require(data.duration >= data.cliff, "TokenVesting: duration must be >= cliff");

        uint256 cliff = data.start + data.cliff;
        uint256 totalAmount = 0;
        uint256 transferId;
        uint256[] memory ids = new uint256[](data.recipient.length);

        for (uint256 i = 0; i < data.recipient.length; i++) {
            require(data.amount[i] > 0, "CoinSenderClaim: Amount must be greater than 0");
            require(data.recipient[i] != _msgSender(), "CoinSenderClaim: You cannot send coins to yourself");
            require(data.recipient[i] != address(0), "CoinSenderClaim: Recipient address not be zero");

            transferId = transferIdCounter.current();
            ids[i] = transferId;

            totalAmount += data.amount[i];
            transfers[transferId] = Transfer(
                transferId,
                _msgSender(),
                data.recipient[i],
                data.currency,
                data.amount[i],
                cliff,
                data.start,
                data.duration,
                data.slicePeriodSeconds,
                data.revocable,
                0,
                false
            );
            _addTransferId(_msgSender(), data.recipient[i], transferId);

            transferIdCounter.increment();
        }

        if (data.currency == CurrencyTransferLib.NATIVE_TOKEN) {
            require(msg.value >= data.fee + totalAmount, "CoinSenderClaim: Insufficient ETH sent to cover fee and total amount");
        }

        _processFee(data.fee);

        CurrencyTransferLib.transferCurrency(data.currency, _msgSender(), payable(address(this)), totalAmount);

        emit CoinSent(data.currency, ids);
    }

    /**
    * @dev Returns an array of pending coin claims for the specified recipient.
    *
    * @param _recipient The address of the recipient to view the pending coin claims for.
    *
    * @return claims An array of `Transfer` structs representing the pending claims.
    *
    * The caller of the function must be the recipient themselves.
    */
    function viewClaimsCoins(address _recipient)
    external view onlyPermittedUser(_recipient) returns (Transfer[] memory)
    {
        return __getTransfers(recipientTransfers[_recipient]);
    }

    function availableForWithdrawal(uint256 _transferId) public view returns (uint256) {
        Transfer memory transfer = transfers[_transferId];
        return _releasableAmount(transfer);
    }

    /**
    * @dev Returns an array of sent coins for the specified sender.
    *
    * @param _sender The address of the sender to view the sent coins for.
    *
    * @return sentTokens An array of `Transfer` structs representing the sent coins.
    *
    * The caller of the function must be the sender themselves.
    */
    function viewSentCoins(address _sender)
    external view onlyPermittedUser(_sender) returns (Transfer[] memory)
    {
        return __getTransfers(senderTransfers[_sender]);
    }

    /**
    * @dev Allows the caller to claim one or more coin transfers.
    *
    * @param _transferIds An array of transfer IDs to claim.
    * @param _fee The fee to be deducted from the claimed funds.
    *
    * The caller of the function must be the recipient of each of the transfers.
    * Each of the transfers must be in a claimable state.
    */
    function claim(uint256[] calldata _transferIds, uint256 _fee)
    external payable nonReentrant whenNotPaused {
        require(_transferIds.length > 0, "Transfer IDs array cannot be empty");

        _processFee(_fee);

        for (uint256 i = 0; i < _transferIds.length; i++) {
            __claim(_msgSender(), _transferIds[i]);
        }
    }

    /**
    * @dev Allows the caller to cancel one or more coin transfers.
    *
    * @param _transferIds An array of transfer IDs to cancel.
    *
    * The caller of the function must be the sender of each of the transfers.
    * Each of the transfers must be in a cancelable state.
    */
    function cancel(uint256[] calldata _transferIds)
    external nonReentrant whenNotPaused
    {
        require(_transferIds.length > 0, "No transfer IDs provided");

        for (uint256 i = 0; i < _transferIds.length; i++) {
            __cancel(_msgSender(), _transferIds[i]);
        }
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function __claim(address _claimant, uint256 _transferId) private {
        Transfer storage transfer = transfers[_transferId];

        require(transfer.amount > 0, "No pending claim found");
        require(transfer.recipient == _claimant, "Claimant is not the recipient of the transfer");
        require(recipientTransfers[_claimant].contains(transfer.id), "The claimant is not the recipient for this transfer ID");

        uint256 releasable = _releasableAmount(transfer);
        require(releasable > 0, "No releasable amount at the moment");

        transfer.released += releasable;

        if (transfer.released >= transfer.amount) {
            transfers[_transferId].amount = 0;
            _removeTransferId(transfer.sender, transfer.recipient, _transferId);
        }

        CurrencyTransferLib.transferCurrency(transfer.coin, address(this), payable(_claimant), releasable);

        emit CoinClaimed(transfer.sender, _transferId);
    }

    function _releasableAmount(Transfer memory transfer) private view returns (uint256) {
        uint256 currentTime = block.timestamp;
        if (currentTime < transfer.cliff) {
            return 0;
        }
        else if (currentTime >= transfer.start + transfer.duration) {
            return transfer.amount - transfer.released;
        }
        else {
            uint256 timeFromStart = currentTime - transfer.start;
            uint256 secondsPerSlice = transfer.slicePeriodSeconds;
            uint256 vestedSlicePeriods = timeFromStart / secondsPerSlice;
            uint256 vestedSeconds = vestedSlicePeriods * secondsPerSlice;
            // Compute the amount of tokens that are vested.
            uint256 vestedAmount = (transfer.amount * vestedSeconds) / transfer.duration;
            return vestedAmount - transfer.released;
        }
    }

    function __cancel(address _requestor, uint256 _transferId) private {
        Transfer storage transfer = transfers[_transferId];

        require(transfer.amount > 0, "No transfer found");
        require(transfer.sender == _requestor, "Requestor is not the sender of the transfer");
        require(senderTransfers[_requestor].contains(_transferId), "The requestor did not initiate this transfer");
        require(transfer.revocable, "This transfer is not revocable");

        uint256 refundAmount = transfer.amount - transfer.released; //// Only returning the unreleased tokens

        transfers[_transferId].amount = 0;
        _removeTransferId(transfer.sender, transfer.recipient, _transferId);

        CurrencyTransferLib.transferCurrency(transfer.coin, address(this), payable(transfer.sender), refundAmount);

        emit CancelTransfer(_msgSender(), _transferId);
    }


    function __getTransfers(EnumerableSetUpgradeable.UintSet storage set) private view returns (Transfer[] memory) {
        Transfer[] memory transfersList = new Transfer[](set.length());

        for (uint i = 0; i < set.length(); i++) {
            transfersList[i] = transfers[set.at(i)];
        }

        return transfersList;
    }

    // Add a transferId to a sender and a recipient
    function _addTransferId(address _sender, address _recipient, uint256 _transferId) private {
        senderTransfers[_sender].add(_transferId);
        recipientTransfers[_recipient].add(_transferId);
    }

    // Remove a transferId from a sender and a recipient
    function _removeTransferId(address _sender, address _recipient, uint256 _transferId) private {
        senderTransfers[_sender].remove(_transferId);
        recipientTransfers[_recipient].remove(_transferId);
    }

    function _processFee(uint256 _amount) private {
        require(_amount >= minFee, "CoinSenderClaim: Fee is below the minimum");
        require(msg.value >= _amount, "CoinSenderClaim: Fee to low");
        CurrencyTransferLib.transferCurrency(CurrencyTransferLib.NATIVE_TOKEN, _msgSender(), payable(bank), _amount);
    }

    function _msgSender()
    internal
    view
    virtual
    override(ContextUpgradeable, ERC2771ContextUpgradeable)
    returns (address sender)
    {
        return ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData()
    internal
    view
    virtual
    override(ContextUpgradeable, ERC2771ContextUpgradeable)
    returns (bytes calldata)
    {
        return ERC2771ContextUpgradeable._msgData();
    }

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override(AccessControlEnumerableUpgradeable)
    returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function emergencyWithdraw(address tokenAddress) external onlyOwner whenPaused {
        uint256 balance = CurrencyTransferLib.getBalance(tokenAddress, address(this));
        require(balance > 0, "No funds to withdraw");
        CurrencyTransferLib.transferCurrency(tokenAddress, address(this), payable(msg.sender), balance);
    }

    function emergencyWithdrawETH() external onlyOwner whenPaused {
        uint256 balance = CurrencyTransferLib.getBalance(CurrencyTransferLib.NATIVE_TOKEN, address(this));
        require(balance > 0, "No ETH to withdraw");
        CurrencyTransferLib.transferCurrency(CurrencyTransferLib.NATIVE_TOKEN, address(this), payable(msg.sender), balance);
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[99] private __gap;

}
