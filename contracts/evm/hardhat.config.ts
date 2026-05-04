import 'dotenv/config';
import '@nomicfoundation/hardhat-toolbox';
import type { HardhatUserConfig } from 'hardhat/config';

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? '';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {},
    ethereum: {
      url: process.env.MAINNET_RPC ?? 'https://eth.llamarpc.com',
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    arbitrum: {
      url: process.env.ARBITRUM_RPC ?? 'https://arb1.arbitrum.io/rpc',
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    optimism: {
      url: process.env.OPTIMISM_RPC ?? 'https://mainnet.optimism.io',
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    base: {
      url: process.env.BASE_RPC ?? 'https://mainnet.base.org',
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    polygon: {
      url: process.env.POLYGON_RPC ?? 'https://polygon-rpc.com',
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    avalanche: {
      url: process.env.AVALANCHE_RPC ?? 'https://api.avax.network/ext/bc/C/rpc',
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    bnb: {
      url: process.env.BNB_RPC ?? 'https://bsc-dataseed.binance.org',
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY ?? '',
  },
};

export default config;
