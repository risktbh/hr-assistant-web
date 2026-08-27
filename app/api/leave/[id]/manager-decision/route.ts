import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  approveLeaveRequest,
  rejectLeaveRequest,
  LeaveServiceError,
} from '@/lib/services/leave-service';

export const runtime =
  'nodejs';

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function errorResponse(
  code: string,
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      success: false,

      error: {
        code,
        message,
      },
    },
    {
      status,
    },
  );
}

/* =========================================================
   VERIFY N8N
========================================================= */

function verifyN8nSecret(
  request: NextRequest,
) {
  const configuredSecret =
    process.env
      .N8N_SHARED_SECRET
      ?.trim();

  if (!configuredSecret) {
    throw new Error(
      'N8N_SHARED_SECRET belum dikonfigurasi.',
    );
  }

  const receivedSecret =
    request.headers
      .get(
        'x-n8n-secret',
      )
      ?.trim();

  return (
    receivedSecret ===
    configuredSecret
  );
}

/* =========================================================
   POST /api/leave/[id]/manager-decision
========================================================= */

export async function POST(
  request: NextRequest,
  context: {
    params:
      Promise<{
        id: string;
      }>;
  },
) {
  try {
    if (
      !verifyN8nSecret(
        request,
      )
    ) {
      return errorResponse(
        'INVALID_N8N_SECRET',
        'Request callback n8n tidak terotorisasi.',
        401,
      );
    }

    const {
      id,
    } =
      await context.params;

    const requestId =
      id?.trim();

    if (!requestId) {
      return errorResponse(
        'REQUEST_ID_REQUIRED',
        'Leave request ID wajib tersedia.',
        400,
      );
    }

    const body =
      await request.json();

    const action =
      typeof body.action ===
        'string'
        ? body.action
            .trim()
            .toUpperCase()
        : '';

    const managerId =
      typeof body.managerId ===
        'string'
        ? body.managerId
            .trim()
        : '';

    const note =
      typeof body.note ===
        'string'
        ? body.note.trim()
        : undefined;

    if (
      action !==
        'APPROVE' &&
      action !==
        'REJECT'
    ) {
      return errorResponse(
        'INVALID_ACTION',
        'Action harus APPROVE atau REJECT.',
        400,
      );
    }

    if (!managerId) {
      return errorResponse(
        'MANAGER_REQUIRED',
        'Manager ID wajib tersedia.',
        400,
      );
    }

    const result =
      action ===
      'APPROVE'
        ? await approveLeaveRequest(
            {
              requestId,
              managerId,
              note,
            },
          )
        : await rejectLeaveRequest(
            {
              requestId,
              managerId,
              note,
            },
          );

    console.info(
      '[LEAVE MANAGER DECISION]',
      {
        requestCode:
          result.requestCode,

        managerId:
          result.managerId,

        action,

        status:
          result.status,

        managerDecision:
          result
            .managerDecision,
      },
    );

    return NextResponse.json({
      success: true,

      data: {
        id:
          result.id,

        requestCode:
          result.requestCode,

        employeeId:
          result.employeeId,

        managerId:
          result.managerId,

        managerName:
          result.manager
            ?.name ??
          null,

        leaveType:
          result.leaveType,

        startDate:
          result.startDate
            .toISOString()
            .slice(
              0,
              10,
            ),

        endDate:
          result.endDate
            .toISOString()
            .slice(
              0,
              10,
            ),

        totalDays:
          result.totalDays,

        status:
          result.status,

        managerDecision:
          result
            .managerDecision,

        managerDecisionNote:
          result
            .managerDecisionNote,

        managerDecidedAt:
          result
            .managerDecidedAt
            ?.toISOString() ??
          null,

        workflowStatus:
          result
            .workflowStatus,
      },
    });
  } catch (error) {
    console.error(
      '[LEAVE MANAGER DECISION ERROR]',
      error,
    );

    if (
      error instanceof
      LeaveServiceError
    ) {
      return errorResponse(
        error.code,
        error.message,
        error.status,
      );
    }

    if (
      error instanceof
      SyntaxError
    ) {
      return errorResponse(
        'INVALID_JSON',
        'Body request tidak valid.',
        400,
      );
    }

    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      'Gagal memproses keputusan manager.',
      500,
    );
  }
}