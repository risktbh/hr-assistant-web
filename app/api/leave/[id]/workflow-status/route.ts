import {
  Prisma,
  WorkflowStatus,
} from '@prisma/client';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  updateLeaveWorkflow,
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
   POST /api/leave/[id]/workflow-status
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

    const statusRaw =
      typeof body
        .workflowStatus ===
        'string'
        ? body
            .workflowStatus
            .trim()
            .toUpperCase()
        : '';

    const allowedStatuses:
        ReadonlySet<WorkflowStatus> =
            new Set<WorkflowStatus>([
            WorkflowStatus.RUNNING,
            WorkflowStatus.COMPLETED,
            WorkflowStatus.FAILED,
            ]);

        if (
        !allowedStatuses.has(
            statusRaw as
            WorkflowStatus,
        )
        ) {
        return errorResponse(
            'INVALID_WORKFLOW_STATUS',
            'Workflow status harus RUNNING, COMPLETED, atau FAILED.',
            400,
        );
        }
    const workflowRunId =
      typeof body
        .workflowRunId ===
        'string' &&
      body.workflowRunId
        .trim()
        ? body.workflowRunId
            .trim()
        : undefined;

    const metadata =
      body.metadata !==
        undefined
        ? JSON.parse(
            JSON.stringify(
              body.metadata,
            ),
          ) as Prisma.InputJsonValue
        : undefined;

    const updated =
      await updateLeaveWorkflow(
        {
          requestId,

          workflowStatus:
            statusRaw as
              WorkflowStatus,

          workflowRunId,

          metadata,
        },
      );

    console.info(
      '[LEAVE WORKFLOW STATUS]',
      {
        requestCode:
          updated.requestCode,

        workflowStatus:
          updated
            .workflowStatus,

        workflowRunId:
          updated
            .workflowRunId,
      },
    );

    return NextResponse.json({
      success: true,

      data: {
        id:
          updated.id,

        requestCode:
          updated.requestCode,

        status:
          updated.status,

        managerDecision:
          updated
            .managerDecision,

        workflowStatus:
          updated
            .workflowStatus,

        workflowRunId:
          updated
            .workflowRunId,
      },
    });
  } catch (error) {
    console.error(
      '[LEAVE WORKFLOW STATUS ERROR]',
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
      'Gagal memperbarui status workflow leave.',
      500,
    );
  }
}