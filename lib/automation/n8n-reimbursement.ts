type ReimbursementWorkflowInput = {
  id: string;

  requestCode: string;

  reimbursementType: string;

  expenseDate: Date;

  amount: {
    toString(): string;
  };

  currency: string;

  merchant:
    string | null;

  reason: string;

  receiptUrl:
    string | null;

  receiptFileName:
    string | null;

  status: string;

  managerDecision: string;

  policySource:
    string | null;

  workflowStatus: string;

  employee: {
    id: string;
    name: string;
    email: string;
    position: string;
    department: string;
  };

  manager: {
    id: string;
    name: string;
    email: string;
    position: string;
    department: string;
  } | null;
};

/* =========================================================
   TRIGGER N8N REIMBURSEMENT WORKFLOW
========================================================= */

export async function triggerN8nReimbursementWorkflow(
  reimbursement:
    ReimbursementWorkflowInput,
) {
  const webhookUrl =
    process.env
      .N8N_REIMBURSEMENT_WEBHOOK_URL
      ?.trim();

  const secret =
    process.env
      .N8N_SHARED_SECRET
      ?.trim();

  const appBaseUrl =
    process.env
      .APP_BASE_URL
      ?.trim()
      .replace(
        /\/+$/,
        '',
      );

  if (!webhookUrl) {
    throw new Error(
      'N8N_REIMBURSEMENT_WEBHOOK_URL belum dikonfigurasi.',
    );
  }

  if (!secret) {
    throw new Error(
      'N8N_SHARED_SECRET belum dikonfigurasi.',
    );
  }

  if (!appBaseUrl) {
    throw new Error(
      'APP_BASE_URL belum dikonfigurasi.',
    );
  }

  if (!reimbursement.manager) {
    throw new Error(
      'Manager reimbursement tidak tersedia.',
    );
  }

  const response =
    await fetch(
      webhookUrl,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',

          'x-n8n-secret':
            secret,
        },

        body:
          JSON.stringify({
            event:
              'REIMBURSEMENT_REQUEST_CREATED',

            reimbursement: {
              id:
                reimbursement.id,

              requestCode:
                reimbursement
                  .requestCode,

              reimbursementType:
                reimbursement
                  .reimbursementType,

              expenseDate:
                reimbursement
                  .expenseDate
                  .toISOString()
                  .slice(
                    0,
                    10,
                  ),

              amount:
                reimbursement
                  .amount
                  .toString(),

              currency:
                reimbursement
                  .currency,

              merchant:
                reimbursement
                  .merchant,

              reason:
                reimbursement
                  .reason,

              receiptUrl:
                reimbursement
                  .receiptUrl,

              receiptFileName:
                reimbursement
                  .receiptFileName,

              status:
                reimbursement
                  .status,

              managerDecision:
                reimbursement
                  .managerDecision,

              policySource:
                reimbursement
                  .policySource,

              workflowStatus:
                reimbursement
                  .workflowStatus,
            },

            employee:
              reimbursement
                .employee,

            manager:
              reimbursement
                .manager,

            callbacks: {
              managerDecision:
                `${appBaseUrl}/api/reimbursement/${encodeURIComponent(
                  reimbursement.id,
                )}/manager-decision`,

              workflowStatus:
                `${appBaseUrl}/api/reimbursement/${encodeURIComponent(
                  reimbursement.id,
                )}/workflow-status`,
            },
          }),
      },
    );

  const responseData =
    await response
      .json()
      .catch(
        () => null,
      );

  if (!response.ok) {
    const message =
      responseData &&
      typeof responseData ===
        'object' &&
      'error' in
        responseData
        ? String(
            (
              responseData as {
                error:
                  unknown;
              }
            ).error,
          )
        : `n8n reimbursement webhook gagal (${response.status}).`;

    throw new Error(
      message,
    );
  }

  return responseData;
}
