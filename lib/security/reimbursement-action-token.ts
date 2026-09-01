import {
  ReimbursementType,
} from '@prisma/client';

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import type {
  ReimbursementPolicyWithRagResult,
  TravelScope,
} from '@/lib/ai/reimbursement-policy';

/* =========================================================
   CONSTANTS
========================================================= */

const TOKEN_TYPE =
  'REIMBURSEMENT_CONFIRMATION' as const;

const TOKEN_VERSION =
  1 as const;

const DEFAULT_TTL_SECONDS =
  10 * 60;

const MAX_TTL_SECONDS =
  30 * 60;

const REQUEST_CODE_PATTERN =
  /^RB-\d{8}-[A-F0-9]{6}$/;

/* =========================================================
   TYPES
========================================================= */

export type ReimbursementConfirmationDraft = {
  reimbursementType:
    ReimbursementType;

  expenseDate:
    string;

  amount:
    string;

  currency:
    string;

  merchant:
    | string
    | null;

  reason:
    string;

  receiptUrl:
    | string
    | null;

  receiptFileName:
    | string
    | null;

  lostReceiptDeclaration?:
    boolean;

  lateClaimReason?:
    | string
    | null;

  isPersonalExpense?:
    boolean;

  paidByOtherParty?:
    boolean;

  categoryRequiresPreApproval?:
    boolean;

  preApproved?:
    boolean;

  isRoutineMealAtNormalWorkLocation?:
    boolean;

  relatedToBusinessTravel?:
    boolean;

  relatedToQualifyingOvertime?:
    boolean;

  authorizedEvent?:
    boolean;

  travelScope?:
    TravelScope;

  travelEmergency?:
    boolean;

  perDiemDuplicate?:
    boolean;

  includesPersonalExpense?:
    boolean;

  personalExpenseSeparated?:
    boolean;

  costCenter?:
    | string
    | null;
};

export type ReimbursementPolicyTokenSnapshot = {
  policyFingerprint:
    string;

  evidenceFingerprint:
    string;

  policyFound:
    boolean;

  eligible:
    boolean;

  needsHumanReview:
    boolean;

  autoSubmittable:
    boolean;

  requiresReceipt:
    boolean;

  requiresLostReceiptDeclaration:
    boolean;

  requiresManagerApproval:
    boolean;

  requiresBudgetOwnerReview:
    boolean;

  requiresDepartmentHeadApproval:
    boolean;

  requiresFinanceAudit:
    boolean;

  requiresBenefitVerification:
    boolean;

  policySource:
    string[];

  sourceFiles:
    string[];
};

export type ReimbursementActionTokenPayload = {
  type:
    typeof TOKEN_TYPE;

  version:
    typeof TOKEN_VERSION;

  requestCode:
    string;

  employeeId:
    string;

  sessionId:
    string;

  draft:
    ReimbursementConfirmationDraft;

  policy:
    ReimbursementPolicyTokenSnapshot;

  issuedAt:
    string;

  expiresAt:
    string;
};

export type CreateReimbursementActionTokenInput = {
  employeeId:
    string;

  sessionId:
    string;

  draft:
    ReimbursementConfirmationDraft;

  policy:
    ReimbursementPolicyWithRagResult;

  requestCode?:
    string;

  ttlSeconds?:
    number;
};

/* =========================================================
   ERROR
========================================================= */

export class ReimbursementActionTokenError
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
      'ReimbursementActionTokenError';
  }
}

/* =========================================================
   SECRET
========================================================= */

function getActionSecret() {
  const secret =
    process.env
      .REIMBURSEMENT_ACTION_SECRET
      ?.trim();

  if (!secret) {
    throw new ReimbursementActionTokenError(
      'REIMBURSEMENT_ACTION_SECRET_NOT_CONFIGURED',
      'Secret untuk token konfirmasi reimbursement belum dikonfigurasi.',
    );
  }

  if (
    secret.length <
    32
  ) {
    throw new ReimbursementActionTokenError(
      'REIMBURSEMENT_ACTION_SECRET_TOO_SHORT',
      'Secret untuk token konfirmasi reimbursement harus minimal 32 karakter.',
    );
  }

  return secret;
}

/* =========================================================
   NORMALIZATION
========================================================= */

