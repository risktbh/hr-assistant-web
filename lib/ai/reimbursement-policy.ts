import {
  Prisma,
  ReimbursementType,
} from '@prisma/client';

import {
  GoogleGenerativeAIEmbeddings,
} from '@langchain/google-genai';

import {
  prisma,
} from '@/lib/db/prisma';

/* =========================================================
   TYPES
========================================================= */

export type TravelScope =
  | 'DOMESTIC'
  | 'INTERNATIONAL';

export type ValidateReimbursementPolicyInput = {
  employeeId: string;

  reimbursementType:
    ReimbursementType;

  expenseDate: string;

  amount:
    | Prisma.Decimal
    | string
    | number;

  currency?: string;

  merchant?:
    | string
    | null;

  reason:
    | string
    | null;

  receiptUrl?:
    | string
    | null;

  receiptFileName?:
    | string
    | null;

  /*
   * Optional contextual facts.
   *
   * Nilai ini nantinya diisi oleh AI intent parser /
   * draft builder berdasarkan pernyataan pengguna.
   *
   * Jangan mengarang true/false jika pengguna belum
   * memberikan informasi yang cukup.
   */
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

  /*
   * MEAL context
   */
  isRoutineMealAtNormalWorkLocation?:
    boolean;

  relatedToBusinessTravel?:
    boolean;

  relatedToQualifyingOvertime?:
    boolean;

  authorizedEvent?:
    boolean;

  /*
   * TRAVEL context
   */
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

  /*
   * Optional field from EXP-01 procedure.
   * Belum disimpan di ReimbursementRequest schema.
   */
  costCenter?:
    | string
    | null;
};

export type ReimbursementPolicyResult = {
  policyFound:
    boolean;

  eligible:
    boolean;

  /*
   * true berarti request tidak boleh dianggap
   * auto-clear hanya dari deterministic rules.
   */
  needsHumanReview:
    boolean;

  reimbursementType:
    ReimbursementType;

  expenseDate:
    string;

  claimAgeDays:
    number;

  amount:
    string;

  currency:
    string;

  receiptPresent:
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

  /*
   * Apakah request aman diteruskan ke standard
   * manager-only MVP flow.
   *
   * Ini BUKAN approval final.
   */
  autoSubmittable:
    boolean;

  violations:
    string[];

  warnings:
    string[];

  matchedRules:
    string[];

  policySource:
    string[];
};

export type ReimbursementPolicyEvidence = {
  content:
    string;

  similarity:
    number;

  source:
    string | null;
};

export type ReimbursementPolicyWithRagResult =
  ReimbursementPolicyResult & {
    rag: {
      found:
        boolean;

      query:
        string;

      threshold:
        number;

      evidence:
        ReimbursementPolicyEvidence[];
    };

    sourceFiles:
      string[];
  };

/* =========================================================
   ERROR
========================================================= */

export class ReimbursementPolicyError
  extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);

    this.name =
      'ReimbursementPolicyError';
  }
}

/* =========================================================
   ENV
========================================================= */

function getGeminiApiKey() {
  const apiKey =
    process.env
      .GOOGLE_API_KEY
      ?.trim() ||
    process.env
      .GEMINI_API_KEY
      ?.trim();

  if (!apiKey) {
    throw new ReimbursementPolicyError(
      'GEMINI_API_KEY_NOT_CONFIGURED',
      'Gemini API key belum dikonfigurasi untuk policy retrieval.',
    );
  }

  return apiKey;
}

