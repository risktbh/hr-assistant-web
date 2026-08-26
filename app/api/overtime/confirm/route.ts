import {
  Prisma,
  WorkflowStatus,
} from '@prisma/client';

import {
  claimOvertimeWorkflowTrigger,
  createOvertimeRequest,
  OvertimeServiceError,
  updateOvertimeWorkflow,
} from '@/lib/services/overtime-service';

import {
  verifyOvertimeActionToken,
} from '@/lib/security/overtime-action-token';

import {
  triggerN8nOvertimeWorkflow,
} from '@/lib/automation/n8n-overtime';

export const runtime =
  'nodejs';

/* =========================================================
   ERROR RESPONSE
========================================================= */

function errorResponse(
  message: string,
  code: string,
  status: number,
) {
  return Response.json(
    {
      success:
        false,

      error:
        message,

      code,
    },
    {
      status,
    },
  );
}

/* =========================================================
   POST /api/overtime/confirm
========================================================= */

export async function POST(
  req: Request,
) {
  try {
    /* =====================================================
       REQUEST BODY
    ===================================================== */

    const body =
      await req.json();

    const actionToken =
      typeof body
        ?.actionToken ===
      'string'
        ? body
            .actionToken
            .trim()
        : '';

    if (
      !actionToken
    ) {
      return errorResponse(
        'Action token wajib diisi.',
        'ACTION_TOKEN_REQUIRED',
        400,
      );
    }

    /* =====================================================
       VERIFY SIGNATURE + EXPIRY + POLICY
    ===================================================== */

    let payload;

    try {
      payload =
        verifyOvertimeActionToken(
          actionToken,
        );
    } catch (
      error
    ) {
      return errorResponse(
        error instanceof
          Error
          ? error.message
          : 'Action token tidak valid.',
        'INVALID_ACTION_TOKEN',
        403,
      );
    }

    const {
      draft,
      policyValidation,
    } =
      payload;

    if (
      !draft.data.startAt ||
      !draft.data.endAt ||
      !draft.data.reason
    ) {
      return errorResponse(
        'Draft overtime tidak lengkap.',
        'INCOMPLETE_OVERTIME_DRAFT',
        400,
      );
    }

    /* =====================================================
       CREATE REAL OVERTIME REQUEST
    ===================================================== */

    const overtime =
      await createOvertimeRequest(
        {
          requestCode:
            payload.requestCode,

          employeeId:
            payload.employeeId,

          startAt:
            draft.data.startAt,

          endAt:
            draft.data.endAt,

          timezone:
            draft.timezone,

          reason:
            draft.data.reason,

          projectName:
            draft.data
              .projectName ??
            undefined,

          taskReference:
            draft.data
              .taskReference ??
            undefined,

          requiresSecondApproval:
            policyValidation
              .requiresSecondApproval,

          policyResult:
            policyValidation as unknown as
              Prisma.InputJsonValue,

          policySource:
            policyValidation
              .sourceFiles
              .join(', ') ||
            undefined,

          actorType:
            'EMPLOYEE',

          actorId:
            payload.employeeId,
        },
      );

    console.info(
      '[OVERTIME CONFIRMED]',
      {
        requestCode:
          overtime.requestCode,

        employeeId:
          overtime.employeeId,

        managerId:
          overtime.managerId,

        status:
          overtime.status,

        approvalStage:
          overtime.approvalStage,

        requiresSecondApproval:
          overtime
            .requiresSecondApproval,
      },
    );

    /* =====================================================
       TRIGGER N8N WORKFLOW
    ===================================================== */

    let automationWarning:
      string | null =
      null;

    try {
      /*
       * Claim memastikan request yang sama
       * tidak mengirim workflow berulang kali.
       */
      const claim =
        await claimOvertimeWorkflowTrigger(
          overtime.id,
        );

      if (
        claim.claimed
      ) {
        console.info(
          '[OVERTIME N8N DISPATCH]',
          {
            requestCode:
              overtime.requestCode,

            workflowStatus:
              claim.request
                .workflowStatus,
          },
        );

        /*
         * Kirim payload ke webhook n8n.
         */
        const n8nResult =
          await triggerN8nOvertimeWorkflow(
            claim.request,
          );

        /*
         * Webhook berhasil menerima workflow.
         */
        await updateOvertimeWorkflow({
          requestId:
            overtime.id,

          workflowStatus:
            WorkflowStatus.RUNNING,

          metadata: {
            source:
              'OVERTIME_CONFIRMATION',

            dispatched:
              true,

            n8nResponse:
              n8nResult ??
              null,
          } as Prisma.InputJsonValue,
        });

        console.info(
          '[OVERTIME N8N STARTED]',
          {
            requestCode:
              overtime.requestCode,
          },
        );
      } else {
        /*
         * Bisa terjadi saat confirmation
         * request dikirim ulang.
         *
         * Tidak dianggap error karena
         * workflow mungkin sudah berjalan.
         */
        console.info(
          '[OVERTIME N8N ALREADY CLAIMED]',
          {
            requestCode:
              overtime.requestCode,

            workflowStatus:
              claim.request
                .workflowStatus,
          },
        );
      }
    } catch (
      error
    ) {
      console.error(
        '[OVERTIME N8N TRIGGER ERROR]',
        error,
      );

      /*
       * Overtime tetap berhasil dibuat.
       * Automation saja yang gagal.
       */
      automationWarning =
        'Pengajuan berhasil dibuat, tetapi workflow approval belum berhasil dijalankan.';

      try {
        await updateOvertimeWorkflow({
          requestId:
            overtime.id,

          workflowStatus:
            WorkflowStatus.FAILED,

          metadata: {
            source:
              'OVERTIME_CONFIRMATION',

            error:
              error instanceof
                Error
                ? error.message
                : 'Unknown automation error',
          } as Prisma.InputJsonValue,
        });
      } catch (
        workflowError
      ) {
        /*
         * Jangan menggagalkan request utama
         * hanya karena pencatatan status
         * workflow gagal.
         */
        console.error(
          '[OVERTIME WORKFLOW FAILURE UPDATE ERROR]',
          workflowError,
        );
      }
    }

    /* =====================================================
       RESPONSE
    ===================================================== */

    return Response.json(
      {
        success:
          true,

        message:
          automationWarning
            ? 'Pengajuan lembur berhasil dibuat, tetapi workflow approval mengalami kendala.'
            : 'Pengajuan lembur berhasil dikirim.',

        data:
          overtime,

        automation: {
          warning:
            automationWarning,
        },
      },
      {
        status:
          201,
      },
    );
  } catch (
    error
  ) {
    /* =====================================================
       SERVICE ERROR
    ===================================================== */

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

    /* =====================================================
       UNKNOWN ERROR
    ===================================================== */

    console.error(
      '[OVERTIME CONFIRM ERROR]',
      error,
    );

    return errorResponse(
      'Gagal memproses konfirmasi overtime.',
      'OVERTIME_CONFIRM_ERROR',
      500,
    );
  }
}