function normalizeNullableText(
  value:
    | string
    | null
    | undefined,
) {
  const normalized =
    value?.trim();

  return normalized ||
    null;
}

function normalizeRequiredText(
  value:
    | string
    | null
    | undefined,

  fieldName:
    string,
) {
  const normalized =
    value?.trim();

  if (!normalized) {
    throw new ReimbursementActionTokenError(
      'INVALID_DRAFT',
      `${fieldName} wajib tersedia sebelum token konfirmasi dibuat.`,
    );
  }

  return normalized;
}

function normalizeCurrency(
  value:
    string,
) {
  const currency =
    normalizeRequiredText(
      value,
      'Currency',
    )
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency,
    )
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_DRAFT',
      'Currency pada draft reimbursement tidak valid.',
    );
  }

  return currency;
}

function normalizeAmount(
  value:
    string,
) {
  const normalized =
    normalizeRequiredText(
      value,
      'Nominal reimbursement',
    );

  /*
   * Token tidak melakukan arithmetic finansial.
   * Policy/service tetap authority untuk Decimal.
   *
   * Di sini kita hanya memastikan nilai yang
   * ditandatangani adalah decimal positif yang
   * dapat direpresentasikan dengan stabil.
   */
  if (
    !/^\d+(?:\.\d{1,2})?$/.test(
      normalized,
    )
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_DRAFT',
      'Nominal reimbursement pada draft tidak valid.',
    );
  }

  const numeric =
    Number(
      normalized,
    );

  if (
    !Number.isFinite(
      numeric,
    ) ||
    numeric <=
    0
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_DRAFT',
      'Nominal reimbursement pada draft harus lebih besar dari 0.',
    );
  }

  /*
   * Hindari bentuk "350000.00" vs "350000"
   * menghasilkan draft berbeda secara semantik.
   */
  return normalized
    .replace(
      /\.00$/,
      '',
    )
    .replace(
      /(\.\d)0$/,
      '$1',
    );
}

function normalizeDraft(
  draft:
    ReimbursementConfirmationDraft,
): ReimbursementConfirmationDraft {
  if (
    !Object.values(
      ReimbursementType,
    ).includes(
      draft.reimbursementType,
    )
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_DRAFT',
      'Jenis reimbursement pada draft tidak valid.',
    );
  }

  const expenseDate =
    normalizeRequiredText(
      draft.expenseDate,
      'Tanggal transaksi',
    );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      expenseDate,
    )
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_DRAFT',
      'Tanggal transaksi pada draft harus menggunakan format YYYY-MM-DD.',
    );
  }

  return {
    reimbursementType:
      draft.reimbursementType,

    expenseDate,

    amount:
      normalizeAmount(
        draft.amount,
      ),

    currency:
      normalizeCurrency(
        draft.currency,
      ),

    merchant:
      normalizeNullableText(
        draft.merchant,
      ),

    reason:
      normalizeRequiredText(
        draft.reason,
        'Alasan reimbursement',
      ),

    receiptUrl:
      normalizeNullableText(
        draft.receiptUrl,
      ),

    receiptFileName:
      normalizeNullableText(
        draft.receiptFileName,
      ),

    lostReceiptDeclaration:
      draft
        .lostReceiptDeclaration,

    lateClaimReason:
      normalizeNullableText(
        draft
          .lateClaimReason,
      ),

    isPersonalExpense:
      draft
        .isPersonalExpense,

    paidByOtherParty:
      draft
        .paidByOtherParty,

    categoryRequiresPreApproval:
      draft
        .categoryRequiresPreApproval,

    preApproved:
      draft
        .preApproved,

    isRoutineMealAtNormalWorkLocation:
      draft
        .isRoutineMealAtNormalWorkLocation,

    relatedToBusinessTravel:
      draft
        .relatedToBusinessTravel,

    relatedToQualifyingOvertime:
      draft
        .relatedToQualifyingOvertime,

    authorizedEvent:
      draft
        .authorizedEvent,

    travelScope:
      draft
        .travelScope,

    travelEmergency:
      draft
        .travelEmergency,

    perDiemDuplicate:
      draft
        .perDiemDuplicate,

    includesPersonalExpense:
      draft
        .includesPersonalExpense,

    personalExpenseSeparated:
      draft
        .personalExpenseSeparated,

    costCenter:
      normalizeNullableText(
        draft.costCenter,
      ),
  };
}

