pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract BatchTokenSender {

    struct PendingClaimTokens {
        address sender;
        address token;
        uint256 amount;
    }

    struct PendingClaimETH {
        address sender;
        uint256 amount;
    }

    mapping(address => PendingClaimTokens[]) private claimsTokens;
    mapping(address => PendingClaimETH[]) private claimsETH;

    event TokensSent(address indexed sender, address indexed recipient, address indexed token, uint256 amount);
    event Claimed(address indexed claimant, address indexed token, uint256 amount);
    event ClaimCancelled(address indexed sender, address indexed recipient, address indexed token, uint256 amount);
    event EthSent(address indexed sender, address indexed recipient, uint256 amount);
    event EthClaimed(address indexed claimant, uint256 amount);
    event EthClaimCancelled(address indexed sender, address indexed recipient, uint256 amount);

    function sendTokens(address[] calldata recipients, address[] calldata tokens, uint256[] calldata amounts)
    external whenNotPaused nonReentrant
    {
        require(recipients.length == tokens.length && recipients.length == amounts.length, "Input arrays must have the same length");

        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            address token = tokens[i];
            uint256 amount = amounts[i];

            IERC20(token).transferFrom(msg.sender, address(this), amount);
            claimsTokens[recipient].push(PendingClaimTokens(msg.sender, token, amount));
            emit TokensSent(msg.sender, recipient, token, amount);
        }
    }

    function claimTokens(uint256 claimIndex) external whenNotPaused nonReentrant {
        require(claimIndex < claimsTokens[msg.sender].length, "Invalid claim index");
        PendingClaimTokens memory claim = claimsTokens[msg.sender][claimIndex];
        require(claim.amount > 0, "No pending claim found");

        delete claimsTokens[msg.sender][claimIndex];
        IERC20(claim.token).transfer(msg.sender, claim.amount);
        emit Claimed(msg.sender, claim.token, claim.amount);
    }

    function cancelClaimTokens(address recipient, uint256 claimIndex) external whenNotPaused nonReentrant {
        require(claimIndex < claimsTokens[recipient].length, "Invalid claim index");
        PendingClaimTokens memory claim = claimsTokens[recipient][claimIndex];
        require(claim.sender == msg.sender, "Not the sender of the claim");

        delete claimsTokens[recipient][claimIndex];
        IERC20(claim.token).transfer(claim.sender, claim.amount);
        emit ClaimCancelled(claim.sender, recipient, claim.token, claim.amount);
    }

    function sendBatchEth(address[] calldata recipients, uint256[] calldata amounts) external payable whenNotPaused nonReentrant {
        require(recipients.length == amounts.length, "Input arrays must have the same length");
        uint256 totalAmount = 0;

        for (uint256 i = 0; i < amounts.length; i++) {
            totalAmount += amounts[i];
        }

        require(msg.value == totalAmount, "Incorrect ETH amount provided");

        for (uint256 i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            uint256 amount = amounts[i];

            claimsETH[recipient].push(PendingClaimETH(msg.sender, amount));
            emit EthSent(msg.sender, recipient, amount);
        }
    }

    function claimEth(uint256 claimIndex) external whenNotPaused nonReentrant {
        require(claimIndex < claimsETH[msg.sender].length, "Invalid claim index");
        PendingClaimETH memory claim = claimsETH[msg.sender][claimIndex];
        require(claim.amount > 0, "No pending ETH claim found");

        delete claimsETH[msg.sender][claimIndex];
        payable(msg.sender).transfer(claim.amount);
        emit EthClaimed(msg.sender, claim.amount);
    }

    function cancelEthClaim(address recipient, uint256 claimIndex) external whenNotPaused nonReentrant {
        require(claimIndex < claimsETH[recipient].length, "Invalid claim index");
        PendingClaimETH memory claim = claimsETH[recipient][claimIndex];
        require(claim.sender == msg.sender, "Not the sender of the claim");

        delete claimsETH[recipient][claimIndex];
        payable(claim.sender).transfer(claim.amount);
        emit EthClaimCancelled(claim.sender, recipient, claim.amount);
    }

    function viewClaims(address recipient) external view returns (PendingClaimTokens[] memory, PendingClaimETH[] memory) {
        return (claimsTokens[recipient], claimsETH[recipient]);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
