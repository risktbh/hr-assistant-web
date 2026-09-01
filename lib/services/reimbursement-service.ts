import {
  ApprovalDecision,
  Prisma,
  ReimbursementStatus,
  ReimbursementType,
  WorkflowStatus,
} from '@prisma/client';

import {
  randomBytes,
} from 'node:crypto';

import {
  prisma,
} from '@/lib/db/prisma';

export type CreateReimbursementInput = {
  employeeId: string;
  reimbursementType: ReimbursementType;
  expenseDate: Date | string;
  amount: Prisma.Decimal | string | number;
  currency?: string;
  merchant?: string | null;
  reason: string;
  receiptUrl?: string | null;
  receiptFileName?: string | null;
  requestCode?: string;
  policyResult?: Prisma.InputJsonValue | null;
  policySource?: string | null;
  actorType?: string;
  actorId?: string | null;
};

export type DecideReimbursementInput = {
  requestId: string;
  managerId: string;
  note?: string | null;
};

export type CancelReimbursementInput = {
  requestId: string;
  employeeId: string;
  note?: string | null;
  actorType?: string;
  actorId?: string | null;
};

export type UpdateReimbursementWorkflowInput = {
  requestId: string;
  workflowStatus: WorkflowStatus;
  workflowRunId?: string | null;
  metadata?: Prisma.InputJsonValue | null;
};

export class ReimbursementServiceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'ReimbursementServiceError';
  }
}

const reimbursementInclude = {
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
} satisfies Prisma.ReimbursementRequestInclude;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeNullableText(
  value: string | null | undefined,
) {
  const normalized = value?.trim();
  return normalized || null;
}

function parseDateOnly(
  value: Date | string,
  fieldName: string,
) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ReimbursementServiceError(
        'INVALID_DATE',
        `${fieldName} tidak valid.`,
      );
    }

    return new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
      ),
    );
  }

  const normalized = value?.trim();

  if (
    !normalized ||
    !DATE_ONLY_PATTERN.test(normalized)
  ) {
    throw new ReimbursementServiceError(
      'INVALID_DATE',
      `${fieldName} harus menggunakan format YYYY-MM-DD.`,
    );
  }

  const [yearString, monthString, dayString] =
    normalized.split('-');

  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day,
    ),
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new ReimbursementServiceError(
      'INVALID_DATE',
      `${fieldName} tidak valid.`,
    );
  }

  return date;
}

function dateOnlyString(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeAmount(
  value: Prisma.Decimal | string | number,
) {
  let amount: Prisma.Decimal;

  try {
    amount = new Prisma.Decimal(value as any);
  } catch {
    throw new ReimbursementServiceError(
      'INVALID_AMOUNT',
      'Nominal reimbursement tidak valid.',
    );
  }

  if (!amount.isFinite() || amount.lte(0)) {
    throw new ReimbursementServiceError(
      'INVALID_AMOUNT',
      'Nominal reimbursement harus lebih besar dari 0.',
    );
  }

  const maxAmount =
    new Prisma.Decimal('999999999999.99');

  if (amount.gt(maxAmount)) {
    throw new ReimbursementServiceError(
      'AMOUNT_TOO_LARGE',
      'Nominal reimbursement melebihi batas penyimpanan sistem.',
    );
  }

  return amount.toDecimalPlaces(2);
}

function normalizeCurrency(
  value?: string | null,
) {
  const currency =
    (value?.trim() || 'IDR').toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ReimbursementServiceError(
      'INVALID_CURRENCY',
      'Currency harus menggunakan kode 3 huruf seperti IDR atau USD.',
    );
  }

  return currency;
}

function createRequestCode() {
  const requestDate =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      },
    )
      .format(new Date())
      .replaceAll('-', '');

  const suffix =
    randomBytes(4)
      .toString('hex')
      .slice(0, 6)
      .toUpperCase();

  return `RB-${requestDate}-${suffix}`;
}

