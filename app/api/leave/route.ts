import {
  LeaveStatus,
  LeaveType,
} from '@prisma/client';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getEmployeeLeaveBalance,
  getEmployeeLeaveRequests,
  getLeaveRequest,
  LeaveServiceError,
} from '@/lib/services/leave-service';

/* =========================================================
   ERROR HANDLER
========================================================= */

function handleError(
  error: unknown,
) {
  console.error(
    '[LEAVE API ERROR]',
    error,
  );

  if (
    error instanceof
    LeaveServiceError
  ) {
    return NextResponse.json(
      {
        success: false,

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
      success: false,

      error: {
        code:
          'INTERNAL_SERVER_ERROR',

        message:
          'Terjadi kesalahan internal.',
      },
    },
    {
      status: 500,
    },
  );
}

/* =========================================================
   ACTIVE EMPLOYEE
========================================================= */

function getActiveEmployeeId() {
  const employeeId =
    process.env
      .DEMO_EMPLOYEE_ID
      ?.trim();

  if (
    !employeeId
  ) {
    throw new LeaveServiceError(
      'EMPLOYEE_CONTEXT_MISSING',
      'Konteks employee belum dikonfigurasi.',
      500,
    );
  }

  return employeeId;
}

/* =========================================================
   GET /api/leave

   Examples:

   /api/leave
   /api/leave?limit=20
   /api/leave?status=PENDING
   /api/leave?leaveType=ANNUAL

   /api/leave?requestId=LV-20260827-XXXXXX

   /api/leave?view=balance
   /api/leave?view=balance&year=2026
========================================================= */

export async function GET(
  request: NextRequest,
) {
  try {
    const {
      searchParams,
    } =
      new URL(
        request.url,
      );

    const employeeId =
      getActiveEmployeeId();

    /* =====================================================
       SECURITY

       Jangan menerima employee lain dari query.
    ===================================================== */

    const requestedEmployeeId =
      searchParams
        .get(
          'employeeId',
        )
        ?.trim();

    if (
      requestedEmployeeId &&
      requestedEmployeeId !==
        employeeId
    ) {
      throw new LeaveServiceError(
        'UNAUTHORIZED_EMPLOYEE',
        'Anda tidak berhak mengakses data leave employee tersebut.',
        403,
      );
    }

    /* =====================================================
       SINGLE REQUEST
    ===================================================== */

    const requestId =
      searchParams
        .get(
          'requestId',
        )
        ?.trim();

    if (
      requestId
    ) {
      const leave =
        await getLeaveRequest(
          requestId,
        );

      /*
       * getLeaveRequest dapat mencari secara global,
       * maka ownership harus diverifikasi sebelum response.
       */
      if (
        leave.employeeId !==
        employeeId
      ) {
        throw new LeaveServiceError(
          'LEAVE_NOT_FOUND',
          'Pengajuan cuti tidak ditemukan.',
          404,
        );
      }

      return NextResponse.json(
        {
          success: true,

          data:
            leave,
        },
      );
    }

    /* =====================================================
       BALANCE
    ===================================================== */

    const view =
      searchParams
        .get(
          'view',
        )
        ?.trim()
        .toLowerCase();

    if (
      view ===
      'balance'
    ) {
      const yearRaw =
        searchParams.get(
          'year',
        );

      const year =
        yearRaw
          ? Number(
              yearRaw,
            )
          : undefined;

      if (
        yearRaw &&
        (
          !Number.isInteger(
            year,
          ) ||
          !year
        )
      ) {
        throw new LeaveServiceError(
          'INVALID_YEAR',
          'Tahun saldo cuti tidak valid.',
          400,
        );
      }

      const balance =
        await getEmployeeLeaveBalance(
          employeeId,
          year,
        );

      return NextResponse.json(
        {
          success: true,

          data:
            balance,
        },
      );
    }

    /* =====================================================
       REQUEST LIST FILTERS
    ===================================================== */

    const limitRaw =
      searchParams.get(
        'limit',
      );

    let limit:
      | number
      | undefined;

    if (
      limitRaw
    ) {
      limit =
        Number(
          limitRaw,
        );

      if (
        !Number.isInteger(
          limit,
        ) ||
        limit < 1 ||
        limit > 100
      ) {
        throw new LeaveServiceError(
          'INVALID_LIMIT',
          'Limit harus berupa angka 1 sampai 100.',
          400,
        );
      }
    }

    /* STATUS */

    const statusRaw =
      searchParams
        .get(
          'status',
        )
        ?.trim()
        .toUpperCase();

    let status:
      | LeaveStatus
      | undefined;

    if (
      statusRaw
    ) {
      if (
        !Object.values(
          LeaveStatus,
        ).includes(
          statusRaw as
            LeaveStatus,
        )
      ) {
        throw new LeaveServiceError(
          'INVALID_LEAVE_STATUS',
          'Status leave tidak valid.',
          400,
        );
      }

      status =
        statusRaw as
          LeaveStatus;
    }

    /* LEAVE TYPE */

    const leaveTypeRaw =
      searchParams
        .get(
          'leaveType',
        )
        ?.trim()
        .toUpperCase();

    let leaveType:
      | LeaveType
      | undefined;

    if (
      leaveTypeRaw
    ) {
      if (
        !Object.values(
          LeaveType,
        ).includes(
          leaveTypeRaw as
            LeaveType,
        )
      ) {
        throw new LeaveServiceError(
          'INVALID_LEAVE_TYPE',
          'Jenis cuti tidak valid.',
          400,
        );
      }

      leaveType =
        leaveTypeRaw as
          LeaveType;
    }

    /* =====================================================
       GET REQUESTS
    ===================================================== */

    const requests =
      await getEmployeeLeaveRequests(
        employeeId,
        {
          limit,
          status,
          leaveType,
        },
      );

    return NextResponse.json(
      {
        success: true,

        data:
          requests,
      },
    );
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}