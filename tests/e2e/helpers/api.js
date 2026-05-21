/**
 * API helper for E2E tests
 */
const http = require('http');

const API_BASE = 'http://localhost:4000';

/**
 * Make an HTTP request to the API
 */
function apiRequest(method, path, options = {}) {
  const { headers = {}, body = null } = options;

  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
          });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

module.exports = { apiRequest, API_BASE };
