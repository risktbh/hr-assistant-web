import {
  Prisma,
  WorkflowStatus,
} from '@prisma/client';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  ReimbursementPolicyError,
  validateReimbursementPolicyWithRag,
} from '@/lib/ai/reimbursement-policy';

import {
  ReimbursementActionTokenError,
  verifyReimbursementActionToken,
} from '@/lib/security/reimbursement-action-token';

import {
  claimReimbursementWorkflowTrigger,
  createReimbursementRequest,
  getReimbursementRequest,
  ReimbursementServiceError,
  updateReimbursementWorkflow,
} from '@/lib/services/reimbursement-service';

import {
  triggerN8nReimbursementWorkflow,
} from '@/lib/automation/n8n-reimbursement';

export const runtime =
  'nodejs';

/* =========================================================
   LOCAL ERROR
========================================================= */

class ReimbursementConfirmError
  extends Error {
  constructor(
    public code:
      string,

    message:
      string,

    public status =
      400,
  ) {
    super(
      message,
    );

    this.name =
      'ReimbursementConfirmError';
  }
}

/* =========================================================
   HELPERS
========================================================= */

function normalizeNullableText(
  value:
    | string
    | null
    | undefined,
) {
  const normalized =
    value?.trim();

  return normalized ||
    null;
}

function dateOnly(
  value:
    Date,
) {
  return value
    .toISOString()
    .slice(
      0,
      10,
    );
}

function toPrismaJson(
  value:
    unknown,
): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(
      value,
    ),
  ) as
    Prisma.InputJsonValue;
}

function serializeReimbursement(
  request:
    any,
) {
  return {
    id:
      request.id,

    requestCode:
      request.requestCode,

    employeeId:
      request.employeeId,

    employeeName:
      request.employee
        ?.name ??
      null,

    managerId:
      request.managerId,

    managerName:
      request.manager
        ?.name ??
      null,

    reimbursementType:
      request
        .reimbursementType,

    expenseDate:
      dateOnly(
        request
          .expenseDate,
      ),

    amount:
      request.amount
        .toString(),

    currency:
      request.currency,

    merchant:
      request.merchant,

    reason:
      request.reason,

    receiptUrl:
      request.receiptUrl,

    receiptFileName:
      request
        .receiptFileName,

    status:
      request.status,

    managerDecision:
      request
        .managerDecision,

    workflowStatus:
      request
        .workflowStatus,

    workflowRunId:
      request
        .workflowRunId,

    requestedAt:
      request
        .requestedAt
        .toISOString(),
  };
}

/* =========================================================
   N8N WORKFLOW DISPATCH
========================================================= */

type ReimbursementWorkflowSource =
  | 'REIMBURSEMENT_CONFIRMATION'
  | 'REIMBURSEMENT_CONFIRMATION_REPLAY';

type ReimbursementRequestWithRelations =
  Awaited<
    ReturnType<
      typeof getReimbursementRequest
    >
  >;

