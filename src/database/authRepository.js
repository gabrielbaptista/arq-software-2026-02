import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

const dbPromise = SQLite.openDatabaseAsync('auth.db');

const DEV_USER = {
  email: 'usuario@exemplo.com',
  password: 'SenhaForte#2026',
  recoveryCode: 'REC-2026'
};

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

  if (!__DEV__) {
    return;
  }

  const existingUser = await db.getFirstAsync(
    'SELECT id FROM users WHERE email = ?;',
    [DEV_USER.email]
  );

  if (!existingUser) {
    const passwordHash = await hashValue(DEV_USER.password);
    const recoveryCodeHash = await hashValue(DEV_USER.recoveryCode);

    await db.runAsync(
      'INSERT INTO users (email, password_hash, recovery_code_hash) VALUES (?, ?, ?);',
      [DEV_USER.email, passwordHash, recoveryCodeHash]
    );
  }
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

export async function updatePasswordByEmail(email, recoveryCode, newPassword) {
  const db = await dbPromise;
  const recoveryCodeHash = await hashValue(recoveryCode);
  const newPasswordHash = await hashValue(newPassword);

  const result = await db.runAsync(
    'UPDATE users SET password_hash = ? WHERE email = ? AND recovery_code_hash = ?;',
    [newPasswordHash, email.trim(), recoveryCodeHash]
  );

  return result.changes > 0;
}

export function getDevelopmentCredentialsHint() {
  if (!__DEV__) {
    return '';
  }

  return `Ambiente dev: ${DEV_USER.email} / ${DEV_USER.password} | Código: ${DEV_USER.recoveryCode}`;
}
