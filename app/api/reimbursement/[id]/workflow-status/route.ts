import {
  WorkflowStatus,
} from '@prisma/client';

import {
  timingSafeEqual,
} from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  ReimbursementServiceError,
  updateReimbursementWorkflow,
} from '@/lib/services/reimbursement-service';

export const runtime =
  'nodejs';

/* =========================================================
   HELPERS
========================================================= */

function assertN8nSecret(
  request:
    NextRequest,
) {
  const expected =
    process.env
      .N8N_SHARED_SECRET
      ?.trim();

  if (!expected) {
    throw new Error(
      'N8N_SHARED_SECRET belum dikonfigurasi.',
    );
  }

  const provided =
    request.headers
      .get(
        'x-n8n-secret',
      )
      ?.trim() ||
    '';

  const expectedBuffer =
    Buffer.from(
      expected,
      'utf8',
    );

  const providedBuffer =
    Buffer.from(
      provided,
      'utf8',
    );

  return (
    expectedBuffer.length ===
      providedBuffer.length &&
    timingSafeEqual(
      expectedBuffer,
      providedBuffer,
    )
  );
}

/* =========================================================
   POST /api/reimbursement/[id]/workflow-status
========================================================= */

export async function POST(
  request:
    NextRequest,

  context: {
    params:
      Promise<{
        id:
          string;
      }>;
  },
) {
  try {
    if (
      !assertN8nSecret(
        request,
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error: {
            code:
              'UNAUTHORIZED',

            message:
              'Callback workflow reimbursement tidak terotorisasi.',
          },
        },
        {
          status: 401,
        },
      );
    }

    const {
      id,
    } =
      await context.params;

    const body =
      await request.json();

    const workflowStatus =
      String(
        body.workflowStatus ||
        '',
      )
        .trim()
        .toUpperCase() as
        WorkflowStatus;

    if (
      workflowStatus !==
        WorkflowStatus.RUNNING &&
      workflowStatus !==
        WorkflowStatus.COMPLETED &&
      workflowStatus !==
        WorkflowStatus.FAILED
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error: {
            code:
              'INVALID_WORKFLOW_STATUS',

            message:
              'Workflow status hanya boleh RUNNING, COMPLETED, atau FAILED.',
          },
        },
        {
          status: 400,
        },
      );
    }

    const updated =
      await updateReimbursementWorkflow(
        {
          requestId:
            id,

          workflowStatus,

          workflowRunId:
            typeof body.workflowRunId ===
              'string'
              ? body.workflowRunId
              : undefined,

          metadata:
            body.metadata ===
              undefined
              ? undefined
              : (
                  JSON.parse(
                    JSON.stringify(
                      body.metadata,
                    ),
                  )
                ),
        },
      );

    return NextResponse.json({
      success:
        true,

      data: {
        id:
          updated.id,

        requestCode:
          updated.requestCode,

        status:
          updated.status,

        managerDecision:
          updated.managerDecision,

        workflowStatus:
          updated.workflowStatus,

        workflowRunId:
          updated.workflowRunId,
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[REIMBURSEMENT WORKFLOW CALLBACK ERROR]',
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

    if (
      error instanceof
      SyntaxError
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error: {
            code:
              'INVALID_JSON',

            message:
              'Body callback tidak valid.',
          },
        },
        {
          status: 400,
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
            'Gagal memperbarui workflow reimbursement.',
        },
      },
      {
        status: 500,
      },
    );
  }
}
