import type { PrismaClient } from '@prisma/client';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const leaveStatusSchema = z.object({
  mode: z
    .enum([
      'LATEST',
      'BY_DATE',
      'BY_REQUEST_CODE',
      'SUMMARY',
    ])
    .optional()
    .default('LATEST')
    .describe(
      'LATEST untuk pengajuan terbaru, BY_DATE untuk tanggal tertentu, BY_REQUEST_CODE untuk kode request tertentu, SUMMARY untuk ringkasan jumlah pengajuan.',
    ),

  requestCode: z
    .string()
    .trim()
    .optional()
    .describe(
      'Kode pengajuan leave, misalnya LV-20260901-DSLBCN. Hanya isi jika pengguna menyebut kode request.',
    ),

  date: z
    .string()
    .trim()
    .optional()
    .describe(
      'Tanggal cuti dalam format YYYY-MM-DD. Hanya isi jika pengguna menanyakan status cuti pada tanggal tertentu.',
    ),

  status: z
    .enum([
      'DRAFT',
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
    ])
    .optional()
    .describe(
      'Filter status jika pengguna secara eksplisit meminta pengajuan dengan status tertentu.',
    ),
});

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isoOrNull(value: Date | null) {
  return value ? value.toISOString() : null;
}

export function createGetLeaveStatusTool({
  prisma,
  employeeId,
}: {
  prisma: PrismaClient;
  employeeId: string;
}) {
  const scopedEmployeeId = employeeId.trim();

  if (!scopedEmployeeId) {
    throw new Error(
      'Employee context untuk get_leave_status tidak tersedia.',
    );
  }

  return tool(
    async (input) => {
      const requestCode = input.requestCode?.trim();
      const queryDate = input.date?.trim();
      const requestedStatus = input.status;

      let mode = input.mode ?? 'LATEST';

      // Defensive routing: kalau model mengirim filter spesifik
      // tetapi lupa mengganti mode, tetap gunakan intent paling spesifik.
      if (mode === 'LATEST' && requestCode) {
        mode = 'BY_REQUEST_CODE';
      } else if (mode === 'LATEST' && queryDate) {
        mode = 'BY_DATE';
      }

      const requests = await prisma.leaveRequest.findMany({
        where: {
          employeeId: scopedEmployeeId,
        },
        include: {
          manager: {
            select: {
              id: true,
              name: true,
              position: true,
              department: true,
            },
          },
        },
        orderBy: {
          requestedAt: 'desc',
        },
        take: 100,
      });

      const summary = {
        total: requests.length,
        draft: requests.filter(
          (request) => request.status === 'DRAFT',
        ).length,
        pending: requests.filter(
          (request) => request.status === 'PENDING',
        ).length,
        approved: requests.filter(
          (request) => request.status === 'APPROVED',
        ).length,
        rejected: requests.filter(
          (request) => request.status === 'REJECTED',
        ).length,
        cancelled: requests.filter(
          (request) => request.status === 'CANCELLED',
        ).length,
      };

      let filtered = requests;

      if (requestedStatus) {
        filtered = filtered.filter(
          (request) => request.status === requestedStatus,
        );
      }

      if (mode === 'BY_REQUEST_CODE') {
        if (!requestCode) {
          return JSON.stringify({
            type: 'LEAVE_STATUS_RESULT',
            found: false,
            reason: 'REQUEST_CODE_REQUIRED',
            message:
              'Kode pengajuan diperlukan untuk pencarian berdasarkan request code.',
            summary,
          });
        }

        const normalizedCode = requestCode.toUpperCase();

        filtered = filtered.filter(
          (request) =>
            request.requestCode.toUpperCase() ===
            normalizedCode,
        );
      }

      if (mode === 'BY_DATE') {
        if (
          !queryDate ||
          !/^\d{4}-\d{2}-\d{2}$/.test(queryDate)
        ) {
          return JSON.stringify({
            type: 'LEAVE_STATUS_RESULT',
            found: false,
            reason: 'VALID_DATE_REQUIRED',
            message:
              'Tanggal YYYY-MM-DD diperlukan untuk pencarian berdasarkan tanggal.',
            summary,
          });
        }

        filtered = filtered.filter((request) => {
          const start = dateOnly(request.startDate);
          const end = dateOnly(request.endDate);

          return start <= queryDate && queryDate <= end;
        });
      }

      const serialize = (
        request: (typeof requests)[number],
      ) => ({
        requestCode: request.requestCode,
        leaveType: request.leaveType,
        startDate: dateOnly(request.startDate),
        endDate: dateOnly(request.endDate),
        totalDays: request.totalDays,
        reason: request.reason,

        status: request.status,
        managerDecision: request.managerDecision,
        managerDecisionNote:
          request.managerDecisionNote,
        managerDecidedAt: isoOrNull(
          request.managerDecidedAt,
        ),

        workflowStatus: request.workflowStatus,
        workflowRunId: request.workflowRunId,

        policySource: request.policySource,
        requestedAt: request.requestedAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),

        manager: request.manager
          ? {
              name: request.manager.name,
              position: request.manager.position,
              department: request.manager.department,
            }
          : null,
      });

      if (mode === 'SUMMARY') {
        return JSON.stringify({
          type: 'LEAVE_STATUS_RESULT',
          found: requests.length > 0,
          mode,
          summary,
          filteredCount: filtered.length,
          filter: {
            status: requestedStatus ?? null,
          },
          recentRequests: filtered
            .slice(0, 5)
            .map(serialize),
        });
      }

      const selected =
        mode === 'LATEST'
          ? filtered.slice(0, 1)
          : filtered;

      return JSON.stringify({
        type: 'LEAVE_STATUS_RESULT',
        found: selected.length > 0,
        mode,
        query: {
          requestCode: requestCode ?? null,
          date: queryDate ?? null,
          status: requestedStatus ?? null,
        },
        summary,
        count: selected.length,
        latest: selected[0]
          ? serialize(selected[0])
          : null,
        requests: selected.slice(0, 10).map(serialize),
      });
    },
    {
      name: 'get_leave_status',
      description:
        'Ambil status pengajuan cuti/leave milik employee yang sedang login dari database. Gunakan untuk pertanyaan seperti "status cuti saya?", "pengajuan cuti terakhir saya bagaimana?", "cuti saya tanggal 6 Oktober sudah disetujui?", "status request LV-...?", atau "berapa pengajuan cuti saya yang masih pending?". Tool ini hanya membaca data transactional leave; jangan gunakan RAG untuk status request.',
      schema: leaveStatusSchema,
    },
  );
}