/* =========================================================
   STABLE SERIALIZATION
========================================================= */

function stableNormalize(
  value:
    unknown,
): unknown {
  if (
    value ===
    undefined
  ) {
    return null;
  }

  if (
    value ===
      null ||
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
      stableNormalize,
    );
  }

  const input =
    value as
      Record<
        string,
        unknown
      >;

  const output:
    Record<
      string,
      unknown
    > = {};

  for (
    const key of
    Object.keys(
      input,
    ).sort()
  ) {
    output[key] =
      stableNormalize(
        input[key],
      );
  }

  return output;
}

function stableStringify(
  value:
    unknown,
) {
  return JSON.stringify(
    stableNormalize(
      value,
    ),
  );
}

function sha256(
  value:
    unknown,
) {
  return createHash(
    'sha256',
  )
    .update(
      stableStringify(
        value,
      ),
      'utf8',
    )
    .digest(
      'hex',
    );
}

/* =========================================================
   POLICY FINGERPRINTS
========================================================= */

export function createReimbursementPolicyFingerprint(
  policy:
    ReimbursementPolicyWithRagResult,
) {
  /*
   * Full RAG chunks sengaja tidak dimasukkan.
   *
   * Fingerprint ini mewakili deterministic /
   * routing snapshot yang menjadi dasar
   * pemberian tombol konfirmasi.
   */
  return sha256({
    policyFound:
      policy
        .policyFound,

    eligible:
      policy
        .eligible,

    needsHumanReview:
      policy
        .needsHumanReview,

    autoSubmittable:
      policy
        .autoSubmittable,

    reimbursementType:
      policy
        .reimbursementType,

    expenseDate:
      policy
        .expenseDate,

    claimAgeDays:
      policy
        .claimAgeDays,

    amount:
      policy
        .amount,

    currency:
      policy
        .currency,

    receiptPresent:
      policy
        .receiptPresent,

    requiresReceipt:
      policy
        .requiresReceipt,

    requiresLostReceiptDeclaration:
      policy
        .requiresLostReceiptDeclaration,

    requiresManagerApproval:
      policy
        .requiresManagerApproval,

    requiresBudgetOwnerReview:
      policy
        .requiresBudgetOwnerReview,

    requiresDepartmentHeadApproval:
      policy
        .requiresDepartmentHeadApproval,

    requiresFinanceAudit:
      policy
        .requiresFinanceAudit,

    requiresBenefitVerification:
      policy
        .requiresBenefitVerification,

    violations:
      policy
        .violations,

    warnings:
      policy
        .warnings,

    matchedRules:
      policy
        .matchedRules,

    policySource:
      policy
        .policySource,
  });
}

export function createReimbursementEvidenceFingerprint(
  policy:
    ReimbursementPolicyWithRagResult,
) {
  /*
   * Evidence content tidak masuk ke token.
   *
   * Hanya hash dari tiap chunk yang digunakan,
   * sehingga kita tetap dapat mengaudit snapshot
   * evidence tanpa membuat token sangat besar.
   */
  return sha256({
    found:
      policy
        .rag
        .found,

    threshold:
      policy
        .rag
        .threshold,

    policySource:
      policy
        .policySource,

    sourceFiles:
      policy
        .sourceFiles,

    evidence:
      policy
        .rag
        .evidence
        .map(
          (
            item,
          ) => ({
            source:
              item.source,

            similarity:
              Number(
                item.similarity,
              ).toFixed(
                6,
              ),

            contentHash:
              createHash(
                'sha256',
              )
                .update(
                  item.content,
                  'utf8',
                )
                .digest(
                  'hex',
                ),
          }),
        ),
  });
}

/* =========================================================
   REQUEST CODE
========================================================= */

function createJakartaRequestDate() {
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

  return formatter
    .format(
      new Date(),
    )
    .replaceAll(
      '-',
      '',
    );
}

export function createReimbursementConfirmationRequestCode() {
  const suffix =
    randomBytes(
      4,
    )
      .toString(
        'hex',
      )
      .slice(
        0,
        6,
      )
      .toUpperCase();

  return `RB-${createJakartaRequestDate()}-${suffix}`;
}

/* =========================================================
   BASE64URL
========================================================= */

