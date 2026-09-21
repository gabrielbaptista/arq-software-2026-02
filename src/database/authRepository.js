import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

const dbPromise = SQLite.openDatabaseAsync('auth.db');

async function hashValue(value) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    value
  );
}

export async function initializeAuthDatabase() {
  const db = await dbPromise;

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      recovery_code_hash TEXT NOT NULL
    );
  `);
}

export async function authenticateUser(email, password) {
  const db = await dbPromise;
  const passwordHash = await hashValue(password);

  const user = await db.getFirstAsync(
    'SELECT id FROM users WHERE email = ? AND password_hash = ?;',
    [email.trim(), passwordHash]
  );

  return Boolean(user);
}

export async function createUser(email, password, recoveryCode) {
  const db = await dbPromise;
  const normalizedEmail = email.trim();
  const passwordHash = await hashValue(password);
  const recoveryCodeHash = await hashValue(recoveryCode);

  try {
    await db.runAsync(
      'INSERT INTO users (email, password_hash, recovery_code_hash) VALUES (?, ?, ?);',
      [normalizedEmail, passwordHash, recoveryCodeHash]
    );

    return true;
  } catch {
    return false;
  }
}

export async function resetPasswordByEmail(email, recoveryCode, newPassword) {
  const db = await dbPromise;
  const normalizedEmail = email.trim();
  const recoveryCodeHash = await hashValue(recoveryCode);
  const newPasswordHash = await hashValue(newPassword);

  const result = await db.runAsync(
    'UPDATE users SET password_hash = ? WHERE email = ? AND recovery_code_hash = ?;',
    [newPasswordHash, normalizedEmail, recoveryCodeHash]
  );

  return result.changes > 0;
}
