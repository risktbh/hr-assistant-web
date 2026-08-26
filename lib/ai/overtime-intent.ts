import {
  tool,
} from '@langchain/core/tools';

import {
  z,
} from 'zod';

/* =========================================================
   TYPES
========================================================= */

export type OvertimeDraftResult = {
  intent:
    'CREATE_OVERTIME_REQUEST';

  stage:
    'DRAFT';

  complete:
    boolean;

  timezone:
    string;

  data: {
    startAt:
      string | null;

    endAt:
      string | null;

    reason:
      string | null;

    projectName:
      string | null;

    taskReference:
      string | null;
  };

  missingFields:
    string[];

  validationErrors:
    string[];
};

/* =========================================================
   HELPERS
========================================================= */

function cleanOptionalString(
  value:
    | string
    | undefined,
) {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned || null;
}

function normalizeDateTime(
  value:
    | string
    | undefined,
) {
  const cleaned =
    cleanOptionalString(
      value,
    );

  if (!cleaned) {
    return null;
  }

  const parsed =
    new Date(
      cleaned,
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return null;
  }

  /*
   * Jangan ubah menjadi UTC di sini.
   *
   * Kita simpan string yang diberikan
   * Gemini agar offset +07:00 masih
   * tersedia untuk confirmation UI.
   */
  return cleaned;
}

/* =========================================================
   CURRENT DATE CONTEXT
========================================================= */

export function getJakartaNowContext() {
  const now =
    new Date();

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

        hour:
          '2-digit',

        minute:
          '2-digit',

        second:
          '2-digit',

        hour12:
          false,
      },
    );

  const parts =
    formatter.formatToParts(
      now,
    );

  const get =
    (
      type: Intl.DateTimeFormatPartTypes,
    ) =>
      parts.find(
        (part) =>
          part.type ===
          type,
      )?.value ??
      '';

  const year =
    get('year');

  const month =
    get('month');

  const day =
    get('day');

  const hour =
    get('hour');

  const minute =
    get('minute');

  const second =
    get('second');

  return (
    `${year}-${month}-${day} ` +
    `${hour}:${minute}:${second} ` +
    `Asia/Jakarta (UTC+07:00)`
  );
}

/* =========================================================
   PREPARE OVERTIME TOOL
========================================================= */

export const prepareOvertimeRequestTool =
  tool(
    async ({
      startAt,
      endAt,
      reason,
      projectName,
      taskReference,
    }) => {
      const normalizedStartAt =
        normalizeDateTime(
          startAt,
        );

      const normalizedEndAt =
        normalizeDateTime(
          endAt,
        );

      const normalizedReason =
        cleanOptionalString(
          reason,
        );

      const normalizedProjectName =
        cleanOptionalString(
          projectName,
        );

      const normalizedTaskReference =
        cleanOptionalString(
          taskReference,
        );

      const missingFields:
        string[] = [];

      const validationErrors:
        string[] = [];

      /* =========================================
         REQUIRED DATA
      ========================================= */

      if (
        !normalizedStartAt
      ) {
        missingFields.push(
          'startAt',
        );
      }

      if (
        !normalizedEndAt
      ) {
        missingFields.push(
          'endAt',
        );
      }

      if (
        !normalizedReason
      ) {
        missingFields.push(
          'reason',
        );
      }

      /* =========================================
         DATE VALIDATION
      ========================================= */

      if (
        normalizedStartAt &&
        normalizedEndAt
      ) {
        const startDate =
          new Date(
            normalizedStartAt,
          );

        const endDate =
          new Date(
            normalizedEndAt,
          );

        if (
          endDate.getTime() <=
          startDate.getTime()
        ) {
          validationErrors.push(
            'Waktu selesai harus setelah waktu mulai.',
          );
        }
      }

      const result:
        OvertimeDraftResult = {
          intent:
            'CREATE_OVERTIME_REQUEST',

          stage:
            'DRAFT',

          complete:
            missingFields.length ===
              0 &&
            validationErrors.length ===
              0,

          timezone:
            'Asia/Jakarta',

          data: {
            startAt:
              normalizedStartAt,

            endAt:
              normalizedEndAt,

            reason:
              normalizedReason,

            projectName:
              normalizedProjectName,

            taskReference:
              normalizedTaskReference,
          },

          missingFields,

          validationErrors,
        };

      return JSON.stringify(
        result,
      );
    },
    {
      name:
        'prepare_overtime_request',

      description:
        `Gunakan tool ini HANYA ketika pengguna
secara eksplisit ingin membuat, mengajukan,
atau menyiapkan pengajuan kerja lembur/overtime.

Contoh:
- "Saya mau mengajukan lembur besok"
- "Tolong buat pengajuan overtime"
- "Saya perlu lembur malam ini jam 7 sampai 10"
- "Ajukan lembur untuk deployment production"

JANGAN gunakan tool ini jika pengguna hanya
bertanya tentang aturan, syarat, kebijakan,
kompensasi, atau prosedur lembur.

Tool ini HANYA membuat draft data pengajuan.
Tool ini TIDAK mengirim atau menyimpan
pengajuan ke database.`,

      schema:
        z.object({
          startAt:
            z
              .string()
              .optional()
              .describe(
                `Tanggal dan waktu mulai lembur dalam
format ISO-8601 dengan timezone Asia/Jakarta.

Contoh:
2026-08-27T19:00:00+07:00

Jika pengguna mengatakan "besok",
"harii ini", atau ekspresi relatif lainnya,
gunakan tanggal saat ini dari system prompt
untuk menentukan tanggal absolut.

Jika waktunya tidak diketahui,
jangan mengarang. Kosongkan field ini.`,
              ),

          endAt:
            z
              .string()
              .optional()
              .describe(
                `Tanggal dan waktu selesai lembur dalam
format ISO-8601 dengan timezone Asia/Jakarta.

Contoh:
2026-08-27T22:00:00+07:00

Jika waktunya tidak diketahui,
jangan mengarang. Kosongkan field ini.`,
              ),

          reason:
            z
              .string()
              .optional()
              .describe(
                `Alasan pekerjaan untuk lembur.
Contoh: production deployment,
incident handling, atau closing report.
Jangan mengarang jika pengguna belum menyebutkan.`,
              ),

          projectName:
            z
              .string()
              .optional()
              .describe(
                'Nama project jika disebutkan pengguna.',
              ),

          taskReference:
            z
              .string()
              .optional()
              .describe(
                'Ticket/task/reference seperti JIRA, issue, atau deployment ID jika disebutkan.',
              ),
        }),
    },
  );