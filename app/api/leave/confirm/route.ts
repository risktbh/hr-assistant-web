import {
  Prisma,
  WorkflowStatus,
} from '@prisma/client';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  validateLeavePolicyWithRag,
  LeavePolicyError,
} from '@/lib/ai/leave-policy';

import {
  verifyLeaveActionToken,
  LeaveActionTokenError,
} from '@/lib/security/leave-action-token';

import {
  claimLeaveWorkflowTrigger,
  createLeaveRequest,
  getLeaveRequest,
  getEmployeeLeaveBalance,
  updateLeaveWorkflow,
  LeaveServiceError,
} from '@/lib/services/leave-service';

import {
  triggerN8nLeaveWorkflow,
} from '@/lib/automation/n8n-leave';

/* =========================================================
   RUNTIME
========================================================= */

export const runtime =
  'nodejs';

/* =========================================================
   LOCAL ERROR
========================================================= */

class LeaveConfirmError
  extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);

    this.name =
      'LeaveConfirmError';
  }
}

/* =========================================================
   JSON HELPER
========================================================= */

function toPrismaJson(
  value: unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(
      value,
    ),
  ) as Prisma.InputJsonValue;
}

/* =========================================================
   LEAVE WORKFLOW DISPATCH
========================================================= */

type LeaveWorkflowSource =
  | 'LEAVE_CONFIRMATION'
  | 'LEAVE_CONFIRMATION_REPLAY';

type LeaveRequestWithRelations =
  Awaited<
    ReturnType<
      typeof getLeaveRequest
    >
  >;

async function dispatchLeaveApprovalWorkflow(
  baseRequest: LeaveRequestWithRelations,
  source: LeaveWorkflowSource,
) {
  /*
   * Gunakan request yang sudah tersedia sebagai fallback.
   *
   * Dengan begitu, kegagalan saat claim / automation
   * tidak membuat request utama ikut gagal hanya karena
   * helper perlu melakukan read tambahan.
   */
  const requestId =
    baseRequest.id;

  let latestRequest =
    baseRequest;

  try {
    /* =====================================================
       CLAIM WORKFLOW
    ===================================================== */

    const claim =
      await claimLeaveWorkflowTrigger(
        requestId,
      );

    latestRequest =
      claim.request;

    /*
     * Tidak di-claim artinya salah satu:
     *
     * - workflow sudah TRIGGERED
     * - workflow sudah RUNNING
     * - workflow sudah COMPLETED
     * - request sudah bukan PENDING
     *
     * Jangan kirim webhook lagi.
     */
    if (!claim.claimed) {
      console.info(
        '[LEAVE N8N ALREADY CLAIMED]',
        {
          requestCode:
            claim.request
              .requestCode,

          status:
            claim.request.status,

          workflowStatus:
            claim.request
              .workflowStatus,

          source,
        },
      );

      return {
        request:
          claim.request,

        claimed:
          false,

        dispatched:
          false,

        warning:
          null as string | null,
      };
    }

    console.info(
      '[LEAVE N8N DISPATCH]',
      {
        requestCode:
          claim.request
            .requestCode,

        workflowStatus:
          claim.request
            .workflowStatus,

        source,
      },
    );

    /* =====================================================
       CALL N8N
    ===================================================== */

    let n8nResult:
      unknown;

    try {
      n8nResult =
        await triggerN8nLeaveWorkflow(
          claim.request,
        );
    } catch (error) {
      /*
       * Webhook benar-benar gagal.
       *
       * Tandai FAILED supaya confirmation
       * replay boleh mencoba lagi.
       */
      console.error(
        '[LEAVE N8N TRIGGER ERROR]',
        error,
      );

      let failedRequest =
        claim.request;

      try {
        failedRequest =
          await updateLeaveWorkflow({
            requestId,

            workflowStatus:
              WorkflowStatus.FAILED,

            metadata:
              toPrismaJson({
                source,

                dispatched:
                  false,

                error:
                  error instanceof
                    Error
                    ? error.message
                    : 'Unknown automation error',
              }),
          });
      } catch (
        workflowError
      ) {
        console.error(
          '[LEAVE WORKFLOW FAILURE UPDATE ERROR]',
          workflowError,
        );
      }

      return {
        request:
          failedRequest,

        claimed:
          true,

        dispatched:
          false,

        warning:
          'Pengajuan cuti berhasil dibuat, tetapi workflow approval belum berhasil dijalankan.',
      };
    }

    /* =====================================================
       N8N ACCEPTED
    ===================================================== */

    try {
      const runningRequest =
        await updateLeaveWorkflow({
          requestId,

          workflowStatus:
            WorkflowStatus.RUNNING,

          metadata:
            toPrismaJson({
              source,

              dispatched:
                true,

              n8nResponse:
                n8nResult ??
                null,
            }),
        });

      console.info(
        '[LEAVE N8N STARTED]',
        {
          requestCode:
            runningRequest
              .requestCode,

          workflowStatus:
            runningRequest
              .workflowStatus,

          source,
        },
      );

      return {
        request:
          runningRequest,

        claimed:
          true,

        dispatched:
          true,

        warning:
          null as string | null,
      };
    } catch (
      workflowError
    ) {
      /*
       * Penting:
       *
       * Webhook SUDAH berhasil dikirim.
       * Jangan ubah ke FAILED.
       *
       * Biarkan status TRIGGERED agar
       * retry confirmation TIDAK
       * mengirim webhook kedua.
       */
      console.error(
        '[LEAVE WORKFLOW RUNNING UPDATE ERROR]',
        workflowError,
      );

      return {
        request:
          claim.request,

        claimed:
          true,

        dispatched:
          true,

        warning:
          'Workflow approval berhasil dikirim, tetapi status workflow lokal belum berhasil diperbarui.',
      };
    }
  } catch (error) {
    /*
     * Error sebelum / saat claim.
     *
     * Request Leave tetap berhasil.
     */
    console.error(
      '[LEAVE WORKFLOW CLAIM ERROR]',
      error,
    );

    return {
      request:
        latestRequest,

      claimed:
        false,

      dispatched:
        false,

      warning:
        'Pengajuan cuti berhasil dibuat, tetapi workflow approval belum berhasil disiapkan.',
    };
  }
}

