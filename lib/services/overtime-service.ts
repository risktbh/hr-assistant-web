import {
  ApprovalDecision,
  OvertimeApprovalStage,
  OvertimeStatus,
  Prisma,
  WorkflowStatus,
} from '@prisma/client';

import {
  randomBytes,
} from 'node:crypto';

import {
  prisma,
} from '@/lib/db/prisma';

/* =========================================================
   TYPES
========================================================= */

export type CreateOvertimeInput = {
  requestCode?: string;

  employeeId: string;

  startAt:
    | Date
    | string;

  endAt:
    | Date
    | string;

  reason: string;

  timezone?: string;

  projectName?: string;

  taskReference?: string;

  requiresSecondApproval?: boolean;

  policyResult?:
    | Prisma.InputJsonValue
    | null;

  policySource?: string;

  actorType?: string;

  actorId?: string;
};

export type DecideOvertimeInput = {
  requestId: string;

  managerId: string;

  note?: string;
};

export type CancelOvertimeInput = {
  requestId: string;

  actorId?: string;

  actorType?: string;

  reason?: string;
};

export type UpdateWorkflowInput = {
  requestId: string;

  workflowStatus:
    WorkflowStatus;

  workflowRunId?: string;

  metadata?:
    Prisma.InputJsonValue;
};

export type SecondApprovalInput = {
  requestId: string;

  secondApproverId: string;

  note?: string;
};

export type AssignSecondApproverInput = {
  requestId: string;

  secondApproverId: string;

  actorType?: string;

  actorId?: string;
};

/* =========================================================
   SERVICE ERROR
========================================================= */

export class OvertimeServiceError
  extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);

    this.name =
      'OvertimeServiceError';
  }
}

/* =========================================================
   SHARED INCLUDE
========================================================= */

const overtimeInclude = {
  employee: {
    select: {
      id: true,
      name: true,
      email: true,
      position: true,
      department: true,
    },
  },

  manager: {
    select: {
      id: true,
      name: true,
      email: true,
      position: true,
      department: true,
    },
  },

  secondApprover: {
    select: {
      id: true,
      name: true,
      email: true,
      position: true,
      department: true,
    },
  },
} satisfies Prisma.OvertimeRequestInclude;

/* =========================================================
   DATE HELPERS
========================================================= */

function parseDate(
  value: Date | string,
  fieldName: string,
) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    throw new OvertimeServiceError(
      'INVALID_DATETIME',
      `${fieldName} tidak valid.`,
    );
  }

  return date;
}

function calculateDurationMinutes(
  startAt: Date,
  endAt: Date,
) {
  const difference =
    endAt.getTime() -
    startAt.getTime();

  if (difference <= 0) {
    throw new OvertimeServiceError(
      'INVALID_OVERTIME_RANGE',
      'Waktu selesai lembur harus setelah waktu mulai.',
    );
  }

  const durationMinutes =
    Math.floor(
      difference /
        (1000 * 60),
    );

  if (
    durationMinutes < 1
  ) {
    throw new OvertimeServiceError(
      'INVALID_OVERTIME_DURATION',
      'Durasi lembur minimal 1 menit.',
    );
  }

  return durationMinutes;
}

/* =========================================================
   REQUEST CODE
========================================================= */

function getDateCode(
  date: Date,
  timezone: string,
) {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: timezone,

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',
      },
    );

  const parts =
    formatter.formatToParts(
      date,
    );

  const year =
    parts.find(
      (part) =>
        part.type ===
        'year',
    )?.value;

  const month =
    parts.find(
      (part) =>
        part.type ===
        'month',
    )?.value;

  const day =
    parts.find(
      (part) =>
        part.type ===
        'day',
    )?.value;

  if (
    !year ||
    !month ||
    !day
  ) {
    throw new OvertimeServiceError(
      'DATE_FORMAT_ERROR',
      'Gagal membuat kode tanggal overtime.',
      500,
    );
  }

  return `${year}${month}${day}`;
}

function generateRandomCode(
  length = 6,
) {
  /*
   * Hilangkan karakter ambigu
   * seperti O/0 dan I/1.
   */
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const bytes =
    randomBytes(length);

  let result = '';

  for (
    let index = 0;
    index < length;
    index++
  ) {
    result +=
      alphabet[
        bytes[index] %
          alphabet.length
      ];
  }

  return result;
}

function generateRequestCode(
  date: Date,
  timezone: string,
) {
  const dateCode =
    getDateCode(
      date,
      timezone,
    );

  const randomCode =
    generateRandomCode();

  return (
    `OT-${dateCode}-${randomCode}`
  );
}

/* =========================================================
   AUDIT LOG HELPER
========================================================= */

type AuditInput = {
  entityId: string;

  action: string;

  actorType: string;

  actorId?: string;

  metadata?:
    Prisma.InputJsonValue;
};

