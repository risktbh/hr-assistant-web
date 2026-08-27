import {
  ApprovalDecision,
  LeaveStatus,
  LeaveType,
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

export type CreateLeaveInput = {
  requestCode?: string;

  employeeId: string;

  leaveType: LeaveType;

  startDate:
    | Date
    | string;

  endDate:
    | Date
    | string;

  reason?: string;

  policyResult?:
    | Prisma.InputJsonValue
    | null;

  policySource?: string;

  actorType?: string;

  actorId?: string;
};

export type DecideLeaveInput = {
  requestId: string;

  managerId: string;

  note?: string;
};

export type CancelLeaveInput = {
  requestId: string;

  actorId?: string;

  actorType?: string;

  reason?: string;
};

export type UpdateLeaveWorkflowInput = {
  requestId: string;

  workflowStatus:
    WorkflowStatus;

  workflowRunId?: string;

  metadata?:
    Prisma.InputJsonValue;
};

/* =========================================================
   SERVICE ERROR
========================================================= */

export class LeaveServiceError
  extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);

    this.name =
      'LeaveServiceError';
  }
}

/* =========================================================
   SHARED INCLUDE
========================================================= */

const leaveInclude = {
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
} satisfies Prisma.LeaveRequestInclude;

/* =========================================================
   DATE HELPERS
========================================================= */

const DATE_ONLY_PATTERN =
  /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnly(
  value:
    | Date
    | string,
  fieldName: string,
) {
  if (
    value instanceof Date
  ) {
    if (
      Number.isNaN(
        value.getTime(),
      )
    ) {
      throw new LeaveServiceError(
        'INVALID_DATE',
        `${fieldName} tidak valid.`,
      );
    }

    /*
     * Leave adalah calendar date.
     * Normalisasi ke UTC midnight agar @db.Date stabil.
     */
    return new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
      ),
    );
  }

  const normalized =
    value?.trim();

  if (
    !normalized ||
    !DATE_ONLY_PATTERN.test(
      normalized,
    )
  ) {
    throw new LeaveServiceError(
      'INVALID_DATE',
      `${fieldName} harus menggunakan format YYYY-MM-DD.`,
    );
  }

  const [
    yearString,
    monthString,
    dayString,
  ] =
    normalized.split('-');

  const year =
    Number(yearString);

  const month =
    Number(monthString);

  const day =
    Number(dayString);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
      ),
    );

  /*
   * Cegah tanggal invalid seperti:
   * 2026-02-31
   */
  if (
    date.getUTCFullYear() !==
      year ||
    date.getUTCMonth() !==
      month - 1 ||
    date.getUTCDate() !==
      day
  ) {
    throw new LeaveServiceError(
      'INVALID_DATE',
      `${fieldName} tidak valid.`,
    );
  }

  return date;
}

function dateOnlyString(
  value: Date,
) {
  return value
    .toISOString()
    .slice(
      0,
      10,
    );
}

/* =========================================================
   WORKING DAY CALCULATION
========================================================= */

/*
 * MVP:
 *
 * - Senin-Jumat = working day
 * - Sabtu/Minggu tidak dihitung
 * - Hari libur nasional BELUM dihitung
 *
 * Holiday calendar akan masuk ke policy layer nanti.
 */
function calculateWorkingDays(
  startDate: Date,
  endDate: Date,
) {
  if (
    endDate.getTime() <
    startDate.getTime()
  ) {
    throw new LeaveServiceError(
      'INVALID_LEAVE_RANGE',
      'Tanggal selesai cuti harus sama atau setelah tanggal mulai.',
    );
  }

  let totalDays = 0;

  const cursor =
    new Date(
      startDate.getTime(),
    );

  while (
    cursor.getTime() <=
    endDate.getTime()
  ) {
    const day =
      cursor.getUTCDay();

    const isWeekend =
      day === 0 ||
      day === 6;

    if (
      !isWeekend
    ) {
      totalDays++;
    }

    cursor.setUTCDate(
      cursor.getUTCDate() +
        1,
    );
  }

  if (
    totalDays <= 0
  ) {
    throw new LeaveServiceError(
      'NO_WORKING_DAY',
      'Rentang cuti tidak memiliki hari kerja.',
      422,
    );
  }

  return totalDays;
}

/* =========================================================
   CURRENT YEAR
========================================================= */

