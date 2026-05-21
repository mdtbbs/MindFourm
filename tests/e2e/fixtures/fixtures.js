// @ts-check
const { test: base } = require('@playwright/test');
const { createTestIdentity, deleteTestIdentity } = require('../helpers/auth');
const { resetTestData, createTestUser, deleteTestUser, getTestDb } = require('./test-db');
const { API_BASE } = require('../helpers/api');

/**
 * Extended test fixture with auth helpers
 */
const test = base.extend({
  /** Regular user identity */
  user: async ({}, use) => {
    const identity = createTestIdentity({ role: 'user' });
    await use(identity);
    deleteTestIdentity(identity.userId);
  },

  /** Admin identity */
  admin: async ({}, use) => {
    const identity = createTestIdentity({ role: 'admin', username: `admin_e2e_${Date.now()}` });
    await use(identity);
    deleteTestIdentity(identity.userId);
  },

  /** Moderator identity */
  moderator: async ({}, use) => {
    const identity = createTestIdentity({ role: 'moderator', username: `mod_e2e_${Date.now()}` });
    await use(identity);
    deleteTestIdentity(identity.userId);
  },

  /** API request helper with auth */
  apiRequest: async ({}, use) => {
    await use(async (method, path, options = {}) => {
      const http = require('http');
      const url = new URL(path, API_BASE);

      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
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
        if (options.body) {
          req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
        }
        req.end();
      });
    });
  },
});

module.exports = { test };