async function createAuditLog(
  tx:
    Prisma.TransactionClient,

  input:
    AuditInput,
) {
  await tx.auditLog.create({
    data: {
      entityType:
        'OVERTIME_REQUEST',

      entityId:
        input.entityId,

      action:
        input.action,

      actorType:
        input.actorType,

      actorId:
        input.actorId,

      metadata:
        input.metadata,
    },
  });
}

/* =========================================================
   GET REQUEST INTERNAL
========================================================= */

async function findOvertimeRequest(
  tx:
    Prisma.TransactionClient,

  requestId: string,
) {
  const request =
    await tx.overtimeRequest.findFirst(
      {
        where: {
          OR: [
            {
              id:
                requestId,
            },
            {
              requestCode:
                requestId,
            },
          ],
        },

        include:
          overtimeInclude,
      },
    );

  if (!request) {
    throw new OvertimeServiceError(
      'OVERTIME_NOT_FOUND',
      'Pengajuan lembur tidak ditemukan.',
      404,
    );
  }

  return request;
}

/* =========================================================
   CREATE OVERTIME REQUEST
========================================================= */

export async function createOvertimeRequest(
  input: CreateOvertimeInput, 
) {
  const employeeId =
    input.employeeId?.trim();

  const reason =
    input.reason?.trim();

  if (!employeeId) {
    throw new OvertimeServiceError(
      'EMPLOYEE_REQUIRED',
      'Employee ID wajib diisi.',
    );
  }

  if (!reason) {
    throw new OvertimeServiceError(
      'REASON_REQUIRED',
      'Alasan lembur wajib diisi.',
    );
  }

  const timezone =
    input.timezone?.trim() ||
    'Asia/Jakarta';

  const startAt =
    parseDate(
      input.startAt,
      'Waktu mulai',
    );

  const endAt =
    parseDate(
      input.endAt,
      'Waktu selesai',
    );

  const durationMinutes =
    calculateDurationMinutes(
      startAt,
      endAt,
    );
  const requiresSecondApproval =
    Boolean(
        input.requiresSecondApproval,
    );

  /*
   * Employee + Manager harus
   * diketahui sebelum request dibuat.
   */
  const employee =
    await prisma.employee.findUnique(
      {
        where: {
          id:
            employeeId,
        },

        include: {
          manager: {
            select: {
              id: true,
              name: true,
              email: true,
              position: true,
              department: true,
            },
          },
        },
      },
    );

  if (!employee) {
    throw new OvertimeServiceError(
      'EMPLOYEE_NOT_FOUND',
      'Data karyawan tidak ditemukan.',
      404,
    );
  }

  if (
    !employee.managerId ||
    !employee.manager
  ) {
    throw new OvertimeServiceError(
      'MANAGER_NOT_ASSIGNED',
      `Manager untuk ${employee.name} belum ditentukan.`,
      422,
    );
  }
  const suppliedRequestCode =
    input.requestCode
        ?.trim();

    if (
    suppliedRequestCode &&
    !/^OT-\d{8}-[A-Z2-9]{6}$/.test(
        suppliedRequestCode,
    )
    ) {
    throw new OvertimeServiceError(
        'INVALID_REQUEST_CODE',
        'Format request code overtime tidak valid.',
        400,
    );
    }

    const requestCode =
    suppliedRequestCode ||
    generateRequestCode(
        new Date(),
        timezone,
    );

    /* =========================================================
    IDEMPOTENCY CHECK
    ========================================================= */

    if (
    suppliedRequestCode
    ) {
    const existing =
        await prisma
        .overtimeRequest
        .findUnique({
            where: {
            requestCode:
                suppliedRequestCode,
            },

            include:
            overtimeInclude,
        });

    if (existing) {

        const sameRequest =
        existing.employeeId ===
            employee.id &&
        existing.startAt.getTime() ===
            startAt.getTime() &&
        existing.endAt.getTime() ===
            endAt.getTime() &&
        existing.reason ===
            reason &&
        existing.requiresSecondApproval ===
            requiresSecondApproval;

        if (!sameRequest) {
        throw new OvertimeServiceError(
            'REQUEST_CODE_CONFLICT',
            'Request code sudah digunakan oleh pengajuan overtime yang berbeda.',
            409,
        );
        }

        console.info(
        '[OVERTIME IDEMPOTENT HIT]',
        {
            requestCode:
            existing.requestCode,

            employeeId:
            existing.employeeId,
        },
        );

        return existing;
    }
    }

    /* =========================================================
    CREATE REQUEST
    ========================================================= */

    try {
    const request =
        await prisma.$transaction(
        async (tx) => {
            const created =
            await tx
                .overtimeRequest
                .create({
                data: {
                    requestCode,

                    employeeId:
                    employee.id,

                    managerId:
                    employee.managerId,

                    startAt,

                    endAt,

                    timezone,

                    durationMinutes,

                    reason,

                    projectName:
                    input.projectName
                        ?.trim() ||
                    null,

                    taskReference:
                    input.taskReference
                        ?.trim() ||
                    null,

                    status:
                    OvertimeStatus.PENDING,

                    approvalStage:
                    OvertimeApprovalStage
                        .MANAGER,

                    requiresSecondApproval,

                    managerDecision:
                    ApprovalDecision
                        .PENDING,

                    secondDecision:
                    requiresSecondApproval
                        ? ApprovalDecision.PENDING
                        : null,

                    policyResult:
                    input.policyResult ??
                    undefined,

                    policySource:
                    input.policySource
                        ?.trim() ||
                    null,

                    workflowStatus:
                    WorkflowStatus
                        .NOT_STARTED,
                },

                include:
                    overtimeInclude,
                });

            await createAuditLog(
            tx,
            {
                entityId:
                created.id,

                action:
                'OVERTIME_REQUEST_CREATED',

                actorType:
                input.actorType ||
                'AI_AGENT',

                actorId:
                input.actorId,

                metadata: {
                requestCode:
                    created.requestCode,

                employeeId:
                    created.employeeId,

                managerId:
                    created.managerId,

                startAt:
                    created.startAt
                    .toISOString(),

                endAt:
                    created.endAt
                    .toISOString(),

                durationMinutes:
                    created
                    .durationMinutes,

                reason:
                    created.reason,
                approvalStage:
                    created.approvalStage,

                requiresSecondApproval:
                    created.requiresSecondApproval,

                managerDecision:
                    created.managerDecision,

                secondDecision:
                    created.secondDecision,

                policySource:
                    created.policySource,

                workflowStatus:
                    created
                    .workflowStatus,
                },
            },
            );

            return created;
        },
        );

    return request;
    } catch (error) {

    if (
        error instanceof
        Prisma.PrismaClientKnownRequestError &&
        error.code ===
        'P2002' &&
        suppliedRequestCode
    ) {
        const existing =
        await prisma
            .overtimeRequest
            .findUnique({
            where: {
                requestCode:
                suppliedRequestCode,
            },

            include:
                overtimeInclude,
            });

        if (existing) {
        const sameRequest =
            existing.employeeId ===
            employee.id &&
            existing.startAt.getTime() ===
            startAt.getTime() &&
            existing.endAt.getTime() ===
            endAt.getTime() &&
            existing.reason ===
            reason &&
            existing.requiresSecondApproval ===
              requiresSecondApproval;

        if (sameRequest) {
            console.info(
            '[OVERTIME IDEMPOTENT RACE RECOVERED]',
            {
                requestCode:
                existing.requestCode,
            },
            );

            return existing;
        }
        }

        throw new OvertimeServiceError(
        'REQUEST_CODE_CONFLICT',
        'Request code sudah digunakan oleh pengajuan overtime lain.',
        409,
        );
    }

    throw error;
    }
}

