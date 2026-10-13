// src/config/env.js
// Centralised environment variable access — fail fast if critical vars are missing.

const required = (key) => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

export const env = {
  port:              parseInt(process.env.PORT || '5000', 10),
  nodeEnv:           process.env.NODE_ENV || 'development',
  isDev:             process.env.NODE_ENV !== 'production',

  databaseUrl:       required('DATABASE_URL'),

  jwtAccessSecret:   required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret:  required('JWT_REFRESH_SECRET'),
  jwtAccessExpires:  process.env.JWT_ACCESS_EXPIRES  || '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',

  corsOrigin:        process.env.CORS_ORIGIN || 'http://localhost:3000',
  tz:                process.env.TZ           || 'Asia/Karachi',
};
