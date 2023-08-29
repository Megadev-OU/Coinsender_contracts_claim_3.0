# UniswapZap

UniswapZap is a smart contract that facilitates token swaps on Uniswap V2 by providing a simple interface for swapping between any two tokens, including ETH, while handling the required fee.

## Contract Code

The contract code can be found in `UniswapZap.sol`. It uses the OpenZeppelin upgradeable contracts and the Uniswap V2 Router to perform token swaps.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "./interfaces/IUniswapV2Router02.sol";

```

## Features

1. **Swap tokens**: The contract provides a simple interface to swap tokens, including ETH, using Uniswap V2.
2. **Handle fees**: The contract handles fees that are associated with token swaps.
3. **Upgradeable**: The contract uses OpenZeppelin's upgradeable contracts, which allows for future upgrades without changing the contract address.

## Functions

- `initialize`: Initializes the contract with the owner, Uniswap router, minimum fee, and fee collector addresses.
- `getAmountsOut`: Returns the amount of tokens that can be obtained by swapping the given input amount.
- `getAmountsIn`: Returns the amount of tokens required to obtain the given output amount.
- `swap`: Swaps tokens using Uniswap with the specified parameters.
- `_getAmountWithSlippage`: Calculates the amount with slippage.
- `_checkBalanceAndAllowance`: Checks if the allowance of a token for a sender is sufficient.
- `_approveTokenIfNeeded`: Approves a token for a spender if not already approved.

## Setters

- `changeRouter`: Changes the Uniswap router address.
- `changeMinFee`: Changes the minimum fee amount.
- `changeBankAddress`: Changes the fee collector address.


CoinSenderClaimVestingV1 deployed to: 0x3C16FD3a5BaAC4e85b0172291cD12d37156cEF54