function getJakartaCurrentYear() {
  const formatter =
    new Intl.DateTimeFormat(
      'en-US',
      {
        timeZone:
          'Asia/Jakarta',

        year:
          'numeric',
      },
    );

  return Number(
    formatter.format(
      new Date(),
    ),
  );
}

/* =========================================================
   REQUEST CODE
========================================================= */

function getJakartaDateCode(
  date:
    Date = new Date(),
) {
  const formatter =
    new Intl.DateTimeFormat(
      'en-CA',
      {
        timeZone:
          'Asia/Jakarta',

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
    throw new LeaveServiceError(
      'DATE_FORMAT_ERROR',
      'Gagal membuat kode tanggal leave.',
      500,
    );
  }

  return `${year}${month}${day}`;
}

function generateRandomCode(
  length = 6,
) {
  /*
   * Hilangkan karakter ambigu:
   * O/0, I/1.
   */
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const bytes =
    randomBytes(
      length,
    );

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

function generateLeaveRequestCode() {
  return (
    `LV-${getJakartaDateCode()}-${generateRandomCode()}`
  );
}

/* =========================================================
   AUDIT LOG
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
        'LEAVE_REQUEST',

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
   GET INTERNAL
========================================================= */

async function findLeaveRequest(
  tx:
    Prisma.TransactionClient,

  requestId: string,
) {
  const normalizedRequestId =
    requestId?.trim();

  if (
    !normalizedRequestId
  ) {
    throw new LeaveServiceError(
      'REQUEST_ID_REQUIRED',
      'Request ID wajib diisi.',
    );
  }

  const request =
    await tx.leaveRequest.findFirst(
      {
        where: {
          OR: [
            {
              id:
                normalizedRequestId,
            },

            {
              requestCode:
                normalizedRequestId,
            },
          ],
        },

        include:
          leaveInclude,
      },
    );

  if (
    !request
  ) {
    throw new LeaveServiceError(
      'LEAVE_NOT_FOUND',
      'Pengajuan cuti tidak ditemukan.',
      404,
    );
  }

  return request;
}

/* =========================================================
   GET BALANCE INTERNAL
========================================================= */

async function getAnnualBalanceSnapshot(
  tx:
    Prisma.TransactionClient,

  employeeId: string,

  year: number,
) {
  const yearStart =
    new Date(
      Date.UTC(
        year,
        0,
        1,
      ),
    );

  const nextYear =
    new Date(
      Date.UTC(
        year + 1,
        0,
        1,
      ),
    );

  const [
    balance,
    approved,
    pending,
  ] =
    await Promise.all([
      tx.leaveBalance.findUnique({
        where: {
          employeeId_year_leaveType: {
            employeeId,
            year,
            leaveType:
              LeaveType.ANNUAL,
          },
        },
      }),

      tx.leaveRequest.aggregate({
        where: {
          employeeId,

          leaveType:
            LeaveType.ANNUAL,

          status:
            LeaveStatus.APPROVED,

          startDate: {
            gte:
              yearStart,

            lt:
              nextYear,
          },
        },

        _sum: {
          totalDays:
            true,
        },
      }),

      tx.leaveRequest.aggregate({
        where: {
          employeeId,

          leaveType:
            LeaveType.ANNUAL,

          status:
            LeaveStatus.PENDING,

          startDate: {
            gte:
              yearStart,

            lt:
              nextYear,
          },
        },

        _sum: {
          totalDays:
            true,
        },
      }),
    ]);

  const entitlementDays =
    balance
      ?.entitlementDays ??
    null;

  const approvedDays =
    approved._sum
      .totalDays ??
    0;

  const pendingDays =
    pending._sum
      .totalDays ??
    0;

  const availableDays =
    entitlementDays ===
    null
      ? null
      : Math.max(
          entitlementDays -
            approvedDays -
            pendingDays,
          0,
        );

  return {
    year,

    leaveType:
      LeaveType.ANNUAL,

    balanceConfigured:
      Boolean(
        balance,
      ),

    entitlementDays,

    approvedDays,

    pendingDays,

    availableDays,
  };
}

/* =========================================================
   CREATE LEAVE REQUEST
========================================================= */

export async function createLeaveRequest(
  input:
    CreateLeaveInput,
) {
  const employeeId =
    input.employeeId
      ?.trim();

  if (
    !employeeId
  ) {
    throw new LeaveServiceError(
      'EMPLOYEE_REQUIRED',
      'Employee ID wajib diisi.',
    );
  }

  if (
    !Object.values(
      LeaveType,
    ).includes(
      input.leaveType,
    )
  ) {
    throw new LeaveServiceError(
      'INVALID_LEAVE_TYPE',
      'Jenis cuti tidak valid.',
    );
  }

  const startDate =
    parseDateOnly(
      input.startDate,
      'Tanggal mulai',
    );

  const endDate =
    parseDateOnly(
      input.endDate,
      'Tanggal selesai',
    );

  /*
   * Karena entitlement disimpan per tahun,
   * MVP belum menerima satu request lintas tahun.
   *
   * Contoh yang belum didukung:
   * 30 Dec 2026 - 2 Jan 2027
   */
  if (
    startDate.getUTCFullYear() !==
    endDate.getUTCFullYear()
  ) {
    throw new LeaveServiceError(
      'CROSS_YEAR_LEAVE_NOT_SUPPORTED',
      'Pengajuan cuti lintas tahun belum didukung. Pisahkan pengajuan berdasarkan tahun.',
      422,
    );
  }

  const totalDays =
    calculateWorkingDays(
      startDate,
      endDate,
    );

  const reason =
    input.reason
      ?.trim() ||
    null;

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

  if (
    !employee
  ) {
    throw new LeaveServiceError(
      'EMPLOYEE_NOT_FOUND',
      'Data karyawan tidak ditemukan.',
      404,
    );
  }

  if (
    !employee.managerId ||
    !employee.manager
  ) {
    throw new LeaveServiceError(
      'MANAGER_NOT_ASSIGNED',
      `Manager untuk ${employee.name} belum ditentukan.`,
      422,
    );
  }

  const suppliedRequestCode =
    input.requestCode
      ?.trim()
      .toUpperCase();

  if (
    suppliedRequestCode &&
    !/^LV-\d{8}-[A-Z2-9]{6}$/.test(
      suppliedRequestCode,
    )
  ) {
    throw new LeaveServiceError(
      'INVALID_REQUEST_CODE',
      'Format request code cuti tidak valid.',
    );
  }

  const requestCode =
    suppliedRequestCode ||
    generateLeaveRequestCode();

  /*
   * =====================================================
   * IDEMPOTENCY PRE-CHECK
   * =====================================================
   */

  if (
    suppliedRequestCode
  ) {
    const existing =
      await prisma
        .leaveRequest
        .findUnique({
          where: {
            requestCode:
              suppliedRequestCode,
          },

          include:
            leaveInclude,
        });

    if (
      existing
    ) {
      const sameRequest =
        existing.employeeId ===
          employee.id &&
        existing.leaveType ===
          input.leaveType &&
        existing.startDate.getTime() ===
          startDate.getTime() &&
        existing.endDate.getTime() ===
          endDate.getTime() &&
        (
          existing.reason ??
          null
        ) ===
          reason;

      if (
        sameRequest
      ) {
        return existing;
      }

      throw new LeaveServiceError(
        'REQUEST_CODE_CONFLICT',
        'Request code sudah digunakan oleh pengajuan cuti lain.',
        409,
      );
    }
  }

  try {
    return await prisma.$transaction(
      async (
        tx,
      ) => {
        /*
         * =================================================
         * OVERLAPPING REQUEST
         * =================================================
         *
         * PENDING / APPROVED leave tidak boleh overlap.
         */

        const overlappingRequest =
          await tx.leaveRequest.findFirst(
            {
              where: {
                employeeId:
                  employee.id,

                status: {
                  in: [
                    LeaveStatus.PENDING,
                    LeaveStatus.APPROVED,
                  ],
                },

                startDate: {
                  lte:
                    endDate,
                },

                endDate: {
                  gte:
                    startDate,
                },
              },

              select: {
                id: true,
                requestCode: true,
                startDate: true,
                endDate: true,
                status: true,
              },
            },
          );

        if (
          overlappingRequest
        ) {
          throw new LeaveServiceError(
            'LEAVE_DATE_CONFLICT',
            `Tanggal cuti bertabrakan dengan ${overlappingRequest.requestCode}.`,
            409,
          );
        }

        /*
         * =================================================
         * ANNUAL LEAVE BALANCE
         * =================================================
         *
         * Balance validation hanya untuk ANNUAL.
         *
         * SICK / SPECIAL / UNPAID akan divalidasi
         * oleh policy layer karena mempunyai aturan berbeda.
         */

        if (
          input.leaveType ===
          LeaveType.ANNUAL
        ) {
          const year =
            startDate
              .getUTCFullYear();

          const balance =
            await getAnnualBalanceSnapshot(
              tx,
              employee.id,
              year,
            );

          if (
            !balance.balanceConfigured ||
            balance.entitlementDays ===
              null
          ) {
            throw new LeaveServiceError(
              'LEAVE_BALANCE_NOT_CONFIGURED',
              `Saldo cuti tahunan ${year} belum dikonfigurasi.`,
              422,
            );
          }

          if (
            balance.availableDays ===
              null ||
            totalDays >
              balance.availableDays
          ) {
            throw new LeaveServiceError(
              'INSUFFICIENT_LEAVE_BALANCE',
              `Saldo cuti tahunan tidak cukup. Tersedia ${balance.availableDays ?? 0} hari, membutuhkan ${totalDays} hari.`,
              422,
            );
          }
        }

        const created =
          await tx.leaveRequest.create(
            {
              data: {
                requestCode,

                employeeId:
                  employee.id,

                managerId:
                  employee.managerId,

                leaveType:
                  input.leaveType,

                startDate,

                endDate,

                totalDays,

                reason,

                status:
                  LeaveStatus.PENDING,

                managerDecision:
                  ApprovalDecision.PENDING,

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
                leaveInclude,
            },
          );

        await createAuditLog(
          tx,
          {
            entityId:
              created.id,

            action:
              'LEAVE_REQUEST_CREATED',

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

              leaveType:
                created.leaveType,

              startDate:
                dateOnlyString(
                  created.startDate,
                ),

              endDate:
                dateOnlyString(
                  created.endDate,
                ),

              totalDays:
                created.totalDays,

              reason:
                created.reason,

              policySource:
                created.policySource,

              workflowStatus:
                created.workflowStatus,
            },
          },
        );

        return created;
      },
    );
  } catch (
    error
  ) {
    /*
     * Race condition idempotency recovery.
     */
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code ===
        'P2002' &&
      suppliedRequestCode
    ) {
      const existing =
        await prisma
          .leaveRequest
          .findUnique({
            where: {
              requestCode:
                suppliedRequestCode,
            },

            include:
              leaveInclude,
          });

      if (
        existing
      ) {
        const sameRequest =
          existing.employeeId ===
            employee.id &&
          existing.leaveType ===
            input.leaveType &&
          existing.startDate.getTime() ===
            startDate.getTime() &&
          existing.endDate.getTime() ===
            endDate.getTime() &&
          (
            existing.reason ??
            null
          ) ===
            reason;

        if (
          sameRequest
        ) {
          return existing;
        }
      }

      throw new LeaveServiceError(
        'REQUEST_CODE_CONFLICT',
        'Request code sudah digunakan oleh pengajuan cuti lain.',
        409,
      );
    }

    throw error;
  }
}

/* =========================================================
   GET SINGLE REQUEST
========================================================= */

export async function getLeaveRequest(
  requestId: string,
) {
  const normalizedRequestId =
    requestId?.trim();

  if (
    !normalizedRequestId
  ) {
    throw new LeaveServiceError(
      'REQUEST_ID_REQUIRED',
      'Request ID wajib diisi.',
    );
  }

  const request =
    await prisma.leaveRequest.findFirst(
      {
        where: {
          OR: [
            {
              id:
                normalizedRequestId,
            },

            {
              requestCode:
                normalizedRequestId,
            },
          ],
        },

        include:
          leaveInclude,
      },
    );

  if (
    !request
  ) {
    throw new LeaveServiceError(
      'LEAVE_NOT_FOUND',
      'Pengajuan cuti tidak ditemukan.',
      404,
    );
  }

  return request;
}

/* =========================================================
   GET EMPLOYEE REQUESTS
========================================================= */

export async function getEmployeeLeaveRequests(
  employeeId: string,

  options?: {
    limit?: number;

    status?:
      LeaveStatus;

    leaveType?:
      LeaveType;
  },
) {
  const normalizedEmployeeId =
    employeeId?.trim();

  if (
    !normalizedEmployeeId
  ) {
    throw new LeaveServiceError(
      'EMPLOYEE_REQUIRED',
      'Employee ID wajib diisi.',
    );
  }

  const limit =
    Math.min(
      Math.max(
        options?.limit ??
          20,
        1,
      ),
      100,
    );

  return prisma.leaveRequest.findMany({
    where: {
      employeeId:
        normalizedEmployeeId,

      ...(options?.status
        ? {
            status:
              options.status,
          }
        : {}),

      ...(options?.leaveType
        ? {
            leaveType:
              options.leaveType,
          }
        : {}),
    },

    include:
      leaveInclude,

    orderBy: {
      requestedAt:
        'desc',
    },

    take:
      limit,
  });
}

/* =========================================================
   GET EMPLOYEE LEAVE BALANCE
========================================================= */

export async function getEmployeeLeaveBalance(
  employeeId: string,

  year:
    number =
      getJakartaCurrentYear(),
) {
  const normalizedEmployeeId =
    employeeId?.trim();

  if (
    !normalizedEmployeeId
  ) {
    throw new LeaveServiceError(
      'EMPLOYEE_REQUIRED',
      'Employee ID wajib diisi.',
    );
  }

  if (
    !Number.isInteger(
      year,
    ) ||
    year < 2000 ||
    year > 2200
  ) {
    throw new LeaveServiceError(
      'INVALID_YEAR',
      'Tahun saldo cuti tidak valid.',
    );
  }

  const employee =
    await prisma.employee.findUnique(
      {
        where: {
          id:
            normalizedEmployeeId,
        },

        select: {
          id: true,
          name: true,
        },
      },
    );

  if (
    !employee
  ) {
    throw new LeaveServiceError(
      'EMPLOYEE_NOT_FOUND',
      'Data karyawan tidak ditemukan.',
      404,
    );
  }

  const yearStart =
    new Date(
      Date.UTC(
        year,
        0,
        1,
      ),
    );

  const nextYear =
    new Date(
      Date.UTC(
        year + 1,
        0,
        1,
      ),
    );

  const [
    balanceRows,
    requests,
  ] =
    await Promise.all([
      prisma.leaveBalance.findMany({
        where: {
          employeeId:
            normalizedEmployeeId,

          year,
        },
      }),

      prisma.leaveRequest.findMany({
        where: {
          employeeId:
            normalizedEmployeeId,

          startDate: {
            gte:
              yearStart,

            lt:
              nextYear,
          },

          status: {
            in: [
              LeaveStatus.PENDING,
              LeaveStatus.APPROVED,
            ],
          },
        },

        select: {
          leaveType: true,
          status: true,
          totalDays: true,
        },
      }),
    ]);

  const leaveTypes =
    Object.values(
      LeaveType,
    );

  const balances =
    leaveTypes.map(
      (
        leaveType,
      ) => {
        const configured =
          balanceRows.find(
            (
              balance,
            ) =>
              balance.leaveType ===
              leaveType,
          );

        const approvedDays =
          requests
            .filter(
              (
                request,
              ) =>
                request.leaveType ===
                  leaveType &&
                request.status ===
                  LeaveStatus.APPROVED,
            )
            .reduce(
              (
                total,
                request,
              ) =>
                total +
                request.totalDays,
              0,
            );

        const pendingDays =
          requests
            .filter(
              (
                request,
              ) =>
                request.leaveType ===
                  leaveType &&
                request.status ===
                  LeaveStatus.PENDING,
            )
            .reduce(
              (
                total,
                request,
              ) =>
                total +
                request.totalDays,
              0,
            );

        const entitlementDays =
          configured
            ?.entitlementDays ??
          null;

        const availableDays =
          entitlementDays ===
          null
            ? null
            : Math.max(
                entitlementDays -
                  approvedDays -
                  pendingDays,
                0,
              );

        return {
          leaveType,

          balanceConfigured:
            Boolean(
              configured,
            ),

          entitlementDays,

          approvedDays,

          pendingDays,

          availableDays,
        };
      },
    );

  return {
    employee: {
      id:
        employee.id,

      name:
        employee.name,
    },

    year,

    balances,
  };
}

/* =========================================================
   APPROVE LEAVE REQUEST
========================================================= */

export async function approveLeaveRequest(
  input:
    DecideLeaveInput,
) {
  const managerId =
    input.managerId
      ?.trim();

  if (
    !managerId
  ) {
    throw new LeaveServiceError(
      'MANAGER_REQUIRED',
      'Manager ID wajib diisi.',
    );
  }

  return prisma.$transaction(
    async (
      tx,
    ) => {
      const current =
        await findLeaveRequest(
          tx,
          input.requestId,
        );

      /*
       * Idempotent approval.
       */
      if (
        current.managerId ===
          managerId &&
        current.managerDecision ===
          ApprovalDecision.APPROVED &&
        current.status ===
          LeaveStatus.APPROVED
      ) {
        return current;
      }

      if (
        current.status !==
        LeaveStatus.PENDING
      ) {
        throw new LeaveServiceError(
          'INVALID_LEAVE_STATUS',
          `Pengajuan dengan status ${current.status} tidak dapat disetujui.`,
          409,
        );
      }

      if (
        current.managerId !==
        managerId
      ) {
        throw new LeaveServiceError(
          'UNAUTHORIZED_APPROVER',
          'Anda bukan manager yang berwenang menyetujui pengajuan ini.',
          403,
        );
      }

      if (
        current.managerDecision !==
        ApprovalDecision.PENDING
      ) {
        throw new LeaveServiceError(
          'MANAGER_ALREADY_DECIDED',
          'Manager sudah memberikan keputusan untuk pengajuan ini.',
          409,
        );
      }

      const now =
        new Date();

      const result =
        await tx.leaveRequest.updateMany(
          {
            where: {
              id:
                current.id,

              status:
                LeaveStatus.PENDING,

              managerDecision:
                ApprovalDecision.PENDING,

              managerId,
            },

            data: {
              status:
                LeaveStatus.APPROVED,

              managerDecision:
                ApprovalDecision.APPROVED,

              managerDecisionNote:
                input.note
                  ?.trim() ||
                null,

              managerDecidedAt:
                now,
            },
          },
        );

      if (
        result.count !==
        1
      ) {
        throw new LeaveServiceError(
          'APPROVAL_CONFLICT',
          'Status pengajuan berubah saat proses approval. Silakan muat ulang data.',
          409,
        );
      }

      const updated =
        await findLeaveRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'LEAVE_MANAGER_APPROVED',

          actorType:
            'MANAGER',

          actorId:
            managerId,

          metadata: {
            previousStatus:
              current.status,

            newStatus:
              updated.status,

            managerDecision:
              updated.managerDecision,

            decisionNote:
              updated.managerDecisionNote,
          },
        },
      );

      return updated;
    },
  );
}