/* =========================================================
   GET SINGLE REQUEST
========================================================= */

export async function getOvertimeRequest(
  requestId: string,
) {
  const request =
    await prisma.overtimeRequest.findFirst(
      {
        where: {
          OR: [
            {
              id:
                requestId,
            },
            {
              requestCode:
                requestId,
            },
          ],
        },

        include:
          overtimeInclude,
      },
    );

  if (!request) {
    throw new OvertimeServiceError(
      'OVERTIME_NOT_FOUND',
      'Pengajuan lembur tidak ditemukan.',
      404,
    );
  }

  return request;
}

/* =========================================================
   GET EMPLOYEE REQUESTS
========================================================= */

export async function getEmployeeOvertimeRequests(
  employeeId: string,
  options?: {
    limit?: number;
    status?: OvertimeStatus;
  },
) {
  const limit =
    Math.min(
      Math.max(
        options?.limit ??
          20,
        1,
      ),
      100,
    );

  return prisma
    .overtimeRequest
    .findMany({
      where: {
        employeeId,

        ...(options?.status
          ? {
              status:
                options.status,
            }
          : {}),
      },

      include:
        overtimeInclude,

      orderBy: {
        requestedAt:
          'desc',
      },

      take:
        limit,
    });
}

/* =========================================================
   APPROVE REQUEST
========================================================= */

