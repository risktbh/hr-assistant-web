import type {
  PrismaClient,
} from '@prisma/client';

import {
  tool,
} from '@langchain/core/tools';

import {
  z,
} from 'zod';

/* =========================================================
   SCHEMA
========================================================= */

const reimbursementStatusSchema =
  z.object({
    mode:
      z
        .enum([
          'LATEST',
          'BY_REQUEST_CODE',
          'SUMMARY',
          'PENDING',
        ])
        .optional()
        .default(
          'LATEST',
        )
        .describe(
          'LATEST untuk klaim terbaru, BY_REQUEST_CODE untuk kode RB tertentu, SUMMARY untuk ringkasan jumlah klaim, PENDING untuk daftar klaim yang masih pending.',
        ),

    requestCode:
      z
        .string()
        .trim()
        .optional()
        .describe(
          'Kode reimbursement seperti RB-20260902-7A987A. Hanya isi jika pengguna menyebut request code.',
        ),

    status:
      z
        .enum([
          'DRAFT',
          'PENDING',
          'APPROVED',
          'REJECTED',
          'CANCELLED',
        ])
        .optional()
        .describe(
          'Filter business status jika pengguna secara eksplisit meminta status tertentu.',
        ),

    reimbursementType:
      z
        .enum([
          'MEDICAL',
          'TRAVEL',
          'MEAL',
          'OTHER',
        ])
        .optional()
        .describe(
          'Filter jenis reimbursement jika pengguna secara eksplisit menyebut kategorinya.',
        ),

    limit:
      z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .default(5)
        .describe(
          'Jumlah request terbaru yang ingin dikembalikan untuk mode PENDING atau daftar. Maksimal 10.',
        ),
  });

/* =========================================================
   HELPERS
========================================================= */

const REQUEST_CODE_PATTERN =
  /^RB-\d{8}-[A-F0-9]{6}$/;

function dateOnly(
  value:
    Date,
) {
  return value
    .toISOString()
    .slice(
      0,
      10,
    );
}

function isoOrNull(
  value:
    Date |
    null,
) {
  return value
    ? value.toISOString()
    : null;
}

/* =========================================================
   TOOL
========================================================= */

