import {
  prisma,
} from '@/lib/db/prisma';

import {
  OvertimeServiceError,
} from '@/lib/services/overtime-service';

/* =========================================================
   TYPES
========================================================= */

export type SecondApproverResolution = {
  secondApproverId:
    string;

  source:
    'MANAGER_MANAGER';

  employee: {
    id:
      string;

    name:
      string;
  };

  manager: {
    id:
      string;

    name:
      string;
  };

  secondApprover: {
    id:
      string;

    name:
      string;

    email:
      string;

    position:
      string;

    department:
      string;
  };
};

/* =========================================================
   RESOLVE SECOND APPROVER
========================================================= */

export async function resolveSecondApprover(
  requestId:
    string,
): Promise<SecondApproverResolution> {
  const normalizedRequestId =
    requestId?.trim();

  if (
    !normalizedRequestId
  ) {
    throw new OvertimeServiceError(
      'REQUEST_ID_REQUIRED',
      'Request ID wajib diisi.',
      400,
    );
  }

  const request =
    await prisma
      .overtimeRequest
      .findFirst({
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

        select: {
          id:
            true,

          requiresSecondApproval:
            true,

          employee: {
            select: {
              id:
                true,

              name:
                true,
            },
          },

          manager: {
            select: {
              id:
                true,

              name:
                true,

              manager: {
                select: {
                  id:
                    true,

                  name:
                    true,

                  email:
                    true,

                  position:
                    true,

                  department:
                    true,
                },
              },
            },
          },
        },
      });

  if (!request) {
    throw new OvertimeServiceError(
      'OVERTIME_NOT_FOUND',
      'Pengajuan lembur tidak ditemukan.',
      404,
    );
  }

  if (
    !request
      .requiresSecondApproval
  ) {
    throw new OvertimeServiceError(
      'SECOND_APPROVAL_NOT_REQUIRED',
      'Pengajuan ini tidak membutuhkan second approval.',
      409,
    );
  }

  if (
    !request.manager
  ) {
    throw new OvertimeServiceError(
      'MANAGER_NOT_ASSIGNED',
      'Line manager belum ditentukan.',
      422,
    );
  }

  /*
   * MVP hierarchy:
   *
   * employee
   *   ↓
   * manager
   *   ↓
   * manager.manager
   *
   * Manager dari line manager dianggap
   * Department Head / second approver.
   */
  const secondApprover =
    request
      .manager
      .manager;

  if (
    !secondApprover
  ) {
    throw new OvertimeServiceError(
      'SECOND_APPROVER_NOT_FOUND',
      'Second approver tidak dapat ditentukan dari hierarchy organisasi.',
      422,
    );
  }

  if (
    secondApprover.id ===
      request.employee.id ||
    secondApprover.id ===
      request.manager.id
  ) {
    throw new OvertimeServiceError(
      'INVALID_SECOND_APPROVER',
      'Second approver harus berbeda dari employee dan line manager.',
      422,
    );
  }

  return {
    secondApproverId:
      secondApprover.id,

    source:
      'MANAGER_MANAGER',

    employee: {
      id:
        request.employee.id,

      name:
        request.employee.name,
    },

    manager: {
      id:
        request.manager.id,

      name:
        request.manager.name,
    },

    secondApprover,
  };
}