export async function approveOvertimeRequest(
  input: DecideOvertimeInput,
) {
  const managerId =
    input.managerId?.trim();

  if (!managerId) {
    throw new OvertimeServiceError(
      'MANAGER_REQUIRED',
      'Manager ID wajib diisi.',
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const current =
        await findOvertimeRequest(
          tx,
          input.requestId,
        );

      /* =====================================================
         IDEMPOTENT APPROVAL
      ===================================================== */

      if (
        current.managerId ===
          managerId &&
        current.managerDecision ===
          ApprovalDecision.APPROVED
      ) {
        return current;
      }

      /* =====================================================
         VALIDATE STATUS
      ===================================================== */

      if (
        current.status !==
        OvertimeStatus.PENDING
      ) {
        throw new OvertimeServiceError(
          'INVALID_OVERTIME_STATUS',
          `Pengajuan dengan status ${current.status} tidak dapat disetujui manager.`,
          409,
        );
      }

      if (
        current.approvalStage !==
        OvertimeApprovalStage.MANAGER
      ) {
        throw new OvertimeServiceError(
          'INVALID_APPROVAL_STAGE',
          `Pengajuan sedang berada pada tahap ${current.approvalStage}.`,
          409,
        );
      }

      if (
        current.managerId !==
        managerId
      ) {
        throw new OvertimeServiceError(
          'UNAUTHORIZED_APPROVER',
          'Anda bukan manager yang berwenang menyetujui pengajuan ini.',
          403,
        );
      }

      if (
        current.managerDecision !==
        ApprovalDecision.PENDING
      ) {
        throw new OvertimeServiceError(
          'MANAGER_ALREADY_DECIDED',
          'Manager sudah memberikan keputusan untuk pengajuan ini.',
          409,
        );
      }

      const now =
        new Date();

      /* =====================================================
         SECOND APPROVAL REQUIRED
      ===================================================== */

      const requiresSecondApproval =
        current
          .requiresSecondApproval;

      const updateResult =
        await tx
          .overtimeRequest
          .updateMany({
            where: {
              id:
                current.id,

              status:
                OvertimeStatus.PENDING,

              approvalStage:
                OvertimeApprovalStage
                  .MANAGER,

              managerDecision:
                ApprovalDecision
                  .PENDING,
            },

            data:
              requiresSecondApproval
                ? {
                    /*
                     * Manager selesai,
                     * tetapi request BELUM final.
                     */
                    managerDecision:
                      ApprovalDecision
                        .APPROVED,

                    managerDecisionNote:
                      input.note
                        ?.trim() ||
                      null,

                    managerDecidedAt:
                      now,

                    approvalStage:
                      OvertimeApprovalStage
                        .SECOND_APPROVER,

                    secondDecision:
                      ApprovalDecision
                        .PENDING,

                    status:
                      OvertimeStatus
                        .PENDING,
                  }
                : {
                    /*
                     * Tidak perlu second approval.
                     * Manager adalah final approver.
                     */
                    managerDecision:
                      ApprovalDecision
                        .APPROVED,

                    managerDecisionNote:
                      input.note
                        ?.trim() ||
                      null,

                    managerDecidedAt:
                      now,

                    approvalStage:
                      OvertimeApprovalStage
                        .COMPLETED,

                    status:
                      OvertimeStatus
                        .APPROVED,

                    decisionNote:
                      input.note
                        ?.trim() ||
                      null,

                    decidedAt:
                      now,
                  },
          });

      /*
       * Protect against concurrent approval.
       */
      if (
        updateResult.count !== 1
      ) {
        throw new OvertimeServiceError(
          'APPROVAL_CONFLICT',
          'Status pengajuan berubah saat proses approval. Silakan muat ulang data.',
          409,
        );
      }

      const updated =
        await findOvertimeRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'OVERTIME_MANAGER_APPROVED',

          actorType:
            'MANAGER',

          actorId:
            managerId,

          metadata: {
            previousStatus:
              current.status,

            newStatus:
              updated.status,

            previousApprovalStage:
              current.approvalStage,

            newApprovalStage:
              updated.approvalStage,

            managerDecision:
              updated.managerDecision,

            requiresSecondApproval:
              updated
                .requiresSecondApproval,

            finalApproval:
              updated.status ===
              OvertimeStatus.APPROVED,

            decisionNote:
              updated
                .managerDecisionNote,
          },
        },
      );

      return updated;
    },
  );
}

/* =========================================================
   REJECT REQUEST
========================================================= */