function encodeBase64Url(
  value:
    string |
    Buffer,
) {
  return Buffer
    .from(
      value,
    )
    .toString(
      'base64url',
    );
}

function decodeBase64Url(
  value:
    string,
) {
  try {
    return Buffer
      .from(
        value,
        'base64url',
      )
      .toString(
        'utf8',
      );
  } catch {
    throw new ReimbursementActionTokenError(
      'INVALID_TOKEN',
      'Token konfirmasi reimbursement tidak valid.',
    );
  }
}

/* =========================================================
   SIGNATURE
========================================================= */

function signPayload(
  payloadPart:
    string,
) {
  return createHmac(
    'sha256',
    getActionSecret(),
  )
    .update(
      payloadPart,
      'utf8',
    )
    .digest(
      'base64url',
    );
}

function assertValidSignature(
  payloadPart:
    string,

  providedSignature:
    string,
) {
  const expectedSignature =
    signPayload(
      payloadPart,
    );

  const expected =
    Buffer.from(
      expectedSignature,
      'utf8',
    );

  const provided =
    Buffer.from(
      providedSignature,
      'utf8',
    );

  if (
    expected.length !==
    provided.length
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_SIGNATURE',
      'Signature token konfirmasi reimbursement tidak valid.',
    );
  }

  if (
    !timingSafeEqual(
      expected,
      provided,
    )
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_SIGNATURE',
      'Signature token konfirmasi reimbursement tidak valid.',
    );
  }
}

/* =========================================================
   PAYLOAD VALIDATION
========================================================= */

function assertPayloadShape(
  value:
    unknown,
): asserts value is ReimbursementActionTokenPayload {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(
      value,
    )
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_TOKEN_PAYLOAD',
      'Payload token konfirmasi reimbursement tidak valid.',
    );
  }

  const payload =
    value as
      Partial<
        ReimbursementActionTokenPayload
      >;

  if (
    payload.type !==
      TOKEN_TYPE ||
    payload.version !==
      TOKEN_VERSION
  ) {
    throw new ReimbursementActionTokenError(
      'UNSUPPORTED_TOKEN',
      'Jenis atau versi token konfirmasi reimbursement tidak didukung.',
    );
  }

  if (
    typeof payload
      .requestCode !==
      'string' ||
    !REQUEST_CODE_PATTERN.test(
      payload
        .requestCode,
    )
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_TOKEN_PAYLOAD',
      'Request code pada token konfirmasi reimbursement tidak valid.',
    );
  }

  if (
    typeof payload
      .employeeId !==
      'string' ||
    !payload
      .employeeId
      .trim() ||
    typeof payload
      .sessionId !==
      'string' ||
    !payload
      .sessionId
      .trim()
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_TOKEN_PAYLOAD',
      'Employee atau session pada token konfirmasi reimbursement tidak valid.',
    );
  }

  if (
    !payload.draft ||
    typeof payload.draft !==
      'object' ||
    Array.isArray(
      payload.draft,
    ) ||
    !payload.policy ||
    typeof payload.policy !==
      'object' ||
    Array.isArray(
      payload.policy,
    )
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_TOKEN_PAYLOAD',
      'Draft atau policy snapshot pada token konfirmasi reimbursement tidak valid.',
    );
  }

  /*
   * Re-normalize agar malformed enum/date/amount
   * tidak lolos hanya karena signature benar.
   */
  normalizeDraft(
    payload
      .draft as
      ReimbursementConfirmationDraft,
  );

  const policy =
    payload
      .policy as
      Partial<
        ReimbursementPolicyTokenSnapshot
      >;

  if (
    typeof policy
      .policyFingerprint !==
      'string' ||
    !/^[a-f0-9]{64}$/.test(
      policy
        .policyFingerprint,
    ) ||
    typeof policy
      .evidenceFingerprint !==
      'string' ||
    !/^[a-f0-9]{64}$/.test(
      policy
        .evidenceFingerprint,
    )
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_TOKEN_PAYLOAD',
      'Fingerprint policy pada token konfirmasi reimbursement tidak valid.',
    );
  }

  if (
    typeof payload
      .issuedAt !==
      'string' ||
    typeof payload
      .expiresAt !==
      'string'
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_TOKEN_PAYLOAD',
      'Timestamp token konfirmasi reimbursement tidak valid.',
    );
  }

  const issuedAt =
    Date.parse(
      payload
        .issuedAt,
    );

  const expiresAt =
    Date.parse(
      payload
        .expiresAt,
    );

  if (
    !Number.isFinite(
      issuedAt,
    ) ||
    !Number.isFinite(
      expiresAt,
    ) ||
    expiresAt <=
      issuedAt
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_TOKEN_PAYLOAD',
      'Masa berlaku token konfirmasi reimbursement tidak valid.',
    );
  }
}

