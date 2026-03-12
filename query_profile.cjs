const jwt = require('jsonwebtoken');
const http = require('http');

const JWT_SECRET = 'rapiderp-v2-enterprise-secret-key-2024-production';
const token = jwt.sign({ userId: '2d23a3b0-8c6c-4ea5-8595-21972ed352b5', companyId: '58030f4f-d9fa-4265-919a-2da2bcf70bce', isSuperAdmin: false }, JWT_SECRET, { expiresIn: '24h', algorithm: 'HS256' });

console.log("GENERATED TOKEN:", token);

http.get('http://localhost:3001/api/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
}, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => console.log('PROFILE RESPONSE:', b));
});
