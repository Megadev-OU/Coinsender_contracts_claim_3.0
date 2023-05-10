require('@typechain/hardhat')
require('hardhat-gas-reporter')
require('@nomicfoundation/hardhat-toolbox')
require('@openzeppelin/hardhat-upgrades')
require('@nomiclabs/hardhat-etherscan')
require('hardhat-deploy')
require("hardhat-celo");
require("@oasisprotocol/sapphire-hardhat");

const dotenv = require('dotenv')

dotenv.config();

const privateKey = process.env.PRIVATE_KEY || '';

const networksConfig = {
  mainnet: {
    url: "https://mainnet.infura.io/v3/1e9df73b43b24ec7ac8fe5c78754e45a",
    chainId: 1,
    // gasPrice: 80000000000 // 57
  },
  binance: {
    url: "https://bscrpc.com",
    chainId: 56,
    gasPrice: 5000000000
  },
  bscTestnet: {
    url: "https://bsc-testnet.public.blastapi.io",
    chainId: 97,
    gasPrice: 5000000000 // 5 Gwei
  },
  polygon: {
    url: "https://polygon-mainnet.infura.io/v3/48b0031c00cb4a30b4edf039450af9d6",
    chainId: 137,
    gasPrice: 400000000000 // 100 Gwei
  },
  fantom: {
    url: "https://rpcapi.fantom.network",
    chainId: 250,
    accounts: [`0x${privateKey}`]
    // gasPrice: 31000000000 // 31 Gwei
  },
  celo: {
    url: "https://celo-mainnet.infura.io/v3/48b0031c00cb4a30b4edf039450af9d6",
    chainId: 42220,
    gasPrice: 2100000000 // 25 Gwei
  },
  moonbeam: {
    url: "https://rpc.api.moonbeam.network",
    chainId: 1284,
    gasPrice: 100000000000 // 100 Gwei
  },
  godwoken: {
    url: "https://v1.mainnet.godwoken.io/rpc",
    chainId: 71402,
    accounts: [`0x${privateKey}`]
    // gasPrice: 30000000000, // 30 Gwei
    // gasLimit: 0x1fffffffffffff,
  },
  optimism: {
    url: "https://mainnet.optimism.io",
    chainId: 10,
    gasPrice: 1002417 // 30 Gwei
  },
  gnosis: {
    url: "https://rpc.gnosischain.com",
    chainId: 100,
    gasPrice: 1600000000 // 1,6
  },
  oasisEmerald: {
    url: "https://emerald.oasis.dev",
    chainId: 42262
  },
  oasisSapphire: {
    url: 'https://sapphire.oasis.io',
    chainId: 0x5afe,
    accounts: [privateKey]
  },
  avalanche: {
    url: "https://api.avax.network/ext/bc/C/rpc",
    chainId: 43114
  },
  arbitrumOne: {
    url: "https://arb1.arbitrum.io/rpc",
    chainId: 42161,
    accounts: [`0x${privateKey}`]
  },
  ronin: {
    url: "https://api.roninchain.com/rpc",
    chainId: 2020,
    accounts: [privateKey],
    blockGasLimit: 100000000,
  },
  fuse: {
    url: "https://rpc.fuse.io",
    chainId: 122,
  },
  aurora: {
    url: "https://mainnet.aurora.dev",
    chainId: 1313161554,
  },
  zkSyncMainnet: {
    url: "https://mainnet.era.zksync.io",
    ethNetwork: "https://mainnet.infura.io/v3/<YOUR_API_KEY>", // или "https://eth-mainnet.alchemyapi.io/v2/<YOUR_API_KEY>"
    zksync: true,
  },
  zkTestnet: {
    url: "https://testnet.era.zksync.dev", // URL of the zkSync network RPC
    ethNetwork: "goerli", // Can also be the RPC URL of the Ethereum network (e.g. `https://goerli.infura.io/v3/<API_KEY>`)
    zksync: true,
  },
  moonriver: {
    url: "https://rpc.moonriver.moonbeam.network",
    accounts: [privateKey],
    // gasPrice: 1000000000, // 1 GWei
    chainId: 1285
  },
  harmony: {
    url: "https://api.s0.t.hmny.io",
    accounts: [privateKey],
    // gasPrice: 1000000000, // 1 GWei
    chainId: 1666600000
  },
  heco: {
    url: "https://http-mainnet.hecochain.com",
    accounts: [privateKey],
    // gasPrice: 1000000000, // 1 GWei
    chainId: 128
  },
  okexchain: {
    url: "https://exchainrpc.okex.org",
    accounts: [privateKey],
    // gasPrice: 1000000000, // 1 GWei
    chainId: 66
  },
  palm: {
    url: "https://palm-mainnet.public.blastapi.io",
    accounts: [privateKey],
    // gasPrice: 1000000000, // 1 GWei
    chainId: 11297108109
  },
  telos: {
    url: "https://mainnet.telos.net/evm",
    accounts: [privateKey],
  },
}

