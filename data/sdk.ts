import { CryptoStatsSDK } from '@cryptostats/sdk';

const sdk = new CryptoStatsSDK({
  mongoConnectionString: process.env.MONGO_CONNECTION_STRING,
  redisConnectionString: process.env.REDIS_URL,
  ipfsGateway: 'https://ipfs.cryptostats.community',
  executionTimeout: 1000,
  adapterListSubgraph: 'dmihal/cryptostats-adapter-registry-test',
});

export default sdk;