/* =========================================================
   TEXT HELPERS
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

function normalizeCurrency(
  value?:
    | string
    | null,
) {
  const currency =
    (
      value?.trim() ||
      'IDR'
    ).toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency,
    )
  ) {
    throw new ReimbursementPolicyError(
      'INVALID_CURRENCY',
      'Currency harus menggunakan kode 3 huruf seperti IDR atau USD.',
    );
  }

  return currency;
}

function normalizeAmount(
  value:
    | Prisma.Decimal
    | string
    | number,
) {
  let amount:
    Prisma.Decimal;

  try {
    amount =
      new Prisma.Decimal(
        value as any,
      );
  } catch {
    throw new ReimbursementPolicyError(
      'INVALID_AMOUNT',
      'Nominal reimbursement tidak valid.',
    );
  }

  if (
    !amount.isFinite() ||
    amount.lte(
      0,
    )
  ) {
    throw new ReimbursementPolicyError(
      'INVALID_AMOUNT',
      'Nominal reimbursement harus lebih besar dari 0.',
    );
  }

  return amount
    .toDecimalPlaces(
      2,
    );
}

/* =========================================================
   DATE HELPERS
========================================================= */

const DATE_ONLY_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(
  value: string,
  fieldName: string,
) {
  const normalized =
    value?.trim();

  if (
    !normalized ||
    !DATE_ONLY_PATTERN.test(
      normalized,
    )
  ) {
    throw new ReimbursementPolicyError(
      'INVALID_DATE',
      `${fieldName} harus menggunakan format YYYY-MM-DD.`,
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
    throw new ReimbursementPolicyError(
      'INVALID_DATE',
      `${fieldName} tidak valid.`,
    );
  }

  return date;
}

function formatDateOnly(
  value: Date,
) {
  return value
    .toISOString()
    .slice(
      0,
      10,
    );
}

function getJakartaToday() {
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
      new Date(),
    );

  const year =
    parts.find(
      (
        part,
      ) =>
        part.type ===
        'year',
    )?.value;

  const month =
    parts.find(
      (
        part,
      ) =>
        part.type ===
        'month',
    )?.value;

  const day =
    parts.find(
      (
        part,
      ) =>
        part.type ===
        'day',
    )?.value;

  if (
    !year ||
    !month ||
    !day
  ) {
    throw new ReimbursementPolicyError(
      'DATE_FORMAT_ERROR',
      'Gagal menentukan tanggal hari ini.',
    );
  }

  return parseDateOnly(
    `${year}-${month}-${day}`,
    'Tanggal hari ini',
  );
}

function calculateClaimAgeDays(
  expenseDate: Date,
) {
  const today =
    getJakartaToday();

  const millisecondsPerDay =
    24 *
    60 *
    60 *
    1000;

  return Math.floor(
    (
      today.getTime() -
      expenseDate.getTime()
    ) /
      millisecondsPerDay,
  );
}

/* =========================================================
   MAIN DETERMINISTIC POLICY VALIDATOR
========================================================= */

