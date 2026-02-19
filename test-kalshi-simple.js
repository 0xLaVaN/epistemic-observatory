#!/usr/bin/env node

console.log('Testing direct Kalshi API call...');

async function testKalshiDirectly() {
  try {
    // Try making a direct API call to Kalshi first to see if we need auth
    const response = await fetch('https://trading-api.kalshi.com/trade-api/v2/markets?limit=5', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Prescience/1.0'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
      return null;
    }
    
    const data = await response.json();
    console.log('Success! Data:', JSON.stringify(data, null, 2));
    return data;
    
  } catch (error) {
    console.error('Direct API call failed:', error);
    return null;
  }
}

testKalshiDirectly().then(() => {
  console.log('Test completed');
}).catch(err => {
  console.error('Test failed:', err);
});