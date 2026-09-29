#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const Redis = require('ioredis');
const dotenv = require('dotenv');

const root = path.resolve(__dirname, '..');
const frontendEnvPath = path.join(root, 'frontend/.env.production');
const frontendEnv = fs.existsSync(frontendEnvPath)
  ? dotenv.parse(fs.readFileSync(frontendEnvPath))
  : {};
const value = (key) => process.env[key] || frontendEnv[key] || '';
const failures = [];
const checks = [];

function check(name, passed, detail = '') {
  checks.push({ name, passed: Boolean(passed) });
  if (!passed) failures.push(name);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

function absoluteDirectory(value) {
  if (!value || !path.isAbsolute(value)) return null;
  return path.resolve(value);
}

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Set NODE_ENV=production and load the intended environment before running this read-only check.');
  }
  const profile = value('SITE_PROFILE');
  const publicProfile = value('NEXT_PUBLIC_SITE_PROFILE');
  const siteUrl = value('NEXT_PUBLIC_SITE_URL');
  check('SITE_PROFILE and NEXT_PUBLIC_SITE_PROFILE match', profile === 'mindustry-club' && profile === publicProfile);

  let parsedSiteUrl;
  try { parsedSiteUrl = new URL(siteUrl); } catch { parsedSiteUrl = null; }
  const clubHost = parsedSiteUrl?.hostname.toLowerCase();
  check('NEXT_PUBLIC_SITE_URL is configured for Mindustry Club', Boolean(parsedSiteUrl && parsedSiteUrl.protocol === 'https:' && (clubHost === 'mindustry.club' || clubHost?.endsWith('.mindustry.club'))));

  const databaseName = process.env.MYSQL_DATABASE || '';
  const legacyDatabaseName = process.env.MDTBBS_MYSQL_DATABASE || '';
  check('Mindustry Club uses a separate MySQL database', Boolean(databaseName && legacyDatabaseName && databaseName !== legacyDatabaseName));
  check('MySQL read-only connection settings are configured', Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_PASSWORD));

  const clubRedis = {
    host: process.env.REDIS_HOST || '',
    port: process.env.REDIS_PORT || '6379',
    db: process.env.REDIS_DB || '0',
  };
  const legacyRedis = {
    host: process.env.MDTBBS_REDIS_HOST || '',
    port: process.env.MDTBBS_REDIS_PORT || '6379',
    db: process.env.MDTBBS_REDIS_DB || '',
  };
  const redisSeparated = Boolean(legacyRedis.host && legacyRedis.db !== '' && (
    clubRedis.host !== legacyRedis.host || clubRedis.port !== legacyRedis.port || clubRedis.db !== legacyRedis.db
  ));
  check('Mindustry Club uses a separate Redis instance/database', redisSeparated);

  const uploadRoot = absoluteDirectory(process.env.RESOURCE_UPLOAD_ROOT || '');
  const legacyUploadRoot = absoluteDirectory(process.env.MDTBBS_RESOURCE_UPLOAD_ROOT || '');
  check('Mindustry Club uses a separate absolute upload root', Boolean(uploadRoot && legacyUploadRoot && uploadRoot !== legacyUploadRoot));

  const oauthClientId = process.env.MINDAUTH_CLIENT_ID || '';
  const oauthEcosystem = process.env.MINDAUTH_CLIENT_ECOSYSTEM || '';
  check('Mindustry Club OAuth client is configured for the Club ecosystem', Boolean(oauthClientId && oauthEcosystem === 'mindustry-club' && oauthClientId !== 'forum'));
  check('MindAuth client secret is configured server-side', Boolean(process.env.MINDAUTH_CLIENT_SECRET));

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: databaseName,
    connectTimeout: 5000,
  });
  try {
    const [rows] = await connection.execute(
      'SELECT name FROM migrations WHERE name IN (?, ?)',
      ['AddInternationalCommunityFields1720000120000', 'AddResourceOriginIdentity1720000130000'],
    );
    const applied = new Set(rows.map((row) => row.name));
    check('MindFourm migration 1720000120000 is applied', applied.has('AddInternationalCommunityFields1720000120000'));
    check('MindFourm migration 1720000130000 is applied', applied.has('AddResourceOriginIdentity1720000130000'));
  } finally {
    await connection.end();
  }

  if (redisSeparated) {
    const redis = new Redis({
      host: clubRedis.host,
      port: Number(clubRedis.port),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(clubRedis.db),
      connectTimeout: 5000,
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    redis.on('error', () => {});
    try {
      await redis.connect();
      check('Configured Club Redis is reachable', (await redis.ping()) === 'PONG');
    } finally {
      redis.disconnect();
    }
  }

  console.log(`${failures.length ? 'NOT READY' : 'READY'}: ${checks.length - failures.length}/${checks.length} checks passed.`);
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`NOT READY: read-only readiness check failed (${error.code || error.name || 'connection error'}).`);
  process.exitCode = 1;
});
