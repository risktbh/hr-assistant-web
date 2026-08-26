import {
  OvertimeStatus,
  Prisma,
} from '@prisma/client';

import {
  createOvertimeRequest,
  getEmployeeOvertimeRequests,
  getOvertimeRequest,
  OvertimeServiceError,
} from '@/lib/services/overtime-service';

export const runtime = 'nodejs';

/* =========================================================
   HELPERS
========================================================= */

function errorResponse(
  message: string,
  code: string,
  status: number,
  detail?: unknown,
) {
  return Response.json(
    {
      success: false,
      error: message,
      code,

      ...(detail
        ? {
            detail,
          }
        : {}),
    },
    {
      status,
    },
  );
}

function handleServiceError(
  error: unknown,
) {
  if (
    error instanceof
    OvertimeServiceError
  ) {
    return errorResponse(
      error.message,
      error.code,
      error.status,
    );
  }

  console.error(
    '[OVERTIME API ERROR]',
    error,
  );

  return errorResponse(
    'Terjadi kesalahan pada server.',
    'INTERNAL_SERVER_ERROR',
    500,
  );
}

/* =========================================================
   POST /api/overtime
========================================================= */

/*
 * Membuat overtime request baru.
 *
 * Untuk sekarang endpoint ini adalah
 * TEST API.
 *
 * Belum menggunakan authenticated user.
 * employeeId masih diberikan manual.
 */

export async function POST(
  req: Request,
) {
  try {
    const body =
      await req.json();

    const employeeId =
      typeof body?.employeeId ===
      'string'
        ? body.employeeId.trim()
        : '';

    const startAt =
      body?.startAt;

    const endAt =
      body?.endAt;

    const reason =
      typeof body?.reason ===
      'string'
        ? body.reason.trim()
        : '';

    /* =====================================================
       BASIC API VALIDATION
    ===================================================== */

    if (!employeeId) {
      return errorResponse(
        'employeeId wajib diisi.',
        'EMPLOYEE_REQUIRED',
        400,
      );
    }

    if (!startAt) {
      return errorResponse(
        'startAt wajib diisi.',
        'START_AT_REQUIRED',
        400,
      );
    }

    if (!endAt) {
      return errorResponse(
        'endAt wajib diisi.',
        'END_AT_REQUIRED',
        400,
      );
    }

    if (!reason) {
      return errorResponse(
        'reason wajib diisi.',
        'REASON_REQUIRED',
        400,
      );
    }

    /* =====================================================
       CREATE VIA SERVICE
    ===================================================== */

    const request =
      await createOvertimeRequest(
        {
          employeeId,

          startAt,

          endAt,

          reason,

          timezone:
            typeof body?.timezone ===
            'string'
              ? body.timezone
              : undefined,

          projectName:
            typeof body
              ?.projectName ===
            'string'
              ? body.projectName
              : undefined,

          taskReference:
            typeof body
              ?.taskReference ===
            'string'
              ? body.taskReference
              : undefined,

          policyResult:
            body?.policyResult &&
            typeof body
              .policyResult ===
              'object'
              ? (body
                  .policyResult as Prisma.InputJsonValue)
              : undefined,

          policySource:
            typeof body
              ?.policySource ===
            'string'
              ? body.policySource
              : undefined,

          /*
           * Untuk test sekarang.
           *
           * Nanti actor ini berasal
           * dari authentication / Agent.
           */
          actorType:
            typeof body
              ?.actorType ===
            'string'
              ? body.actorType
              : 'MANUAL_TEST',

          actorId:
            typeof body
              ?.actorId ===
            'string'
              ? body.actorId
              : employeeId,
        },
      );

    console.info(
      '[OVERTIME API] Request created',
      {
        id:
          request.id,

        requestCode:
          request.requestCode,

        employeeId:
          request.employeeId,

        managerId:
          request.managerId,

        durationMinutes:
          request.durationMinutes,
      },
    );

    return Response.json(
      {
        success: true,

        message:
          'Pengajuan lembur berhasil dibuat.',

        data:
          request,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return handleServiceError(
      error,
    );
  }
}

/* =========================================================
   GET /api/overtime
========================================================= */

/*
 * MODE 1
 *
 * GET /api/overtime?requestId=xxx
 *
 * Mendapatkan satu overtime request.
 *
 *
 * MODE 2
 *
 * GET /api/overtime?employeeId=emp_003
 *
 * Mendapatkan daftar overtime employee.
 *
 *
 * MODE 3
 *
 * GET /api/overtime
 *   ?employeeId=emp_003
 *   &status=PENDING
 *   &limit=10
 */

export async function GET(
  req: Request,
) {
  try {
    const url =
      new URL(
        req.url,
      );

    const requestId =
      url.searchParams
        .get(
          'requestId',
        )
        ?.trim();

    const employeeId =
      url.searchParams
        .get(
          'employeeId',
        )
        ?.trim();

    const statusParam =
      url.searchParams
        .get(
          'status',
        )
        ?.trim()
        .toUpperCase();

    const limitParam =
      url.searchParams.get(
        'limit',
      );

    /* =====================================================
       GET SINGLE REQUEST
    ===================================================== */

    if (requestId) {
      const request =
        await getOvertimeRequest(
          requestId,
        );

      return Response.json({
        success: true,

        data:
          request,
      });
    }

    /* =====================================================
       GET EMPLOYEE REQUESTS
    ===================================================== */

    if (!employeeId) {
      return errorResponse(
        'Gunakan requestId atau employeeId.',
        'QUERY_REQUIRED',
        400,
      );
    }

    /* =====================================================
       STATUS VALIDATION
    ===================================================== */

    let status:
      | OvertimeStatus
      | undefined;

    if (statusParam) {
      const validStatuses =
        Object.values(
          OvertimeStatus,
        );

      if (
        !validStatuses.includes(
          statusParam as OvertimeStatus,
        )
      ) {
        return errorResponse(
          `Status '${statusParam}' tidak valid.`,
          'INVALID_STATUS',
          400,
          {
            validStatuses,
          },
        );
      }

      status =
        statusParam as OvertimeStatus;
    }

    /* =====================================================
       LIMIT
    ===================================================== */

    let limit = 20;

    if (limitParam) {
      const parsed =
        Number(
          limitParam,
        );

      if (
        Number.isNaN(
          parsed,
        ) ||
        parsed < 1
      ) {
        return errorResponse(
          'limit harus berupa angka positif.',
          'INVALID_LIMIT',
          400,
        );
      }

      limit =
        Math.min(
          Math.floor(
            parsed,
          ),
          100,
        );
    }

    /* =====================================================
       SERVICE
    ===================================================== */

    const requests =
      await getEmployeeOvertimeRequests(
        employeeId,
        {
          limit,
          status,
        },
      );

    return Response.json({
      success: true,

      data:
        requests,

      meta: {
        employeeId,

        status:
          status ??
          null,

        count:
          requests.length,

        limit,
      },
    });
  } catch (error) {
    return handleServiceError(
      error,
    );
  }
}