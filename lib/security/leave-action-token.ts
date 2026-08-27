import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import {
  LeaveType,
} from '@prisma/client';

import type {
  LeavePolicyWithRagResult,
} from '@/lib/ai/leave-policy';

/* =========================================================
   TYPES
========================================================= */

export type LeavePolicySnapshot = {
  policyFound: boolean;

  eligible: boolean;

  needsHumanReview: boolean;

  requiresManagerApproval: boolean;

  policySource: string[];

  sourceFiles: string[];

  balance: {
    year: number;

    entitlementDays:
      number | null;

    approvedDays: number;

    pendingDays: number;

    availableDays:
      number | null;

    requestedDays: number;

    remainingAfterRequest:
      number | null;
  } | null;

  evidenceFingerprint:
    string | null;

  policyFingerprint:
    string;
};

export type LeaveActionPayload = {
  type:
    'LEAVE_CONFIRMATION';

  version:
    2;

  requestCode:
    string;

  employeeId:
    string;

  sessionId:
    string;

  draft: {
    leaveType:
      LeaveType;

    startDate:
      string;

    endDate:
      string;

    totalDays:
      number;

    reason:
      string | null;
  };

  policy:
    LeavePolicySnapshot;

  issuedAt:
    number;

  expiresAt:
    number;
};

export type CreateLeaveActionTokenInput = {
  requestCode:
    string;

  employeeId:
    string;

  sessionId:
    string;

  leaveType:
    LeaveType;

  startDate:
    string;

  endDate:
    string;

  totalDays:
    number;

  reason?:
    string | null;

  policyValidation:
    LeavePolicyWithRagResult;

  expiresInSeconds?:
    number;
};

/* =========================================================
   ERROR
========================================================= */

export class LeaveActionTokenError
  extends Error {
  constructor(
    public code:
      string,

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'LeaveActionTokenError';
  }
}

/* =========================================================
   SECRET
========================================================= */

function getSecret() {
  const secret =
    process.env
      .LEAVE_ACTION_SECRET
      ?.trim();

  if (
    !secret
  ) {
    throw new LeaveActionTokenError(
      'LEAVE_ACTION_SECRET_MISSING',
      'LEAVE_ACTION_SECRET belum dikonfigurasi.',
    );
  }

  if (
    secret.length <
    32
  ) {
    throw new LeaveActionTokenError(
      'LEAVE_ACTION_SECRET_WEAK',
      'LEAVE_ACTION_SECRET minimal 32 karakter.',
    );
  }

  return secret;
}

/* =========================================================
   BASE64 URL
========================================================= */

function encodeBase64Url(
  value:
    string,
) {
  return Buffer
    .from(
      value,
      'utf8',
    )
    .toString(
      'base64url',
    );
}

function decodeBase64Url(
  value:
    string,
) {
  return Buffer
    .from(
      value,
      'base64url',
    )
    .toString(
      'utf8',
    );
}

/* =========================================================
   DATE
========================================================= */

function normalizeDateOnly(
  value:
    string,
) {
  const normalized =
    value
      ?.trim();

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalized,
    )
  ) {
    throw new LeaveActionTokenError(
      'INVALID_LEAVE_DATE',
      'Tanggal leave harus berformat YYYY-MM-DD.',
    );
  }

  const [
    yearString,
    monthString,
    dayString,
  ] =
    normalized.split(
      '-',
    );

  const year =
    Number(
      yearString,
    );

  const month =
    Number(
      monthString,
    );

  const day =
    Number(
      dayString,
    );

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  if (
    date.getUTCFullYear() !==
      year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !==
      day
  ) {
    throw new LeaveActionTokenError(
      'INVALID_LEAVE_DATE',
      'Tanggal leave tidak valid.',
    );
  }

  return normalized;
}

/* =========================================================
   CANONICAL JSON
========================================================= */

function canonicalize(
  value:
    unknown,
): unknown {
  if (
    value === null ||
    typeof value !==
      'object'
  ) {
    return value;
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.map(
      canonicalize,
    );
  }

  const object =
    value as Record<
      string,
      unknown
    >;

  const result:
    Record<
      string,
      unknown
    > = {};

  for (
    const key of
    Object.keys(
      object,
    ).sort()
  ) {
    result[key] =
      canonicalize(
        object[key],
      );
  }

  return result;
}

function canonicalJson(
  value:
    unknown,
) {
  return JSON.stringify(
    canonicalize(
      value,
    ),
  );
}

