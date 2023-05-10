// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "@thirdweb-dev/contracts/openzeppelin-presets/metatx/ERC2771ContextUpgradeable.sol";

import "./lib/CurrencyTransferLib.sol";
import "./lib/Set.sol";


contract CoinSenderClaim is UUPSUpgradeable, ERC2771ContextUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {

    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    struct SentToken {
        address recipient;
        address token;
        uint256 amount;
    }

    struct Claim {
        address sender;
        address token;
        uint256 amount;
    }

    string public constant name = "CoinSenderClaim";
    string public constant version = "1";

    address public bank;
    uint256 public minFee;

    // recipient => sender => coin => amount
    mapping(address => mapping(address => mapping(address => uint256))) private claimsCoins;

    // sender => recipients
    mapping(address => EnumerableSetUpgradeable.AddressSet) private senderRecipients;

    // recipient => coins
    mapping(address => EnumerableSetUpgradeable.AddressSet) private recipientCoins;

    // recipient => senders
    mapping(address => EnumerableSetUpgradeable.AddressSet) private recipientSenders;

    // recipient => sender => total amount
    mapping(address => mapping(address => uint256)) private totalClaims;

    event CoinSent(address indexed coinAddress, address indexed sender, address[] recipients, uint256[] amounts);
    event CoinClaimed(address indexed claimer, address indexed tokenAddress, uint256 amount);
    event CancelTransfer(address indexed sender,  address[] recipients,  address[] coinAddress);

    event BankAddressChanged(address indexed oldBank, address indexed newBank);
    event MinFeeChanged(uint256 oldMinFee, uint256 newMinFee);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {}

    function _authorizeUpgrade(address newImplementation)
    internal
    virtual
    override
    onlyOwner
    {}

    /// @notice Initializes the contract with an owner and a minimum fee
    /// @param _owner The owner's address for the contract
    /// @param _minFee The minimum fee for contract operations
    function initialize(address _owner, uint256 _minFee) public initializer {
        require(_owner != address(0), "CoinSenderV2: Owner address is not set");

        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        transferOwnership(_owner);
        bank = _owner;
        minFee = _minFee;
    }

    receive() external payable {}

    // @dev Sets the bank address
    /// @param _bank The new bank address
    function changeBankAddress(address _bank) public onlyOwner {
        require(_bank != address(0), "CoinSenderV2: Bank address is not be zero");
        address oldBank = bank;
        bank = _bank;
        emit BankAddressChanged(oldBank, _bank);
    }

    /// @dev Sets the minimum fee
    /// @param _minFee The new minimum fee
    function setMinFee(uint256 _minFee) public onlyOwner {
        uint256 oldMinFee = minFee;
        minFee = _minFee;
        emit MinFeeChanged(oldMinFee, _minFee);
    }

    function sendCoins(address _currency, address[] calldata _recipient, uint256[] calldata _amount, uint256 _fee)
    external payable whenNotPaused nonReentrant
    {
        require(_currency != address(0), "CoinSenderClaim: Token address cannot be zero address");
        require(_recipient.length > 0, "CoinSenderClaim: Recipients array cannot be empty");
        require(_recipient.length == _amount.length, "CoinSenderClaim: Recipients and amounts arrays should have the same length");

        uint256 totalAmount = 0;

        for (uint256 i = 0; i < _recipient.length; i++) {
            require(_amount[i] > 0, "CoinSenderClaim: Amount must be greater than 0");
            claimsCoins[_recipient[i]][_msgSender()][_currency] += _amount[i];
            totalAmount += _amount[i];

            senderRecipients[_msgSender()].add(_recipient[i]);
            recipientCoins[_recipient[i]].add(_currency);
            recipientSenders[_recipient[i]].add(_msgSender());
            totalClaims[_recipient[i]][_msgSender()] += _amount[i];
        }

        if (_currency == CurrencyTransferLib.NATIVE_TOKEN) {
            require(msg.value >= _fee + totalAmount, "CoinSenderClaim: Insufficient ETH sent to cover fee and total amount");
        }

        _processFee(_fee);

        CurrencyTransferLib.transferCurrency(_currency, _msgSender(), payable(address(this)), totalAmount);

        emit CoinSent(_currency, _msgSender(), _recipient, _amount);
    }

    function viewClaims(address _recipient) external view returns (Claim[] memory claims) {
        require(_msgSender() == _recipient, "Only the recipient can view their claims");

        uint256 sendersCount = recipientSenders[_recipient].length();
        uint256 tokensCount = recipientCoins[_recipient].length();

        // Create a dynamic array to store the claims
        claims = new Claim[](sendersCount * tokensCount);

        // Index to keep track of the number of valid claims
        uint256 claimIndex = 0;

        for (uint256 i = 0; i < sendersCount; i++) {
            address sender = recipientSenders[_recipient].at(i);

            for (uint256 j = 0; j < tokensCount; j++) {
                address token = recipientCoins[_recipient].at(j);
                uint256 amount = claimsCoins[_recipient][sender][token];

                if (amount > 0) {
                    // Add a new claim to the array
                    claims[claimIndex] = Claim(sender, token, amount);
                    claimIndex++;
                }
            }
        }

        // Resize the array to fit the number of valid claims
        assembly {
            mstore(claims, claimIndex)
        }
    }

    function viewSentTokens(address _sender) external view returns (SentToken[] memory sentTokens) {
        require(_msgSender() == _sender, "Only the sender can view their sent tokens");

        uint256 recipientsCount = senderRecipients[_sender].length();

        // Create a dynamic array to store the sent tokens
        sentTokens = new SentToken[](recipientsCount);

        // Index to keep track of the number of valid sent tokens
        uint256 sentTokenIndex = 0;

        for (uint256 i = 0; i < recipientsCount; i++) {
            address recipient = senderRecipients[_sender].at(i);
            uint256 tokensCount = recipientCoins[recipient].length();

            for (uint256 j = 0; j < tokensCount; j++) {
                address token = recipientCoins[recipient].at(j);
                uint256 amount = claimsCoins[recipient][_sender][token];

                if (amount > 0) {
                    // Add a new sent token to the array
                    sentTokens[sentTokenIndex] = SentToken(recipient, token, amount);
                    sentTokenIndex++;
                }
            }
        }

        // Resize the array to fit the number of valid sent tokens
        assembly {
            mstore(sentTokens, sentTokenIndex)
        }
    }

    function claimCoinsBatch(address[] calldata _senders, address[] calldata _currency)
    external whenNotPaused nonReentrant {
        require(_senders.length > 0, "Senders array cannot be empty");
        require(_senders.length == _currency.length, "Senders and currencies arrays must have the same length");

        for (uint256 i = 0; i < _senders.length; i++) {
            _claimCoins(_msgSender(), _senders[i], _currency[i]);
        }
    }

    function cancelTransferBatch(address[] calldata recipients, address[] calldata currencies)
    external whenNotPaused nonReentrant
    {
        require(recipients.length > 0, "No recipients provided");
        require(recipients.length == currencies.length, "Recipients and currencies arrays must have the same length");

        for (uint256 i = 0; i < recipients.length; i++) {
            _cancelTransfer(recipients[i], currencies[i], _msgSender());
        }

        emit CancelTransfer(_msgSender(), recipients, currencies);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _processFee(uint256 _amount) internal {
        require(_amount >= minFee, "CoinSenderClaim: Fee is below the minimum");
        require(msg.value >= _amount, "CoinSenderClaim: Fee to low");
        CurrencyTransferLib.transferCurrency(CurrencyTransferLib.NATIVE_TOKEN, _msgSender(), payable(bank), _amount);
    }

    function _claimCoins(address recipient, address sender, address currency) internal {
        uint256 amount = claimsCoins[recipient][sender][currency];
        require(amount > 0, "No pending claim found");

        claimsCoins[recipient][sender][currency] = 0;
        totalClaims[recipient][sender] -= amount;
        CurrencyTransferLib.transferCurrency(currency, address(this), payable(recipient), amount);

        _updateClaims(recipient, sender, currency);

        emit CoinClaimed(sender, currency, amount);
    }

    function _cancelTransfer(address recipient, address currency, address sender) internal {
        uint256 amount = claimsCoins[recipient][sender][currency];
        require(amount > 0, "No cancel transfer found");

        claimsCoins[recipient][_msgSender()][currency] = 0;
        totalClaims[recipient][_msgSender()] -= amount;
        CurrencyTransferLib.transferCurrency(currency, address(this), payable(sender), amount);

        _updateClaims(recipient, sender, currency);
    }

    function _updateClaims(address recipient, address sender, address currency) internal {
        // If no coins are left to be claimed, remove the sender and recipient from their respective sets
        if (totalClaims[recipient][sender] == 0) {
            recipientSenders[recipient].remove(sender);
            senderRecipients[sender].remove(recipient);
        }

        // If no coins of this currency are left to be claimed, remove the currency from the recipient's coin set
        bool hasCurrency = false;
        for (uint256 j = 0; j < senderRecipients[sender].length(); j++) {
            if (claimsCoins[senderRecipients[sender].at(j)][sender][currency] > 0) {
                hasCurrency = true;
                break;
            }
        }
        if (!hasCurrency) {
            recipientCoins[recipient].remove(currency);
        }
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
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[99] private __gap;

}