/* =========================================================
   CREATE TOKEN
========================================================= */

export function createReimbursementActionToken(
  input:
    CreateReimbursementActionTokenInput,
) {
  const employeeId =
    normalizeRequiredText(
      input.employeeId,
      'Employee ID',
    );

  const sessionId =
    normalizeRequiredText(
      input.sessionId,
      'Session ID',
    );

  /*
   * Hanya request yang aman untuk standard
   * manager-only MVP yang boleh menerima
   * actionable confirmation token.
   */
  if (
    !input.policy
      .policyFound
  ) {
    throw new ReimbursementActionTokenError(
      'POLICY_NOT_FOUND',
      'Kebijakan reimbursement belum dapat diverifikasi.',
    );
  }

  if (
    !input.policy
      .eligible
  ) {
    throw new ReimbursementActionTokenError(
      'POLICY_NOT_ELIGIBLE',
      input.policy
        .violations[0] ||
      'Pengajuan reimbursement tidak memenuhi kebijakan.',
    );
  }

  if (
    input.policy
      .needsHumanReview ||
    !input.policy
      .autoSubmittable
  ) {
    throw new ReimbursementActionTokenError(
      'POLICY_REQUIRES_HUMAN_REVIEW',
      'Pengajuan reimbursement memerlukan pemeriksaan manual dan belum dapat dikonfirmasi melalui standard workflow.',
    );
  }

  const normalizedDraft =
    normalizeDraft(
      input.draft,
    );

  /*
   * Draft yang ditandatangani harus sama dengan
   * transaction facts yang sudah divalidasi policy.
   */
  if (
    normalizedDraft
      .reimbursementType !==
      input.policy
        .reimbursementType ||
    normalizedDraft
      .expenseDate !==
      input.policy
        .expenseDate ||
    normalizedDraft
      .amount !==
      normalizeAmount(
        input.policy
          .amount,
      ) ||
    normalizedDraft
      .currency !==
      normalizeCurrency(
        input.policy
          .currency,
      )
  ) {
    throw new ReimbursementActionTokenError(
      'DRAFT_POLICY_MISMATCH',
      'Draft reimbursement berbeda dari transaksi yang telah divalidasi policy.',
    );
  }

  const requestCode =
    input.requestCode
      ?.trim()
      .toUpperCase() ||
    createReimbursementConfirmationRequestCode();

  if (
    !REQUEST_CODE_PATTERN.test(
      requestCode,
    )
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_REQUEST_CODE',
      'Request code reimbursement untuk token konfirmasi tidak valid.',
    );
  }

  const ttlSeconds =
    Math.min(
      Math.max(
        Math.floor(
          input.ttlSeconds ??
          DEFAULT_TTL_SECONDS,
        ),
        1,
      ),
      MAX_TTL_SECONDS,
    );

  const issuedAt =
    new Date();

  const expiresAt =
    new Date(
      issuedAt.getTime() +
      ttlSeconds *
      1000,
    );

  const policySnapshot:
    ReimbursementPolicyTokenSnapshot =
      {
        policyFingerprint:
          createReimbursementPolicyFingerprint(
            input.policy,
          ),

        evidenceFingerprint:
          createReimbursementEvidenceFingerprint(
            input.policy,
          ),

        policyFound:
          input.policy
            .policyFound,

        eligible:
          input.policy
            .eligible,

        needsHumanReview:
          input.policy
            .needsHumanReview,

        autoSubmittable:
          input.policy
            .autoSubmittable,

        requiresReceipt:
          input.policy
            .requiresReceipt,

        requiresLostReceiptDeclaration:
          input.policy
            .requiresLostReceiptDeclaration,

        requiresManagerApproval:
          input.policy
            .requiresManagerApproval,

        requiresBudgetOwnerReview:
          input.policy
            .requiresBudgetOwnerReview,

        requiresDepartmentHeadApproval:
          input.policy
            .requiresDepartmentHeadApproval,

        requiresFinanceAudit:
          input.policy
            .requiresFinanceAudit,

        requiresBenefitVerification:
          input.policy
            .requiresBenefitVerification,

        policySource:
          [
            ...input.policy
              .policySource,
          ],

        sourceFiles:
          [
            ...input.policy
              .sourceFiles,
          ],
      };

  const payload:
    ReimbursementActionTokenPayload =
      {
        type:
          TOKEN_TYPE,

        version:
          TOKEN_VERSION,

        requestCode,

        employeeId,

        sessionId,

        draft:
          normalizedDraft,

        policy:
          policySnapshot,

        issuedAt:
          issuedAt
            .toISOString(),

        expiresAt:
          expiresAt
            .toISOString(),
      };

  const payloadPart =
    encodeBase64Url(
      JSON.stringify(
        payload,
      ),
    );

  const signaturePart =
    signPayload(
      payloadPart,
    );

  return {
    token:
      `${payloadPart}.${signaturePart}`,

    payload,
  };
}

