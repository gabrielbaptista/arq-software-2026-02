import * as SQLite from 'expo-sqlite';

const dbPromise = SQLite.openDatabaseAsync('auth.db');

const DEMO_USER = {
  email: 'usuario@exemplo.com',
  password: '123456'
};

export async function initializeAuthDatabase() {
  const db = await dbPromise;

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `);

  const existingUser = await db.getFirstAsync(
    'SELECT id FROM users WHERE email = ?;',
    [DEMO_USER.email]
  );

  if (!existingUser) {
    await db.runAsync('INSERT INTO users (email, password) VALUES (?, ?);', [
      DEMO_USER.email,
      DEMO_USER.password
    ]);
  }
}

export async function authenticateUser(email, password) {
  const db = await dbPromise;
  const user = await db.getFirstAsync(
    'SELECT id FROM users WHERE email = ? AND password = ?;',
    [email.trim(), password]
  );

  return Boolean(user);
}

export async function updatePasswordByEmail(email, newPassword) {
  const db = await dbPromise;
  const result = await db.runAsync(
    'UPDATE users SET password = ? WHERE email = ?;',
    [newPassword, email.trim()]
  );

  return result.changes > 0;
}
