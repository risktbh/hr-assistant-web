import {
  LeaveType,
} from '@prisma/client';

import {
  GoogleGenerativeAIEmbeddings,
} from '@langchain/google-genai';

import {
  prisma,
} from '@/lib/db/prisma';

import {
  getEmployeeLeaveBalance,
  LeaveServiceError,
} from '@/lib/services/leave-service';

/* =========================================================
   TYPES
========================================================= */

export type ValidateLeavePolicyInput = {
  employeeId: string;

  leaveType: LeaveType;

  startDate: string;

  endDate: string;

  reason?: string | null;
};

export type LeavePolicyBalance = {
  year: number;

  entitlementDays:
    number | null;

  approvedDays:
    number;

  pendingDays:
    number;

  availableDays:
    number | null;

  requestedDays:
    number;

  remainingAfterRequest:
    number | null;
};

export type LeavePolicyResult = {
  policyFound:
    boolean;

  eligible:
    boolean;

  needsHumanReview:
    boolean;

  requiresManagerApproval:
    boolean;

  leaveType:
    LeaveType;

  startDate:
    string;

  endDate:
    string;

  totalDays:
    number;

  noticeDays:
    number;

  balance:
    LeavePolicyBalance | null;

  violations:
    string[];

  warnings:
    string[];

  matchedRules:
    string[];

  policySource:
    string[];
};

export type LeavePolicyEvidence = {
  content: string;

  similarity: number;

  source:
    string | null;
};
/* =========================================================
   GEMINI API KEY
========================================================= */

function getGeminiApiKey() {
  const apiKey =
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new LeavePolicyError(
      'AI_CONFIG_ERROR',
      'API Key Gemini tidak tersedia.',
    );
  }

  return apiKey;
}

/* =========================================================
   RAG QUERY BUILDER
========================================================= */

