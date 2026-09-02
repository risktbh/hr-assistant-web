import {
  tool,
} from '@langchain/core/tools';

import {
  z,
} from 'zod';

import {
  prisma,
} from '@/lib/db/prisma';

import {
  getEmployeeLeaveBalance,
} from '@/lib/services/leave-service';

/* =========================================================
   HELPERS
========================================================= */

function getJakartaCurrentYear() {
  const year = new Intl.DateTimeFormat(
    'en-US',
    {
      timeZone:
        'Asia/Jakarta',

      year:
        'numeric',
    },
  ).format(
    new Date(),
  );

  return Number(year);
}

/* =========================================================
   FACTORY
========================================================= */

export function createGetEmployeeContextTool(
  {
    employeeId,
  }: {
    employeeId: string;
  },
) {
  return tool(
    async ({
      year,
    }) => {
      const selectedYear =
        year ??
        getJakartaCurrentYear();

      const employee =
        await prisma.employee.findUnique({
          where: {
            id:
              employeeId,
          },

          select: {
            name:
              true,

            position:
              true,

            department:
              true,
          },
        });

      if (!employee) {
        return JSON.stringify({
          type:
            'EMPLOYEE_CONTEXT_RESULT',

          success:
            false,

          found:
            false,

          message:
            'Data employee aktif tidak ditemukan.',
        });
      }

      const leaveBalance =
        await getEmployeeLeaveBalance(
          employeeId,
          selectedYear,
        );

      return JSON.stringify({
        type:
          'EMPLOYEE_CONTEXT_RESULT',

        success:
          true,

        found:
          true,

        employee: {
          name:
            employee.name,

          position:
            employee.position,

          department:
            employee.department,
        },

        leaveBalance: {
          year:
            leaveBalance.year,

          balances:
            leaveBalance
              .balances
              .map(
                (balance) => ({
                  leaveType:
                    balance.leaveType,

                  balanceConfigured:
                    balance
                      .balanceConfigured,

                  entitlementDays:
                    balance
                      .entitlementDays,

                  approvedDays:
                    balance
                      .approvedDays,

                  pendingDays:
                    balance
                      .pendingDays,

                  availableDays:
                    balance
                      .availableDays,
                }),
              ),
        },
      });
    },
    {
      name:
        'get_employee_context',

      description:
        'Gunakan tool read-only ini untuk membaca profil employee aktif dan saldo cuti aktual dari database, termasuk entitlement, hari approved, hari pending, dan saldo tersedia. Employee identity ditentukan server dan tidak boleh dipilih pengguna atau model.',

      schema:
        z.object({
          year:
            z
              .number()
              .int()
              .min(2000)
              .max(2100)
              .optional()
              .describe(
                'Tahun saldo cuti yang ingin dilihat. Kosongkan untuk tahun berjalan di Asia/Jakarta.',
              ),
        }),
    },
  );
}
