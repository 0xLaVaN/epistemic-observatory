#!/usr/bin/env node

import { Kalshi } from 'pmxtjs';

async function testKalshi() {
  console.log('Testing Kalshi integration...');
  
  try {
    const kalshi = new Kalshi();
    console.log('Kalshi instance created successfully');
    
    console.log('Attempting to fetch markets...');
    const markets = await kalshi.fetchMarkets({ limit: 5 });
    
    console.log(`Successfully fetched ${markets?.length || 0} markets`);
    if (markets && markets.length > 0) {
      console.log('First market:', JSON.stringify(markets[0], null, 2));
    }
    
    return markets;
  } catch (error) {
    console.error('Kalshi test error:', error);
    console.error('Stack trace:', error.stack);
    return null;
  }
}

testKalshi().then(() => {
  console.log('Test completed');
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});