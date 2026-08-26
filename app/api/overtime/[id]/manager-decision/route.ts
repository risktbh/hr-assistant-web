import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  OvertimeApprovalStage,
} from '@prisma/client';

import {
  approveOvertimeRequest,
  assignSecondApprover,
  OvertimeServiceError,
  rejectOvertimeRequest,
} from '@/lib/services/overtime-service';

import {
  resolveSecondApprover,
} from '@/lib/services/overtime-approver-service';

export const runtime = 'nodejs';

/* =========================================================
   TYPES
========================================================= */

type ManagerDecisionBody = {
  managerId?: string;

  decision?:
    | 'APPROVE'
    | 'REJECT';

  note?: string;
};

/* =========================================================
   POST
========================================================= */

export async function POST(
  request: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    const {
      id,
    } =
      await context.params;

    const body =
      await request.json() as
        ManagerDecisionBody;

    const managerId =
      body.managerId?.trim();

    const decision =
      body.decision
        ?.trim()
        .toUpperCase();

    const note =
      body.note?.trim();

    /* =====================================================
       VALIDATION
    ===================================================== */

    if (!id) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Request ID wajib diisi.',
        },
        {
          status: 400,
        },
      );
    }

    if (!managerId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Manager ID wajib diisi.',
        },
        {
          status: 400,
        },
      );
    }

    if (
      decision !==
        'APPROVE' &&
      decision !==
        'REJECT'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Decision harus APPROVE atau REJECT.',
        },
        {
          status: 400,
        },
      );
    }

    /* =====================================================
       REJECT
    ===================================================== */

    if (
      decision ===
      'REJECT'
    ) {
      if (!note) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Alasan penolakan wajib diisi.',
          },
          {
            status: 400,
          },
        );
      }

      const rejected =
        await rejectOvertimeRequest({
          requestId:
            id,

          managerId,

          note,
        });

      console.info(
        '[OVERTIME MANAGER REJECTED]',
        {
          requestCode:
            rejected.requestCode,

          managerId,

          status:
            rejected.status,

          approvalStage:
            rejected.approvalStage,
        },
      );

      return NextResponse.json(
        {
          success: true,

          message:
            'Pengajuan overtime ditolak oleh manager.',

          data:
            rejected,
        },
      );
    }

    /* =====================================================
       APPROVE
    ===================================================== */

    let approved =
      await approveOvertimeRequest({
        requestId:
          id,

        managerId,

        note,
      });

    /*
     * Jika approval kedua diperlukan,
     * manager approval TIDAK membuat
     * request menjadi APPROVED.
     *
     * Service akan memindahkan:
     *
     * MANAGER
     *   ↓
     * SECOND_APPROVER
     */

    if (
      approved.approvalStage ===
        OvertimeApprovalStage
          .SECOND_APPROVER &&
      approved
        .requiresSecondApproval
    ) {
      const resolution =
        await resolveSecondApprover(
          approved.id,
        );

      approved =
        await assignSecondApprover({
          requestId:
            approved.id,

          secondApproverId:
            resolution
              .secondApproverId,

          actorType:
            'SYSTEM',

          actorId:
            'SECOND_APPROVER_RESOLVER',
        });

      console.info(
        '[OVERTIME SECOND APPROVER RESOLVED]',
        {
          requestCode:
            approved.requestCode,

          employee:
            resolution.employee.name,

          manager:
            resolution.manager.name,

          secondApprover:
            resolution
              .secondApprover
              .name,

          source:
            resolution.source,
        },
      );
    }

    console.info(
      '[OVERTIME MANAGER APPROVED]',
      {
        requestCode:
          approved.requestCode,

        managerId,

        status:
          approved.status,

        approvalStage:
          approved.approvalStage,

        requiresSecondApproval:
          approved
            .requiresSecondApproval,

        secondApproverId:
          approved
            .secondApproverId,
      },
    );

    return NextResponse.json({
      success: true,

      message:
        approved
          .approvalStage ===
          OvertimeApprovalStage
            .SECOND_APPROVER
          ? 'Manager menyetujui pengajuan. Pengajuan diteruskan ke second approver.'
          : 'Pengajuan overtime telah disetujui.',

      data:
        approved,
    });
  } catch (error) {
    console.error(
      '[OVERTIME MANAGER DECISION ERROR]',
      error,
    );

    if (
      error instanceof
      OvertimeServiceError
    ) {
      return NextResponse.json(
        {
          success: false,

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
        success: false,

        error:
          'Terjadi kesalahan saat memproses keputusan manager.',
      },
      {
        status: 500,
      },
    );
  }
}