async function createAuditLog(
  tx: Prisma.TransactionClient,
  input: {
    entityId: string;
    action: string;
    actorType: string;
    actorId?: string | null;
    metadata?: Prisma.InputJsonValue | null;
  },
) {
  await tx.auditLog.create({
    data: {
      entityType: 'REIMBURSEMENT_REQUEST',
      entityId: input.entityId,
      action: input.action,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

async function findReimbursementRequest(
  tx: Prisma.TransactionClient,
  requestId: string,
) {
  const normalized = requestId?.trim();

  if (!normalized) {
    throw new ReimbursementServiceError(
      'REQUEST_ID_REQUIRED',
      'Request ID atau request code wajib tersedia.',
    );
  }

  const request =
    await tx.reimbursementRequest.findFirst({
      where: {
        OR: [
          { id: normalized },
          { requestCode: normalized },
        ],
      },
      include: reimbursementInclude,
    });

  if (!request) {
    throw new ReimbursementServiceError(
      'REIMBURSEMENT_NOT_FOUND',
      'Pengajuan reimbursement tidak ditemukan.',
      404,
    );
  }

  return request;
}

function sameNullableText(
  left: string | null,
  right: string | null,
) {
  return (
    normalizeNullableText(left) ===
    normalizeNullableText(right)
  );
}

export async function createReimbursementRequest(
  input: CreateReimbursementInput,
) {
  const employeeId = input.employeeId?.trim();

  if (!employeeId) {
    throw new ReimbursementServiceError(
      'EMPLOYEE_REQUIRED',
      'Employee ID wajib tersedia.',
    );
  }

  if (
    !Object.values(ReimbursementType).includes(
      input.reimbursementType,
    )
  ) {
    throw new ReimbursementServiceError(
      'INVALID_REIMBURSEMENT_TYPE',
      'Jenis reimbursement tidak valid.',
    );
  }

  const expenseDate =
    parseDateOnly(
      input.expenseDate,
      'Tanggal pengeluaran',
    );

  const amount = normalizeAmount(input.amount);
  const currency = normalizeCurrency(input.currency);

  const reason = input.reason?.trim();

  if (!reason) {
    throw new ReimbursementServiceError(
      'REASON_REQUIRED',
      'Alasan reimbursement wajib diisi.',
    );
  }

  const merchant =
    normalizeNullableText(input.merchant);
  const receiptUrl =
    normalizeNullableText(input.receiptUrl);
  const receiptFileName =
    normalizeNullableText(input.receiptFileName);

  const suppliedRequestCode =
    input.requestCode?.trim().toUpperCase();

  const requestCode =
    suppliedRequestCode ||
    createRequestCode();

  const actorType =
    input.actorType?.trim() ||
    'EMPLOYEE';

  const actorId =
    input.actorId?.trim() ||
    employeeId;

  if (suppliedRequestCode) {
    const existing =
      await prisma.reimbursementRequest.findUnique({
        where: {
          requestCode: suppliedRequestCode,
        },
        include: reimbursementInclude,
      });

    if (existing) {
      const sameRequest =
        existing.employeeId === employeeId &&
        existing.reimbursementType ===
          input.reimbursementType &&
        existing.expenseDate.getTime() ===
          expenseDate.getTime() &&
        existing.amount.eq(amount) &&
        existing.currency === currency &&
        sameNullableText(
          existing.merchant,
          merchant,
        ) &&
        existing.reason === reason &&
        sameNullableText(
          existing.receiptUrl,
          receiptUrl,
        ) &&
        sameNullableText(
          existing.receiptFileName,
          receiptFileName,
        );

      if (sameRequest) {
        return existing;
      }

      throw new ReimbursementServiceError(
        'REQUEST_CODE_CONFLICT',
        'Request code sudah digunakan oleh pengajuan reimbursement lain.',
        409,
      );
    }
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const employee =
          await tx.employee.findUnique({
            where: { id: employeeId },
            select: {
              id: true,
              name: true,
              managerId: true,
            },
          });

        if (!employee) {
          throw new ReimbursementServiceError(
            'EMPLOYEE_NOT_FOUND',
            'Employee tidak ditemukan.',
            404,
          );
        }

        if (!employee.managerId) {
          throw new ReimbursementServiceError(
            'MANAGER_NOT_CONFIGURED',
            'Employee belum memiliki line manager untuk memproses reimbursement.',
            409,
          );
        }

        const manager =
          await tx.employee.findUnique({
            where: {
              id: employee.managerId,
            },
            select: {
              id: true,
            },
          });

        if (!manager) {
          throw new ReimbursementServiceError(
            'MANAGER_NOT_FOUND',
            'Line manager employee tidak ditemukan.',
            409,
          );
        }

        const created =
          await tx.reimbursementRequest.create({
            data: {
              requestCode,
              employeeId: employee.id,
              managerId: manager.id,
              reimbursementType:
                input.reimbursementType,
              expenseDate,
              amount,
              currency,
              merchant,
              reason,
              receiptUrl,
              receiptFileName,
              status:
                ReimbursementStatus.PENDING,
              managerDecision:
                ApprovalDecision.PENDING,
              policyResult:
                input.policyResult ?? undefined,
              policySource:
                normalizeNullableText(
                  input.policySource,
                ),
              workflowStatus:
                WorkflowStatus.NOT_STARTED,
            },
            include: reimbursementInclude,
          });

        await createAuditLog(
          tx,
          {
            entityId: created.id,
            action:
              'REIMBURSEMENT_CREATED',
            actorType,
            actorId,
            metadata: {
              requestCode:
                created.requestCode,
              reimbursementType:
                created.reimbursementType,
              expenseDate:
                dateOnlyString(
                  created.expenseDate,
                ),
              amount:
                created.amount.toString(),
              currency:
                created.currency,
              managerId:
                created.managerId,
              policySource:
                created.policySource,
            },
          },
        );

        return created;
      },
    );
  } catch (error) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002' &&
      suppliedRequestCode
    ) {
      const existing =
        await prisma.reimbursementRequest.findUnique({
          where: {
            requestCode:
              suppliedRequestCode,
          },
          include: reimbursementInclude,
        });

      if (existing) {
        const sameRequest =
          existing.employeeId ===
            employeeId &&
          existing.reimbursementType ===
            input.reimbursementType &&
          existing.expenseDate.getTime() ===
            expenseDate.getTime() &&
          existing.amount.eq(amount) &&
          existing.currency ===
            currency &&
          sameNullableText(
            existing.merchant,
            merchant,
          ) &&
          existing.reason ===
            reason &&
          sameNullableText(
            existing.receiptUrl,
            receiptUrl,
          ) &&
          sameNullableText(
            existing.receiptFileName,
            receiptFileName,
          );

        if (sameRequest) {
          return existing;
        }
      }

      throw new ReimbursementServiceError(
        'REQUEST_CODE_CONFLICT',
        'Request code sudah digunakan oleh pengajuan reimbursement lain.',
        409,
      );
    }

    throw error;
  }
}

