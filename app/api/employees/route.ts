import { NextRequest, NextResponse } from 'next/server';

import {
  PrismaClient,
  Prisma,
} from '@prisma/client';

import { PrismaPg } from '@prisma/adapter-pg';

/* =========================================================
   ROUTE CONFIG
========================================================= */

/**
 * pg / PrismaPg berjalan pada Node.js runtime.
 */
export const runtime = 'nodejs';

/**
 * Employee status dapat berubah sewaktu-waktu.
 * Force dynamic memastikan route tidak diperlakukan
 * sebagai static response.
 */
export const dynamic = 'force-dynamic';


/* =========================================================
   DATABASE
========================================================= */

/**
 * Simpan instance Prisma di globalThis saat development.
 *
 * Tujuannya agar Next.js hot reload tidak terus-menerus
 * membuat PrismaClient baru.
 */

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};


/**
 * Membuat Prisma Client.
 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL belum tersedia. Pastikan environment variable DATABASE_URL sudah diatur.',
    );
  }

  const adapter = new PrismaPg({
    connectionString,
  });

  return new PrismaClient({
    adapter,
  });
}


/**
 * Reuse Prisma Client apabila sudah ada.
 */
const prisma =
  globalForPrisma.prisma ??
  createPrismaClient();


/**
 * Cache client ketika development.
 */
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}


/* =========================================================
   CONSTANTS
========================================================= */

const ALLOWED_STATUS = [
  'WFO',
  'WFH',
  'CUTI',
] as const;

type EmployeeStatus =
  (typeof ALLOWED_STATUS)[number];


/**
 * Batas maksimal hasil apabila parameter limit digunakan.
 *
 * Menghindari query seperti:
 * /api/employees?limit=999999
 */
const MAX_LIMIT = 200;


/**
 * Panjang maksimum search.
 */
const MAX_SEARCH_LENGTH = 100;


/* =========================================================
   HELPERS
========================================================= */

/**
 * Membersihkan string dari URL search params.
 */
function cleanParam(
  value: string | null,
  maxLength = 100,
) {
  if (!value) {
    return '';
  }

  return value
    .trim()
    .slice(0, maxLength);
}


/**
 * Parse parameter limit.
 *
 * Contoh:
 * ?limit=50
 */
function parseLimit(
  value: string | null,
) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  if (
    Number.isNaN(parsed) ||
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return undefined;
  }

  return Math.min(
    parsed,
    MAX_LIMIT,
  );
}


/**
 * Cek status employee.
 */
function isValidStatus(
  value: string,
): value is EmployeeStatus {
  return ALLOWED_STATUS.includes(
    value as EmployeeStatus,
  );
}


/* =========================================================
   GET /api/employees
========================================================= */

/**
 * Mendapatkan employee directory.
 *
 * Mendukung:
 *
 * /api/employees
 *
 * /api/employees?search=riski
 *
 * /api/employees?status=WFO
 *
 * /api/employees?department=Engineering
 *
 * /api/employees?location=Jakarta
 *
 * /api/employees?sort=desc
 *
 * /api/employees?limit=50
 *
 * Bisa digabung:
 *
 * /api/employees
 * ?search=engineer
 * &department=Engineering
 * &status=WFO
 * &sort=asc
 */