/* =========================================================
   HASH
========================================================= */

function sha256(
  value:
    unknown,
) {
  return createHash(
    'sha256',
  )
    .update(
      canonicalJson(
        value,
      ),
    )
    .digest(
      'hex',
    );
}

/* =========================================================
   REQUEST CODE
========================================================= */

function jakartaDateCode(
  date =
    new Date(),
) {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Asia/Jakarta',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',
      },
    );

  const parts =
    formatter.formatToParts(
      date,
    );

  const year =
    parts.find(
      (item) =>
        item.type ===
        'year',
    )?.value;

  const month =
    parts.find(
      (item) =>
        item.type ===
        'month',
    )?.value;

  const day =
    parts.find(
      (item) =>
        item.type ===
        'day',
    )?.value;

  if (
    !year ||
    !month ||
    !day
  ) {
    throw new LeaveActionTokenError(
      'REQUEST_CODE_DATE_ERROR',
      'Gagal membuat tanggal request code.',
    );
  }

  return `${year}${month}${day}`;
}

function randomCode(
  length =
    6,
) {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const bytes =
    randomBytes(
      length,
    );

  let result =
    '';

  for (
    let index =
      0;
    index <
    length;
    index++
  ) {
    result +=
      alphabet[
        bytes[index] %
          alphabet.length
      ];
  }

  return result;
}

export function createLeaveRequestCode() {
  return (
    `LV-${jakartaDateCode()}-${randomCode()}`
  );
}

/* =========================================================
   POLICY SNAPSHOT
========================================================= */

function createEvidenceFingerprint(
  policy:
    LeavePolicyWithRagResult,
) {
  if (
    !policy.rag.found ||
    policy.rag.evidence
      .length ===
      0
  ) {
    return null;
  }

  /*
   * Jangan masukkan seluruh content RAG
   * ke token.
   *
   * Kita hash evidence agar token tetap
   * kecil tetapi snapshot evidence tetap
   * bisa dibuktikan.
   */
  return sha256(
    policy.rag.evidence.map(
      (
        evidence,
      ) => ({
        source:
          evidence.source,

        similarity:
          Number(
            evidence.similarity
              .toFixed(
                6,
              ),
          ),

        contentHash:
          sha256(
            evidence.content,
          ),
      }),
    ),
  );
}

export function createLeavePolicySnapshot(
  policy:
    LeavePolicyWithRagResult,
): LeavePolicySnapshot {
  const evidenceFingerprint =
    createEvidenceFingerprint(
      policy,
    );

  const fingerprintInput = {
    policyFound:
      policy.policyFound,

    eligible:
      policy.eligible,

    needsHumanReview:
      policy
        .needsHumanReview,

    requiresManagerApproval:
      policy
        .requiresManagerApproval,

    leaveType:
      policy.leaveType,

    startDate:
      policy.startDate,

    endDate:
      policy.endDate,

    totalDays:
      policy.totalDays,

    noticeDays:
      policy.noticeDays,

    violations:
      policy.violations,

    warnings:
      policy.warnings,

    matchedRules:
      policy.matchedRules,

    policySource:
      policy.policySource,

    sourceFiles:
      policy.sourceFiles,

    balance:
      policy.balance,

    evidenceFingerprint,
  };

  const policyFingerprint =
    sha256(
      fingerprintInput,
    );

  return {
    policyFound:
      policy.policyFound,

    eligible:
      policy.eligible,

    needsHumanReview:
      policy
        .needsHumanReview,

    requiresManagerApproval:
      policy
        .requiresManagerApproval,

    policySource:
      [
        ...policy
          .policySource,
      ],

    sourceFiles:
      [
        ...policy
          .sourceFiles,
      ],

    balance:
      policy.balance
        ? {
            ...policy.balance,
          }
        : null,

    evidenceFingerprint,

    policyFingerprint,
  };
}

/* =========================================================
   SIGNATURE
========================================================= */

function createSignature(
  encodedPayload:
    string,
) {
  return createHmac(
    'sha256',
    getSecret(),
  )
    .update(
      encodedPayload,
    )
    .digest(
      'base64url',
    );
}

/* =========================================================
   CREATE TOKEN
========================================================= */

