import { NextResponse } from 'next/server';

import { prisma } from '@/lib/db/prisma';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const employeeId =
      process.env
        .DEMO_EMPLOYEE_ID
        ?.trim();

    if (!employeeId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code:
              'EMPLOYEE_CONTEXT_NOT_CONFIGURED',
            message:
              'Server belum memiliki employee context.',
          },
        },
        {
          status: 500,
        },
      );
    }

    const employee =
      await prisma.employee.findUnique({
        where: {
          id:
            employeeId,
        },

        select: {
          id: true,
          name: true,
          position: true,
          department: true,
        },
      });

    if (!employee) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code:
              'EMPLOYEE_NOT_FOUND',
            message:
              'Employee demo tidak ditemukan.',
          },
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data:
          employee,
      },
      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  } catch (error) {
    console.error(
      '[CURRENT EMPLOYEE API ERROR]',
      error,
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code:
            'CURRENT_EMPLOYEE_READ_FAILED',
          message:
            'Gagal membaca employee aktif.',
        },
      },
      {
        status: 500,
      },
    );
  }
}
