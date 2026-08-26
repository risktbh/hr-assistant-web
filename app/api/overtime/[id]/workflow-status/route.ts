import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  Prisma,
  WorkflowStatus,
} from '@prisma/client';

import {
  OvertimeServiceError,
  updateOvertimeWorkflow,
} from '@/lib/services/overtime-service';

import {
  verifyN8nSecret,
} from '@/lib/security/n8n-auth';

export const runtime =
  'nodejs';

type WorkflowStatusBody = {
  workflowStatus?:
    string;

  workflowRunId?:
    string;

  metadata?:
    Record<
      string,
      unknown
    >;
};

const allowedStatuses:
  Set<WorkflowStatus> =
  new Set<WorkflowStatus>([
    WorkflowStatus.RUNNING,
    WorkflowStatus.COMPLETED,
    WorkflowStatus.FAILED,
  ]);

export async function POST(
  request: NextRequest,

  context: {
    params: Promise<{
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
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Unauthorized automation request.',
        },
        {
          status:
            401,
        },
      );
    }

    const {
      id,
    } =
      await context.params;

    const body =
      await request.json() as
        WorkflowStatusBody;

    const rawStatus =
      body.workflowStatus
        ?.trim()
        .toUpperCase();

    if (!rawStatus) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Workflow status wajib diisi.',
        },
        {
          status:
            400,
        },
      );
    }

    const workflowStatus =
      rawStatus as
        WorkflowStatus;

    if (
      !allowedStatuses.has(
        workflowStatus,
      )
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Workflow status tidak valid.',
        },
        {
          status:
            400,
        },
      );
    }

    const updated =
      await updateOvertimeWorkflow({
        requestId:
          id,

        workflowStatus,

        workflowRunId:
          body.workflowRunId
            ?.trim(),

        metadata:
          body.metadata as
            Prisma.InputJsonValue,
      });

    return NextResponse.json({
      success:
        true,

      data: {
        requestCode:
          updated.requestCode,

        workflowStatus:
          updated.workflowStatus,

        workflowRunId:
          updated.workflowRunId,
      },
    });
  } catch (error) {
    console.error(
      '[OVERTIME WORKFLOW STATUS ERROR]',
      error,
    );

    if (
      error instanceof
      OvertimeServiceError
    ) {
      return NextResponse.json(
        {
          success:
            false,

          code:
            error.code,

          error:
            error.message,
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

        error:
          'Gagal memperbarui workflow overtime.',
      },
      {
        status:
          500,
      },
    );
  }
}