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

async function migrateLegacyPasswords(db, columnNames) {
  if (!columnNames.has('password')) {
    return;
  }

  const legacyUsers = await db.getAllAsync(
    `SELECT id, password
     FROM users
     WHERE password IS NOT NULL
       AND TRIM(password) <> ''
       AND (password_hash IS NULL OR password_salt IS NULL);`
  );

  for (const legacyUser of legacyUsers) {
    const passwordSalt = createSaltHex();
    const passwordHash = deriveHash(legacyUser.password, passwordSalt);

    await db.runAsync(
      'UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?;',
      [passwordHash, passwordSalt, legacyUser.id]
    );
  }
}

export async function initializeAuthDatabase() {
  const db = await dbPromise;
  await ensureUsersTableSchema(db);
  const columnNames = await getUsersColumnSet(db);
  await migrateLegacyPasswords(db, columnNames);
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

  let isLegacyPasswordValid = false;

  if (user.password_hash && !user.password_salt) {
    const legacyPasswordHash = await hashLegacyValue(password);
    isLegacyPasswordValid = legacyPasswordHash === user.password_hash;
  } else if (typeof user.password === 'string') {
    isLegacyPasswordValid = user.password === password;
  }

  if (!isLegacyPasswordValid) {
    return false;
  }

  const passwordSalt = createSaltHex();
  const passwordHash = deriveHash(password, passwordSalt);
  const legacyPasswordSetClause = columnNames.has('password') ? ', password = NULL' : '';

  await db.runAsync(
    `UPDATE users
     SET password_hash = ?,
         password_salt = ?${legacyPasswordSetClause}
     WHERE id = ?;`,
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
  } catch (error) {
    if (error?.message?.includes('UNIQUE constraint failed: users.email')) {
      return false;
    }

    throw error;
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
  const legacyPasswordSetClause = columnNames.has('password') ? ', password = NULL' : '';

  const updateResult = await db.runAsync(
    `UPDATE users
     SET password_hash = ?,
         password_salt = ?,
         recovery_code_hash = ?,
         recovery_code_salt = ?${legacyPasswordSetClause}
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