export function createLeaveActionToken(
  input:
    CreateLeaveActionTokenInput,
) {
  const requestCode =
    input.requestCode
      ?.trim();

  const employeeId =
    input.employeeId
      ?.trim();

  const sessionId =
    input.sessionId
      ?.trim();

  if (
    !requestCode
  ) {
    throw new LeaveActionTokenError(
      'REQUEST_CODE_REQUIRED',
      'Request code wajib tersedia.',
    );
  }

  if (
    !/^LV-\d{8}-[A-Z2-9]{6}$/.test(
      requestCode,
    )
  ) {
    throw new LeaveActionTokenError(
      'INVALID_REQUEST_CODE',
      'Format request code leave tidak valid.',
    );
  }

  if (
    !employeeId
  ) {
    throw new LeaveActionTokenError(
      'EMPLOYEE_REQUIRED',
      'Employee ID wajib tersedia.',
    );
  }

  if (
    !sessionId
  ) {
    throw new LeaveActionTokenError(
      'SESSION_REQUIRED',
      'Session ID wajib tersedia.',
    );
  }

  if (
    !Object.values(
      LeaveType,
    ).includes(
      input.leaveType,
    )
  ) {
    throw new LeaveActionTokenError(
      'INVALID_LEAVE_TYPE',
      'Jenis leave tidak valid.',
    );
  }

  if (
    !Number.isInteger(
      input.totalDays,
    ) ||
    input.totalDays <
      1
  ) {
    throw new LeaveActionTokenError(
      'INVALID_TOTAL_DAYS',
      'Total hari leave tidak valid.',
    );
  }

  /*
   * Token confirmation hanya boleh dibuat
   * jika policy sudah benar-benar lolos.
   */
  if (
    !input
      .policyValidation
      .policyFound
  ) {
    throw new LeaveActionTokenError(
      'POLICY_NOT_FOUND',
      'Policy leave belum ditemukan.',
    );
  }

  if (
    !input
      .policyValidation
      .eligible
  ) {
    throw new LeaveActionTokenError(
      'LEAVE_NOT_ELIGIBLE',
      'Pengajuan leave belum memenuhi policy.',
    );
  }

  if (
    input
      .policyValidation
      .needsHumanReview
  ) {
    throw new LeaveActionTokenError(
      'POLICY_REQUIRES_REVIEW',
      'Policy leave masih membutuhkan human review.',
    );
  }

  if (
    input
      .policyValidation
      .violations
      .length >
    0
  ) {
    throw new LeaveActionTokenError(
      'POLICY_HAS_VIOLATIONS',
      'Pengajuan leave memiliki pelanggaran policy.',
    );
  }

  /*
   * Defensive consistency check.
   */
  if (
    input.totalDays !==
    input
      .policyValidation
      .totalDays
  ) {
    throw new LeaveActionTokenError(
      'POLICY_DRAFT_MISMATCH',
      'Total hari draft tidak sesuai dengan hasil policy.',
    );
  }

  const startDate =
    normalizeDateOnly(
      input.startDate,
    );

  const endDate =
    normalizeDateOnly(
      input.endDate,
    );

  if (
    startDate !==
      input
        .policyValidation
        .startDate ||
    endDate !==
      input
        .policyValidation
        .endDate ||
    input.leaveType !==
      input
        .policyValidation
        .leaveType
  ) {
    throw new LeaveActionTokenError(
      'POLICY_DRAFT_MISMATCH',
      'Draft leave tidak sesuai dengan hasil policy validation.',
    );
  }

  const now =
    Math.floor(
      Date.now() /
        1000,
    );

  const ttl =
    Math.min(
      Math.max(
        input
          .expiresInSeconds ??
          900,
        60,
      ),
      3600,
    );

  const policy =
    createLeavePolicySnapshot(
      input.policyValidation,
    );

  const payload:
    LeaveActionPayload = {
      type:
        'LEAVE_CONFIRMATION',

      version:
        2,

      requestCode,

      employeeId,

      sessionId,

      draft: {
        leaveType:
          input.leaveType,

        startDate,

        endDate,

        totalDays:
          input.totalDays,

        reason:
          input.reason
            ?.trim() ||
          null,
      },

      policy,

      issuedAt:
        now,

      expiresAt:
        now +
        ttl,
    };

  const encodedPayload =
    encodeBase64Url(
      JSON.stringify(
        payload,
      ),
    );

  const signature =
    createSignature(
      encodedPayload,
    );

  return (
    `${encodedPayload}.${signature}`
  );
}

/* =========================================================
   VALIDATE PAYLOAD
========================================================= */

