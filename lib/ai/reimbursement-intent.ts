import {
  ReimbursementType,
} from '@prisma/client';

import {
  tool,
} from '@langchain/core/tools';

import {
  z,
} from 'zod';

/* =========================================================
   TYPES
========================================================= */

export type ReimbursementDraftData = {
  reimbursementType:
    | ReimbursementType
    | null;

  expenseDate:
    | string
    | null;

  amount:
    | string
    | null;

  currency:
    string;

  merchant:
    | string
    | null;

  reason:
    | string
    | null;

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
    | 'DOMESTIC'
    | 'INTERNATIONAL';

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

export type ReimbursementDraftResult = {
  kind:
    'REIMBURSEMENT_DRAFT';

  complete:
    boolean;

  missingFields:
    string[];

  validationErrors:
    string[];

  data:
    ReimbursementDraftData;
};

/* =========================================================
   NORMALIZERS
========================================================= */

function optionalText(
  value:
    unknown,
) {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized ||
    null;
}

function normalizeDate(
  value:
    unknown,
) {
  const normalized =
    optionalText(
      value,
    );

  if (!normalized) {
    return null;
  }

  return normalized;
}

function normalizeAmount(
  value:
    unknown,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  let normalized =
    String(
      value,
    )
      .trim()
      .replace(
        /^rp\s*/i,
        '',
      )
      .replace(
        /\s+/g,
        '',
      );

  /*
   * Indonesian thousands format:
   * 350.000
   * 1.250.000,50
   */
  if (
    /^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(
      normalized,
    )
  ) {
    normalized =
      normalized
        .replace(
          /\./g,
          '',
        )
        .replace(
          ',',
          '.',
        );
  }
  /*
   * English thousands format:
   * 350,000
   * 1,250,000.50
   */
  else if (
    /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(
      normalized,
    )
  ) {
    normalized =
      normalized.replace(
        /,/g,
        '',
      );
  }
  /*
   * Simple decimal comma:
   * 350000,50
   */
  else if (
    /^\d+,\d+$/.test(
      normalized,
    )
  ) {
    normalized =
      normalized.replace(
        ',',
        '.',
      );
  }

  const amount =
    Number(
      normalized,
    );

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <= 0
  ) {
    return normalized;
  }

  return normalized;
}

function isValidDateOnly(
  value:
    string,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      value,
    )
  ) {
    return false;
  }

  const parsed =
    new Date(
      `${value}T00:00:00.000Z`,
    );

  return (
    !Number.isNaN(
      parsed.getTime(),
    ) &&
    parsed
      .toISOString()
      .slice(
        0,
        10,
      ) ===
      value
  );
}

/* =========================================================
   TOOL
========================================================= */

