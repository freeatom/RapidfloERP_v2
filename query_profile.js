const http = require('http');

const data = JSON.stringify({ email: 'admin@rapiderp.com', password: 'Password123!' });

const req = http.request({
  hostname: 'localhost',
  port: 3001,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const json = JSON.parse(body);
    const token = json.token;
    
    http.get('http://localhost:3001/api/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, res2 => {
      let b = '';
      res2.on('data', c => b += c);
      res2.on('end', () => console.log('PROFILE RESPONSE:', b));
    });
  });
});
req.write(data);
req.end();