function validatePayload(
  value:
    unknown,
): LeaveActionPayload {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    throw new LeaveActionTokenError(
      'INVALID_TOKEN_PAYLOAD',
      'Payload token leave tidak valid.',
    );
  }

  const payload =
    value as Partial<
      LeaveActionPayload
    >;

  if (
    payload.type !==
      'LEAVE_CONFIRMATION' ||
    payload.version !==
      2
  ) {
    throw new LeaveActionTokenError(
      'INVALID_TOKEN_TYPE',
      'Token bukan token konfirmasi leave yang valid.',
    );
  }

  if (
    !payload.requestCode ||
    !payload.employeeId ||
    !payload.sessionId ||
    !payload.draft ||
    !payload.policy
  ) {
    throw new LeaveActionTokenError(
      'INVALID_TOKEN_PAYLOAD',
      'Payload token leave tidak lengkap.',
    );
  }

  if (
    !/^LV-\d{8}-[A-Z2-9]{6}$/.test(
      payload.requestCode,
    )
  ) {
    throw new LeaveActionTokenError(
      'INVALID_REQUEST_CODE',
      'Request code pada token tidak valid.',
    );
  }

  if (
    !Object.values(
      LeaveType,
    ).includes(
      payload
        .draft
        .leaveType as LeaveType,
    )
  ) {
    throw new LeaveActionTokenError(
      'INVALID_LEAVE_TYPE',
      'Jenis leave pada token tidak valid.',
    );
  }

  normalizeDateOnly(
    payload
      .draft
      .startDate,
  );

  normalizeDateOnly(
    payload
      .draft
      .endDate,
  );

  if (
    !Number.isInteger(
      payload
        .draft
        .totalDays,
    ) ||
    payload
      .draft
      .totalDays <
      1
  ) {
    throw new LeaveActionTokenError(
      'INVALID_TOTAL_DAYS',
      'Total hari pada token tidak valid.',
    );
  }

  if (
    !payload
      .policy
      .policyFingerprint
  ) {
    throw new LeaveActionTokenError(
      'INVALID_POLICY_FINGERPRINT',
      'Policy fingerprint pada token tidak tersedia.',
    );
  }

  if (
    !Number.isInteger(
      payload.issuedAt,
    ) ||
    !Number.isInteger(
      payload.expiresAt,
    )
  ) {
    throw new LeaveActionTokenError(
      'INVALID_TOKEN_TIME',
      'Timestamp token leave tidak valid.',
    );
  }

  return payload as LeaveActionPayload;
}

/* =========================================================
   VERIFY TOKEN
========================================================= */

export function verifyLeaveActionToken(
  token:
    string,
) {
  const normalized =
    token
      ?.trim();

  if (
    !normalized
  ) {
    throw new LeaveActionTokenError(
      'TOKEN_REQUIRED',
      'Token konfirmasi leave wajib tersedia.',
    );
  }

  const parts =
    normalized.split(
      '.',
    );

  if (
    parts.length !==
    2
  ) {
    throw new LeaveActionTokenError(
      'INVALID_TOKEN',
      'Format token konfirmasi leave tidak valid.',
    );
  }

  const [
    encodedPayload,
    suppliedSignature,
  ] =
    parts;

  const expectedSignature =
    createSignature(
      encodedPayload,
    );

  const suppliedBuffer =
    Buffer.from(
      suppliedSignature,
      'utf8',
    );

  const expectedBuffer =
    Buffer.from(
      expectedSignature,
      'utf8',
    );

  if (
    suppliedBuffer.length !==
      expectedBuffer.length ||
    !timingSafeEqual(
      suppliedBuffer,
      expectedBuffer,
    )
  ) {
    throw new LeaveActionTokenError(
      'INVALID_TOKEN_SIGNATURE',
      'Signature token konfirmasi leave tidak valid.',
    );
  }

  let decoded:
    unknown;

  try {
    decoded =
      JSON.parse(
        decodeBase64Url(
          encodedPayload,
        ),
      );
  } catch {
    throw new LeaveActionTokenError(
      'INVALID_TOKEN_PAYLOAD',
      'Payload token konfirmasi leave tidak dapat dibaca.',
    );
  }

  const payload =
    validatePayload(
      decoded,
    );

  const now =
    Math.floor(
      Date.now() /
        1000,
    );

  if (
    payload.expiresAt <
    now
  ) {
    throw new LeaveActionTokenError(
      'TOKEN_EXPIRED',
      'Token konfirmasi leave sudah kedaluwarsa.',
    );
  }

  return payload;
}