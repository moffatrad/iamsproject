const fetch = require('node-fetch');

async function testBackup() {
  try {
    const response = await fetch('http://localhost:3000/api/coordinator/create-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataTypes: ['students'], role: 'coordinator' })
    });

    const result = await response.json();
    console.log('Backup creation result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

testBackup();