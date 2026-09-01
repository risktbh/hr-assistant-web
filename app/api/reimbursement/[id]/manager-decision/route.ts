import {
  timingSafeEqual,
} from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  approveReimbursementRequest,
  getReimbursementRequest,
  rejectReimbursementRequest,
  ReimbursementServiceError,
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

  if (
    expectedBuffer.length !==
      providedBuffer.length ||
    !timingSafeEqual(
      expectedBuffer,
      providedBuffer,
    )
  ) {
    return false;
  }

  return true;
}

function serialize(
  request:
    any,
) {
  return {
    id:
      request.id,

    requestCode:
      request.requestCode,

    status:
      request.status,

    managerId:
      request.managerId,

    managerDecision:
      request.managerDecision,

    managerDecisionNote:
      request.managerDecisionNote,

    managerDecidedAt:
      request.managerDecidedAt
        ?.toISOString() ??
      null,

    workflowStatus:
      request.workflowStatus,

    workflowRunId:
      request.workflowRunId,
  };
}

/* =========================================================
   POST /api/reimbursement/[id]/manager-decision
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
              'Callback reimbursement tidak terotorisasi.',
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

    const decision =
      String(
        body.decision ||
        '',
      )
        .trim()
        .toUpperCase();

    if (
      decision !==
        'APPROVED' &&
      decision !==
        'REJECTED'
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error: {
            code:
              'INVALID_DECISION',

            message:
              'Decision hanya boleh APPROVED atau REJECTED.',
          },
        },
        {
          status: 400,
        },
      );
    }

    const current =
      await getReimbursementRequest(
        id,
      );

    /*
     * Manager identity tidak dipercaya dari URL/body
     * bila request sudah memiliki assigned manager.
     *
     * Body managerId tetap boleh dikirim untuk
     * observability, tetapi harus identik.
     */
    const managerId =
      String(
        body.managerId ||
        current.managerId ||
        '',
      )
        .trim();

    if (
      !managerId ||
      managerId !==
        current.managerId
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error: {
            code:
              'MANAGER_MISMATCH',

            message:
              'Manager callback tidak sesuai dengan approver yang ditugaskan.',
          },
        },
        {
          status: 403,
        },
      );
    }

    const note =
      typeof body.note ===
        'string'
        ? body.note
        : null;

    const updated =
      decision ===
        'APPROVED'
        ? await approveReimbursementRequest(
            {
              requestId:
                id,

              managerId,

              note,
            },
          )
        : await rejectReimbursementRequest(
            {
              requestId:
                id,

              managerId,

              note,
            },
          );

    return NextResponse.json({
      success:
        true,

      data:
        serialize(
          updated,
        ),
    });
  } catch (
    error
  ) {
    console.error(
      '[REIMBURSEMENT MANAGER CALLBACK ERROR]',
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
            'Gagal memproses keputusan manager reimbursement.',
        },
      },
      {
        status: 500,
      },
    );
  }
}