export async function rejectOvertimeRequest(
  input: DecideOvertimeInput,
) {
  const managerId =
    input.managerId?.trim();

  const note =
    input.note?.trim();

  if (!managerId) {
    throw new OvertimeServiceError(
      'MANAGER_REQUIRED',
      'Manager ID wajib diisi.',
    );
  }

  if (!note) {
    throw new OvertimeServiceError(
      'REJECTION_NOTE_REQUIRED',
      'Alasan penolakan wajib diisi.',
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const current =
        await findOvertimeRequest(
          tx,
          input.requestId,
        );

      /* IDEMPOTENT */

      if (
        current.managerId ===
          managerId &&
        current.managerDecision ===
          ApprovalDecision.REJECTED
      ) {
        return current;
      }

      if (
        current.status !==
        OvertimeStatus.PENDING
      ) {
        throw new OvertimeServiceError(
          'INVALID_OVERTIME_STATUS',
          `Pengajuan dengan status ${current.status} tidak dapat ditolak.`,
          409,
        );
      }

      if (
        current.approvalStage !==
        OvertimeApprovalStage.MANAGER
      ) {
        throw new OvertimeServiceError(
          'INVALID_APPROVAL_STAGE',
          'Pengajuan sudah tidak berada pada tahap manager approval.',
          409,
        );
      }

      if (
        current.managerId !==
        managerId
      ) {
        throw new OvertimeServiceError(
          'UNAUTHORIZED_APPROVER',
          'Anda bukan manager yang berwenang menolak pengajuan ini.',
          403,
        );
      }

      if (
        current.managerDecision !==
        ApprovalDecision.PENDING
      ) {
        throw new OvertimeServiceError(
          'MANAGER_ALREADY_DECIDED',
          'Manager sudah memberikan keputusan.',
          409,
        );
      }

      const now =
        new Date();

      const result =
        await tx
          .overtimeRequest
          .updateMany({
            where: {
              id:
                current.id,

              status:
                OvertimeStatus.PENDING,

              approvalStage:
                OvertimeApprovalStage
                  .MANAGER,

              managerDecision:
                ApprovalDecision
                  .PENDING,
            },

            data: {
              managerDecision:
                ApprovalDecision
                  .REJECTED,

              managerDecisionNote:
                note,

              managerDecidedAt:
                now,

              approvalStage:
                OvertimeApprovalStage
                  .COMPLETED,

              status:
                OvertimeStatus
                  .REJECTED,

              decisionNote:
                note,

              decidedAt:
                now,
            },
          });

      if (
        result.count !== 1
      ) {
        throw new OvertimeServiceError(
          'APPROVAL_CONFLICT',
          'Status pengajuan berubah saat proses rejection.',
          409,
        );
      }

      const updated =
        await findOvertimeRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'OVERTIME_MANAGER_REJECTED',

          actorType:
            'MANAGER',

          actorId:
            managerId,

          metadata: {
            previousStatus:
              current.status,

            newStatus:
              updated.status,

            previousApprovalStage:
              current.approvalStage,

            newApprovalStage:
              updated.approvalStage,

            managerDecision:
              updated.managerDecision,

            decisionNote:
              note,
          },
        },
      );

      return updated;
    },
  );
}

