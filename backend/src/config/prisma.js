// src/config/prisma.js
// Single PrismaClient instance — reused across the entire app.

import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

const prisma = new PrismaClient({
  log: env.isDev ? ['error', 'warn'] : ['error'],
});

export default prisma;