/* =========================================================
   ERROR HANDLER
========================================================= */

function handleError(
  error: unknown,
) {
  console.error(
    '[LEAVE CONFIRM ERROR]',
    error,
  );

  /*
   * Signed token invalid,
   * expired, malformed, dll.
   */
  if (
    error instanceof
    LeaveActionTokenError
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
        status: 422,
      },
    );
  }

  /*
   * Error dari policy engine.
   */
  if (
    error instanceof
    LeavePolicyError
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
        status: 422,
      },
    );
  }

  /*
   * Error dari leave service:
   * overlap, balance,
   * employee tidak ada, dll.
   */
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

  if (
    error instanceof
    LeaveConfirmError
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

  /*
   * JSON body malformed.
   */
  if (
    error instanceof
    SyntaxError
  ) {
    return NextResponse.json(
      {
        success: false,

        error: {
          code:
            'INVALID_JSON',

          message:
            'Body request tidak valid.',
        },
      },
      {
        status: 400,
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
          'Terjadi kesalahan internal saat mengonfirmasi pengajuan cuti.',
      },
    },
    {
      status: 500,
    },
  );
}

/* =========================================================
   POST /api/leave/confirm
========================================================= */

export async function POST(
  request: NextRequest,
) {
  try {
    /* =====================================================
       1. REQUEST BODY
    ===================================================== */

    const body =
      await request.json();

    const token =
      typeof body.token ===
      'string'
        ? body.token.trim()
        : '';

    const sessionId =
      typeof body.sessionId ===
      'string'
        ? body.sessionId.trim()
        : '';

    if (!token) {
      throw new LeaveConfirmError(
        'TOKEN_REQUIRED',
        'Token konfirmasi leave wajib tersedia.',
        400,
      );
    }

    if (!sessionId) {
      throw new LeaveConfirmError(
        'SESSION_REQUIRED',
        'Session ID wajib tersedia.',
        400,
      );
    }

    /* =====================================================
       2. SERVER-SIDE EMPLOYEE IDENTITY
    ===================================================== */

    const employeeId =
      process.env
        .DEMO_EMPLOYEE_ID
        ?.trim();

    if (!employeeId) {
      throw new LeaveConfirmError(
        'EMPLOYEE_CONTEXT_NOT_CONFIGURED',
        'Server belum memiliki konteks employee untuk konfirmasi leave.',
        500,
      );
    }

    /* =====================================================
       3. VERIFY SIGNED TOKEN
    ===================================================== */

    const payload =
      verifyLeaveActionToken(
        token,
      );

    /*
     * Jangan percaya employeeId
     * dari browser.
     *
     * Employee authority berasal
     * dari server-side context.
     */
    if (
      payload.employeeId !==
      employeeId
    ) {
      throw new LeaveConfirmError(
        'TOKEN_EMPLOYEE_MISMATCH',
        'Token konfirmasi tidak berlaku untuk employee saat ini.',
        403,
      );
    }

    /*
     * Token harus digunakan dari
     * chat/session tempat draft dibuat.
     */
    if (
      payload.sessionId !==
      sessionId
    ) {
      throw new LeaveConfirmError(
        'TOKEN_SESSION_MISMATCH',
        'Token konfirmasi tidak berlaku untuk session ini.',
        403,
      );
    }
    /* =====================================================
    4. EARLY IDEMPOTENCY CHECK
    ===================================================== */

    let existingRequest:
    Awaited<
        ReturnType<
        typeof getLeaveRequest
        >
    > | null =
    null;

    try {
    existingRequest =
        await getLeaveRequest(
        payload.requestCode,
        );
    } catch (error) {
    /*
    * Belum pernah dibuat:
    * lanjut ke policy revalidation.
    */
    if (
        error instanceof
        LeaveServiceError &&
        error.code ===
        'LEAVE_NOT_FOUND'
    ) {
        existingRequest =
        null;
    } else {
        throw error;
    }
    }

    if (existingRequest) {
    const existingStartDate =
        existingRequest.startDate
        .toISOString()
        .slice(
            0,
            10,
        );

    const existingEndDate =
        existingRequest.endDate
        .toISOString()
        .slice(
            0,
            10,
        );

    const existingReason =
        existingRequest.reason
        ?.trim() ||
        null;

    const tokenReason =
        payload.draft.reason
        ?.trim() ||
        null;

    /*
    * Request code sama hanya boleh
    * menunjuk ke request yang sama.
    */
    const sameRequest =
        existingRequest
        .employeeId ===
        employeeId &&
        existingRequest
        .leaveType ===
        payload.draft
            .leaveType &&
        existingStartDate ===
        payload.draft
            .startDate &&
        existingEndDate ===
        payload.draft
            .endDate &&
        existingRequest
        .totalDays ===
        payload.draft
            .totalDays &&
        existingReason ===
        tokenReason;

    if (!sameRequest) {
        throw new LeaveConfirmError(
        'REQUEST_CODE_CONFLICT',
        'Request code sudah digunakan oleh pengajuan leave yang berbeda.',
        409,
        );
    }

    /*
    * Ambil balance CURRENT.
    *
    * Tetapi jangan kurangi lagi
    * requestedDays karena request ini
    * sudah tercatat di database.
    */
    const year =
        Number(
        payload.draft
            .startDate
            .slice(
            0,
            4,
            ),
        );

    const balance =
        await getEmployeeLeaveBalance(
        employeeId,
        year,
        );

    const currentBalance =
        balance.balances.find(
        (item) =>
            item.leaveType ===
            payload.draft
            .leaveType,
        );

    const availableDays =
        currentBalance
        ?.availableDays ??
        null;

    console.info(
        '[LEAVE CONFIRM IDEMPOTENT]',
        {
        requestCode:
            existingRequest
            .requestCode,

        requestId:
            existingRequest.id,

        status:
            existingRequest.status,

        availableDays,
        },
    );
    const automation =
    await dispatchLeaveApprovalWorkflow(
        existingRequest,
        'LEAVE_CONFIRMATION_REPLAY',
    );

    const replayRequest =
    automation.request;

    return NextResponse.json(
        {
        success: true,

        data: {
            confirmed: true,

            /*
            * Berguna untuk frontend /
            * observability.
            */
            idempotent: true,

            request: {
              id:
                replayRequest.id,

              requestCode:
                replayRequest
                  .requestCode,

              employeeId:
                replayRequest
                  .employeeId,

              employeeName:
                replayRequest
                  .employee.name,

              managerId:
                replayRequest
                  .managerId,

              managerName:
                replayRequest
                  .manager
                  ?.name ??
                null,

              leaveType:
                replayRequest
                  .leaveType,

              startDate:
                replayRequest
                  .startDate
                  .toISOString()
                  .slice(
                    0,
                    10,
                  ),

              endDate:
                replayRequest
                  .endDate
                  .toISOString()
                  .slice(
                    0,
                    10,
                  ),

              totalDays:
                replayRequest
                  .totalDays,

              reason:
                replayRequest
                  .reason,

              status:
                replayRequest
                  .status,

              managerDecision:
                replayRequest
                  .managerDecision,

              workflowStatus:
                replayRequest
                  .workflowStatus,

              requestedAt:
                replayRequest
                  .requestedAt
                  .toISOString(),
            },

            revalidation: {
            /*
            * Tidak ada simulasi request
            * kedua.
            */
            idempotentReplay:
                true,

            availableDays,

            /*
            * Karena retry tidak membuat
            * request baru, saldo setelah
            * retry = saldo saat ini.
            */
            remainingAfterRequest:
                availableDays,

            policyFingerprint:
                payload.policy
                .policyFingerprint,

            evidenceFingerprint:
                payload.policy
                .evidenceFingerprint,
            },
            automation: {
            claimed:
                automation.claimed,

            dispatched:
                automation.dispatched,

            workflowStatus:
                replayRequest
                .workflowStatus,

            warning:
                automation.warning,
            },
        },
        },
        {
        /*
        * First create = 201
        * Idempotent replay = 200
        */
        status: 200,
        },
    );
    }

    /* =====================================================
       4. REVALIDATE CURRENT POLICY
    ===================================================== */

    /*
     * Saldo / eligibility di token adalah
     * snapshot saat token dibuat.
     *
     * Kita TIDAK mempercayainya sebagai
     * kondisi terbaru.
     */
    const currentPolicy =
      await validateLeavePolicyWithRag(
        {
          employeeId,

          leaveType:
            payload.draft
              .leaveType,

          startDate:
            payload.draft
              .startDate,

          endDate:
            payload.draft
              .endDate,

          reason:
            payload.draft
              .reason,
        },
      );

    /* =====================================================
       5. CURRENT POLICY MUST STILL BE ELIGIBLE
    ===================================================== */

    if (
      !currentPolicy
        .policyFound
    ) {
      throw new LeaveConfirmError(
        'LEAVE_POLICY_NOT_FOUND',
        'Kebijakan cuti tidak dapat diverifikasi saat ini.',
        409,
      );
    }

    if (
      !currentPolicy
        .eligible
    ) {
      throw new LeaveConfirmError(
        'LEAVE_NO_LONGER_ELIGIBLE',
        currentPolicy
          .violations[0] ||
          'Pengajuan cuti tidak lagi memenuhi kebijakan saat ini.',
        409,
      );
    }

    if (
      currentPolicy
        .needsHumanReview
    ) {
      throw new LeaveConfirmError(
        'LEAVE_REQUIRES_HUMAN_REVIEW',
        'Pengajuan cuti memerlukan pemeriksaan manual sebelum dapat dibuat.',
        409,
      );
    }

    if (
      currentPolicy
        .violations
        .length >
      0
    ) {
      throw new LeaveConfirmError(
        'LEAVE_POLICY_VIOLATION',
        currentPolicy
          .violations[0],
        409,
      );
    }

    /* =====================================================
       6. DRAFT CONSISTENCY CHECK
    ===================================================== */

    /*
     * Signature sudah melindungi draft
     * dari client tampering.
     *
     * Check ini memastikan perhitungan
     * server saat confirm masih sama
     * dengan draft yang ditandatangani.
     */
    if (
      currentPolicy
        .totalDays !==
      payload.draft
        .totalDays
    ) {
      throw new LeaveConfirmError(
        'LEAVE_DRAFT_CHANGED',
        'Perhitungan hari cuti berubah sejak draft dibuat. Silakan buat ulang pengajuan.',
        409,
      );
    }

    if (
      currentPolicy
        .leaveType !==
        payload.draft
          .leaveType ||
      currentPolicy
        .startDate !==
        payload.draft
          .startDate ||
      currentPolicy
        .endDate !==
        payload.draft
          .endDate
    ) {
      throw new LeaveConfirmError(
        'LEAVE_DRAFT_CHANGED',
        'Detail pengajuan cuti berubah sejak draft dibuat. Silakan buat ulang pengajuan.',
        409,
      );
    }

    /* =====================================================
       7. BUILD COMPACT AUDIT POLICY RESULT
    ===================================================== */

    /*
     * Tidak menyimpan full RAG chunks
     * ke LeaveRequest.
     *
     * Kita simpan fingerprint token +
     * hasil revalidation yang ringkas.
     */
    const policyResult =
      toPrismaJson({
        confirmation: {
          policyFingerprint:
            payload.policy
              .policyFingerprint,

          evidenceFingerprint:
            payload.policy
              .evidenceFingerprint,

          issuedAt:
            payload.issuedAt,

          expiresAt:
            payload.expiresAt,
        },

        revalidatedAt:
          new Date()
            .toISOString(),

        revalidation: {
          policyFound:
            currentPolicy
              .policyFound,

          eligible:
            currentPolicy
              .eligible,

          needsHumanReview:
            currentPolicy
              .needsHumanReview,

          requiresManagerApproval:
            currentPolicy
              .requiresManagerApproval,

          leaveType:
            currentPolicy
              .leaveType,

          startDate:
            currentPolicy
              .startDate,

          endDate:
            currentPolicy
              .endDate,

          totalDays:
            currentPolicy
              .totalDays,

          noticeDays:
            currentPolicy
              .noticeDays,

          balance:
            currentPolicy
              .balance,

          violations:
            currentPolicy
              .violations,

          warnings:
            currentPolicy
              .warnings,

          matchedRules:
            currentPolicy
              .matchedRules,

          policySource:
            currentPolicy
              .policySource,

          sourceFiles:
            currentPolicy
              .sourceFiles,

          rag: {
            found:
              currentPolicy
                .rag
                .found,

            threshold:
              currentPolicy
                .rag
                .threshold,

            evidenceCount:
              currentPolicy
                .rag
                .evidence
                .length,
          },
        },
      });

    /* =====================================================
       8. CREATE LEAVE REQUEST
    ===================================================== */

    /*
     * Penting:
     * requestCode berasal dari signed token.
     *
     * JANGAN generate requestCode baru
     * pada tahap confirm.
     */
    const created =
      await createLeaveRequest(
        {
          requestCode:
            payload.requestCode,

          employeeId,

          leaveType:
            payload.draft
              .leaveType,

          startDate:
            payload.draft
              .startDate,

          endDate:
            payload.draft
              .endDate,

          reason:
            payload.draft
                .reason ??
            undefined,  

          policyResult,

          policySource:
            currentPolicy
              .policySource
              .join(', ') ||
            'LEAVE_POLICY',

          actorType:
            'EMPLOYEE_CONFIRMATION',

          actorId:
            employeeId,
        },
      );
    /* =====================================================
    9. DISPATCH APPROVAL WORKFLOW
    ===================================================== */

    const automation =
    await dispatchLeaveApprovalWorkflow(
        created,
        'LEAVE_CONFIRMATION',
    );

    const confirmedRequest =
    automation.request;

    /* =====================================================
       10. RESPONSE
    ===================================================== */

    return NextResponse.json(
      {
        success: true,

        data: {
          confirmed: true,
          idempotent: false,

          request: {
            id:
              confirmedRequest.id,

            requestCode:
              confirmedRequest
                .requestCode,

            employeeId:
              confirmedRequest
                .employeeId,

            employeeName:
              confirmedRequest
                .employee.name,

            managerId:
              confirmedRequest
                .managerId,

            managerName:
              confirmedRequest
                .manager
                ?.name ??
              null,

            leaveType:
              confirmedRequest
                .leaveType,

            startDate:
              confirmedRequest
                .startDate
                .toISOString()
                .slice(
                  0,
                  10,
                ),

            endDate:
              confirmedRequest
                .endDate
                .toISOString()
                .slice(
                  0,
                  10,
                ),

            totalDays:
              confirmedRequest
                .totalDays,

            reason:
              confirmedRequest
                .reason,

            status:
              confirmedRequest
                .status,

            managerDecision:
              confirmedRequest
                .managerDecision,

            workflowStatus:
              confirmedRequest
                .workflowStatus,

            requestedAt:
              confirmedRequest
                .requestedAt
                .toISOString(),
          },

          revalidation: {
            eligible:
              currentPolicy
                .eligible,

            policySource:
              currentPolicy
                .policySource,

            availableDays:
              currentPolicy
                .balance
                ?.availableDays ??
              null,

            remainingAfterRequest:
              currentPolicy
                .balance
                ?.remainingAfterRequest ??
              null,

            policyFingerprint:
              payload.policy
                .policyFingerprint,

            evidenceFingerprint:
              payload.policy
                .evidenceFingerprint,
          },

          automation: {
            claimed:
              automation.claimed,

            dispatched:
              automation.dispatched,

            workflowStatus:
              confirmedRequest
                .workflowStatus,

            warning:
              automation.warning,
          },
        },
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    return handleError(
      error,
    );
  }
}