export async function assignSecondApprover(
  input: AssignSecondApproverInput,
) {
  const secondApproverId =
    input.secondApproverId?.trim();

  if (!secondApproverId) {
    throw new OvertimeServiceError(
      'SECOND_APPROVER_REQUIRED',
      'Second approver wajib ditentukan.',
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const current =
        await findOvertimeRequest(
          tx,
          input.requestId,
        );

      /* =====================================================
         SECOND APPROVAL MUST BE REQUIRED
      ===================================================== */

      if (
        !current.requiresSecondApproval
      ) {
        throw new OvertimeServiceError(
          'SECOND_APPROVAL_NOT_REQUIRED',
          'Pengajuan ini tidak membutuhkan second approval.',
          409,
        );
      }

      /* =====================================================
         VALIDATE STATE
      ===================================================== */

      if (
        current.status !==
          OvertimeStatus.PENDING ||
        current.approvalStage !==
          OvertimeApprovalStage.SECOND_APPROVER
      ) {
        throw new OvertimeServiceError(
          'INVALID_APPROVAL_STAGE',
          'Pengajuan belum berada pada tahap second approval.',
          409,
        );
      }

      /*
       * Stage SECOND_APPROVER seharusnya hanya
       * dapat dicapai setelah manager approve.
       */
      if (
        current.managerDecision !==
        ApprovalDecision.APPROVED
      ) {
        throw new OvertimeServiceError(
          'MANAGER_APPROVAL_REQUIRED',
          'Manager harus menyetujui pengajuan sebelum second approver ditentukan.',
          409,
        );
      }

      /* =====================================================
         IDEMPOTENT ASSIGNMENT
      ===================================================== */

      if (
        current.secondApproverId ===
        secondApproverId
      ) {
        return current;
      }

      /*
       * Jangan silent reassign.
       */
      if (
        current.secondApproverId &&
        current.secondApproverId !==
          secondApproverId
      ) {
        throw new OvertimeServiceError(
          'SECOND_APPROVER_ALREADY_ASSIGNED',
          'Second approver sudah ditentukan dan tidak dapat diganti melalui proses ini.',
          409,
        );
      }

      /* =====================================================
         SEPARATION OF DUTIES
      ===================================================== */

      if (
        secondApproverId ===
          current.employeeId ||
        secondApproverId ===
          current.managerId
      ) {
        throw new OvertimeServiceError(
          'INVALID_SECOND_APPROVER',
          'Second approver harus berbeda dari employee dan line manager.',
          422,
        );
      }

      /* =====================================================
         CHECK APPROVER EXISTS
      ===================================================== */

      const approver =
        await tx.employee.findUnique({
          where: {
            id:
              secondApproverId,
          },

          select: {
            id: true,
            name: true,
            email: true,
            position: true,
            department: true,
          },
        });

      if (!approver) {
        throw new OvertimeServiceError(
          'SECOND_APPROVER_NOT_FOUND',
          'Data second approver tidak ditemukan.',
          404,
        );
      }

      /* =====================================================
         CONDITIONAL ASSIGNMENT
      ===================================================== */

      const result =
        await tx.overtimeRequest.updateMany({
          where: {
            id:
              current.id,

            status:
              OvertimeStatus.PENDING,

            approvalStage:
              OvertimeApprovalStage.SECOND_APPROVER,

            managerDecision:
              ApprovalDecision.APPROVED,

            secondApproverId:
              null,

            secondDecision:
              ApprovalDecision.PENDING,
          },

          data: {
            secondApproverId,
          },
        });

      /*
       * Assignment lain mungkin masuk
       * secara concurrent.
       */
      if (
        result.count !== 1
      ) {
        const latest =
          await findOvertimeRequest(
            tx,
            current.id,
          );

        /*
         * Jika request concurrent melakukan
         * assignment approver yang sama,
         * perlakukan sebagai idempotent.
         */
        if (
          latest.secondApproverId ===
          secondApproverId
        ) {
          return latest;
        }

        throw new OvertimeServiceError(
          'SECOND_APPROVER_ASSIGNMENT_CONFLICT',
          'Second approver atau status pengajuan berubah saat proses assignment.',
          409,
        );
      }

      const updated =
        await findOvertimeRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'OVERTIME_SECOND_APPROVER_ASSIGNED',

          actorType:
            input.actorType ||
            'AUTOMATION',

          actorId:
            input.actorId,

          metadata: {
            secondApproverId:
              approver.id,

            secondApproverName:
              approver.name,

            secondApproverEmail:
              approver.email,

            approvalStage:
              updated.approvalStage,

            managerDecision:
              updated.managerDecision,
          },
        },
      );

      return updated;
    },
  );
}
export async function approveSecondOvertimeRequest(
  input: SecondApprovalInput,
) {
  const secondApproverId =
    input.secondApproverId?.trim();

  if (!secondApproverId) {
    throw new OvertimeServiceError(
      'SECOND_APPROVER_REQUIRED',
      'Second approver ID wajib diisi.',
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const current =
        await findOvertimeRequest(
          tx,
          input.requestId,
        );

      /* IDEMPOTENT */

      if (
        current.secondApproverId ===
          secondApproverId &&
        current.secondDecision ===
          ApprovalDecision.APPROVED &&
        current.status ===
          OvertimeStatus.APPROVED
      ) {
        return current;
      }

      if (
        !current
          .requiresSecondApproval
      ) {
        throw new OvertimeServiceError(
          'SECOND_APPROVAL_NOT_REQUIRED',
          'Pengajuan ini tidak membutuhkan second approval.',
          409,
        );
      }

      if (
        current.status !==
        OvertimeStatus.PENDING
      ) {
        throw new OvertimeServiceError(
          'INVALID_OVERTIME_STATUS',
          `Pengajuan dengan status ${current.status} tidak dapat diproses.`,
          409,
        );
      }

      if (
        current.approvalStage !==
        OvertimeApprovalStage
          .SECOND_APPROVER
      ) {
        throw new OvertimeServiceError(
          'INVALID_APPROVAL_STAGE',
          'Pengajuan tidak berada pada tahap second approval.',
          409,
        );
      }

      if (
        current.managerDecision !==
        ApprovalDecision.APPROVED
      ) {
        throw new OvertimeServiceError(
          'MANAGER_APPROVAL_REQUIRED',
          'Manager belum menyetujui pengajuan ini.',
          409,
        );
      }

      if (
        !current.secondApproverId
      ) {
        throw new OvertimeServiceError(
          'SECOND_APPROVER_NOT_ASSIGNED',
          'Second approver belum ditentukan.',
          422,
        );
      }

      if (
        current.secondApproverId !==
        secondApproverId
      ) {
        throw new OvertimeServiceError(
          'UNAUTHORIZED_SECOND_APPROVER',
          'Anda bukan second approver yang berwenang.',
          403,
        );
      }

      if (
        current.secondDecision !==
        ApprovalDecision.PENDING
      ) {
        throw new OvertimeServiceError(
          'SECOND_APPROVER_ALREADY_DECIDED',
          'Second approver sudah memberikan keputusan.',
          409,
        );
      }

      const now =
        new Date();

      const result =
        await tx
          .overtimeRequest
          .updateMany({
            where: {
              id:
                current.id,

              status:
                OvertimeStatus.PENDING,

              approvalStage:
                OvertimeApprovalStage
                  .SECOND_APPROVER,

              secondApproverId,

              secondDecision:
                ApprovalDecision
                  .PENDING,
            },

            data: {
              secondDecision:
                ApprovalDecision
                  .APPROVED,

              secondDecisionNote:
                input.note
                  ?.trim() ||
                null,

              secondDecidedAt:
                now,

              status:
                OvertimeStatus
                  .APPROVED,

              approvalStage:
                OvertimeApprovalStage
                  .COMPLETED,

              decisionNote:
                input.note
                  ?.trim() ||
                null,

              decidedAt:
                now,
            },
          });

      if (
        result.count !== 1
      ) {
        throw new OvertimeServiceError(
          'APPROVAL_CONFLICT',
          'Status pengajuan berubah saat second approval.',
          409,
        );
      }

      const updated =
        await findOvertimeRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'OVERTIME_SECOND_APPROVED',

          actorType:
            'SECOND_APPROVER',

          actorId:
            secondApproverId,

          metadata: {
            previousStatus:
              current.status,

            newStatus:
              updated.status,

            previousApprovalStage:
              current.approvalStage,

            newApprovalStage:
              updated.approvalStage,

            secondDecision:
              updated.secondDecision,

            decisionNote:
              updated
                .secondDecisionNote,
          },
        },
      );

      return updated;
    },
  );
}

