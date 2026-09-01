import {
  ReimbursementStatus,
  ReimbursementType,
} from '@prisma/client';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getEmployeeReimbursementRequests,
  getReimbursementRequest,
  ReimbursementServiceError,
} from '@/lib/services/reimbursement-service';

export const runtime =
  'nodejs';

/* =========================================================
   SERIALIZER
========================================================= */

function serializeReimbursement(
  request: any,
) {
  return {
    id:
      request.id,

    requestCode:
      request.requestCode,

    reimbursementType:
      request.reimbursementType,

    expenseDate:
      request.expenseDate
        .toISOString()
        .slice(
          0,
          10,
        ),

    amount:
      request.amount
        .toString(),

    currency:
      request.currency,

    merchant:
      request.merchant,

    reason:
      request.reason,

    receiptUrl:
      request.receiptUrl,

    receiptFileName:
      request.receiptFileName,

    status:
      request.status,

    managerDecision:
      request.managerDecision,

    managerDecisionNote:
      request.managerDecisionNote,

    managerDecidedAt:
      request.managerDecidedAt
        ?.toISOString() ??
      null,

    policySource:
      request.policySource,

    workflowStatus:
      request.workflowStatus,

    workflowRunId:
      request.workflowRunId,

    requestedAt:
      request.requestedAt
        .toISOString(),

    createdAt:
      request.createdAt
        .toISOString(),

    updatedAt:
      request.updatedAt
        .toISOString(),

    manager:
      request.manager
        ? {
            name:
              request.manager.name,

            position:
              request.manager.position,

            department:
              request.manager.department,
          }
        : null,
  };
}

/* =========================================================
   ERROR HANDLER
========================================================= */

function handleError(
  error: unknown,
) {
  console.error(
    '[REIMBURSEMENT API ERROR]',
    error,
  );

  if (
    error instanceof
    ReimbursementServiceError
  ) {
    return NextResponse.json(
      {
        success:
          false,

        error: {
          code:
            error.code,

          message:
            error.message,
        },
      },
      {
        status:
          error.status,
      },
    );
  }

  return NextResponse.json(
    {
      success:
        false,

      error: {
        code:
          'INTERNAL_SERVER_ERROR',

        message:
          'Terjadi kesalahan internal saat membaca reimbursement.',
      },
    },
    {
      status: 500,
    },
  );
}

/* =========================================================
   GET /api/reimbursement
========================================================= */

/*
 * Identity source untuk MVP:
 *
 * DEMO_EMPLOYEE_ID
 *
 * Jangan menerima employeeId dari query/body.
 * Saat Auth/RBAC tersedia, ganti dengan authenticated session.
 *
 * Examples:
 *
 * GET /api/reimbursement
 * GET /api/reimbursement?limit=10
 * GET /api/reimbursement?status=PENDING
 * GET /api/reimbursement?type=MEDICAL
 * GET /api/reimbursement?requestId=RB-20260901-ABC123
 */

export async function GET(
  request: NextRequest,
) {
  try {
    const employeeId =
      process.env
        .DEMO_EMPLOYEE_ID
        ?.trim();

    if (!employeeId) {
      return NextResponse.json(
        {
          success:
            false,

          error: {
            code:
              'EMPLOYEE_CONTEXT_NOT_CONFIGURED',

            message:
              'Server belum memiliki employee context.',
          },
        },
        {
          status: 500,
        },
      );
    }

    const url =
      new URL(
        request.url,
      );

    const requestId =
      url.searchParams
        .get(
          'requestId',
        )
        ?.trim();

    /* =====================================================
       SINGLE REQUEST
    ===================================================== */

    if (requestId) {
      try {
        const reimbursement =
          await getReimbursementRequest(
            requestId,
          );

        /*
         * SECURITY:
         *
         * getReimbursementRequest() dapat mencari
         * berdasarkan id / requestCode secara global.
         *
         * Jangan pernah expose reimbursement
         * milik employee lain.
         */
        if (
          reimbursement.employeeId !==
          employeeId
        ) {
          return NextResponse.json(
            {
              success:
                false,

              error: {
                code:
                  'REIMBURSEMENT_NOT_FOUND',

                message:
                  'Pengajuan reimbursement tidak ditemukan.',
              },
            },
            {
              status: 404,
            },
          );
        }

        return NextResponse.json({
          success:
            true,

          data:
            serializeReimbursement(
              reimbursement,
            ),
        });
      } catch (
        error
      ) {
        if (
          error instanceof
            ReimbursementServiceError &&
          error.code ===
            'REIMBURSEMENT_NOT_FOUND'
        ) {
          return NextResponse.json(
            {
              success:
                false,

              error: {
                code:
                  'REIMBURSEMENT_NOT_FOUND',

                message:
                  'Pengajuan reimbursement tidak ditemukan.',
              },
            },
            {
              status: 404,
            },
          );
        }

        throw error;
      }
    }

    /* =====================================================
       FILTERS
    ===================================================== */

    const statusRaw =
      url.searchParams
        .get(
          'status',
        )
        ?.trim()
        .toUpperCase();

    const typeRaw =
      url.searchParams
        .get(
          'type',
        )
        ?.trim()
        .toUpperCase();

    const limitRaw =
      url.searchParams
        .get(
          'limit',
        )
        ?.trim();

    let status:
      ReimbursementStatus |
      undefined;

    if (statusRaw) {
      if (
        !Object.values(
          ReimbursementStatus,
        ).includes(
          statusRaw as
            ReimbursementStatus,
        )
      ) {
        return NextResponse.json(
          {
            success:
              false,

            error: {
              code:
                'INVALID_STATUS',

              message:
                'Filter status reimbursement tidak valid.',
            },
          },
          {
            status: 400,
          },
        );
      }

      status =
        statusRaw as
          ReimbursementStatus;
    }

    let reimbursementType:
      ReimbursementType |
      undefined;

    if (typeRaw) {
      if (
        !Object.values(
          ReimbursementType,
        ).includes(
          typeRaw as
            ReimbursementType,
        )
      ) {
        return NextResponse.json(
          {
            success:
              false,

            error: {
              code:
                'INVALID_REIMBURSEMENT_TYPE',

              message:
                'Filter jenis reimbursement tidak valid.',
            },
          },
          {
            status: 400,
          },
        );
      }

      reimbursementType =
        typeRaw as
          ReimbursementType;
    }

    let limit =
      20;

    if (limitRaw) {
      const parsed =
        Number(
          limitRaw,
        );

      if (
        !Number.isInteger(
          parsed,
        ) ||
        parsed < 1 ||
        parsed > 100
      ) {
        return NextResponse.json(
          {
            success:
              false,

            error: {
              code:
                'INVALID_LIMIT',

              message:
                'Limit harus berupa angka bulat antara 1 dan 100.',
            },
          },
          {
            status: 400,
          },
        );
      }

      limit =
        parsed;
    }

    /* =====================================================
       EMPLOYEE-SCOPED LIST
    ===================================================== */

    const reimbursements =
      await getEmployeeReimbursementRequests(
        employeeId,
        {
          limit,
          status,
          reimbursementType,
        },
      );

    return NextResponse.json({
      success:
        true,

      data: {
        count:
          reimbursements.length,

        requests:
          reimbursements.map(
            serializeReimbursement,
          ),
      },
    });
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}
