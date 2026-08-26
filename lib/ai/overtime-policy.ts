import {
  GoogleGenerativeAIEmbeddings,
} from '@langchain/google-genai';

import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';

import {
  prisma,
} from '@/lib/db/prisma';

import {
  invokeGemini,
} from '@/lib/ai/gemini';

import type {
  OvertimeDraftResult,
} from '@/lib/ai/overtime-intent';

/* =========================================================
   TYPES
========================================================= */

export type PolicyRuleResult =
  'PASS' |
  'WARN' |
  'FAIL';

export type OvertimePolicyRule = {
  rule: string;

  result:
    PolicyRuleResult;

  evidence:
    string;
};

export type OvertimePolicyValidation = {
  policyFound:
    boolean;

  eligible:
    boolean;

  needsHumanReview:
    boolean;

  requiresManagerApproval:
    boolean;

  requiresSecondApproval:
    boolean;

  durationMinutes:
    number;

  violations:
    string[];

  warnings:
    string[];

  matchedRules:
    OvertimePolicyRule[];

  sourceFiles:
    string[];

  confidence:
    number;
};

type RetrievedPolicyChunk = {
  content:
    string;

  metadata:
    any;

  similarity:
    number;
};

type ValidateOvertimeInput = {
  draft:
    OvertimeDraftResult;

  originalQuestion:
    string;

  signal?:
    AbortSignal;
};

/* =========================================================
   CONSTANTS
========================================================= */

const SIMILARITY_THRESHOLD =
  0.60;

const MAX_CONTEXT_CHUNKS =
  6;

/* =========================================================
   TEXT HELPER
========================================================= */

function extractText(
  content: any,
): string {
  if (
    content == null
  ) {
    return '';
  }

  if (
    typeof content ===
    'string'
  ) {
    return content;
  }

  if (
    typeof content !==
    'object'
  ) {
    return '';
  }

  if (
    Array.isArray(content)
  ) {
    return content
      .map(
        (part) =>
          extractText(part),
      )
      .filter(Boolean)
      .join('');
  }

  if (
    typeof content.text ===
    'string'
  ) {
    return content.text;
  }

  if (
    typeof content.content ===
    'string'
  ) {
    return content.content;
  }

  if (
    content.content
  ) {
    return extractText(
      content.content,
    );
  }

  if (
    Array.isArray(
      content.parts,
    )
  ) {
    return content.parts
      .map(
        (part: any) =>
          extractText(part),
      )
      .filter(Boolean)
      .join('');
  }

  return '';
}

/* =========================================================
   JSON PARSER
========================================================= */

function parseJsonObject(
  text: string,
) {
  const cleaned =
    text
      .replace(
        /```json/gi,
        '',
      )
      .replace(
        /```/g,
        '',
      )
      .trim();

  const firstBrace =
    cleaned.indexOf(
      '{',
    );

  const lastBrace =
    cleaned.lastIndexOf(
      '}',
    );

  if (
    firstBrace === -1 ||
    lastBrace === -1 ||
    lastBrace <
      firstBrace
  ) {
    throw new Error(
      'JSON object tidak ditemukan pada response policy validator.',
    );
  }

  return JSON.parse(
    cleaned.slice(
      firstBrace,
      lastBrace + 1,
    ),
  );
}

/* =========================================================
   ARRAY HELPER
========================================================= */

function normalizeStringArray(
  value: unknown,
): string[] {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return value
    .filter(
      (
        item,
      ): item is string =>
        typeof item ===
        'string',
    )
    .map(
      (item) =>
        item.trim(),
    )
    .filter(Boolean);
}

/* =========================================================
   DURATION
========================================================= */

function calculateDurationMinutes(
  draft:
    OvertimeDraftResult,
) {
  const startAt =
    draft.data.startAt;

  const endAt =
    draft.data.endAt;

  if (
    !startAt ||
    !endAt
  ) {
    return 0;
  }

  const start =
    new Date(
      startAt,
    );

  const end =
    new Date(
      endAt,
    );

  if (
    Number.isNaN(
      start.getTime(),
    ) ||
    Number.isNaN(
      end.getTime(),
    )
  ) {
    return 0;
  }

  return Math.max(
    0,
    Math.round(
      (
        end.getTime() -
        start.getTime()
      ) /
        60000,
    ),
  );
}

/* =========================================================
   SOURCE HELPER
========================================================= */

function getSourceName(
  chunk:
    RetrievedPolicyChunk,
) {
  const rawSource =
    chunk
      ?.metadata
      ?.source;

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
      .pop() ??
    null
  );
}

/* =========================================================
   MAIN RAG POLICY VALIDATION
========================================================= */

