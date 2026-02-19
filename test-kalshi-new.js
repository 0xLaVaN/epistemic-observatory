#!/usr/bin/env node

console.log('Testing new Kalshi API endpoint...');

async function testKalshiNewAPI() {
  try {
    // Try the new API endpoint
    const response = await fetch('https://api.elections.kalshi.com/trade-api/v2/markets?limit=5', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Prescience/1.0'
      }
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
      
      // Also try without trade-api path
      console.log('\nTrying alternative endpoint...');
      const alt = await fetch('https://api.elections.kalshi.com/v2/markets?limit=5', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Prescience/1.0'
        }
      });
      
      console.log('Alt response status:', alt.status);
      if (alt.ok) {
        const altData = await alt.json();
        console.log('Success with alt endpoint! Data:', JSON.stringify(altData, null, 2));
        return altData;
      } else {
        const altError = await alt.text();
        console.log('Alt error response:', altError);
      }
      return null;
    }
    
    const data = await response.json();
    console.log('Success! Data:', JSON.stringify(data, null, 2));
    return data;
    
  } catch (error) {
    console.error('API call failed:', error);
    return null;
  }
}

testKalshiNewAPI().then(() => {
  console.log('Test completed');
}).catch(err => {
  console.error('Test failed:', err);
});