export async function GET(
  request: NextRequest,
) {
  try {
    /* =====================================================
       1. READ QUERY PARAMETERS
    ===================================================== */

    const searchParams =
      request.nextUrl.searchParams;

    const search = cleanParam(
      searchParams.get('search'),
      MAX_SEARCH_LENGTH,
    );

    const department = cleanParam(
      searchParams.get('department'),
    );

    const location = cleanParam(
      searchParams.get('location'),
    );

    const rawStatus = cleanParam(
      searchParams.get('status'),
    ).toUpperCase();

    const rawSort = cleanParam(
      searchParams.get('sort'),
    ).toLowerCase();

    const limit = parseLimit(
      searchParams.get('limit'),
    );


    /* =====================================================
       2. VALIDATE STATUS
    ===================================================== */

    /**
     * ALL dianggap tidak menggunakan filter.
     */

    if (
      rawStatus &&
      rawStatus !== 'ALL' &&
      !isValidStatus(rawStatus)
    ) {
      return NextResponse.json(
        {
          error: 'INVALID_STATUS',
          message:
            'Status employee tidak valid.',
          allowedStatus: [
            'WFO',
            'WFH',
            'CUTI',
          ],
        },
        {
          status: 400,
        },
      );
    }


    /* =====================================================
       3. SORTING
    ===================================================== */

    const sortDirection:
      Prisma.SortOrder =
      rawSort === 'desc'
        ? 'desc'
        : 'asc';


    /* =====================================================
       4. BUILD FILTER
    ===================================================== */

    const filters:
      Prisma.EmployeeWhereInput[] = [];


    /* -----------------------------------------------------
       SEARCH
    ----------------------------------------------------- */

    /**
     * Search berdasarkan:
     *
     * - name
     * - position
     * - department
     * - location
     * - email
     *
     * mode insensitive:
     * "riski" tetap menemukan "Riski Mardianto"
     */

    if (search) {
      filters.push({
        OR: [
          {
            name: {
              contains: search,
              mode: 'insensitive',
            },
          },

          {
            position: {
              contains: search,
              mode: 'insensitive',
            },
          },

          {
            department: {
              contains: search,
              mode: 'insensitive',
            },
          },

          {
            location: {
              contains: search,
              mode: 'insensitive',
            },
          },

          {
            email: {
              contains: search,
              mode: 'insensitive',
            },
          },
        ],
      });
    }


    /* -----------------------------------------------------
       STATUS
    ----------------------------------------------------- */

    if (
      rawStatus &&
      rawStatus !== 'ALL' &&
      isValidStatus(rawStatus)
    ) {
      filters.push({
        status: rawStatus,
      });
    }


    /* -----------------------------------------------------
       DEPARTMENT
    ----------------------------------------------------- */

    if (
      department &&
      department.toUpperCase() !== 'ALL'
    ) {
      filters.push({
        department: {
          equals: department,
          mode: 'insensitive',
        },
      });
    }


    /* -----------------------------------------------------
       LOCATION
    ----------------------------------------------------- */

    if (
      location &&
      location.toUpperCase() !== 'ALL'
    ) {
      filters.push({
        location: {
          contains: location,
          mode: 'insensitive',
        },
      });
    }


    /* =====================================================
       5. FINAL WHERE
    ===================================================== */

    const where:
      Prisma.EmployeeWhereInput =
      filters.length
        ? {
            AND: filters,
          }
        : {};


    /* =====================================================
       6. DATABASE QUERY
    ===================================================== */

    /**
     * Employee + count dijalankan dalam satu transaction.
     *
     * Count digunakan untuk metadata response header.
     */

    const [
      employees,
      totalEmployees,
    ] = await prisma.$transaction([
      prisma.employee.findMany({
        where,

        /**
         * Secara eksplisit menentukan data yang
         * boleh dikirim ke browser.
         *
         * Kalau nanti tabel Employee memiliki
         * salary, privateNotes, dll, field tersebut
         * tidak otomatis bocor ke frontend.
         */
        select: {
          id: true,
          name: true,
          position: true,
          department: true,
          email: true,
          phone: true,
          status: true,
          location: true,
          initial: true,
        },

        orderBy: {
          name: sortDirection,
        },

        /**
         * Apabila limit tidak diberikan,
         * semua employee dikembalikan.
         *
         * Ini menjaga kompatibilitas dengan
         * frontend kita sekarang.
         */
        ...(limit
          ? {
              take: limit,
            }
          : {}),
      }),

      prisma.employee.count({
        where,
      }),
    ]);


    /* =====================================================
       7. RESPONSE
    ===================================================== */

    return NextResponse.json(
      employees,
      {
        status: 200,

        headers: {
          /**
           * Informasi tambahan yang nantinya
           * dapat digunakan frontend.
           */

          'X-Total-Count':
            String(totalEmployees),

          'X-Returned-Count':
            String(employees.length),

          /**
           * Employee availability dapat berubah.
           * Jangan cache response di browser/CDN.
           */

          'Cache-Control':
            'no-store, max-age=0',
        },
      },
    );
  } catch (error) {
    /* =====================================================
       8. ERROR HANDLING
    ===================================================== */

    console.error(
      '[GET /api/employees]',
      error,
    );


    /* -----------------------------------------------------
       PRISMA KNOWN ERROR
    ----------------------------------------------------- */

    if (
      error instanceof
      Prisma.PrismaClientKnownRequestError
    ) {
      return NextResponse.json(
        {
          error: 'DATABASE_QUERY_ERROR',

          message:
            'Terjadi kesalahan saat membaca database employee.',

          /**
           * Code hanya saya tampilkan karena
           * aman untuk debugging.
           *
           * Jangan kirim stack trace/database
           * credentials ke frontend.
           */
          code: error.code,
        },
        {
          status: 500,
        },
      );
    }


    /* -----------------------------------------------------
       DATABASE CONFIG ERROR
    ----------------------------------------------------- */

    if (
      error instanceof Error &&
      error.message.includes(
        'DATABASE_URL',
      )
    ) {
      return NextResponse.json(
        {
          error:
            'DATABASE_CONFIGURATION_ERROR',

          message:
            'Konfigurasi database belum tersedia.',
        },
        {
          status: 500,
        },
      );
    }


    /* -----------------------------------------------------
       UNKNOWN ERROR
    ----------------------------------------------------- */

    return NextResponse.json(
      {
        error:
          'INTERNAL_SERVER_ERROR',

        message:
          'Gagal mengambil data karyawan.',
      },
      {
        status: 500,
      },
    );
  }
}