function buildLeavePolicyQuery(
  input:
    ValidateLeavePolicyInput,

  deterministic:
    LeavePolicyResult,

  originalQuestion?:
    string,
) {
  const keywords:
    string[] = [];

  switch (
    input.leaveType
  ) {
    case LeaveType.ANNUAL:
      keywords.push(
        'LEV-01',
        'cuti tahunan',
        'annual leave',
        'vacation',
        'saldo cuti',
        'leave balance',
        '14 hari kerja',
        'persetujuan line manager',
        'notice period',
        'pengajuan 7 hari sebelumnya',
        'pengajuan 14 hari sebelumnya',
        'handover',
        'out-of-office',
      );
      break;

    case LeaveType.SICK:
      keywords.push(
        'SICK-01',
        'cuti sakit',
        'sick leave',
        'medical leave',
        'surat dokter',
        'bukti medis',
        'memberitahu manager',
        'medical accommodation',
      );
      break;

    case LeaveType.SPECIAL:
      keywords.push(
        'cuti khusus',
        'special leave',
        'bereavement',
        'cuti duka',
        'cuti menikah',
        'marriage leave',
        'kewajiban sipil',
        'ibadah',
      );
      break;

    case LeaveType.UNPAID:
      keywords.push(
        'unpaid leave',
        'cuti tanpa upah',
        'leave tanpa gaji',
        'Department Head',
        'HR approval',
        'lebih dari 5 hari kerja',
        'payroll',
        'benefit impact',
      );
      break;
  }

  return `
Kebijakan cuti / leave perusahaan.

Jenis cuti:
${input.leaveType}

Kata kunci:
${keywords.join(', ')}

Tanggal:
${deterministic.startDate}
sampai
${deterministic.endDate}

Jumlah hari kerja:
${deterministic.totalDays}

Notice:
${deterministic.noticeDays} hari

Alasan:
${input.reason?.trim() || 'tidak disebutkan'}

Pertanyaan pengguna:
${originalQuestion?.trim() || 'Validasi pengajuan cuti berdasarkan kebijakan perusahaan.'}
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
        source?: unknown;
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
   LEAVE DOMAIN FILTER
========================================================= */

function isRelevantLeavePolicyChunk(
  content: string,
  leaveType: LeaveType,
) {
  const normalized =
    content
      .toLowerCase()
      .replace(/\s+/g, ' ');

  switch (leaveType) {
    case LeaveType.ANNUAL:
      /*
       * Terima LEV-01 atau chunk yang secara eksplisit
       * membahas annual leave.
       *
       * LEV-02 saja tidak cukup untuk annual leave.
       */
      if (
        normalized.includes('lev-02') &&
        !normalized.includes('lev-01')
      ) {
        return false;
      }

      return (
        normalized.includes('lev-01') ||
        normalized.includes('cuti tahunan') ||
        normalized.includes('annual leave') ||
        normalized.includes('leave balance') ||
        normalized.includes('leavebalance') ||
        normalized.includes('saldo cuti')
      );

    case LeaveType.SICK:
      return (
        normalized.includes('sick-01') ||
        normalized.includes('cuti sakit') ||
        normalized.includes('sick leave') ||
        normalized.includes('medical leave')
      );

    case LeaveType.SPECIAL:
      return (
        normalized.includes('lev-02') ||
        normalized.includes('cuti khusus') ||
        normalized.includes('cuti duka') ||
        normalized.includes('bereavement') ||
        normalized.includes('cuti menikah') ||
        normalized.includes('marriage leave')
      );

    case LeaveType.UNPAID:
      return (
        normalized.includes('lev-02') ||
        normalized.includes('unpaid leave') ||
        normalized.includes('cuti tanpa upah') ||
        normalized.includes('cuti tanpa gaji')
      );

    default:
      return false;
  }
}

/* =========================================================
   RAG RETRIEVAL
========================================================= */

async function retrieveLeavePolicyEvidence(
  searchQuery: string,
  leaveType: LeaveType,
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
    await embeddings.embedQuery(
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

      LIMIT 8;
    `;

  console.info(
    '[LEAVE POLICY RETRIEVAL]',
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
          ).toFixed(4),

        source:
          getSourceName(
            chunk.metadata,
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

  const similarityPassed =
    candidates.filter(
        (chunk) =>
        Number(
            chunk.similarity,
        ) >=
        threshold,
    );

  const relevant =
    similarityPassed
      .filter(
        (chunk) =>
          isRelevantLeavePolicyChunk(
            chunk.content,
            leaveType,
          ),
      )
      .slice(
        0,
        4,
      );

  console.info(
    '[LEAVE POLICY FILTER]',
    {
        threshold,

        candidates:
        candidates.length,

        similarityPassed:
        similarityPassed.length,

        domainAccepted:
        relevant.length,

        leaveType,
    },
    );

  return {
    threshold,

    evidence:
      relevant.map(
        (
          chunk,
        ): LeavePolicyEvidence => ({
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

export type LeavePolicyWithRagResult =
  LeavePolicyResult & {
    rag: {
      found:
        boolean;

      query:
        string;

      threshold:
        number;

      evidence:
        LeavePolicyEvidence[];
    };

    sourceFiles:
      string[];
  };

/* =========================================================
   ERROR
========================================================= */

export class LeavePolicyError
  extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);

    this.name =
      'LeavePolicyError';
  }
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
    value
      ?.trim();

  if (
    !normalized ||
    !DATE_ONLY_PATTERN.test(
      normalized,
    )
  ) {
    throw new LeavePolicyError(
      'INVALID_DATE',
      `${fieldName} harus menggunakan format YYYY-MM-DD.`,
    );
  }

  const [
    yearString,
    monthString,
    dayString,
  ] =
    normalized.split('-');

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

  /*
   * Mencegah tanggal seperti:
   * 2026-02-31
   */
  if (
    date.getUTCFullYear() !==
      year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !==
      day
  ) {
    throw new LeavePolicyError(
      'INVALID_DATE',
      `${fieldName} tidak valid.`,
    );
  }

  return date;
}

function formatDateOnly(
  date: Date,
) {
  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}

/* =========================================================
   WORKING DAYS
========================================================= */

function calculateWorkingDays(
  startDate: Date,
  endDate: Date,
) {
  if (
    endDate.getTime() <
    startDate.getTime()
  ) {
    throw new LeavePolicyError(
      'INVALID_LEAVE_RANGE',
      'Tanggal selesai cuti harus sama atau setelah tanggal mulai.',
    );
  }

  let workingDays =
    0;

  const cursor =
    new Date(
      startDate.getTime(),
    );

  while (
    cursor.getTime() <=
    endDate.getTime()
  ) {
    const day =
      cursor.getUTCDay();

    /*
     * 0 = Minggu
     * 6 = Sabtu
     */
    if (
      day !== 0 &&
      day !== 6
    ) {
      workingDays++;
    }

    cursor.setUTCDate(
      cursor.getUTCDate() +
        1,
    );
  }

  return workingDays;
}

/* =========================================================
   TODAY — ASIA/JAKARTA
========================================================= */

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
      (part) =>
        part.type ===
        'year',
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type ===
        'month',
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type ===
        'day',
    )?.value;

  if (
    !year ||
    !month ||
    !day
  ) {
    throw new LeavePolicyError(
      'DATE_FORMAT_ERROR',
      'Gagal menentukan tanggal hari ini.',
    );
  }

  return parseDateOnly(
    `${year}-${month}-${day}`,
    'Tanggal hari ini',
  );
}

/* =========================================================
   NOTICE DAYS
========================================================= */

function calculateNoticeDays(
  startDate: Date,
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
      startDate.getTime() -
      today.getTime()
    ) /
      millisecondsPerDay,
  );
}