export async function rejectSecondOvertimeRequest(
  input: SecondApprovalInput,
) {
  const secondApproverId =
    input.secondApproverId?.trim();

  const note =
    input.note?.trim();

  if (!secondApproverId) {
    throw new OvertimeServiceError(
      'SECOND_APPROVER_REQUIRED',
      'Second approver ID wajib diisi.',
    );
  }

  if (!note) {
    throw new OvertimeServiceError(
      'REJECTION_NOTE_REQUIRED',
      'Alasan penolakan wajib diisi.',
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const current =
        await findOvertimeRequest(
          tx,
          input.requestId,
        );

      if (
        current.secondApproverId ===
          secondApproverId &&
        current.secondDecision ===
          ApprovalDecision.REJECTED &&
        current.status ===
          OvertimeStatus.REJECTED
      ) {
        return current;
      }

      if (
        !current
          .requiresSecondApproval
      ) {
        throw new OvertimeServiceError(
          'SECOND_APPROVAL_NOT_REQUIRED',
          'Pengajuan ini tidak membutuhkan second approval.',
          409,
        );
      }

      if (
        current.status !==
          OvertimeStatus.PENDING ||
        current.approvalStage !==
          OvertimeApprovalStage
            .SECOND_APPROVER
      ) {
        throw new OvertimeServiceError(
          'INVALID_APPROVAL_STAGE',
          'Pengajuan tidak berada pada tahap second approval.',
          409,
        );
      }

      if (
        current.managerDecision !==
        ApprovalDecision.APPROVED
      ) {
        throw new OvertimeServiceError(
          'MANAGER_APPROVAL_REQUIRED',
          'Manager belum menyetujui pengajuan ini.',
          409,
        );
      }

      if (
        !current.secondApproverId ||
        current.secondApproverId !==
          secondApproverId
      ) {
        throw new OvertimeServiceError(
          'UNAUTHORIZED_SECOND_APPROVER',
          'Anda bukan second approver yang berwenang.',
          403,
        );
      }

      const now =
        new Date();

      const result =
        await tx
          .overtimeRequest
          .updateMany({
            where: {
              id:
                current.id,

              status:
                OvertimeStatus.PENDING,

              approvalStage:
                OvertimeApprovalStage
                  .SECOND_APPROVER,

              secondApproverId,

              secondDecision:
                ApprovalDecision
                  .PENDING,
            },

            data: {
              secondDecision:
                ApprovalDecision
                  .REJECTED,

              secondDecisionNote:
                note,

              secondDecidedAt:
                now,

              status:
                OvertimeStatus
                  .REJECTED,

              approvalStage:
                OvertimeApprovalStage
                  .COMPLETED,

              decisionNote:
                note,

              decidedAt:
                now,
            },
          });

      if (
        result.count !== 1
      ) {
        throw new OvertimeServiceError(
          'APPROVAL_CONFLICT',
          'Status pengajuan berubah saat second rejection.',
          409,
        );
      }

      const updated =
        await findOvertimeRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'OVERTIME_SECOND_REJECTED',

          actorType:
            'SECOND_APPROVER',

          actorId:
            secondApproverId,

          metadata: {
            previousStatus:
              current.status,

            newStatus:
              updated.status,

            previousApprovalStage:
              current.approvalStage,

            newApprovalStage:
              updated.approvalStage,

            secondDecision:
              updated.secondDecision,

            decisionNote:
              note,
          },
        },
      );

      return updated;
    },
  );
}

/* =========================================================
   CANCEL REQUEST
========================================================= */