/* =========================================================
   VERIFY TOKEN
========================================================= */

export function verifyReimbursementActionToken(
  token:
    string,
) {
  const normalized =
    token?.trim();

  if (!normalized) {
    throw new ReimbursementActionTokenError(
      'TOKEN_REQUIRED',
      'Token konfirmasi reimbursement wajib tersedia.',
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
    throw new ReimbursementActionTokenError(
      'INVALID_TOKEN',
      'Format token konfirmasi reimbursement tidak valid.',
    );
  }

  const [
    payloadPart,
    signaturePart,
  ] =
    parts;

  if (
    !payloadPart ||
    !signaturePart
  ) {
    throw new ReimbursementActionTokenError(
      'INVALID_TOKEN',
      'Format token konfirmasi reimbursement tidak valid.',
    );
  }

  assertValidSignature(
    payloadPart,
    signaturePart,
  );

  let parsed:
    unknown;

  try {
    parsed =
      JSON.parse(
        decodeBase64Url(
          payloadPart,
        ),
      );
  } catch (
    error
  ) {
    if (
      error instanceof
      ReimbursementActionTokenError
    ) {
      throw error;
    }

    throw new ReimbursementActionTokenError(
      'INVALID_TOKEN_PAYLOAD',
      'Payload token konfirmasi reimbursement tidak valid.',
    );
  }

  assertPayloadShape(
    parsed,
  );

  const now =
    Date.now();

  const issuedAt =
    Date.parse(
      parsed
        .issuedAt,
    );

  const expiresAt =
    Date.parse(
      parsed
        .expiresAt,
    );

  /*
   * Toleransi 60 detik untuk clock skew.
   */
  if (
    issuedAt >
    now +
      60_000
  ) {
    throw new ReimbursementActionTokenError(
      'TOKEN_NOT_ACTIVE',
      'Token konfirmasi reimbursement belum berlaku.',
    );
  }

  if (
    expiresAt <=
    now
  ) {
    throw new ReimbursementActionTokenError(
      'TOKEN_EXPIRED',
      'Token konfirmasi reimbursement sudah kedaluwarsa. Silakan buat ulang draft.',
    );
  }

  return parsed;
}

/* =========================================================
   CONTEXT BINDING
========================================================= */

export function assertReimbursementActionTokenContext(
  payload:
    ReimbursementActionTokenPayload,

  context: {
    employeeId:
      string;

    sessionId:
      string;
  },
) {
  const employeeId =
    normalizeRequiredText(
      context.employeeId,
      'Employee ID',
    );

  const sessionId =
    normalizeRequiredText(
      context.sessionId,
      'Session ID',
    );

  if (
    payload.employeeId !==
    employeeId
  ) {
    throw new ReimbursementActionTokenError(
      'TOKEN_EMPLOYEE_MISMATCH',
      'Token konfirmasi reimbursement tidak berlaku untuk employee saat ini.',
    );
  }

  if (
    payload.sessionId !==
    sessionId
  ) {
    throw new ReimbursementActionTokenError(
      'TOKEN_SESSION_MISMATCH',
      'Token konfirmasi reimbursement tidak berlaku untuk session ini.',
    );
  }
}
