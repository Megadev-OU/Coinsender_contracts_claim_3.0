// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

contract CoinSenderClaimV1 is UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    string public constant name = "CoinSenderClaim";
    string public constant version = "1";

    address public bank;
    uint256 public minFee;

    struct TokenBalance {
        address tokenAddress;
        uint256 amount;
        bool claimed;
    }

    struct EthBalance {
        uint256 amount;
        bool claimed;
    }

    mapping(address => TokenBalance[]) public tokensToClaim;

    mapping(address => EthBalance[]) public ethToClaim;

    event TokensSent(address indexed tokenAddress, address indexed sender, address[] recipients, uint256[] amounts);
    event EthSent(address indexed sender, address[] recipients, uint256[] amounts);
    event TokensClaimed(address indexed claimer, address indexed tokenAddress, uint256 amount);
    event EthClaimed(address indexed claimer, uint256 amount);
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

    /// @dev Sets the bank address
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

    /// @dev Sends tokens to multiple recipients and adds the token balances to their claim list
    /// @param tokenAddress The token contract address
    /// @param recipients The array of recipient addresses
    /// @param amounts The array of amounts to be sent to each recipient
    /// @param fee The fee for this transaction
    function multiSendTokens(
        address tokenAddress,
        address[] memory recipients,
        uint256[] memory amounts,
        uint256 fee
    )  external payable whenNotPaused {
        require(tokenAddress != address(0), "CoinSenderV2: Token address cannot be zero address");
        require(recipients.length > 0, "CoinSenderV2: Recipients array cannot be empty");
        require(recipients.length == amounts.length, "CoinSenderV2: Recipients and amounts arrays should have the same length");

        processFee(fee);

        uint256 totalAmount = 0;

        for (uint256 i = 0; i < recipients.length; i++) {
            tokensToClaim[recipients[i]].push(TokenBalance(tokenAddress, amounts[i], false));
            totalAmount += amounts[i];
        }

        IERC20Upgradeable token = IERC20Upgradeable(tokenAddress);
        require(totalAmount < token.balanceOf(msg.sender), "CoinSenderV2: Not enough token balance");
        require(totalAmount < token.allowance(msg.sender, address(this)), "CoinSenderV2: Not enough token allowance");

        token.safeTransferFrom(msg.sender, address(this), totalAmount);

        // Return excess ETH to the sender
        returnExcessEth(fee);

        emit TokensSent(tokenAddress, msg.sender, recipients, amounts);
    }

    /// @dev Sends ETH to multiple recipients and adds the ETH balances to their claim list
    /// @param recipients The array of recipient addresses
    /// @param amounts The array of amounts to be sent to each recipient
    /// @param fee The fee for this transaction
    function multiSendEth(
        address[] memory recipients,
        uint256[] memory amounts,
        uint256 fee
    ) external payable whenNotPaused {
        require(recipients.length > 0, "CoinSenderV2: Recipients array cannot be empty");
        require(recipients.length == amounts.length, "CoinSenderV2: Recipients and amounts arrays should have the same length");

        uint256 totalAmount = 0;

        for (uint256 i = 0; i < recipients.length; i++) {
            ethToClaim[recipients[i]].push(EthBalance(amounts[i], false));
            totalAmount = totalAmount.add(amounts[i]);
        }

        require(msg.value >= totalAmount.add(fee), "CoinSenderV2: Not enough ETH provided");
        processFee(fee);

        // Return excess ETH to the sender
        returnExcessEth(totalAmount.add(fee));

        emit EthSent(msg.sender, recipients, amounts);
    }

    /// @dev Claims the tokens for the msg.sender
    /// @param index The index of the token balance in the claim list
    /// @param fee The fee for this transaction
    function claimTokens(uint256 index, uint256 fee) external payable nonReentrant whenNotPaused {
        TokenBalance storage tokenBalance = tokensToClaim[msg.sender][index];
        require(!tokenBalance.claimed, "CoinSenderV2: Tokens already claimed");

        processFee(fee);

        IERC20Upgradeable token = IERC20Upgradeable(tokenBalance.tokenAddress);

        tokenBalance.claimed = true;

        token.safeTransfer(msg.sender, tokenBalance.amount);

        // Return excess ETH to the sender
        returnExcessEth(fee);

        emit TokensClaimed(msg.sender, tokenBalance.tokenAddress, tokenBalance.amount);
    }

    /// @dev Claims the ETH for the msg.sender
    /// @param index The index of the ETH balance in the claim list
    /// @param fee The fee for this transaction
    function claimEth(uint256 index, uint256 fee) external payable nonReentrant whenNotPaused {
        EthBalance storage ethBalance = ethToClaim[msg.sender][index];
        require(!ethBalance.claimed, "CoinSenderV2: ETH already claimed");
        require(ethBalance.amount > fee, "CoinSenderV2: Balance must be higher than fee");

        ethBalance.claimed = true;

        processFee(fee);

        uint256 amount = ethBalance.amount.sub(fee);
        sendETH(msg.sender, amount);

        emit EthClaimed(msg.sender, ethBalance.amount);
    }

    /// @dev Returns the claim lists (tokens and ETH) for the specified recipient
    /// @param recipient The recipient address
    /// @return tokenBalances The array of token balances for the recipient
    /// @return ethBalances The array of ETH balances for the recipient
    function getRecipientBalances(address recipient)
    public view
    returns (TokenBalance[] memory tokenBalances, EthBalance[] memory ethBalances) {
        tokenBalances = tokensToClaim[recipient];
        ethBalances = ethToClaim[recipient];
    }

    function processFee(uint256 fee) internal {
        require(fee >= minFee, "CoinSenderV2: Fee is below the minimum");
        sendETH(bank, fee);
    }

    function returnExcessEth(uint256 totalAmount) internal {
        uint256 excess = msg.value.sub(totalAmount);
        if (excess > 0) {
            sendETH(msg.sender, excess);
        }
    }

    /// @dev Returns excess ETH to the contract owner
    function returnExcessEthToSender() public onlyOwner {
        uint256 contractBalance = address(this).balance;
        if (contractBalance > 0) {
            sendETH(msg.sender, contractBalance);
        }
    }

    /// @dev Withdraws accidentally sent tokens to the contract
    /// @param token The token contract address
    /// @param amount The amount to withdraw
    function withdrawAccidentallySentEth(address token, uint256 amount) public onlyOwner {
        IERC20Upgradeable(token).safeTransfer(msg.sender, amount);
    }

    /// @dev Sends ETH to the specified address
    /// @param recipient The recipient address
    /// @param amount The amount to send
    function sendETH(address recipient, uint256 amount) internal {
        if (amount > 0) {
            (bool success,) = payable(recipient).call{value: amount}("");
            require(success, "CoinSenderV2: ETH transfer failed");
        }
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    uint256[49] private __gap;
}
