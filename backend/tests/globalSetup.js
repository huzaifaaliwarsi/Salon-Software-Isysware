// tests/globalSetup.js — recreate and seed the test database once per test run.
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

export default function setup() {
  const env = { ...process.env, ...dotenv.config({ path: '.env.test', override: true }).parsed };
  env.DATABASE_URL = process.env.SALONOS_TEST_DATABASE_URL || env.DATABASE_URL;
  if (!env.DATABASE_URL?.includes('_test')) {
    throw new Error('Refusing to reset a non-test database. DATABASE_URL in .env.test must point to *_test.');
  }
  // The installed client is generated separately; a running Windows dev server locks its DLL.
  execSync('npx prisma migrate reset --force --skip-generate', { env, stdio: 'pipe' });
}
