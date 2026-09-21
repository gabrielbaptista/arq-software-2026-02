import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

const dbPromise = SQLite.openDatabaseAsync('auth.db');

const DERIVATION_OPTIONS = {
  c: 120000,
  dkLen: 32
};

function createSaltHex() {
  return bytesToHex(Crypto.getRandomBytes(16));
}

function deriveHash(secret, saltHex) {
  const derivedBytes = pbkdf2(
    sha256,
    utf8ToBytes(secret),
    hexToBytes(saltHex),
    DERIVATION_OPTIONS
  );

  return bytesToHex(derivedBytes);
}

async function ensureUsersTableSchema(db) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      recovery_code_hash TEXT NOT NULL,
      recovery_code_salt TEXT NOT NULL
    );
  `);

  const columns = await db.getAllAsync('PRAGMA table_info(users);');
  const columnNames = new Set(columns.map((column) => column.name));

  const hasSaltColumns =
    columnNames.has('password_salt') && columnNames.has('recovery_code_salt');

  if (hasSaltColumns) {
    return;
  }

  await db.execAsync(`
    DROP TABLE users;
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      recovery_code_hash TEXT NOT NULL,
      recovery_code_salt TEXT NOT NULL
    );
  `);
}

export async function initializeAuthDatabase() {
  const db = await dbPromise;
  await ensureUsersTableSchema(db);
}

export async function authenticateUser(email, password) {
  const db = await dbPromise;
  const normalizedEmail = email.trim();

  const user = await db.getFirstAsync(
    'SELECT password_hash, password_salt FROM users WHERE email = ?;',
    [normalizedEmail]
  );

  if (!user) {
    return false;
  }

  return deriveHash(password, user.password_salt) === user.password_hash;
}

export async function createUser(email, password, recoveryCode) {
  const db = await dbPromise;
  const normalizedEmail = email.trim();
  const passwordSalt = createSaltHex();
  const recoveryCodeSalt = createSaltHex();
  const passwordHash = deriveHash(password, passwordSalt);
  const recoveryCodeHash = deriveHash(recoveryCode, recoveryCodeSalt);

  try {
    await db.runAsync(
      `INSERT INTO users (
        email,
        password_hash,
        password_salt,
        recovery_code_hash,
        recovery_code_salt
      ) VALUES (?, ?, ?, ?, ?);`,
      [
        normalizedEmail,
        passwordHash,
        passwordSalt,
        recoveryCodeHash,
        recoveryCodeSalt
      ]
    );

    return true;
  } catch {
    return false;
  }
}

export async function resetPasswordByEmail(email, recoveryCode, newPassword) {
  const db = await dbPromise;
  const normalizedEmail = email.trim();

  const user = await db.getFirstAsync(
    `SELECT id, recovery_code_hash, recovery_code_salt
     FROM users
     WHERE email = ?;`,
    [normalizedEmail]
  );

  if (!user) {
    return false;
  }

  const providedRecoveryHash = deriveHash(recoveryCode, user.recovery_code_salt);

  if (providedRecoveryHash !== user.recovery_code_hash) {
    return false;
  }

  const newPasswordSalt = createSaltHex();
  const newPasswordHash = deriveHash(newPassword, newPasswordSalt);

  const updateResult = await db.runAsync(
    'UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?;',
    [newPasswordHash, newPasswordSalt, user.id]
  );

  return updateResult.changes > 0;
}