export async function validateReimbursementPolicy(
  input:
    ValidateReimbursementPolicyInput,
): Promise<ReimbursementPolicyResult> {
  const employeeId =
    input.employeeId
      ?.trim();

  if (!employeeId) {
    throw new ReimbursementPolicyError(
      'EMPLOYEE_REQUIRED',
      'Employee ID wajib tersedia.',
    );
  }

  if (
    !Object.values(
      ReimbursementType,
    ).includes(
      input.reimbursementType,
    )
  ) {
    throw new ReimbursementPolicyError(
      'INVALID_REIMBURSEMENT_TYPE',
      'Jenis reimbursement tidak valid.',
    );
  }

  /*
   * Policy validation harus tetap employee-scoped.
   * Kita hanya memastikan employee benar-benar ada.
   * Manager/workflow validation dilakukan oleh service.
   */
  const employee =
    await prisma.employee
      .findUnique({
        where: {
          id:
            employeeId,
        },

        select: {
          id:
            true,
        },
      });

  if (!employee) {
    throw new ReimbursementPolicyError(
      'EMPLOYEE_NOT_FOUND',
      'Employee tidak ditemukan.',
    );
  }

  const expenseDate =
    parseDateOnly(
      input.expenseDate,
      'Tanggal pengeluaran',
    );

  const claimAgeDays =
    calculateClaimAgeDays(
      expenseDate,
    );

  const amount =
    normalizeAmount(
      input.amount,
    );

  const currency =
    normalizeCurrency(
      input.currency,
    );

  const reason =
    normalizeNullableText(
      input.reason,
    );

  const receiptPresent =
    Boolean(
      normalizeNullableText(
        input.receiptUrl,
      ) ||
      normalizeNullableText(
        input.receiptFileName,
      ),
    );

  const violations:
    string[] = [];

  const warnings:
    string[] = [];

  const matchedRules:
    string[] = [];

  const policySource:
    string[] = [];

  let eligible =
    true;

  let needsHumanReview =
    false;

  let requiresReceipt =
    false;

  let requiresLostReceiptDeclaration =
    false;

  let requiresManagerApproval =
    false;

  let requiresBudgetOwnerReview =
    false;

  let requiresDepartmentHeadApproval =
    false;

  let requiresFinanceAudit =
    false;

  let requiresBenefitVerification =
    false;

  /* =======================================================
     COMMON DATA VALIDATION
  ======================================================= */

  if (!reason) {
    violations.push(
      'Keterangan atau tujuan reimbursement wajib dijelaskan.',
    );
  }

  if (
    claimAgeDays <
    0
  ) {
    violations.push(
      'Tanggal pengeluaran tidak boleh berada di masa depan.',
    );
  }

  /* =======================================================
     MEDICAL → BEN-01
  ======================================================= */

  if (
    input.reimbursementType ===
    ReimbursementType.MEDICAL
  ) {
    policySource.push(
      'BEN-01',
    );

    matchedRules.push(
      'Benefit kesehatan mengikuti plan tahun berjalan serta insurer/benefit booklet.',
    );

    /*
     * Handbook tidak memberikan angka coverage,
     * annual limit, network provider, exclusion,
     * maupun pre-authorization untuk medical.
     *
     * Karena itu AI tidak boleh menyimpulkan
     * auto-eligible hanya dari handbook umum.
     */
    requiresBenefitVerification =
      true;

    needsHumanReview =
      true;

    warnings.push(
      'Eligibility reimbursement medis belum dapat dipastikan hanya dari handbook karena coverage, limit, provider network, pre-authorization, dan exclusion mengikuti insurer/benefit booklet.',
    );

    /*
     * BEN-01 tidak menyatakan bahwa claim medis
     * normal harus diberikan ke line manager.
     *
     * Jangan memaksakan manager-only expense flow
     * untuk data medis sebelum workflow benefit
     * yang tepat tersedia.
     */
    requiresManagerApproval =
      false;
  }

  /* =======================================================
     BUSINESS EXPENSE BASELINE → EXP-01
  ======================================================= */

  const isBusinessExpense =
    input.reimbursementType !==
    ReimbursementType.MEDICAL;

  if (isBusinessExpense) {
    policySource.push(
      'EXP-01',
    );

    requiresReceipt =
      true;

    requiresManagerApproval =
      true;

    requiresFinanceAudit =
      true;

    matchedRules.push(
      'Expense claim harus memiliki tujuan bisnis yang jelas, wajar, tidak bersifat pribadi, dan dapat diaudit.',
      'Klaim normal diajukan maksimal 30 hari kalender setelah transaksi atau perjalanan.',
      'Receipt wajib dilampirkan; lost receipt menggunakan declaration dan approval manager.',
      'Manager atau budget owner melakukan review dan Finance dapat melakukan audit/compliance.',
    );

    /*
     * EXP-01: maksimal 30 hari,
     * kecuali ada alasan yang dapat dibuktikan.
     */
    if (
      claimAgeDays >
      30
    ) {
      const lateClaimReason =
        normalizeNullableText(
          input.lateClaimReason,
        );

      if (!lateClaimReason) {
        violations.push(
          `Klaim berusia ${claimAgeDays} hari. EXP-01 menetapkan klaim normal maksimal 30 hari kalender setelah transaksi/perjalanan kecuali ada alasan yang dapat dibuktikan.`,
        );
      } else {
        needsHumanReview =
          true;

        warnings.push(
          `Klaim berusia ${claimAgeDays} hari dan melewati batas normal 30 hari. Alasan keterlambatan perlu diverifikasi secara manual.`,
        );
      }
    }

    /*
     * Receipt path.
     */
    if (!receiptPresent) {
      requiresLostReceiptDeclaration =
        true;

      if (
        input.lostReceiptDeclaration ===
        true
      ) {
        needsHumanReview =
          true;

        warnings.push(
          'Receipt tidak tersedia. Lost receipt declaration sudah dinyatakan dan perlu ditinjau manager.',
        );
      } else {
        violations.push(
          'Receipt wajib untuk standard expense claim. Jika receipt hilang, employee harus membuat lost receipt declaration.',
        );
      }
    }

    /*
     * Personal / paid-by-other-party rules.
     *
     * false atau undefined tidak langsung dianggap
     * pelanggaran. Kita hanya menolak bila fakta
     * positif diberikan.
     */
    if (
      input.isPersonalExpense ===
      true
    ) {
      violations.push(
        'Pengeluaran pribadi tidak dapat diklaim sebagai business expense.',
      );
    }

    if (
      input.paidByOtherParty ===
      true
    ) {
      violations.push(
        'Pengeluaran yang sudah dibayar pihak lain tidak boleh diklaim kembali.',
      );
    }

    /*
     * EXP-01 menyebut kategori yang membutuhkan
     * pre-approval idealnya telah disetujui.
     * Karena kata kebijakannya bukan absolute ban,
     * missing pre-approval diarahkan ke review,
     * bukan langsung dibuat hard violation.
     */
    if (
      input.categoryRequiresPreApproval ===
      true &&
      input.preApproved !==
      true
    ) {
      needsHumanReview =
        true;

      warnings.push(
        'Kategori ini dinyatakan membutuhkan pre-approval, tetapi pre-approval belum terkonfirmasi.',
      );
    }

    if (
      !normalizeNullableText(
        input.costCenter,
      )
    ) {
      warnings.push(
        'Cost center belum disebutkan. EXP-01 memasukkan pemilihan kategori biaya dan cost center sebagai bagian prosedur pengajuan.',
      );
    }
  }

  /* =======================================================
     MEAL → EXP-01 SPECIAL RULE
  ======================================================= */

  if (
    input.reimbursementType ===
    ReimbursementType.MEAL
  ) {
    matchedRules.push(
      'Makan rutin sehari-hari di lokasi kerja normal bukan expense kecuali terkait perjalanan dinas, qualifying overtime, atau event yang diotorisasi.',
    );

    const hasAllowedMealContext =
      input.relatedToBusinessTravel ===
        true ||
      input.relatedToQualifyingOvertime ===
        true ||
      input.authorizedEvent ===
        true;

    if (
      input.isRoutineMealAtNormalWorkLocation ===
        true &&
      !hasAllowedMealContext
    ) {
      violations.push(
        'Makan rutin sehari-hari di lokasi kerja normal tidak memenuhi EXP-01 kecuali terkait business travel, qualifying overtime, atau authorized event.',
      );
    }

    /*
     * Bila meal context belum jelas, jangan
     * mengarang bahwa expense eligible.
     */
    if (
      input.isRoutineMealAtNormalWorkLocation ===
        undefined &&
      input.relatedToBusinessTravel ===
        undefined &&
      input.relatedToQualifyingOvertime ===
        undefined &&
      input.authorizedEvent ===
        undefined
    ) {
      needsHumanReview =
        true;

      warnings.push(
        'Konteks meal belum cukup untuk menentukan apakah ini routine meal atau exception yang diperbolehkan.',
      );
    }
  }

  /* =======================================================
     TRAVEL → EXP-01 + TRV-01
  ======================================================= */

  if (
    input.reimbursementType ===
    ReimbursementType.TRAVEL
  ) {
    policySource.push(
      'TRV-01',
    );

    requiresBudgetOwnerReview =
      true;

    matchedRules.push(
      'Perjalanan dinas harus memiliki business purpose dan approval sebelum booking kecuali emergency.',
      'Per diem tidak boleh diklaim ganda dengan receipt reimbursement untuk biaya yang sama.',
      'Komponen pribadi harus dipisahkan dan tidak boleh menambah biaya perusahaan tanpa approval.',
    );

    /*
     * Approval matrix:
     * domestic → Line Manager + Budget Owner
     * international → Department Head + Budget Owner
     */
    if (
      input.travelScope ===
      'INTERNATIONAL'
    ) {
      requiresDepartmentHeadApproval =
        true;

      requiresManagerApproval =
        false;

      needsHumanReview =
        true;

      warnings.push(
        'Perjalanan internasional membutuhkan Department Head + Budget Owner dan review tambahan sesuai kebutuhan. Workflow manager-only MVP belum cukup untuk route ini.',
      );
    } else if (
      input.travelScope ===
      'DOMESTIC'
    ) {
      requiresManagerApproval =
        true;

      /*
       * Schema/workflow MVP belum memiliki
       * budget owner approver terpisah.
       */
      needsHumanReview =
        true;

      warnings.push(
        'Perjalanan domestik membutuhkan Line Manager + Budget Owner. Workflow manager-only MVP belum mencakup Budget Owner terpisah.',
      );
    } else {
      needsHumanReview =
        true;

      warnings.push(
        'Jenis perjalanan domestik/internasional belum ditentukan sehingga approval route belum dapat dipastikan.',
      );
    }

    if (
      input.perDiemDuplicate ===
      true
    ) {
      violations.push(
        'Biaya yang sama tidak boleh diklaim ganda melalui per diem dan receipt reimbursement.',
      );
    }

    if (
      input.includesPersonalExpense ===
        true
    ) {
      if (
        input.personalExpenseSeparated !==
        true
      ) {
        violations.push(
          'Komponen perjalanan pribadi harus dipisahkan dari biaya perusahaan.',
        );
      } else {
        warnings.push(
          'Komponen pribadi dinyatakan sudah dipisahkan; approver tetap perlu memastikan tidak ada tambahan biaya perusahaan.',
        );
      }
    }

    /*
     * TRV-01 requires approval sebelum booking
     * kecuali emergency.
     */
    if (
      input.preApproved ===
        false
    ) {
      if (
        input.travelEmergency ===
        true
      ) {
        needsHumanReview =
          true;

        warnings.push(
          'Perjalanan dinyatakan emergency tanpa pre-approval; exception perlu diverifikasi oleh approver.',
        );
      } else {
        needsHumanReview =
          true;

        warnings.push(
          'Pre-approval perjalanan belum terpenuhi dan memerlukan review manual.',
        );
      }
    } else if (
      input.preApproved ===
        undefined
    ) {
      needsHumanReview =
        true;

      warnings.push(
        'Status pre-approval perjalanan belum diketahui.',
      );
    }
  }

  /* =======================================================
     OTHER → EXP-01
  ======================================================= */

  if (
    input.reimbursementType ===
    ReimbursementType.OTHER
  ) {
    matchedRules.push(
      'Expense kategori lain tetap harus memenuhi EXP-01 dan memiliki business purpose yang dapat diaudit.',
    );
  }

  /* =======================================================
     FINAL
  ======================================================= */

  if (
    violations.length >
    0
  ) {
    eligible =
      false;
  }

  /*
   * Standard manager-only MVP hanya aman jika:
   *
   * - deterministic eligible;
   * - tidak perlu human-review/exception;
   * - manager memang merupakan approval route;
   * - tidak ada Budget Owner / Dept Head / benefit
   *   verification yang belum dimodelkan.
   */
  const autoSubmittable =
    eligible &&
    !needsHumanReview &&
    requiresManagerApproval &&
    !requiresBudgetOwnerReview &&
    !requiresDepartmentHeadApproval &&
    !requiresBenefitVerification;

  return {
    policyFound:
      policySource.length >
      0,

    eligible,

    needsHumanReview,

    reimbursementType:
      input.reimbursementType,

    expenseDate:
      formatDateOnly(
        expenseDate,
      ),

    claimAgeDays,

    amount:
      amount.toString(),

    currency,

    receiptPresent,

    requiresReceipt,

    requiresLostReceiptDeclaration,

    requiresManagerApproval,

    requiresBudgetOwnerReview,

    requiresDepartmentHeadApproval,

    requiresFinanceAudit,

    requiresBenefitVerification,

    autoSubmittable,

    violations,

    warnings,

    matchedRules,

    policySource: [
      ...new Set(
        policySource,
      ),
    ],
  };
}