/* =========================================================
   REJECT LEAVE REQUEST
========================================================= */

export async function rejectLeaveRequest(
  input:
    DecideLeaveInput,
) {
  const managerId =
    input.managerId
      ?.trim();

  const note =
    input.note
      ?.trim();

  if (
    !managerId
  ) {
    throw new LeaveServiceError(
      'MANAGER_REQUIRED',
      'Manager ID wajib diisi.',
    );
  }

  if (
    !note
  ) {
    throw new LeaveServiceError(
      'REJECTION_NOTE_REQUIRED',
      'Alasan penolakan wajib diisi.',
    );
  }

  return prisma.$transaction(
    async (
      tx,
    ) => {
      const current =
        await findLeaveRequest(
          tx,
          input.requestId,
        );

      if (
        current.managerId ===
          managerId &&
        current.managerDecision ===
          ApprovalDecision.REJECTED &&
        current.status ===
          LeaveStatus.REJECTED
      ) {
        return current;
      }

      if (
        current.status !==
        LeaveStatus.PENDING
      ) {
        throw new LeaveServiceError(
          'INVALID_LEAVE_STATUS',
          `Pengajuan dengan status ${current.status} tidak dapat ditolak.`,
          409,
        );
      }

      if (
        current.managerId !==
        managerId
      ) {
        throw new LeaveServiceError(
          'UNAUTHORIZED_APPROVER',
          'Anda bukan manager yang berwenang menolak pengajuan ini.',
          403,
        );
      }

      if (
        current.managerDecision !==
        ApprovalDecision.PENDING
      ) {
        throw new LeaveServiceError(
          'MANAGER_ALREADY_DECIDED',
          'Manager sudah memberikan keputusan untuk pengajuan ini.',
          409,
        );
      }

      const now =
        new Date();

      const result =
        await tx.leaveRequest.updateMany(
          {
            where: {
              id:
                current.id,

              status:
                LeaveStatus.PENDING,

              managerDecision:
                ApprovalDecision.PENDING,

              managerId,
            },

            data: {
              status:
                LeaveStatus.REJECTED,

              managerDecision:
                ApprovalDecision.REJECTED,

              managerDecisionNote:
                note,

              managerDecidedAt:
                now,
            },
          },
        );

      if (
        result.count !==
        1
      ) {
        throw new LeaveServiceError(
          'APPROVAL_CONFLICT',
          'Status pengajuan berubah saat proses rejection. Silakan muat ulang data.',
          409,
        );
      }

      const updated =
        await findLeaveRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'LEAVE_MANAGER_REJECTED',

          actorType:
            'MANAGER',

          actorId:
            managerId,

          metadata: {
            previousStatus:
              current.status,

            newStatus:
              updated.status,

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

/* =========================================================
   CANCEL LEAVE REQUEST
========================================================= */

export async function cancelLeaveRequest(
  input:
    CancelLeaveInput,
) {
  return prisma.$transaction(
    async (
      tx,
    ) => {
      const current =
        await findLeaveRequest(
          tx,
          input.requestId,
        );

      if (
        current.status !==
          LeaveStatus.PENDING &&
        current.status !==
          LeaveStatus.DRAFT
      ) {
        throw new LeaveServiceError(
          'INVALID_LEAVE_STATUS',
          `Pengajuan dengan status ${current.status} tidak dapat dibatalkan.`,
          409,
        );
      }

      const actorType =
        input.actorType
          ?.trim() ||
        'EMPLOYEE';

      /*
       * Untuk employee:
       * hanya pemilik request yang boleh cancel.
       */
      if (
        actorType ===
        'EMPLOYEE'
      ) {
        if (
          !input.actorId ||
          input.actorId !==
            current.employeeId
        ) {
          throw new LeaveServiceError(
            'UNAUTHORIZED_CANCEL',
            'Anda tidak berhak membatalkan pengajuan ini.',
            403,
          );
        }
      }

      const result =
        await tx.leaveRequest.updateMany(
          {
            where: {
              id:
                current.id,

              status:
                current.status,
            },

            data: {
              status:
                LeaveStatus.CANCELLED,
            },
          },
        );

      if (
        result.count !==
        1
      ) {
        throw new LeaveServiceError(
          'CANCEL_CONFLICT',
          'Status pengajuan berubah saat proses pembatalan. Silakan muat ulang data.',
          409,
        );
      }

      const updated =
        await findLeaveRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'LEAVE_CANCELLED',

          actorType,

          actorId:
            input.actorId,

          metadata: {
            previousStatus:
              current.status,

            newStatus:
              updated.status,

            reason:
              input.reason
                ?.trim() ||
              null,
          },
        },
      );

      return updated;
    },
  );
}

/* =========================================================
   CLAIM N8N WORKFLOW
========================================================= */

export async function claimLeaveWorkflowTrigger(
  requestId: string,
) {
  return prisma.$transaction(
    async (
      tx,
    ) => {
      const current =
        await findLeaveRequest(
          tx,
          requestId,
        );

      /*
       * Workflow hanya relevan untuk request pending.
       */
      if (
        current.status !==
        LeaveStatus.PENDING
      ) {
        return {
          claimed:
            false,

          request:
            current,
        };
      }

      /*
       * Jangan trigger ulang workflow
       * yang sedang berjalan / selesai.
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
       * Hanya NOT_STARTED atau FAILED
       * yang boleh dicoba trigger.
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
        await tx.leaveRequest.updateMany(
          {
            where: {
              id:
                current.id,

              status:
                LeaveStatus.PENDING,

              workflowStatus:
                current.workflowStatus,
            },

            data: {
              workflowStatus:
                WorkflowStatus.TRIGGERED,
            },
          },
        );

      if (
        result.count !==
        1
      ) {
        const latest =
          await findLeaveRequest(
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
        await findLeaveRequest(
          tx,
          current.id,
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'LEAVE_WORKFLOW_TRIGGERED',

          actorType:
            'SYSTEM',

          actorId:
            'N8N_DISPATCHER',

          metadata: {
            previousWorkflowStatus:
              current.workflowStatus,

            newWorkflowStatus:
              updated.workflowStatus,
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

export async function updateLeaveWorkflow(
  input:
    UpdateLeaveWorkflowInput,
) {
  return prisma.$transaction(
    async (
      tx,
    ) => {
      const current =
        await findLeaveRequest(
          tx,
          input.requestId,
        );

      const updated =
        await tx.leaveRequest.update(
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
              leaveInclude,
          },
        );

      await createAuditLog(
        tx,
        {
          entityId:
            updated.id,

          action:
            'LEAVE_WORKFLOW_UPDATED',

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