export function createGetReimbursementStatusTool({
  prisma,
  employeeId,
}: {
  prisma:
    PrismaClient;

  employeeId:
    string;
}) {
  const scopedEmployeeId =
    employeeId
      .trim();

  if (
    !scopedEmployeeId
  ) {
    throw new Error(
      'Employee context untuk get_reimbursement_status tidak tersedia.',
    );
  }

  return tool(
    async (
      input,
    ) => {
      const rawRequestCode =
        input
          .requestCode
          ?.trim();

      const requestCode =
        rawRequestCode
          ?.toUpperCase();

      const requestedStatus =
        input.status;

      const requestedType =
        input
          .reimbursementType;

      const limit =
        input.limit ??
        5;

      let mode =
        input.mode ??
        'LATEST';

      /*
       * Request code adalah intent paling spesifik.
       *
       * Jika model lupa mengganti mode tetapi sudah
       * memberikan requestCode, tetap arahkan ke
       * BY_REQUEST_CODE.
       */
      if (
        requestCode &&
        mode !==
          'BY_REQUEST_CODE'
      ) {
        mode =
          'BY_REQUEST_CODE';
      }

      /*
       * Semua data selalu dibaca ulang dari DB pada
       * setiap invocation. Chat history BUKAN source
       * of truth.
       *
       * Employee scope berasal dari server, bukan
       * dari argumen LLM.
       */
      const requests =
        await prisma
          .reimbursementRequest
          .findMany({
            where: {
              employeeId:
                scopedEmployeeId,
            },

            include: {
              manager: {
                select: {
                  id:
                    true,

                  name:
                    true,

                  position:
                    true,

                  department:
                    true,
                },
              },
            },

            orderBy: {
              requestedAt:
                'desc',
            },

            take:
              100,
          });

      const summary = {
        total:
          requests.length,

        draft:
          requests.filter(
            (
              request,
            ) =>
              request.status ===
              'DRAFT',
          ).length,

        pending:
          requests.filter(
            (
              request,
            ) =>
              request.status ===
              'PENDING',
          ).length,

        approved:
          requests.filter(
            (
              request,
            ) =>
              request.status ===
              'APPROVED',
          ).length,

        rejected:
          requests.filter(
            (
              request,
            ) =>
              request.status ===
              'REJECTED',
          ).length,

        cancelled:
          requests.filter(
            (
              request,
            ) =>
              request.status ===
              'CANCELLED',
          ).length,

        byType: {
          medical:
            requests.filter(
              (
                request,
              ) =>
                request
                  .reimbursementType ===
                'MEDICAL',
            ).length,

          travel:
            requests.filter(
              (
                request,
              ) =>
                request
                  .reimbursementType ===
                'TRAVEL',
            ).length,

          meal:
            requests.filter(
              (
                request,
              ) =>
                request
                  .reimbursementType ===
                'MEAL',
            ).length,

          other:
            requests.filter(
              (
                request,
              ) =>
                request
                  .reimbursementType ===
                'OTHER',
            ).length,
        },
      };

      const serialize =
        (
          request:
            (typeof requests)[number],
        ) => ({
          requestCode:
            request
              .requestCode,

          reimbursementType:
            request
              .reimbursementType,

          expenseDate:
            dateOnly(
              request
                .expenseDate,
            ),

          amount:
            request
              .amount
              .toString(),

          currency:
            request
              .currency,

          merchant:
            request
              .merchant,

          reason:
            request
              .reason,

          receiptFileName:
            request
              .receiptFileName,

          hasReceipt:
            Boolean(
              request
                .receiptUrl ||
              request
                .receiptFileName,
            ),

          /*
           * Business status dan workflow status
           * sengaja dipisahkan.
           *
           * workflowStatus=FAILED tidak berarti
           * reimbursement ditolak.
           */
          status:
            request
              .status,

          managerDecision:
            request
              .managerDecision,

          managerDecisionNote:
            request
              .managerDecisionNote,

          managerDecidedAt:
            isoOrNull(
              request
                .managerDecidedAt,
            ),

          workflowStatus:
            request
              .workflowStatus,

          workflowRunId:
            request
              .workflowRunId,

          policySource:
            request
              .policySource,

          requestedAt:
            request
              .requestedAt
              .toISOString(),

          updatedAt:
            request
              .updatedAt
              .toISOString(),

          manager:
            request.manager
              ? {
                  name:
                    request
                      .manager
                      .name,

                  position:
                    request
                      .manager
                      .position,

                  department:
                    request
                      .manager
                      .department,
                }
              : null,
        });

      const baseMeta = {
        type:
          'REIMBURSEMENT_STATUS_RESULT',

        source:
          'TRANSACTIONAL_DB',

        employeeScoped:
          true,

        freshReadAt:
          new Date()
            .toISOString(),

        businessStatusIsAuthoritative:
          true,

        workflowStatusIsAutomationOnly:
          true,
      } as const;

      /* =====================================================
         BY REQUEST CODE
      ===================================================== */

      if (
        mode ===
        'BY_REQUEST_CODE'
      ) {
        if (
          !requestCode
        ) {
          return JSON.stringify({
            ...baseMeta,

            found:
              false,

            mode,

            reason:
              'REQUEST_CODE_REQUIRED',

            message:
              'Kode reimbursement diperlukan untuk pencarian berdasarkan request code.',

            summary,
          });
        }

        if (
          !REQUEST_CODE_PATTERN.test(
            requestCode,
          )
        ) {
          return JSON.stringify({
            ...baseMeta,

            found:
              false,

            mode,

            reason:
              'INVALID_REQUEST_CODE_FORMAT',

            message:
              'Format request code reimbursement tidak valid.',

            query: {
              requestCode,
            },

            summary,
          });
        }

        const selected =
          requests.find(
            (
              request,
            ) =>
              request
                .requestCode
                .toUpperCase() ===
              requestCode,
          );

        /*
         * Jangan membedakan antara:
         * - code memang tidak ada
         * - code ada tetapi milik employee lain
         *
         * Ini mencegah ownership enumeration.
         */
        if (
          !selected
        ) {
          return JSON.stringify({
            ...baseMeta,

            found:
              false,

            mode,

            reason:
              'NOT_FOUND_OR_NOT_OWNED',

            message:
              'Pengajuan reimbursement tidak ditemukan.',

            query: {
              requestCode,
            },

            summary,
          });
        }

        return JSON.stringify({
          ...baseMeta,

          found:
            true,

          mode,

          query: {
            requestCode,
          },

          summary,

          count:
            1,

          latest:
            serialize(
              selected,
            ),

          requests: [
            serialize(
              selected,
            ),
          ],
        });
      }

      /* =====================================================
         FILTERS
      ===================================================== */

      let filtered =
        requests;

      const effectiveStatus =
        mode ===
          'PENDING'
          ? 'PENDING'
          : requestedStatus;

      if (
        effectiveStatus
      ) {
        filtered =
          filtered.filter(
            (
              request,
            ) =>
              request.status ===
              effectiveStatus,
          );
      }

      if (
        requestedType
      ) {
        filtered =
          filtered.filter(
            (
              request,
            ) =>
              request
                .reimbursementType ===
              requestedType,
          );
      }

      /* =====================================================
         SUMMARY
      ===================================================== */

      if (
        mode ===
        'SUMMARY'
      ) {
        return JSON.stringify({
          ...baseMeta,

          found:
            requests.length >
            0,

          mode,

          summary,

          filteredCount:
            filtered.length,

          filter: {
            status:
              effectiveStatus ??
              null,

            reimbursementType:
              requestedType ??
              null,
          },

          recentRequests:
            filtered
              .slice(
                0,
                limit,
              )
              .map(
                serialize,
              ),
        });
      }

      /* =====================================================
         PENDING
      ===================================================== */

      if (
        mode ===
        'PENDING'
      ) {
        const selected =
          filtered.slice(
            0,
            limit,
          );

        return JSON.stringify({
          ...baseMeta,

          found:
            selected.length >
            0,

          mode,

          summary,

          count:
            selected.length,

          filter: {
            status:
              'PENDING',

            reimbursementType:
              requestedType ??
              null,
          },

          latest:
            selected[0]
              ? serialize(
                  selected[0],
                )
              : null,

          requests:
            selected.map(
              serialize,
            ),
        });
      }

      /* =====================================================
         LATEST
      ===================================================== */

      const selected =
        filtered.slice(
          0,
          1,
        );

      return JSON.stringify({
        ...baseMeta,

        found:
          selected.length >
          0,

        mode:
          'LATEST',

        summary,

        query: {
          status:
            effectiveStatus ??
            null,

          reimbursementType:
            requestedType ??
            null,
        },

        count:
          selected.length,

        latest:
          selected[0]
            ? serialize(
                selected[0],
              )
            : null,

        requests:
          selected.map(
            serialize,
          ),
      });
    },
    {
      name:
        'get_reimbursement_status',

      description:
        'Baca status/progress reimbursement milik employee aktif langsung dari database transactional. Gunakan untuk pertanyaan seperti "status reimbursement saya?", "status RB-... bagaimana?", "berapa reimbursement saya yang masih pending?", atau ringkasan klaim reimbursement. Employee identity sudah di-scope oleh server. Jangan gunakan RAG atau chat history sebagai source of truth status transaksi.',

      schema:
        reimbursementStatusSchema,
    },
  );
}