/* =========================================================
   RAG QUERY BUILDER
========================================================= */

function buildReimbursementPolicyQuery(
  input:
    ValidateReimbursementPolicyInput,

  deterministic:
    ReimbursementPolicyResult,

  originalQuestion?:
    string,
) {
  const keywords:
    string[] = [];

  switch (
    input.reimbursementType
  ) {
    case ReimbursementType.MEDICAL:
      keywords.push(
        'BEN-01',
        'benefit kesehatan',
        'medical insurance',
        'rawat jalan',
        'rawat inap',
        'dental',
        'kacamata',
        'provider network',
        'pre-authorization',
        'annual limit',
        'exclusion',
        'benefit booklet',
      );
      break;

    case ReimbursementType.TRAVEL:
      keywords.push(
        'EXP-01',
        'TRV-01',
        'reimbursement',
        'expense claim',
        'business travel',
        'perjalanan dinas',
        'receipt',
        'pre-approval',
        'per diem',
        'budget owner',
        'personal expense',
      );
      break;

    case ReimbursementType.MEAL:
      keywords.push(
        'EXP-01',
        'reimbursement',
        'expense claim',
        'receipt',
        'meal',
        'makan',
        'business travel',
        'overtime',
        'authorized event',
        'manager',
        'budget owner',
      );
      break;

    case ReimbursementType.OTHER:
      keywords.push(
        'EXP-01',
        'reimbursement',
        'expense claim',
        'penggantian biaya',
        'business purpose',
        'receipt',
        'lost receipt',
        '30 hari',
        'manager',
        'budget owner',
        'finance audit',
      );
      break;
  }

  return `
Kebijakan reimbursement / expense claim perusahaan.

Jenis reimbursement:
${input.reimbursementType}

Policy target:
${deterministic.policySource.join(', ')}

Kata kunci:
${keywords.join(', ')}

Tanggal transaksi:
${deterministic.expenseDate}

Usia klaim:
${deterministic.claimAgeDays} hari

Nominal:
${deterministic.amount} ${deterministic.currency}

Merchant:
${normalizeNullableText(input.merchant) || 'tidak disebutkan'}

Business purpose / alasan:
${normalizeNullableText(input.reason) || 'tidak disebutkan'}

Receipt:
${deterministic.receiptPresent ? 'tersedia' : 'tidak tersedia'}

Pertanyaan pengguna:
${originalQuestion?.trim() || 'Validasi pengajuan reimbursement berdasarkan kebijakan perusahaan.'}
`.trim();
}

