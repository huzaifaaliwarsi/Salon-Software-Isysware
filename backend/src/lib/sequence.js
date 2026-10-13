// src/lib/sequence.js
// Human-readable, branch-scoped sequential numbers: PREFIX-BRANCHCODE-YEAR-NNNN (e.g. INV-LHE-01-2026-0001).
// A single atomic upsert (INSERT … ON CONFLICT DO UPDATE … RETURNING) makes this safe under concurrency,
// including the very first number of a new year.

/**
 * MUST be called inside a Prisma interactive transaction so a rollback also rolls back the number.
 * @param {object} tx          Prisma transaction client
 * @param {string} branchCode  e.g. 'LHE-01'
 * @param {string} prefix      e.g. 'INV', 'APT', 'EXP'
 * @param {number} [year]      defaults to the current year
 * @param {number} [pad]       digits in the running number (default 4)
 * @returns {Promise<string>}
 */
export const nextSequence = async (tx, branchCode, prefix, year, pad = 4) => {
  const y = year ?? new Date().getFullYear();
  if (prefix === 'INV') {
    const scope = 'GLOBAL';
    const rows = await tx.$queryRaw`
      INSERT INTO "Sequence" (id, "branchCode", prefix, year, "lastValue")
      VALUES (gen_random_uuid()::text, ${scope}, ${prefix}, 0, 1)
      ON CONFLICT ("branchCode", prefix, year)
      DO UPDATE SET "lastValue" = "Sequence"."lastValue" + 1
      RETURNING "lastValue"
    `;
    return `${prefix}-${String(rows[0].lastValue).padStart(pad, '0')}`;
  }

  const rows = await tx.$queryRaw`
    INSERT INTO "Sequence" (id, "branchCode", prefix, year, "lastValue")
    VALUES (gen_random_uuid()::text, ${branchCode}, ${prefix}, ${y}, 1)
    ON CONFLICT ("branchCode", prefix, year)
    DO UPDATE SET "lastValue" = "Sequence"."lastValue" + 1
    RETURNING "lastValue"
  `;
  return `${prefix}-${branchCode}-${y}-${String(rows[0].lastValue).padStart(pad, '0')}`;
};

/**
 * Period sequences such as PAY-LHE-01-2026-08-0001 (period = 'YYYY-MM')
 */
export const nextPeriodSequence = async (tx, branchCode, prefix, period, pad = 4) => {
  const scope = `${branchCode}:${period}`;
  const rows = await tx.$queryRaw`
    INSERT INTO "Sequence" (id, "branchCode", prefix, year, "lastValue")
    VALUES (gen_random_uuid()::text, ${scope}, ${prefix}, 0, 1)
    ON CONFLICT ("branchCode", prefix, year)
    DO UPDATE SET "lastValue" = "Sequence"."lastValue" + 1
    RETURNING "lastValue"
  `;
  return `${prefix}-${branchCode}-${period}-${String(rows[0].lastValue).padStart(pad, '0')}`;
};