export const prepareReimbursementRequestTool =
  tool(
    async (
      input,
    ) => {
      const reimbursementType =
        input.reimbursementType ??
        null;

      const expenseDate =
        normalizeDate(
          input.expenseDate,
        );

      const amount =
        normalizeAmount(
          input.amount,
        );

      const currency =
        optionalText(
          input.currency,
        )
          ?.toUpperCase() ||
        'IDR';

      const reason =
        optionalText(
          input.reason,
        );

      const data:
        ReimbursementDraftData =
        {
          reimbursementType,
          expenseDate,
          amount,
          currency,

          merchant:
            optionalText(
              input.merchant,
            ),

          reason,

          receiptUrl:
            optionalText(
              input.receiptUrl,
            ),

          receiptFileName:
            optionalText(
              input.receiptFileName,
            ),

          lostReceiptDeclaration:
            input
              .lostReceiptDeclaration,

          lateClaimReason:
            optionalText(
              input
                .lateClaimReason,
            ),

          isPersonalExpense:
            input
              .isPersonalExpense,

          paidByOtherParty:
            input
              .paidByOtherParty,

          categoryRequiresPreApproval:
            input
              .categoryRequiresPreApproval,

          preApproved:
            input
              .preApproved,

          isRoutineMealAtNormalWorkLocation:
            input
              .isRoutineMealAtNormalWorkLocation,

          relatedToBusinessTravel:
            input
              .relatedToBusinessTravel,

          relatedToQualifyingOvertime:
            input
              .relatedToQualifyingOvertime,

          authorizedEvent:
            input
              .authorizedEvent,

          travelScope:
            input
              .travelScope,

          travelEmergency:
            input
              .travelEmergency,

          perDiemDuplicate:
            input
              .perDiemDuplicate,

          includesPersonalExpense:
            input
              .includesPersonalExpense,

          personalExpenseSeparated:
            input
              .personalExpenseSeparated,

          costCenter:
            optionalText(
              input.costCenter,
            ),
        };

      const missingFields:
        string[] = [];

      const validationErrors:
        string[] = [];

      if (
        !data
          .reimbursementType
      ) {
        missingFields.push(
          'reimbursementType',
        );
      }

      if (
        !data
          .expenseDate
      ) {
        missingFields.push(
          'expenseDate',
        );
      } else if (
        !isValidDateOnly(
          data.expenseDate,
        )
      ) {
        validationErrors.push(
          'expenseDate harus menggunakan format YYYY-MM-DD dan merupakan tanggal yang valid.',
        );
      }

      if (
        !data.amount
      ) {
        missingFields.push(
          'amount',
        );
      } else {
        const parsedAmount =
          Number(
            data.amount,
          );

        if (
          !Number.isFinite(
            parsedAmount,
          ) ||
          parsedAmount <=
            0
        ) {
          validationErrors.push(
            'amount harus berupa nilai positif.',
          );
        }
      }

      if (
        !data.reason
      ) {
        missingFields.push(
          'reason',
        );
      }

      const result:
        ReimbursementDraftResult =
        {
          kind:
            'REIMBURSEMENT_DRAFT',

          complete:
            missingFields
              .length ===
              0 &&
            validationErrors
              .length ===
              0,

          missingFields,

          validationErrors,

          data,
        };

      return JSON.stringify(
        result,
      );
    },
    {
      name:
        'prepare_reimbursement_request',

      description:
        'Menyiapkan DRAFT pengajuan reimbursement dari detail yang diberikan pengguna. Tool ini tidak membuat database record dan tidak mengirim workflow. Gunakan hanya jika pengguna memang ingin membuat atau menyiapkan reimbursement request.',

      schema:
        z.object({
          reimbursementType:
            z.enum([
              'MEDICAL',
              'TRAVEL',
              'MEAL',
              'OTHER',
            ])
              .optional()
              .describe(
                'Kategori reimbursement. Jangan mengarang jika pengguna belum memberikan konteks yang cukup.',
              ),

          expenseDate:
            z.string()
              .optional()
              .describe(
                'Tanggal transaksi YYYY-MM-DD.',
              ),

          amount:
            z.union([
              z.string(),
              z.number(),
            ])
              .optional()
              .describe(
                'Nominal biaya tanpa simbol mata uang.',
              ),

          currency:
            z.string()
              .optional()
              .describe(
                'Kode mata uang, misalnya IDR.',
              ),

          merchant:
            z.string()
              .nullable()
              .optional()
              .describe(
                'Merchant/vendor/provider jika disebutkan.',
              ),

          reason:
            z.string()
              .optional()
              .describe(
                'Tujuan/alasan bisnis atau penjelasan biaya.',
              ),

          receiptUrl:
            z.string()
              .nullable()
              .optional()
              .describe(
                'URL bukti transaksi hanya jika memang tersedia.',
              ),

          receiptFileName:
            z.string()
              .nullable()
              .optional()
              .describe(
                'Nama file bukti transaksi hanya jika memang tersedia.',
              ),

          lostReceiptDeclaration:
            z.boolean()
              .optional(),

          lateClaimReason:
            z.string()
              .nullable()
              .optional(),

          isPersonalExpense:
            z.boolean()
              .optional(),

          paidByOtherParty:
            z.boolean()
              .optional(),

          categoryRequiresPreApproval:
            z.boolean()
              .optional(),

          preApproved:
            z.boolean()
              .optional(),

          isRoutineMealAtNormalWorkLocation:
            z.boolean()
              .optional(),

          relatedToBusinessTravel:
            z.boolean()
              .optional(),

          relatedToQualifyingOvertime:
            z.boolean()
              .optional(),

          authorizedEvent:
            z.boolean()
              .optional(),

          travelScope:
            z.enum([
              'DOMESTIC',
              'INTERNATIONAL',
            ])
              .optional(),

          travelEmergency:
            z.boolean()
              .optional(),

          perDiemDuplicate:
            z.boolean()
              .optional(),

          includesPersonalExpense:
            z.boolean()
              .optional(),

          personalExpenseSeparated:
            z.boolean()
              .optional(),

          costCenter:
            z.string()
              .nullable()
              .optional(),
        }),
    },
  );
