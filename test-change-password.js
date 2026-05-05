const fetch = require('node-fetch');

async function testChangePassword() {
  try {
    const response = await fetch('http://localhost:3000/api/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: 'student@uni.ac.bw',
        newPassword: 'newpassword123'
      })
    });

    const result = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

testChangePassword();