export async function getReimbursementRequest(
  requestId: string,
) {
  const normalized = requestId?.trim();

  if (!normalized) {
    throw new ReimbursementServiceError(
      'REQUEST_ID_REQUIRED',
      'Request ID atau request code wajib tersedia.',
    );
  }

  const request =
    await prisma.reimbursementRequest.findFirst({
      where: {
        OR: [
          { id: normalized },
          { requestCode: normalized },
        ],
      },
      include: reimbursementInclude,
    });

  if (!request) {
    throw new ReimbursementServiceError(
      'REIMBURSEMENT_NOT_FOUND',
      'Pengajuan reimbursement tidak ditemukan.',
      404,
    );
  }

  return request;
}

export async function getEmployeeReimbursementRequests(
  employeeId: string,
  options?: {
    limit?: number;
    status?: ReimbursementStatus;
    reimbursementType?:
      ReimbursementType;
  },
) {
  const normalizedEmployeeId =
    employeeId?.trim();

  if (!normalizedEmployeeId) {
    throw new ReimbursementServiceError(
      'EMPLOYEE_REQUIRED',
      'Employee ID wajib tersedia.',
    );
  }

  const limit =
    Math.min(
      Math.max(
        options?.limit ?? 20,
        1,
      ),
      100,
    );

  return prisma.reimbursementRequest.findMany({
    where: {
      employeeId:
        normalizedEmployeeId,
      ...(options?.status
        ? {
            status:
              options.status,
          }
        : {}),
      ...(options?.reimbursementType
        ? {
            reimbursementType:
              options.reimbursementType,
          }
        : {}),
    },
    include: reimbursementInclude,
    orderBy: {
      requestedAt: 'desc',
    },
    take: limit,
  });
}