async function dispatchReimbursementApprovalWorkflow(
  baseRequest:
    ReimbursementRequestWithRelations,

  source:
    ReimbursementWorkflowSource,
) {
  const requestId =
    baseRequest.id;

  let latestRequest =
    baseRequest;

  try {
    const claim =
      await claimReimbursementWorkflowTrigger(
        requestId,
      );

    latestRequest =
      claim.request;

    if (!claim.claimed) {
      console.info(
        '[REIMBURSEMENT N8N ALREADY CLAIMED]',
        {
          requestCode:
            claim.request
              .requestCode,

          status:
            claim.request
              .status,

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
          null as
            string |
            null,
      };
    }

    console.info(
      '[REIMBURSEMENT N8N DISPATCH]',
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

    let n8nResult:
      unknown;

    try {
      n8nResult =
        await triggerN8nReimbursementWorkflow(
          claim.request,
        );
    } catch (
      error
    ) {
      console.error(
        '[REIMBURSEMENT N8N TRIGGER ERROR]',
        error,
      );

      let failedRequest =
        claim.request;

      try {
        failedRequest =
          await updateReimbursementWorkflow(
            {
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
            },
          );
      } catch (
        workflowError
      ) {
        console.error(
          '[REIMBURSEMENT WORKFLOW FAILURE UPDATE ERROR]',
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
          'Pengajuan reimbursement berhasil dibuat, tetapi workflow approval belum berhasil dijalankan.',
      };
    }

    /*
     * Webhook SUDAH diterima n8n.
     *
     * Bila update RUNNING gagal, jangan tandai FAILED,
     * karena replay confirmation dapat menyebabkan
     * webhook kedua. Biarkan TRIGGERED.
     */
    try {
      const runningRequest =
        await updateReimbursementWorkflow(
          {
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
          },
        );

      console.info(
        '[REIMBURSEMENT N8N STARTED]',
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
          null as
            string |
            null,
      };
    } catch (
      workflowError
    ) {
      console.error(
        '[REIMBURSEMENT WORKFLOW RUNNING UPDATE ERROR]',
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
  } catch (
    error
  ) {
    console.error(
      '[REIMBURSEMENT WORKFLOW CLAIM ERROR]',
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
        'Pengajuan reimbursement berhasil dibuat, tetapi workflow approval belum berhasil disiapkan.',
    };
  }
}

/* =========================================================
   ERROR HANDLER
========================================================= */

function handleError(
  error:
    unknown,
) {
  console.error(
    '[REIMBURSEMENT CONFIRM ERROR]',
    error,
  );

  if (
    error instanceof
    ReimbursementActionTokenError
  ) {
    const status =
      error.code ===
        'TOKEN_EMPLOYEE_MISMATCH' ||
      error.code ===
        'TOKEN_SESSION_MISMATCH'
        ? 403
        : 422;

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
        status,
      },
    );
  }

  if (
    error instanceof
    ReimbursementPolicyError
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
        status: 422,
      },
    );
  }

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
    ReimbursementConfirmError
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
      success:
        false,

      error: {
        code:
          'INTERNAL_SERVER_ERROR',

        message:
          'Terjadi kesalahan internal saat mengonfirmasi reimbursement.',
      },
    },
    {
      status: 500,
    },
  );
}

/* =========================================================
   POST /api/reimbursement/confirm
========================================================= */

