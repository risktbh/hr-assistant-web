type OvertimeWorkflowInput = {
  id: string;

  requestCode: string;

  startAt: Date;

  endAt: Date;

  timezone: string;

  durationMinutes: number;

  reason: string;

  projectName:
    string | null;

  taskReference:
    string | null;

  status: string;

  approvalStage:
    string;

  requiresSecondApproval:
    boolean;

  policySource:
    string | null;

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

  secondApprover?: {
    id: string;
    name: string;
    email: string;
    position: string;
    department: string;
  } | null;
};

/* =========================================================
   TRIGGER N8N
========================================================= */

export async function triggerN8nOvertimeWorkflow(
  overtime:
    OvertimeWorkflowInput,
) {
  const webhookUrl =
    process.env
      .N8N_OVERTIME_WEBHOOK_URL
      ?.trim();

  const secret =
    process.env
      .N8N_SHARED_SECRET
      ?.trim();

  const appBaseUrl =
    process.env
      .APP_BASE_URL
      ?.trim();

  if (!webhookUrl) {
    throw new Error(
      'N8N_OVERTIME_WEBHOOK_URL belum dikonfigurasi.',
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

  if (!overtime.manager) {
    throw new Error(
      'Manager overtime tidak tersedia.',
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
              'OVERTIME_REQUEST_CREATED',

            overtime: {
              id:
                overtime.id,

              requestCode:
                overtime.requestCode,

              startAt:
                overtime.startAt
                  .toISOString(),

              endAt:
                overtime.endAt
                  .toISOString(),

              timezone:
                overtime.timezone,

              durationMinutes:
                overtime
                  .durationMinutes,

              reason:
                overtime.reason,

              projectName:
                overtime
                  .projectName,

              taskReference:
                overtime
                  .taskReference,

              status:
                overtime.status,

              approvalStage:
                overtime
                  .approvalStage,

              requiresSecondApproval:
                overtime
                  .requiresSecondApproval,

              policySource:
                overtime
                  .policySource,
            },

            employee:
              overtime.employee,

            manager:
              overtime.manager,

            secondApprover:
              overtime
                .secondApprover ??
              null,

            callbacks: {
              managerDecision:
                `${appBaseUrl}/api/overtime/${encodeURIComponent(
                  overtime.id,
                )}/manager-decision`,

              secondDecision:
                `${appBaseUrl}/api/overtime/${encodeURIComponent(
                  overtime.id,
                )}/second-decision`,

              workflowStatus:
                `${appBaseUrl}/api/overtime/${encodeURIComponent(
                  overtime.id,
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
    throw new Error(
      responseData?.error ||
      `n8n webhook gagal (${response.status}).`,
    );
  }

  return responseData;
}