/* =========================================================
   SOURCE HELPER
========================================================= */

function getSourceName(
  metadata:
    unknown,
) {
  if (
    !metadata ||
    typeof metadata !==
      'object' ||
    Array.isArray(
      metadata,
    )
  ) {
    return null;
  }

  const rawSource =
    (
      metadata as {
        source?:
          unknown;
      }
    ).source;

  if (
    typeof rawSource !==
    'string'
  ) {
    return null;
  }

  return (
    rawSource
      .split(
        /[/\\]/,
      )
      .pop() ||
    null
  );
}

/* =========================================================
   DOMAIN / LEXICAL GUARD
========================================================= */

function isExpectedPolicyEvidence(
  content: string,
  reimbursementType:
    ReimbursementType,
) {
  const text =
    content
      .toLowerCase();

  switch (
    reimbursementType
  ) {
    case ReimbursementType.MEDICAL:
      return (
        text.includes(
          'ben-01',
        ) ||
        text.includes(
          'benefit kesehatan',
        ) ||
        text.includes(
          'medical insurance',
        ) ||
        (
          text.includes(
            'provider network',
          ) &&
          text.includes(
            'pre-authorization',
          )
        )
      );

    case ReimbursementType.TRAVEL:
      return (
        text.includes(
          'trv-01',
        ) ||
        text.includes(
          'exp-01',
        ) ||
        text.includes(
          'perjalanan dinas',
        ) ||
        (
          text.includes(
            'per diem',
          ) &&
          text.includes(
            'reimbursement',
          )
        )
      );

    case ReimbursementType.MEAL:
      return (
        text.includes(
          'exp-01',
        ) ||
        (
          text.includes(
            'makan',
          ) &&
          (
            text.includes(
              'overtime',
            ) ||
            text.includes(
              'perjalanan',
            ) ||
            text.includes(
              'event',
            )
          )
        )
      );

    case ReimbursementType.OTHER:
      return (
        text.includes(
          'exp-01',
        ) ||
        (
          text.includes(
            'expense claim',
          ) &&
          text.includes(
            'receipt',
          )
        ) ||
        (
          text.includes(
            'reimbursement',
          ) &&
          text.includes(
            '30 hari',
          )
        )
      );
  }
}