export async function approveReimbursementRequest(
  input: DecideReimbursementInput,
) {
  const managerId =
    input.managerId?.trim();

  if (!managerId) {
    throw new ReimbursementServiceError(
      'MANAGER_REQUIRED',
      'Manager ID wajib diisi.',
    );
  }

  const note =
    normalizeNullableText(input.note);

  return prisma.$transaction(
    async (tx) => {
      const current =
        await findReimbursementRequest(
          tx,
          input.requestId,
        );

      if (
        current.managerId === managerId &&
        current.status ===
          ReimbursementStatus.APPROVED &&
        current.managerDecision ===
          ApprovalDecision.APPROVED
      ) {
        return current;
      }

      if (
        current.status !==
        ReimbursementStatus.PENDING
      ) {
        throw new ReimbursementServiceError(
          'INVALID_REIMBURSEMENT_STATUS',
          `Pengajuan dengan status ${current.status} tidak dapat disetujui manager.`,
          409,
        );
      }

      if (current.managerId !== managerId) {
        throw new ReimbursementServiceError(
          'UNAUTHORIZED_APPROVER',
          'Anda bukan manager yang berwenang menyetujui pengajuan reimbursement ini.',
          403,
        );
      }

      if (
        current.managerDecision !==
        ApprovalDecision.PENDING
      ) {
        throw new ReimbursementServiceError(
          'MANAGER_ALREADY_DECIDED',
          'Manager sudah memberikan keputusan untuk pengajuan reimbursement ini.',
          409,
        );
      }

      const now = new Date();

      const result =
        await tx.reimbursementRequest.updateMany({
          where: {
            id: current.id,
            status:
              ReimbursementStatus.PENDING,
            managerId,
            managerDecision:
              ApprovalDecision.PENDING,
          },
          data: {
            status:
              ReimbursementStatus.APPROVED,
            managerDecision:
              ApprovalDecision.APPROVED,
            managerDecisionNote: note,
            managerDecidedAt: now,
          },
        });

      if (result.count !== 1) {
        throw new ReimbursementServiceError(
          'APPROVAL_CONFLICT',
          'Status pengajuan reimbursement berubah saat approval diproses.',
          409,
        );
      }

      const updated =
        await findReimbursementRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId: updated.id,
          action:
            'REIMBURSEMENT_MANAGER_APPROVED',
          actorType: 'MANAGER',
          actorId: managerId,
          metadata: {
            previousStatus:
              current.status,
            newStatus:
              updated.status,
            managerDecision:
              updated.managerDecision,
            decisionNote: note,
          },
        },
      );

      return updated;
    },
  );
}