export async function validateOvertimeDraftWithRag(
  input:
    ValidateOvertimeInput,
): Promise<OvertimePolicyValidation> {
  const {
    draft,
    originalQuestion,
    signal,
  } = input;

  const durationMinutes =
    calculateDurationMinutes(
      draft,
    );

  /*
   * Policy validation hanya dilakukan
   * terhadap draft lengkap.
   */
  if (
    !draft.complete ||
    draft.missingFields.length >
      0 ||
    draft.validationErrors.length >
      0
  ) {
    return {
      policyFound:
        false,

      eligible:
        false,

      needsHumanReview:
        false,

      requiresManagerApproval:
        false,

      requiresSecondApproval:
        false,

      durationMinutes,

      violations: [],

      warnings: [
        'Draft overtime belum lengkap sehingga policy validation belum dijalankan.',
      ],

      matchedRules: [],

      sourceFiles: [],

      confidence:
        0,
    };
  }

  const apiKey =
    process.env
      .GOOGLE_API_KEY ||
    process.env
      .GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Gemini API key tidak tersedia untuk policy validation.',
    );
  }

  /* =======================================================
     BUILD SPECIALIZED SEARCH QUERY
  ======================================================= */

  const searchQuery = `
kebijakan kerja lembur overtime,
overtime request,
pengajuan lembur,
persetujuan line manager,
persetujuan department head,
batas jam lembur,
durasi lembur,
kompensasi lembur,
jam aktual,
emergency overtime,
fatigue dan keselamatan.

Pertanyaan pengguna:
${originalQuestion}

Alasan:
${draft.data.reason ?? '-'}

Durasi:
${durationMinutes} menit
`.trim();

  console.info(
    '[OVERTIME POLICY QUERY]',
    {
      searchQuery,
    },
  );

  /* =======================================================
     EMBEDDING
  ======================================================= */

  const embeddings =
    new GoogleGenerativeAIEmbeddings(
      {
        model:
          'gemini-embedding-2',

        apiKey,
      },
    );

  const queryVector =
    await embeddings.embedQuery(
      searchQuery,
    );

  const vectorString =
    `[${queryVector.join(
      ',',
    )}]`;

  /* =======================================================
     VECTOR SEARCH
  ======================================================= */

  const candidateChunks:
    RetrievedPolicyChunk[] =
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
    '[OVERTIME POLICY RETRIEVAL]',
    candidateChunks.map(
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
            chunk,
          ),

        preview:
          chunk.content
            ?.slice(
              0,
              140,
            ),
      }),
    ),
  );

  /* =======================================================
     SIMILARITY FILTER
  ======================================================= */

  const relevantChunks =
    candidateChunks
      .filter(
        (chunk) =>
          Number(
            chunk.similarity,
          ) >=
          SIMILARITY_THRESHOLD,
      )
      .slice(
        0,
        MAX_CONTEXT_CHUNKS,
      );

  const sourceFiles = [
    ...new Set(
      relevantChunks
        .map(
          getSourceName,
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

  console.info(
    '[OVERTIME POLICY FILTER]',
    {
      threshold:
        SIMILARITY_THRESHOLD,

      candidates:
        candidateChunks.length,

      accepted:
        relevantChunks.length,

      sources:
        sourceFiles,
    },
  );

  /* =======================================================
     NO RELEVANT POLICY
  ======================================================= */

  if (
    relevantChunks.length ===
    0
  ) {
    return {
      policyFound:
        false,

      eligible:
        false,

      needsHumanReview:
        true,

      requiresManagerApproval:
        false,

      requiresSecondApproval:
        false,

      durationMinutes,

      violations: [
        'Kebijakan overtime yang cukup relevan tidak ditemukan pada knowledge base.',
      ],

      warnings: [],

      matchedRules: [],

      sourceFiles: [],

      confidence:
        0,
    };
  }

  /* =======================================================
     BUILD POLICY CONTEXT
  ======================================================= */

  const policyContext =
    relevantChunks
      .map(
        (
          chunk,
          index,
        ) => {
          const source =
            getSourceName(
              chunk,
            ) ??
            'Unknown source';

          return `
[POLICY CHUNK ${index + 1}]
Source: ${source}
Similarity: ${Number(
            chunk.similarity,
          ).toFixed(4)}

${chunk.content}
`.trim();
        },
      )
      .join(
        '\n\n---\n\n',
      );

  /* =======================================================
     POLICY VALIDATOR PROMPT
  ======================================================= */

  const systemPrompt = `
Anda adalah Overtime Policy Validator.

Tugas Anda adalah mengevaluasi draft pengajuan
lembur HANYA menggunakan POLICY CONTEXT
yang diberikan.

JANGAN menggunakan pengetahuan eksternal.
JANGAN mengarang aturan yang tidak ditemukan
di POLICY CONTEXT.

Return HANYA valid JSON.
Jangan gunakan markdown.
Jangan gunakan code fence.

Format wajib:

{
  "eligible": true,
  "needsHumanReview": false,
  "requiresManagerApproval": true,
  "requiresSecondApproval": false,
  "violations": [],
  "warnings": [],
  "matchedRules": [
    {
      "rule": "nama aturan",
      "result": "PASS",
      "evidence": "ringkasan bukti dari policy"
    }
  ],
  "confidence": 0.95
}

ATURAN VALIDASI:

- eligible=true hanya jika tidak terdapat
  pelanggaran kebijakan yang membuat request
  tidak dapat diajukan.

- violations berisi pelanggaran yang harus
  diperbaiki sebelum request dapat dikirim.

- warnings berisi risiko atau kondisi yang
  tidak otomatis membatalkan request.

- needsHumanReview=true jika policy context
  tidak cukup untuk mengambil keputusan,
  terdapat aturan ambigu, atau diperlukan
  informasi employee yang belum tersedia.

- requiresManagerApproval=true jika policy
  mengharuskan line manager approval.

- requiresSecondApproval=true jika kondisi
  draft memenuhi aturan yang membutuhkan
  approval tambahan.

- matchedRules harus menjelaskan aturan yang
  benar-benar ditemukan dalam context.

- result hanya:
  PASS
  WARN
  FAIL

- confidence berupa angka 0 sampai 1.
`.trim();

  const draftPayload = {
    startAt:
      draft.data.startAt,

    endAt:
      draft.data.endAt,

    durationMinutes,

    reason:
      draft.data.reason,

    projectName:
      draft.data.projectName,

    taskReference:
      draft.data.taskReference,

    timezone:
      draft.timezone,
  };

  const messages = [
    new SystemMessage(
      systemPrompt,
    ),

    new HumanMessage(
      `
DRAFT OVERTIME:

${JSON.stringify(
  draftPayload,
  null,
  2,
)}

POLICY CONTEXT:

${policyContext}

Evaluasi draft berdasarkan policy context.
`.trim(),
    ),
  ];

  /* =======================================================
     VALIDATION LLM CALL
  ======================================================= */

  try {
    const result =
      await invokeGemini(
        messages,
        {
          stage:
            'overtime-policy-validation',

          signal,
        },
      );

    const response =
      result.response as AIMessage;

    const responseText =
      typeof response?.text ===
        'string'
        ? response.text
        : extractText(
            response?.content,
          );

    const parsed:
      any =
      parseJsonObject(
        responseText,
      );

    const violations =
      normalizeStringArray(
        parsed.violations,
      );

    const warnings =
      normalizeStringArray(
        parsed.warnings,
      );

    const matchedRules:
      OvertimePolicyRule[] =
      Array.isArray(
        parsed.matchedRules,
      )
        ? parsed.matchedRules
            .filter(
              (rule: any) =>
                rule &&
                typeof rule.rule ===
                  'string',
            )
            .map(
              (rule: any) => {
                const rawResult =
                  String(
                    rule.result ??
                    'WARN',
                  ).toUpperCase();

                const normalizedResult:
                  PolicyRuleResult =
                  rawResult ===
                    'PASS' ||
                  rawResult ===
                    'FAIL'
                    ? rawResult
                    : 'WARN';

                return {
                  rule:
                    String(
                      rule.rule,
                    ),

                  result:
                    normalizedResult,

                  evidence:
                    typeof rule.evidence ===
                      'string'
                      ? rule.evidence
                      : '',
                };
              },
            )
        : [];

    let confidence =
      Number(
        parsed.confidence,
      );

    if (
      !Number.isFinite(
        confidence,
      )
    ) {
      confidence =
        0;
    }

    confidence =
      Math.max(
        0,
        Math.min(
          confidence,
          1,
        ),
      );

    /*
     * Defensive rule:
     * jika ada violation, jangan boleh eligible.
     */
    const eligible =
      violations.length > 0
        ? false
        : Boolean(
            parsed.eligible,
          );

    const validation:
      OvertimePolicyValidation = {
        policyFound:
          true,

        eligible,

        needsHumanReview:
          Boolean(
            parsed
              .needsHumanReview,
          ),

        requiresManagerApproval:
          Boolean(
            parsed
              .requiresManagerApproval,
          ),

        requiresSecondApproval:
          Boolean(
            parsed
              .requiresSecondApproval,
          ),

        durationMinutes,

        violations,

        warnings,

        matchedRules,

        sourceFiles,

        confidence,
      };

    console.info(
      '[OVERTIME POLICY VALIDATION]',
      validation,
    );

    return validation;
  } catch (
    error
  ) {
    console.error(
      '[OVERTIME POLICY VALIDATION ERROR]',
      error,
    );

    /*
     * Jangan menganggap eligible
     * ketika validator gagal.
     */
    return {
      policyFound:
        true,

      eligible:
        false,

      needsHumanReview:
        true,

      requiresManagerApproval:
        false,

      requiresSecondApproval:
        false,

      durationMinutes,

      violations: [],

      warnings: [
        'Policy validation tidak dapat diselesaikan secara otomatis.',
      ],

      matchedRules: [],

      sourceFiles,

      confidence:
        0,
    };
  }
}