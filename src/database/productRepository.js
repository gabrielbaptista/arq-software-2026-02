import * as SQLite from 'expo-sqlite';

const dbPromise = SQLite.openDatabaseAsync('auth.db');

async function ensureProductsTableSchema(db) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      expiry_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export async function initializeProductDatabase() {
  const db = await dbPromise;
  await ensureProductsTableSchema(db);
}

export async function createProduct(name, description, expiryDate) {
  const db = await dbPromise;
  const normalizedName = name.trim();
  const normalizedDescription = description.trim();
  const createdAt = new Date().toISOString();

  const result = await db.runAsync(
    `INSERT INTO products (
      name,
      description,
      expiry_date,
      created_at
    ) VALUES (?, ?, ?, ?);`,
    [normalizedName, normalizedDescription || null, expiryDate, createdAt]
  );

  return result.lastInsertRowId;
}

export async function getProducts() {
  const db = await dbPromise;

  const rows = await db.getAllAsync(
    `SELECT id, name, description, expiry_date AS expiryDate
     FROM products
     ORDER BY expiry_date ASC, id DESC;`
  );

  return rows;
}