function createConfig (network) {
  const gasPrice = 10000000000  // 10 Gwei default

  return {
    accounts: [`${privateKey}`],
    ...networksConfig[network],

    // gasPrice: networksConfig[network].gasPrice || gasPrice
  }
}

const config = {
  zksolc: {
    version: "1.3.5",
    compilerSource: "binary",
    settings: {},
  },
  solidity: {
    compilers: [
      {
        version: '0.8.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          evmVersion: 'istanbul'
        }
      }
    ]
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    }
  },
  abiExporter: {
    flat: true
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY,
      bsc: process.env.BSCSCAN_API_KEY,
      bscTestnet: process.env.BSCSCAN_API_KEY,
      polygon: process.env.POLYGON_API_KEY,
      opera: process.env.FANTOM_API_KEY, // fantom
      celo: process.env.CELO_API_KEY,
      moonbeam: process.env.MOONBEEN_API_KEY,
      godwoken: process.env.GODWOKEN_API_KEY,
      optimisticEthereum: process.env.OPTIMISM_API_KEY,
      gnosis: process.env.GNOSIS_API_KEY,
      oasisEmerald: process.env.OASIS_API_KEY,
      oasisSapphire: process.env.OASIS_API_KEY,
      avalanche: process.env.AVALANCHE_API_KEY,
      arbitrumOne: process.env.ARBITRUM_ONE_API_KEY,
      fuse: process.env.FUSE_API_KEY,
      moonriver: process.env.MOONRIVER_API_KEY,
    }
  },
  customChains: [
    {
      network: "godwoken",
      chainId: 71402,
      urls: {
        apiURL: "https://gw-mainnet-explorer.nervosdao.community/api",
        browserURL: "https://gw-mainnet-explorer.nervosdao.community"
      }
    },
    {
      network: "oasisEmerald",
      chainId: 42262,
      urls: {
        apiURL: "https://explorer.emerald.oasis.dev/api",
        browserURL: "https://explorer.emerald.oasis.dev"
      }
    },
    {
      network: "oasisSapphire",
      chainId: 23294,
      urls: {
        apiURL: "https://explorer.sapphire.oasis.io/api",
        browserURL: "https://explorer.sapphire.oasis.io"
      }
    },
    {
      network: "gnosis",
      chainId: 100,
      urls: {
        // 3) Select to what explorer verify the contracts
        // Gnosisscan
        apiURL: "https://api.gnosisscan.io/api",
        browserURL: "https://gnosisscan.io/",
        // Blockscout
        //apiURL: "https://blockscout.com/xdai/mainnet/api",
        //browserURL: "https://blockscout.com/xdai/mainnet",
      },
    },
  ]
}

config.networks = {
  mainnet: createConfig('mainnet'),
  binance: createConfig('binance'),
  bscTestnet: createConfig('bscTestnet'),
  polygon: createConfig('polygon'),
  fantom: createConfig('fantom'),
  celo: createConfig('celo'),
  moonbeam: createConfig('moonbeam'),
  godwoken: createConfig('godwoken'),
  optimism: createConfig('optimism'),
  gnosis: createConfig('gnosis'),
  oasisEmerald: createConfig('oasisEmerald'),
  oasisSapphire: createConfig('oasisSapphire'),
  avalanche: createConfig('avalanche'),
  arbitrumOne: createConfig('arbitrumOne'),
  ronin: createConfig('ronin'),
  fuse: createConfig('fuse'),
  aurora: createConfig('aurora'),
  moonriver: createConfig('moonriver'),
  harmony: createConfig('harmony'),
  heco: createConfig('heco'),
  okexchain: createConfig('okexchain'),
  palm: createConfig('palm'),
  telos: createConfig('telos'),
  // zkSync: createConfig('zkSync'),
  // zkTestnet: createConfig('zkTestnet'),

  hardhat: {
    chainId: 1337
  }
}

module.exports = config;
