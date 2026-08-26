import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  approveSecondOvertimeRequest,
  OvertimeServiceError,
  rejectSecondOvertimeRequest,
} from '@/lib/services/overtime-service';

export const runtime =
  'nodejs';

type SecondDecisionBody = {
  secondApproverId?:
    string;

  decision?:
    | 'APPROVE'
    | 'REJECT';

  note?:
    string;
};

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
        SecondDecisionBody;

    const secondApproverId =
      body
        .secondApproverId
        ?.trim();

    const decision =
      body
        .decision
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
          success:
            false,

          error:
            'Request ID wajib diisi.',
        },
        {
          status:
            400,
        },
      );
    }

    if (
      !secondApproverId
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            'Second approver ID wajib diisi.',
        },
        {
          status:
            400,
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
          success:
            false,

          error:
            'Decision harus APPROVE atau REJECT.',
        },
        {
          status:
            400,
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
            success:
              false,

            error:
              'Alasan penolakan wajib diisi.',
          },
          {
            status:
              400,
          },
        );
      }

      const rejected =
        await rejectSecondOvertimeRequest(
          {
            requestId:
              id,

            secondApproverId,

            note,
          },
        );

      console.info(
        '[OVERTIME SECOND REJECTED]',
        {
          requestCode:
            rejected
              .requestCode,

          secondApproverId,

          status:
            rejected.status,

          approvalStage:
            rejected
              .approvalStage,
        },
      );

      return NextResponse.json({
        success:
          true,

        message:
          'Pengajuan overtime ditolak oleh second approver.',

        data:
          rejected,
      });
    }

    /* =====================================================
       APPROVE
    ===================================================== */

    const approved =
      await approveSecondOvertimeRequest(
        {
          requestId:
            id,

          secondApproverId,

          note,
        },
      );

    console.info(
      '[OVERTIME SECOND APPROVED]',
      {
        requestCode:
          approved.requestCode,

        secondApproverId,

        status:
          approved.status,

        approvalStage:
          approved
            .approvalStage,
      },
    );

    return NextResponse.json({
      success:
        true,

      message:
        'Pengajuan overtime telah mendapatkan final approval.',

      data:
        approved,
    });
  } catch (error) {
    console.error(
      '[OVERTIME SECOND DECISION ERROR]',
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
          'Terjadi kesalahan saat memproses second approval.',
      },
      {
        status:
          500,
      },
    );
  }
}