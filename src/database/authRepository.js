import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { LOCAL_DATABASE_NAME } from './databaseConfig';

const dbPromise = SQLite.openDatabaseAsync(LOCAL_DATABASE_NAME);

const DERIVATION_OPTIONS = {
  c: 120000,
  dkLen: 32
};

async function hashLegacyValue(value) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    value
  );
}

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
      password_salt TEXT,
      recovery_code_hash TEXT NOT NULL,
      recovery_code_salt TEXT
    );
  `);

  const columns = await db.getAllAsync('PRAGMA table_info(users);');
  const columnNames = new Set(columns.map((column) => column.name));

  const hasSaltColumns =
    columnNames.has('password_salt') && columnNames.has('recovery_code_salt');

  if (hasSaltColumns) {
    return;
  }

  if (!columnNames.has('password_salt')) {
    await db.execAsync('ALTER TABLE users ADD COLUMN password_salt TEXT;');
  }

  if (!columnNames.has('recovery_code_salt')) {
    await db.execAsync('ALTER TABLE users ADD COLUMN recovery_code_salt TEXT;');
  }
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

  if (!user.password_salt) {
    const legacyPasswordHash = await hashLegacyValue(password);

    if (legacyPasswordHash !== user.password_hash) {
      return false;
    }

    const passwordSalt = createSaltHex();
    const migratedPasswordHash = deriveHash(password, passwordSalt);

    await db.runAsync(
      'UPDATE users SET password_hash = ?, password_salt = ? WHERE email = ?;',
      [migratedPasswordHash, passwordSalt, normalizedEmail]
    );

    return true;
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

  const providedRecoveryHash = user.recovery_code_salt
    ? deriveHash(recoveryCode, user.recovery_code_salt)
    : await hashLegacyValue(recoveryCode);

  if (providedRecoveryHash !== user.recovery_code_hash) {
    return false;
  }

  const newPasswordSalt = createSaltHex();
  const newRecoveryCodeSalt = user.recovery_code_salt || createSaltHex();
  const newPasswordHash = deriveHash(newPassword, newPasswordSalt);
  const migratedRecoveryCodeHash = user.recovery_code_salt
    ? user.recovery_code_hash
    : deriveHash(recoveryCode, newRecoveryCodeSalt);

  const updateResult = await db.runAsync(
    `UPDATE users
     SET password_hash = ?,
         password_salt = ?,
         recovery_code_hash = ?,
         recovery_code_salt = ?
     WHERE id = ?;`,
    [
      newPasswordHash,
      newPasswordSalt,
      migratedRecoveryCodeHash,
      newRecoveryCodeSalt,
      user.id
    ]
  );

  return updateResult.changes > 0;
}