export async function rejectReimbursementRequest(
  input: DecideReimbursementInput,
) {
  const managerId =
    input.managerId?.trim();

  if (!managerId) {
    throw new ReimbursementServiceError(
      'MANAGER_REQUIRED',
      'Manager ID wajib diisi.',
    );
  }

  const note =
    normalizeNullableText(input.note);

  return prisma.$transaction(
    async (tx) => {
      const current =
        await findReimbursementRequest(
          tx,
          input.requestId,
        );

      if (
        current.managerId === managerId &&
        current.status ===
          ReimbursementStatus.REJECTED &&
        current.managerDecision ===
          ApprovalDecision.REJECTED
      ) {
        return current;
      }

      if (
        current.status !==
        ReimbursementStatus.PENDING
      ) {
        throw new ReimbursementServiceError(
          'INVALID_REIMBURSEMENT_STATUS',
          `Pengajuan dengan status ${current.status} tidak dapat ditolak manager.`,
          409,
        );
      }

      if (current.managerId !== managerId) {
        throw new ReimbursementServiceError(
          'UNAUTHORIZED_APPROVER',
          'Anda bukan manager yang berwenang menolak pengajuan reimbursement ini.',
          403,
        );
      }

      if (
        current.managerDecision !==
        ApprovalDecision.PENDING
      ) {
        throw new ReimbursementServiceError(
          'MANAGER_ALREADY_DECIDED',
          'Manager sudah memberikan keputusan untuk pengajuan reimbursement ini.',
          409,
        );
      }

      const now = new Date();

      const result =
        await tx.reimbursementRequest.updateMany({
          where: {
            id: current.id,
            status:
              ReimbursementStatus.PENDING,
            managerId,
            managerDecision:
              ApprovalDecision.PENDING,
          },
          data: {
            status:
              ReimbursementStatus.REJECTED,
            managerDecision:
              ApprovalDecision.REJECTED,
            managerDecisionNote: note,
            managerDecidedAt: now,
          },
        });

      if (result.count !== 1) {
        throw new ReimbursementServiceError(
          'APPROVAL_CONFLICT',
          'Status pengajuan reimbursement berubah saat rejection diproses.',
          409,
        );
      }

      const updated =
        await findReimbursementRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId: updated.id,
          action:
            'REIMBURSEMENT_MANAGER_REJECTED',
          actorType: 'MANAGER',
          actorId: managerId,
          metadata: {
            previousStatus:
              current.status,
            newStatus:
              updated.status,
            managerDecision:
              updated.managerDecision,
            decisionNote: note,
          },
        },
      );

      return updated;
    },
  );
}

export async function cancelReimbursementRequest(
  input: CancelReimbursementInput,
) {
  const employeeId =
    input.employeeId?.trim();

  if (!employeeId) {
    throw new ReimbursementServiceError(
      'EMPLOYEE_REQUIRED',
      'Employee ID wajib tersedia.',
    );
  }

  const note =
    normalizeNullableText(input.note);

  const actorType =
    input.actorType?.trim() ||
    'EMPLOYEE';

  const actorId =
    input.actorId?.trim() ||
    employeeId;

  return prisma.$transaction(
    async (tx) => {
      const current =
        await findReimbursementRequest(
          tx,
          input.requestId,
        );

      if (
        current.employeeId !== employeeId
      ) {
        throw new ReimbursementServiceError(
          'UNAUTHORIZED_EMPLOYEE',
          'Pengajuan reimbursement bukan milik employee aktif.',
          403,
        );
      }

      if (
        current.status ===
        ReimbursementStatus.CANCELLED
      ) {
        return current;
      }

      if (
        current.status !==
          ReimbursementStatus.PENDING &&
        current.status !==
          ReimbursementStatus.DRAFT
      ) {
        throw new ReimbursementServiceError(
          'INVALID_REIMBURSEMENT_STATUS',
          `Pengajuan dengan status ${current.status} tidak dapat dibatalkan.`,
          409,
        );
      }

      const result =
        await tx.reimbursementRequest.updateMany({
          where: {
            id: current.id,
            employeeId,
            status: {
              in: [
                ReimbursementStatus.PENDING,
                ReimbursementStatus.DRAFT,
              ],
            },
          },
          data: {
            status:
              ReimbursementStatus.CANCELLED,
          },
        });

      if (result.count !== 1) {
        throw new ReimbursementServiceError(
          'CANCEL_CONFLICT',
          'Status pengajuan reimbursement berubah saat pembatalan diproses.',
          409,
        );
      }

      const updated =
        await findReimbursementRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId: updated.id,
          action:
            'REIMBURSEMENT_CANCELLED',
          actorType,
          actorId,
          metadata: {
            previousStatus:
              current.status,
            newStatus:
              updated.status,
            note,
          },
        },
      );

      return updated;
    },
  );
}

