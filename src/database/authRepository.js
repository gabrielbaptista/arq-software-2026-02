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

async function sha256Hex(value) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    value
  );
}

async function getUsersColumnSet(db) {
  const columns = await db.getAllAsync('PRAGMA table_info(users);');
  return new Set(columns.map((column) => column.name));
}

async function ensureUsersTableSchema(db) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT,
      password_salt TEXT,
      recovery_code_hash TEXT,
      recovery_code_salt TEXT
    );
  `);

  const columnNames = await getUsersColumnSet(db);

  if (!columnNames.has('password_hash')) {
    await db.execAsync('ALTER TABLE users ADD COLUMN password_hash TEXT;');
  }

  if (!columnNames.has('password_salt')) {
    await db.execAsync('ALTER TABLE users ADD COLUMN password_salt TEXT;');
  }

  if (!columnNames.has('recovery_code_hash')) {
    await db.execAsync('ALTER TABLE users ADD COLUMN recovery_code_hash TEXT;');
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
  const columnNames = await getUsersColumnSet(db);

  const selectableColumns = ['id'];

  if (columnNames.has('password_hash')) selectableColumns.push('password_hash');
  if (columnNames.has('password_salt')) selectableColumns.push('password_salt');
  if (columnNames.has('password')) selectableColumns.push('password');

  const user = await db.getFirstAsync(
    `SELECT ${selectableColumns.join(', ')} FROM users WHERE email = ?;`,
    [normalizedEmail]
  );

  if (!user) {
    return false;
  }

  if (user.password_hash && user.password_salt) {
    return deriveHash(password, user.password_salt) === user.password_hash;
  }

  if (typeof user.password !== 'string') {
    return false;
  }

  const isLegacyPasswordValid = user.password === password;

  if (!isLegacyPasswordValid) {
    return false;
  }

  const passwordSalt = createSaltHex();
  const passwordHash = deriveHash(password, passwordSalt);

  await db.runAsync(
    'UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?;',
    [passwordHash, passwordSalt, user.id]
  );

  return true;
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
  const columnNames = await getUsersColumnSet(db);

  const selectableColumns = ['id'];

  if (columnNames.has('recovery_code_hash')) selectableColumns.push('recovery_code_hash');
  if (columnNames.has('recovery_code_salt')) selectableColumns.push('recovery_code_salt');

  const user = await db.getFirstAsync(
    `SELECT ${selectableColumns.join(', ')} FROM users WHERE email = ?;`,
    [normalizedEmail]
  );

  if (!user || !user.recovery_code_hash) {
    return false;
  }

  const providedRecoveryHash = user.recovery_code_salt
    ? deriveHash(recoveryCode, user.recovery_code_salt)
    : await sha256Hex(recoveryCode);

  if (providedRecoveryHash !== user.recovery_code_hash) {
    return false;
  }

  const newPasswordSalt = createSaltHex();
  const newPasswordHash = deriveHash(newPassword, newPasswordSalt);
  const newRecoveryCodeSalt = createSaltHex();
  const newRecoveryCodeHash = deriveHash(recoveryCode, newRecoveryCodeSalt);

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
      newRecoveryCodeHash,
      newRecoveryCodeSalt,
      user.id
    ]
  );

  return updateResult.changes > 0;
}
