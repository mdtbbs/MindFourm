const mysql = require('mysql2/promise');
const config = require('../config');

let pool = null;

function initialize() {
  pool = mysql.createPool(config.mysql);
  console.log(`MySQL pool initialized: ${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`);
  return pool;
}

function getPool() {
  if (!pool) {
    throw new Error('MySQL pool not initialized. Call initialize() first.');
  }
  return pool;
}

// Use pool.query for flexibility with dynamic parameters
async function query(sql, params = []) {
  const pool = getPool();
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Use pool.query for all operations (handles dynamic params better)
async function execute(sql, params = []) {
  const pool = getPool();
  const [result] = await pool.query(sql, params);
  return result;
}

async function transaction(callback) {
  const pool = getPool();
  const connection = await pool.getConnection();
  // Wrap connection methods to use query for flexibility
  const wrappedConn = {
    execute: async (sql, params) => {
      return connection.query(sql, params);
    },
    query: async (sql, params) => {
      return connection.query(sql, params);
    }
  };
  try {
    await connection.beginTransaction();
    const result = await callback(wrappedConn);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('MySQL pool closed');
  }
}

module.exports = {
  initialize,
  getPool,
  query,
  queryOne,
  execute,
  transaction,
  close
};