require('dotenv').config({ path: __dirname + '/.env' });

function getEnvVar(key, required = true) {
  const value = process.env[key];
  if (required && (!value || value === '')) {
    throw new Error(`${key} is not defined or empty in .env`);
  }
  return value;
}

module.exports = {
  WHITELISTED_WALLET_PRIVATE_KEY: getEnvVar('WHITELISTED_WALLET_PRIVATE_KEY'),
  BUYER_AGENT_WALLET_ADDRESS: getEnvVar('BUYER_AGENT_WALLET_ADDRESS'),
  BUYER_ENTITY_ID: parseInt(getEnvVar('BUYER_ENTITY_ID')),
  SELLER_AGENT_WALLET_ADDRESS: getEnvVar('SELLER_AGENT_WALLET_ADDRESS'),
  SELLER_ENTITY_ID: parseInt(getEnvVar('SELLER_ENTITY_ID')),
  TEST_SERVICE_KEYWORD: getEnvVar('TEST_SERVICE_KEYWORD', false) || 'solidity_audit',
  TEST_PRICE: parseFloat(getEnvVar('TEST_PRICE', false) || '0.01'),
};
