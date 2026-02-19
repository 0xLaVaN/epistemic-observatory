#!/usr/bin/env node

import { KalshiFixed, normalizeKalshiMarket } from './kalshi-fix.js';

async function testKalshiIntegration() {
  console.log('Testing fixed Kalshi integration...');
  
  try {
    const kalshi = new KalshiFixed();
    console.log('KalshiFixed instance created');
    
    console.log('Fetching markets...');
    const markets = await kalshi.fetchMarkets({ limit: 5 });
    console.log(`Fetched ${markets.length} raw markets`);
    
    if (markets.length > 0) {
      console.log('\nFirst raw market:');
      console.log(JSON.stringify(markets[0], null, 2));
      
      console.log('\nNormalized market:');
      const normalized = normalizeKalshiMarket(markets[0]);
      console.log(JSON.stringify(normalized, null, 2));
      
      console.log('\nAll normalized markets:');
      markets.forEach((market, i) => {
        const norm = normalizeKalshiMarket(market);
        console.log(`${i+1}. ${norm.title} - ${norm.marketId} - Volume: $${norm.volume24h}`);
      });
    }
    
    return true;
  } catch (error) {
    console.error('Integration test failed:', error);
    return false;
  }
}

testKalshiIntegration().then(success => {
  console.log(success ? 'Integration test PASSED' : 'Integration test FAILED');
  process.exit(success ? 0 : 1);
});