export async function claimReimbursementWorkflowTrigger(
  requestId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const current =
        await findReimbursementRequest(
          tx,
          requestId,
        );

      if (
        current.status !==
        ReimbursementStatus.PENDING
      ) {
        return {
          claimed: false,
          request: current,
        };
      }

      if (
        current.workflowStatus ===
          WorkflowStatus.TRIGGERED ||
        current.workflowStatus ===
          WorkflowStatus.RUNNING ||
        current.workflowStatus ===
          WorkflowStatus.COMPLETED
      ) {
        return {
          claimed: false,
          request: current,
        };
      }

      const previousWorkflowStatus =
        current.workflowStatus;

      const result =
        await tx.reimbursementRequest.updateMany({
          where: {
            id: current.id,
            status:
              ReimbursementStatus.PENDING,
            workflowStatus:
              previousWorkflowStatus,
          },
          data: {
            workflowStatus:
              WorkflowStatus.TRIGGERED,
          },
        });

      if (result.count !== 1) {
        const latest =
          await findReimbursementRequest(
            tx,
            current.id,
          );

        return {
          claimed: false,
          request: latest,
        };
      }

      const updated =
        await findReimbursementRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId: updated.id,
          action:
            'REIMBURSEMENT_WORKFLOW_CLAIMED',
          actorType: 'SYSTEM',
          actorId: null,
          metadata: {
            previousWorkflowStatus,
            newWorkflowStatus:
              updated.workflowStatus,
          },
        },
      );

      return {
        claimed: true,
        request: updated,
      };
    },
  );
}

export async function updateReimbursementWorkflow(
  input: UpdateReimbursementWorkflowInput,
) {
  const allowedStatuses:
    ReadonlySet<WorkflowStatus> =
      new Set<WorkflowStatus>([
        WorkflowStatus.RUNNING,
        WorkflowStatus.COMPLETED,
        WorkflowStatus.FAILED,
      ]);

  if (
    !allowedStatuses.has(
      input.workflowStatus,
    )
  ) {
    throw new ReimbursementServiceError(
      'INVALID_WORKFLOW_STATUS',
      'Workflow status hanya boleh RUNNING, COMPLETED, atau FAILED.',
    );
  }

  return prisma.$transaction(
    async (tx) => {
      const current =
        await findReimbursementRequest(
          tx,
          input.requestId,
        );

      const updated =
        await tx.reimbursementRequest.update({
          where: {
            id: current.id,
          },
          data: {
            workflowStatus:
              input.workflowStatus,
            workflowRunId:
              input.workflowRunId ===
              undefined
                ? current.workflowRunId
                : normalizeNullableText(
                    input.workflowRunId,
                  ),
          },
          include: reimbursementInclude,
        });

      await createAuditLog(
        tx,
        {
          entityId: updated.id,
          action:
            'REIMBURSEMENT_WORKFLOW_UPDATED',
          actorType: 'SYSTEM',
          actorId: null,
          metadata: {
            previousWorkflowStatus:
              current.workflowStatus,
            newWorkflowStatus:
              updated.workflowStatus,
            workflowRunId:
              updated.workflowRunId,
            context:
              input.metadata ?? null,
          },
        },
      );

      return updated;
    },
  );
}