/* =========================================================
   MAIN POLICY VALIDATOR
========================================================= */

export async function validateLeavePolicy(
  input:
    ValidateLeavePolicyInput,
): Promise<LeavePolicyResult> {
  const employeeId =
    input.employeeId
      ?.trim();

  if (
    !employeeId
  ) {
    throw new LeavePolicyError(
      'EMPLOYEE_REQUIRED',
      'Employee ID wajib tersedia.',
    );
  }

  if (
    !Object.values(
      LeaveType,
    ).includes(
      input.leaveType,
    )
  ) {
    throw new LeavePolicyError(
      'INVALID_LEAVE_TYPE',
      'Jenis cuti tidak valid.',
    );
  }

  const startDate =
    parseDateOnly(
      input.startDate,
      'Tanggal mulai',
    );

  const endDate =
    parseDateOnly(
      input.endDate,
      'Tanggal selesai',
    );

  if (
    startDate.getUTCFullYear() !==
    endDate.getUTCFullYear()
  ) {
    throw new LeavePolicyError(
      'CROSS_YEAR_LEAVE_NOT_SUPPORTED',
      'Pengajuan cuti lintas tahun belum didukung. Pisahkan pengajuan berdasarkan tahun.',
    );
  }

  const totalDays =
    calculateWorkingDays(
      startDate,
      endDate,
    );

  if (
    totalDays <= 0
  ) {
    throw new LeavePolicyError(
      'NO_WORKING_DAY',
      'Rentang cuti tidak memiliki hari kerja.',
    );
  }

  const noticeDays =
    calculateNoticeDays(
      startDate,
    );

  const violations:
    string[] = [];

  const warnings:
    string[] = [];

  const matchedRules:
    string[] = [];

  const policySource:
    string[] = [];

  let balance:
    LeavePolicyBalance |
    null = null;

  let eligible =
    true;
  
  let needsHumanReview =
    false;  

  const requiresManagerApproval =
    true;

  /* =======================================================
     COMMON VALIDATION
  ======================================================= */

  if (
    noticeDays < 0
  ) {
    eligible =
      false;

    violations.push(
      'Tanggal mulai cuti sudah lewat.',
    );
  }

  /*
   * Manager approval adalah baseline workflow
   * untuk leave request.
   */
  matchedRules.push(
    'Pengajuan cuti memerlukan persetujuan line manager.',
  );

  /* =======================================================
     ANNUAL LEAVE
  ======================================================= */

  if (
    input.leaveType ===
    LeaveType.ANNUAL
  ) {
    policySource.push(
      'LEV-01',
    );

    matchedRules.push(
      'Baseline cuti tahunan perusahaan adalah 14 hari kerja per tahun bagi karyawan yang memenuhi eligibility.',
    );

    const year =
      startDate
        .getUTCFullYear();

    let employeeBalance;

    try {
      employeeBalance =
        await getEmployeeLeaveBalance(
          employeeId,
          year,
        );
    } catch (
      error
    ) {
      if (
        error instanceof
        LeaveServiceError
      ) {
        throw new LeavePolicyError(
          error.code,
          error.message,
        );
      }

      throw error;
    }

    const annualBalance =
      employeeBalance
        .balances
        .find(
          (
            item,
          ) =>
            item.leaveType ===
            LeaveType.ANNUAL,
        );

    if (
      !annualBalance ||
      !annualBalance
        .balanceConfigured ||
      annualBalance
        .entitlementDays ===
        null
    ) {
      eligible =
        false;

      violations.push(
        `Saldo cuti tahunan ${year} belum dikonfigurasi.`,
      );
    } else {
      const availableDays =
        annualBalance
          .availableDays ??
        0;

      const remainingAfterRequest =
        availableDays -
        totalDays;

      balance = {
        year,

        entitlementDays:
          annualBalance
            .entitlementDays,

        approvedDays:
          annualBalance
            .approvedDays,

        pendingDays:
          annualBalance
            .pendingDays,

        availableDays,

        requestedDays:
          totalDays,

        remainingAfterRequest:
          Math.max(
            remainingAfterRequest,
            0,
          ),
      };

      if (
        totalDays >
        availableDays
      ) {
        eligible =
          false;

        violations.push(
          `Saldo cuti tahunan tidak cukup. Tersedia ${availableDays} hari, sedangkan pengajuan membutuhkan ${totalDays} hari.`,
        );
      }
    }

    /* NOTICE PERIOD */

    if (
      totalDays <= 2
    ) {
      matchedRules.push(
        'Cuti tahunan 1-2 hari idealnya diajukan minimal 7 hari sebelumnya.',
      );

      if (
        noticeDays >= 0 &&
        noticeDays < 7
      ) {
        warnings.push(
          `Pengajuan dilakukan ${noticeDays} hari sebelum tanggal cuti. Untuk cuti 1-2 hari, pengajuan idealnya dilakukan minimal 7 hari sebelumnya.`,
        );
      }
    } else {
      matchedRules.push(
        'Cuti tahunan 3 hari atau lebih idealnya diajukan minimal 14 hari sebelumnya.',
      );

      if (
        noticeDays >= 0 &&
        noticeDays < 14
      ) {
        warnings.push(
          `Pengajuan dilakukan ${noticeDays} hari sebelum tanggal cuti. Untuk cuti 3 hari atau lebih, pengajuan idealnya dilakukan minimal 14 hari sebelumnya.`,
        );
      }

      warnings.push(
        'Siapkan handover pekerjaan dan status out-of-office sebelum cuti dimulai.',
      );
    }
  }

  /* =======================================================
     SICK LEAVE
  ======================================================= */

  if (
    input.leaveType ===
    LeaveType.SICK
  ) {
    policySource.push(
      'SICK-01',
    );

    matchedRules.push(
      'Karyawan yang sakit perlu memberi tahu manager sesegera mungkin.',
    );

    warnings.push(
      'Bukti medis dapat diminta berdasarkan durasi, pola ketidakhadiran, atau kebutuhan administrasi.',
    );

    /*
     * Sick leave tidak menggunakan
     * annual leave balance.
     */
    balance =
      null;
  }

  /* =======================================================
     SPECIAL LEAVE
  ======================================================= */

  if (
    input.leaveType ===
    LeaveType.SPECIAL
  ) {
    policySource.push(
      'SPECIAL_LEAVE',
    );

    warnings.push(
      'Jenis dan eligibility cuti khusus perlu diverifikasi berdasarkan alasan pengajuan dan kebijakan yang berlaku.',
    );

    needsHumanReview =
      true;

    balance =
      null;
  }

  /* =======================================================
     UNPAID LEAVE
  ======================================================= */

  if (
    input.leaveType ===
    LeaveType.UNPAID
  ) {
    policySource.push(
      'UNPAID_LEAVE',
    );

    balance =
      null;

    /*
     * Handbook:
     * unpaid leave >5 hari kerja
     * membutuhkan approval tambahan.
     *
     * Schema MVP belum memiliki second
     * approval untuk leave sehingga
     * sementara ditandai human review.
     */
    if (
      totalDays > 5
    ) {
      warnings.push(
        'Unpaid leave lebih dari 5 hari kerja memerlukan approval Department Head dan HR.',
      );

      needsHumanReview =
        true;
    }
  }

  /* =======================================================
     FINAL RESULT
  ======================================================= */

  if (
    violations.length >
    0
  ) {
    eligible =
      false;
  }

  return {
    policyFound:
      policySource.length >
      0,

    eligible,

    needsHumanReview,

    requiresManagerApproval,

    leaveType:
      input.leaveType,

    startDate:
      formatDateOnly(
        startDate,
      ),

    endDate:
      formatDateOnly(
        endDate,
      ),

    totalDays,

    noticeDays,

    balance,

    violations,

    warnings,

    matchedRules,

    policySource,
  };
}