/* =========================================================
   RAG RETRIEVAL
========================================================= */

async function retrieveReimbursementPolicyEvidence(
  searchQuery:
    string,

  reimbursementType:
    ReimbursementType,
) {
  const embeddings =
    new GoogleGenerativeAIEmbeddings(
      {
        model:
          'gemini-embedding-2',

        apiKey:
          getGeminiApiKey(),
      },
    );

  const queryVector =
    await embeddings
      .embedQuery(
        searchQuery,
      );

  const vectorString =
    `[${queryVector.join(',')}]`;

  type RetrievedChunk = {
    content:
      string;

    metadata:
      unknown;

    similarity:
      number;
  };

  const candidates:
    RetrievedChunk[] =
      await prisma.$queryRaw`
        SELECT
          content,
          metadata,

          1 - (
            embedding <=>
            ${vectorString}::vector
          ) AS similarity

        FROM "DocumentChunk"

        WHERE
          embedding IS NOT NULL

        ORDER BY
          embedding <=>
          ${vectorString}::vector

        LIMIT 10;
      `;

  console.info(
    '[REIMBURSEMENT POLICY RETRIEVAL]',
    candidates.map(
      (
        chunk,
        index,
      ) => ({
        rank:
          index + 1,

        similarity:
          Number(
            chunk.similarity,
          ).toFixed(
            4,
          ),

        source:
          getSourceName(
            chunk.metadata,
          ),

        domainMatch:
          isExpectedPolicyEvidence(
            chunk.content,
            reimbursementType,
          ),

        preview:
          chunk.content
            ?.slice(
              0,
              120,
            ),
      }),
    ),
  );

  const threshold =
    0.60;

  /*
   * Similarity saja tidak cukup.
   *
   * Lexical/domain guard mencegah chunk policy lain
   * dengan semantic similarity tinggi dianggap sebagai
   * evidence reimbursement.
   */
  const relevant =
    candidates
      .filter(
        (
          chunk,
        ) =>
          Number(
            chunk.similarity,
          ) >=
            threshold &&
          isExpectedPolicyEvidence(
            chunk.content,
            reimbursementType,
          ),
      )
      .slice(
        0,
        6,
      );

  console.info(
    '[REIMBURSEMENT POLICY FILTER]',
    {
      reimbursementType,

      threshold,

      candidates:
        candidates.length,

      accepted:
        relevant.length,
    },
  );

  return {
    threshold,

    evidence:
      relevant.map(
        (
          chunk,
        ): ReimbursementPolicyEvidence => ({
          content:
            chunk.content,

          similarity:
            Number(
              chunk.similarity,
            ),

          source:
            getSourceName(
              chunk.metadata,
            ),
        }),
      ),
  };
}

