type LeaveWorkflowInput = {
  id: string;

  requestCode: string;

  leaveType: string;

  startDate: Date;

  endDate: Date;

  totalDays: number;

  reason:
    | string
    | null;

  status: string;

  policySource:
    | string
    | null;

  employee: {
    id: string;
    name: string;

    email:
        string | null;

    position:
        string | null;

    department:
        string | null;
    };

  manager: {
    id: string;
    name: string;

    email:
        string | null;

    position:
        string | null;

    department:
        string | null;
    } | null;
};

/* =========================================================
   TRIGGER N8N LEAVE WORKFLOW
========================================================= */

export async function triggerN8nLeaveWorkflow(
  leave: LeaveWorkflowInput,
) {
  const webhookUrl =
    process.env
      .N8N_LEAVE_WEBHOOK_URL
      ?.trim();

  const secret =
    process.env
      .N8N_SHARED_SECRET
      ?.trim();

  const appBaseUrl =
    process.env
      .APP_BASE_URL
      ?.trim();

  /* =======================================================
     CONFIG VALIDATION
  ======================================================= */

  if (!webhookUrl) {
    throw new Error(
      'N8N_LEAVE_WEBHOOK_URL belum dikonfigurasi.',
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

  if (!leave.manager) {
    throw new Error(
      'Manager leave tidak tersedia.',
    );
  }

  /* =======================================================
     SEND TO N8N
  ======================================================= */

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
              'LEAVE_REQUEST_CREATED',

            leave: {
              id:
                leave.id,

              requestCode:
                leave.requestCode,

              leaveType:
                leave.leaveType,

              startDate:
                leave.startDate
                  .toISOString()
                  .slice(
                    0,
                    10,
                  ),

              endDate:
                leave.endDate
                  .toISOString()
                  .slice(
                    0,
                    10,
                  ),

              totalDays:
                leave.totalDays,

              reason:
                leave.reason,

              status:
                leave.status,

              policySource:
                leave.policySource,
            },

            employee:
              leave.employee,

            manager:
              leave.manager,

            callbacks: {
              managerDecision:
                `${appBaseUrl}/api/leave/${encodeURIComponent(
                  leave.id,
                )}/manager-decision`,

              workflowStatus:
                `${appBaseUrl}/api/leave/${encodeURIComponent(
                  leave.id,
                )}/workflow-status`,
            },
          }),
      },
    );

  /* =======================================================
     N8N RESPONSE
  ======================================================= */

  const responseData =
    await response
      .json()
      .catch(
        () => null,
      );

  if (!response.ok) {
    const errorMessage =
      typeof responseData?.error ===
        'string'
        ? responseData.error
        : `n8n leave webhook gagal (${response.status}).`;

    throw new Error(
      errorMessage,
    );
  }

  return responseData;
}