/* =========================================================
   DETERMINISTIC + RAG
========================================================= */

export async function validateLeavePolicyWithRag(
  input:
    ValidateLeavePolicyInput & {
      originalQuestion?:
        string;
    },
): Promise<LeavePolicyWithRagResult> {
  /*
   * 1. Deterministic engine tetap
   * menjadi authority.
   */
  const deterministic =
    await validateLeavePolicy(
      input,
    );

  /*
   * 2. Build query berdasarkan
   * leave type + actual request.
   */
  const searchQuery =
    buildLeavePolicyQuery(
      input,
      deterministic,
      input.originalQuestion,
    );

  console.info(
    '[LEAVE POLICY QUERY]',
    {
      searchQuery,
    },
  );

  /*
   * 3. Retrieve handbook evidence.
   */
  const retrieval =
    await retrieveLeavePolicyEvidence(
        searchQuery,
        input.leaveType,
    );

  const sourceFiles = [
    ...new Set(
      retrieval
        .evidence
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
   * RAG tidak boleh mengubah hard
   * deterministic eligibility.
   *
   * Jika tidak ada evidence,
   * request tetap punya hasil deterministic,
   * tetapi human review dinaikkan.
   */
  const result:
    LeavePolicyWithRagResult =
      {
        ...deterministic,

        needsHumanReview:
          deterministic
            .needsHumanReview ||
          !ragFound,

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
    '[LEAVE POLICY VALIDATION]',
    {
      leaveType:
        result.leaveType,

      eligible:
        result.eligible,

      totalDays:
        result.totalDays,

      noticeDays:
        result.noticeDays,

      ragFound:
        result.rag.found,

      evidenceCount:
        result.rag
          .evidence
          .length,

      sourceFiles:
        result.sourceFiles,

      violations:
        result.violations,

      warnings:
        result.warnings,
    },
  );

  return result;
}