export async function cancelOvertimeRequest(
  input: CancelOvertimeInput,
) {
  return prisma.$transaction(
    async (tx) => {
      const current =
        await findOvertimeRequest(
          tx,
          input.requestId,
        );

      if (
        current.status !==
          OvertimeStatus.PENDING &&
        current.status !==
          OvertimeStatus.DRAFT
      ) {
        throw new OvertimeServiceError(
          'INVALID_OVERTIME_STATUS',
          `Pengajuan dengan status ${current.status} tidak dapat dibatalkan.`,
          409,
        );
      }

      const actorType =
        input.actorType?.trim() ||
        'EMPLOYEE';

        if (
        actorType ===
        'EMPLOYEE'
        ) {
        if (
            !input.actorId ||
            input.actorId !==
            current.employeeId
        ) {
            throw new OvertimeServiceError(
            'UNAUTHORIZED_CANCEL',
            'Anda tidak berhak membatalkan pengajuan ini.',
            403,
            );
        }
        }
      const result =
        await tx.overtimeRequest.updateMany({
          where: {
            id: current.id,
            status: current.status,
            approvalStage:
                current.approvalStage,
        },

        data: {
         status:
            OvertimeStatus.CANCELLED,

         approvalStage:
            OvertimeApprovalStage.COMPLETED,

         decisionNote:
            input.reason?.trim() ||
            'Dibatalkan oleh pengaju.',

         decidedAt:
            new Date(),
         },
        });

        if (
        result.count !== 1
        ) {
            throw new OvertimeServiceError(
             'CANCEL_CONFLICT',
             'Status pengajuan berubah saat proses pembatalan. Silakan muat ulang data.',
             409,
            );
        }

        const updated =
         await findOvertimeRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'OVERTIME_CANCELLED',

          actorType,

          actorId:
            input.actorId,

          metadata: {
            previousStatus:
              current.status,

            newStatus:
              updated.status,

            reason:
              input.reason ||
              null,
          },
        },
      );

      return updated;
    },
  );
}

/* =========================================================
   CLAIM N8N WORKFLOW TRIGGER
========================================================= */

export async function claimOvertimeWorkflowTrigger(
  requestId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const current =
        await findOvertimeRequest(
          tx,
          requestId,
        );

      /*
       * Jangan trigger ulang workflow
       * yang sudah berjalan / selesai.
       */
      if (
        current.workflowStatus ===
          WorkflowStatus.TRIGGERED ||
        current.workflowStatus ===
          WorkflowStatus.RUNNING ||
        current.workflowStatus ===
          WorkflowStatus.COMPLETED
      ) {
        return {
          claimed:
            false,

          request:
            current,
        };
      }

      /*
       * Hanya NOT_STARTED dan FAILED
       * yang dapat di-trigger.
       */
      if (
        current.workflowStatus !==
          WorkflowStatus.NOT_STARTED &&
        current.workflowStatus !==
          WorkflowStatus.FAILED
      ) {
        return {
          claimed:
            false,

          request:
            current,
        };
      }

      const result =
        await tx
          .overtimeRequest
          .updateMany({
            where: {
              id:
                current.id,

              workflowStatus:
                current
                  .workflowStatus,
            },

            data: {
              workflowStatus:
                WorkflowStatus
                  .TRIGGERED,
            },
          });

      /*
       * Request lain mungkin sudah
       * mengambil workflow ini.
       */
      if (
        result.count !==
        1
      ) {
        const latest =
          await findOvertimeRequest(
            tx,
            current.id,
          );

        return {
          claimed:
            false,

          request:
            latest,
        };
      }

      const updated =
        await findOvertimeRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'OVERTIME_WORKFLOW_TRIGGERED',

          actorType:
            'SYSTEM',

          actorId:
            'N8N_DISPATCHER',

          metadata: {
            previousWorkflowStatus:
              current
                .workflowStatus,

            newWorkflowStatus:
              updated
                .workflowStatus,
          },
        },
      );

      return {
        claimed:
          true,

        request:
          updated,
      };
    },
  );
}

/* =========================================================
   UPDATE N8N WORKFLOW STATUS
========================================================= */

export async function updateOvertimeWorkflow(
  input: UpdateWorkflowInput,
) {
  return prisma.$transaction(
    async (tx) => {
      const current =
        await findOvertimeRequest(
          tx,
          input.requestId,
        );

      const updated =
        await tx.overtimeRequest.update(
          {
            where: {
              id:
                current.id,
            },

            data: {
              workflowStatus:
                input.workflowStatus,

              workflowRunId:
                input.workflowRunId ??
                current.workflowRunId,
            },

            include:
              overtimeInclude,
          },
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'OVERTIME_WORKFLOW_UPDATED',

          actorType:
            'AUTOMATION',

          actorId:
            'N8N',

          metadata: {
            previousWorkflowStatus:
              current.workflowStatus,

            newWorkflowStatus:
              updated.workflowStatus,

            workflowRunId:
              updated.workflowRunId,

            ...(input.metadata
              ? {
                  detail:
                    input.metadata,
                }
              : {}),
          },
        },
      );

      return updated;
    },
  );
}