export async function POST(
  request:
    NextRequest,
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
      throw new ReimbursementConfirmError(
        'TOKEN_REQUIRED',
        'Token konfirmasi reimbursement wajib tersedia.',
        400,
      );
    }

    if (!sessionId) {
      throw new ReimbursementConfirmError(
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
      throw new ReimbursementConfirmError(
        'EMPLOYEE_CONTEXT_NOT_CONFIGURED',
        'Server belum memiliki konteks employee untuk konfirmasi reimbursement.',
        500,
      );
    }

    /* =====================================================
       3. VERIFY SIGNED TOKEN
    ===================================================== */

    const payload =
      verifyReimbursementActionToken(
        token,
      );

    /*
     * Jangan percaya employeeId dari browser.
     *
     * Source of truth identity tetap server-side context.
     */
    if (
      payload.employeeId !==
      employeeId
    ) {
      throw new ReimbursementConfirmError(
        'TOKEN_EMPLOYEE_MISMATCH',
        'Token konfirmasi reimbursement tidak berlaku untuk employee saat ini.',
        403,
      );
    }

    /*
     * Token hanya valid dari chat/session
     * tempat draft dibuat.
     */
    if (
      payload.sessionId !==
      sessionId
    ) {
      throw new ReimbursementConfirmError(
        'TOKEN_SESSION_MISMATCH',
        'Token konfirmasi reimbursement tidak berlaku untuk session ini.',
        403,
      );
    }

    /* =====================================================
       4. EARLY IDEMPOTENCY CHECK
    ===================================================== */

    let existingRequest:
      Awaited<
        ReturnType<
          typeof getReimbursementRequest
        >
      > |
      null =
        null;

    try {
      existingRequest =
        await getReimbursementRequest(
          payload
            .requestCode,
        );
    } catch (
      error
    ) {
      if (
        error instanceof
          ReimbursementServiceError &&
        error.code ===
          'REIMBURSEMENT_NOT_FOUND'
      ) {
        existingRequest =
          null;
      } else {
        throw error;
      }
    }

    if (existingRequest) {
      const existingExpenseDate =
        dateOnly(
          existingRequest
            .expenseDate,
        );

      const existingMerchant =
        normalizeNullableText(
          existingRequest
            .merchant,
        );

      const tokenMerchant =
        normalizeNullableText(
          payload.draft
            .merchant,
        );

      const existingReceiptUrl =
        normalizeNullableText(
          existingRequest
            .receiptUrl,
        );

      const tokenReceiptUrl =
        normalizeNullableText(
          payload.draft
            .receiptUrl,
        );

      const existingReceiptFileName =
        normalizeNullableText(
          existingRequest
            .receiptFileName,
        );

      const tokenReceiptFileName =
        normalizeNullableText(
          payload.draft
            .receiptFileName,
        );

      const sameRequest =
        existingRequest
          .employeeId ===
            employeeId &&
        existingRequest
          .reimbursementType ===
            payload.draft
              .reimbursementType &&
        existingExpenseDate ===
          payload.draft
            .expenseDate &&
        existingRequest
          .amount
          .eq(
            new Prisma.Decimal(
              payload.draft
                .amount,
            ),
          ) &&
        existingRequest
          .currency ===
            payload.draft
              .currency &&
        existingMerchant ===
          tokenMerchant &&
        existingRequest
          .reason ===
            payload.draft
              .reason &&
        existingReceiptUrl ===
          tokenReceiptUrl &&
        existingReceiptFileName ===
          tokenReceiptFileName;

      if (!sameRequest) {
        throw new ReimbursementConfirmError(
          'REQUEST_CODE_CONFLICT',
          'Request code sudah digunakan oleh pengajuan reimbursement yang berbeda.',
          409,
        );
      }

      console.info(
        '[REIMBURSEMENT CONFIRM IDEMPOTENT REPLAY]',
        {
          requestCode:
            existingRequest
              .requestCode,

          employeeId,

          status:
            existingRequest
              .status,

          workflowStatus:
            existingRequest
              .workflowStatus,
        },
      );

      /*
       * Replay tidak membuat DB request kedua.
       *
       * Tetapi jika workflow sebelumnya FAILED,
       * claim service mengizinkan retry.
       */
      const automation =
        await dispatchReimbursementApprovalWorkflow(
          existingRequest,
          'REIMBURSEMENT_CONFIRMATION_REPLAY',
        );

      const replayRequest =
        automation.request;

      return NextResponse.json(
        {
          success:
            true,

          data: {
            confirmed:
              true,

            idempotent:
              true,

            request:
              serializeReimbursement(
                replayRequest,
              ),

            revalidation: {
              replaySkippedCurrentPolicy:
                true,

              policyFingerprint:
                payload.policy
                  .policyFingerprint,

              evidenceFingerprint:
                payload.policy
                  .evidenceFingerprint,
            },

            automation: {
              integrated:
                true,

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
          status: 200,
        },
      );
    }

    /* =====================================================
       5. CURRENT POLICY REVALIDATION
    ===================================================== */

    /*
     * Policy snapshot di token TIDAK menjadi
     * source of truth saat confirmation.
     *
     * Seluruh transaction facts diambil dari
     * signed draft, lalu policy dibaca ulang
     * dari current handbook / RAG state.
     */
    const currentPolicy =
      await validateReimbursementPolicyWithRag(
        {
          employeeId,

          reimbursementType:
            payload.draft
              .reimbursementType,

          expenseDate:
            payload.draft
              .expenseDate,

          amount:
            payload.draft
              .amount,

          currency:
            payload.draft
              .currency,

          merchant:
            payload.draft
              .merchant,

          reason:
            payload.draft
              .reason,

          receiptUrl:
            payload.draft
              .receiptUrl,

          receiptFileName:
            payload.draft
              .receiptFileName,

          lostReceiptDeclaration:
            payload.draft
              .lostReceiptDeclaration,

          lateClaimReason:
            payload.draft
              .lateClaimReason,

          isPersonalExpense:
            payload.draft
              .isPersonalExpense,

          paidByOtherParty:
            payload.draft
              .paidByOtherParty,

          categoryRequiresPreApproval:
            payload.draft
              .categoryRequiresPreApproval,

          preApproved:
            payload.draft
              .preApproved,

          isRoutineMealAtNormalWorkLocation:
            payload.draft
              .isRoutineMealAtNormalWorkLocation,

          relatedToBusinessTravel:
            payload.draft
              .relatedToBusinessTravel,

          relatedToQualifyingOvertime:
            payload.draft
              .relatedToQualifyingOvertime,

          authorizedEvent:
            payload.draft
              .authorizedEvent,

          travelScope:
            payload.draft
              .travelScope,

          travelEmergency:
            payload.draft
              .travelEmergency,

          perDiemDuplicate:
            payload.draft
              .perDiemDuplicate,

          includesPersonalExpense:
            payload.draft
              .includesPersonalExpense,

          personalExpenseSeparated:
            payload.draft
              .personalExpenseSeparated,

          costCenter:
            payload.draft
              .costCenter,

          originalQuestion:
            'Revalidasi current policy saat employee mengonfirmasi reimbursement.',
        },
      );

    /* =====================================================
       6. CURRENT POLICY MUST STILL ALLOW SUBMISSION
    ===================================================== */

    if (
      !currentPolicy
        .policyFound
    ) {
      throw new ReimbursementConfirmError(
        'REIMBURSEMENT_POLICY_NOT_FOUND',
        'Kebijakan reimbursement tidak dapat diverifikasi saat ini.',
        409,
      );
    }

    if (
      !currentPolicy
        .eligible
    ) {
      throw new ReimbursementConfirmError(
        'REIMBURSEMENT_NO_LONGER_ELIGIBLE',
        currentPolicy
          .violations[0] ||
        'Pengajuan reimbursement tidak lagi memenuhi kebijakan saat ini.',
        409,
      );
    }

    if (
      currentPolicy
        .needsHumanReview ||
      !currentPolicy
        .autoSubmittable
    ) {
      throw new ReimbursementConfirmError(
        'REIMBURSEMENT_REQUIRES_HUMAN_REVIEW',
        'Pengajuan reimbursement memerlukan pemeriksaan manual dan belum dapat dibuat melalui standard workflow.',
        409,
      );
    }

    /* =====================================================
       7. DRAFT CONSISTENCY CHECK
    ===================================================== */

    /*
     * Signature sudah mencegah browser mengubah draft.
     *
     * Check ini memastikan hasil normalisasi policy
     * saat confirm masih sama dengan core facts
     * yang ditandatangani.
     */
    if (
      currentPolicy
        .reimbursementType !==
        payload.draft
          .reimbursementType ||
      currentPolicy
        .expenseDate !==
        payload.draft
          .expenseDate ||
      !new Prisma.Decimal(
        currentPolicy
          .amount,
      ).eq(
        new Prisma.Decimal(
          payload.draft
            .amount,
        ),
      ) ||
      currentPolicy
        .currency !==
        payload.draft
          .currency
    ) {
      throw new ReimbursementConfirmError(
        'REIMBURSEMENT_DRAFT_CHANGED',
        'Detail reimbursement berubah sejak draft dibuat. Silakan buat ulang pengajuan.',
        409,
      );
    }

    /* =====================================================
       8. BUILD COMPACT POLICY AUDIT SNAPSHOT
    ===================================================== */

    /*
     * Jangan simpan full RAG chunks ke DB.
     *
     * Simpan:
     * - signed snapshot fingerprints
     * - compact current revalidation
     * - source file names
     * - evidence count
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
            payload
              .issuedAt,

          expiresAt:
            payload
              .expiresAt,
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

          autoSubmittable:
            currentPolicy
              .autoSubmittable,

          reimbursementType:
            currentPolicy
              .reimbursementType,

          expenseDate:
            currentPolicy
              .expenseDate,

          claimAgeDays:
            currentPolicy
              .claimAgeDays,

          amount:
            currentPolicy
              .amount,

          currency:
            currentPolicy
              .currency,

          receiptPresent:
            currentPolicy
              .receiptPresent,

          requiresReceipt:
            currentPolicy
              .requiresReceipt,

          requiresLostReceiptDeclaration:
            currentPolicy
              .requiresLostReceiptDeclaration,

          requiresManagerApproval:
            currentPolicy
              .requiresManagerApproval,

          requiresBudgetOwnerReview:
            currentPolicy
              .requiresBudgetOwnerReview,

          requiresDepartmentHeadApproval:
            currentPolicy
              .requiresDepartmentHeadApproval,

          requiresFinanceAudit:
            currentPolicy
              .requiresFinanceAudit,

          requiresBenefitVerification:
            currentPolicy
              .requiresBenefitVerification,

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
       9. CREATE REIMBURSEMENT REQUEST
    ===================================================== */

    /*
     * requestCode HARUS berasal dari signed token.
     * Jangan generate code baru pada confirm.
     */
    const created =
      await createReimbursementRequest(
        {
          requestCode:
            payload
              .requestCode,

          employeeId,

          reimbursementType:
            payload.draft
              .reimbursementType,

          expenseDate:
            payload.draft
              .expenseDate,

          amount:
            payload.draft
              .amount,

          currency:
            payload.draft
              .currency,

          merchant:
            payload.draft
              .merchant,

          reason:
            payload.draft
              .reason,

          receiptUrl:
            payload.draft
              .receiptUrl,

          receiptFileName:
            payload.draft
              .receiptFileName,

          policyResult,

          policySource:
            currentPolicy
              .policySource
              .join(
                ', ',
              ) ||
            'REIMBURSEMENT_POLICY',

          actorType:
            'EMPLOYEE_CONFIRMATION',

          actorId:
            employeeId,
        },
      );

    console.info(
      '[REIMBURSEMENT CONFIRMED]',
      {
        requestCode:
          created
            .requestCode,

        employeeId:
          created
            .employeeId,

        managerId:
          created
            .managerId,

        reimbursementType:
          created
            .reimbursementType,

        status:
          created
            .status,

        workflowStatus:
          created
            .workflowStatus,
      },
    );

    /* =====================================================
       10. DISPATCH APPROVAL WORKFLOW
    ===================================================== */

    const automation =
      await dispatchReimbursementApprovalWorkflow(
        created,
        'REIMBURSEMENT_CONFIRMATION',
      );

    const confirmedRequest =
      automation.request;

    /* =====================================================
       11. RESPONSE
    ===================================================== */

    return NextResponse.json(
      {
        success:
          true,

        data: {
          confirmed:
            true,

          idempotent:
            false,

          request:
            serializeReimbursement(
              confirmedRequest,
            ),

          revalidation: {
            eligible:
              currentPolicy
                .eligible,

            needsHumanReview:
              currentPolicy
                .needsHumanReview,

            autoSubmittable:
              currentPolicy
                .autoSubmittable,

            policySource:
              currentPolicy
                .policySource,

            sourceFiles:
              currentPolicy
                .sourceFiles,

            evidenceCount:
              currentPolicy
                .rag
                .evidence
                .length,

            policyFingerprint:
              payload.policy
                .policyFingerprint,

            evidenceFingerprint:
              payload.policy
                .evidenceFingerprint,
          },

          automation: {
            integrated:
              true,

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
  } catch (
    error
  ) {
    return handleError(
      error,
    );
  }
}