/* =========================================================
   DETERMINISTIC + RAG
========================================================= */

export async function validateReimbursementPolicyWithRag(
  input:
    ValidateReimbursementPolicyInput & {
      originalQuestion?:
        string;
    },
): Promise<ReimbursementPolicyWithRagResult> {
  /*
   * 1. Deterministic rules adalah authority.
   *
   * RAG tidak boleh mengubah hard violation
   * menjadi eligible.
   */
  const deterministic =
    await validateReimbursementPolicy(
      input,
    );

  /*
   * 2. Query RAG dibuat dari policy route
   * + actual transaction.
   */
  const searchQuery =
    buildReimbursementPolicyQuery(
      input,
      deterministic,
      input.originalQuestion,
    );

  console.info(
    '[REIMBURSEMENT POLICY QUERY]',
    {
      reimbursementType:
        input.reimbursementType,

      policySource:
        deterministic.policySource,

      searchQuery,
    },
  );

  /*
   * 3. Retrieve evidence.
   */
  const retrieval =
    await retrieveReimbursementPolicyEvidence(
      searchQuery,
      input.reimbursementType,
    );

  const sourceFiles = [
    ...new Set(
      retrieval.evidence
        .map(
          (
            item,
          ) =>
            item.source,
        )
        .filter(
          (
            source,
          ): source is string =>
            Boolean(
              source,
            ),
        ),
    ),
  ];

  const ragFound =
    retrieval
      .evidence
      .length >
    0;

  /*
   * RAG tidak mengubah:
   * - eligible
   * - requiresX approval
   * - deterministic violations
   *
   * Jika evidence yang sesuai domain tidak ditemukan,
   * kita hanya menaikkan human-review requirement.
   */
  const needsHumanReview =
    deterministic
      .needsHumanReview ||
    !ragFound;

  const autoSubmittable =
    deterministic
      .autoSubmittable &&
    ragFound &&
    !needsHumanReview;

  const result:
    ReimbursementPolicyWithRagResult =
      {
        ...deterministic,

        needsHumanReview,

        autoSubmittable,

        rag: {
          found:
            ragFound,

          query:
            searchQuery,

          threshold:
            retrieval.threshold,

          evidence:
            retrieval.evidence,
        },

        sourceFiles,
      };

  console.info(
    '[REIMBURSEMENT POLICY VALIDATION]',
    {
      reimbursementType:
        result
          .reimbursementType,

      eligible:
        result
          .eligible,

      needsHumanReview:
        result
          .needsHumanReview,

      autoSubmittable:
        result
          .autoSubmittable,

      claimAgeDays:
        result
          .claimAgeDays,

      receiptPresent:
        result
          .receiptPresent,

      requiresManagerApproval:
        result
          .requiresManagerApproval,

      requiresBudgetOwnerReview:
        result
          .requiresBudgetOwnerReview,

      requiresDepartmentHeadApproval:
        result
          .requiresDepartmentHeadApproval,

      requiresBenefitVerification:
        result
          .requiresBenefitVerification,

      ragFound:
        result
          .rag
          .found,

      evidenceCount:
        result
          .rag
          .evidence
          .length,

      sourceFiles:
        result
          .sourceFiles,

      policySource:
        result
          .policySource,

      violations:
        result
          .violations,

      warnings:
        result
          .warnings,
    },
  );

  return result;
}
