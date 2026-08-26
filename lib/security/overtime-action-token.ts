import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import type {
  OvertimeDraftResult,
} from '@/lib/ai/overtime-intent';

import type {
  OvertimePolicyValidation,
} from '@/lib/ai/overtime-policy';

/* =========================================================
   TYPES
========================================================= */

export type OvertimeActionTokenPayload = {
  version: 1;

  action:
    'CONFIRM_OVERTIME';

  requestCode:
    string;

  employeeId:
    string;

  sessionId:
    string;

  issuedAt:
    number;

  expiresAt:
    number;

  draft:
    OvertimeDraftResult;

  policyValidation:
    OvertimePolicyValidation;
};

/* =========================================================
   SECRET
========================================================= */

function getSecret() {
  const secret =
    process.env
      .OVERTIME_ACTION_SECRET;

  if (!secret) {
    throw new Error(
      'OVERTIME_ACTION_SECRET tidak tersedia.',
    );
  }

  return secret;
}

/* =========================================================
   REQUEST CODE
========================================================= */

function generateRandomCode(
  length = 6,
) {
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

function generateRequestCode() {
  const parts =
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
    ).formatToParts(
      new Date(),
    );

  const get =
    (
      type:
        Intl.DateTimeFormatPartTypes,
    ) =>
      parts.find(
        (part) =>
          part.type ===
          type,
      )?.value ?? '';

  const dateCode =
    `${get('year')}` +
    `${get('month')}` +
    `${get('day')}`;

  return (
    `OT-${dateCode}-` +
    generateRandomCode()
  );
}

/* =========================================================
   SIGNATURE
========================================================= */

function sign(
  encodedPayload: string,
) {
  return createHmac(
    'sha256',
    getSecret(),
  )
    .update(
      encodedPayload,
    )
    .digest(
      'base64url',
    );
}

/* =========================================================
   CREATE TOKEN
========================================================= */

export function createOvertimeActionToken(
  input: {
    employeeId:
      string;

    sessionId:
      string;

    draft:
      OvertimeDraftResult;

    policyValidation:
      OvertimePolicyValidation;

    expiresInSeconds?:
      number;
  },
) {
  const now =
    Math.floor(
      Date.now() /
        1000,
    );

  const expiresIn =
    input.expiresInSeconds ??
    10 * 60;

  const payload:
    OvertimeActionTokenPayload =
    {
      version:
        1,

      action:
        'CONFIRM_OVERTIME',

      requestCode:
        generateRequestCode(),

      employeeId:
        input.employeeId,

      sessionId:
        input.sessionId,

      issuedAt:
        now,

      expiresAt:
        now +
        expiresIn,

      draft:
        input.draft,

      policyValidation:
        input.policyValidation,
    };

  const encodedPayload =
    Buffer
      .from(
        JSON.stringify(
          payload,
        ),
        'utf8',
      )
      .toString(
        'base64url',
      );

  const signature =
    sign(
      encodedPayload,
    );

  return (
    `${encodedPayload}.` +
    `${signature}`
  );
}

/* =========================================================
   VERIFY TOKEN
========================================================= */

export function verifyOvertimeActionToken(
  token: string,
): OvertimeActionTokenPayload {
  if (
    !token ||
    token.length > 20_000
  ) {
    throw new Error(
      'Action token tidak valid.',
    );
  }

  const [
    encodedPayload,
    receivedSignature,
  ] =
    token.split('.');

  if (
    !encodedPayload ||
    !receivedSignature
  ) {
    throw new Error(
      'Format action token tidak valid.',
    );
  }

  const expectedSignature =
    sign(
      encodedPayload,
    );

  const receivedBuffer =
    Buffer.from(
      receivedSignature,
    );

  const expectedBuffer =
    Buffer.from(
      expectedSignature,
    );

  if (
    receivedBuffer.length !==
    expectedBuffer.length
  ) {
    throw new Error(
      'Signature action token tidak valid.',
    );
  }

  if (
    !timingSafeEqual(
      receivedBuffer,
      expectedBuffer,
    )
  ) {
    throw new Error(
      'Signature action token tidak valid.',
    );
  }

  let payload:
    OvertimeActionTokenPayload;

  try {
    payload =
      JSON.parse(
        Buffer
          .from(
            encodedPayload,
            'base64url',
          )
          .toString(
            'utf8',
          ),
      );
  } catch {
    throw new Error(
      'Payload action token tidak valid.',
    );
  }

  const now =
    Math.floor(
      Date.now() /
        1000,
    );

  if (
    payload.version !==
      1 ||
    payload.action !==
      'CONFIRM_OVERTIME'
  ) {
    throw new Error(
      'Jenis action token tidak valid.',
    );
  }

  if (
    payload.expiresAt <=
    now
  ) {
    throw new Error(
      'Konfirmasi sudah kedaluwarsa. Buat draft overtime baru.',
    );
  }

  /* =======================================================
     SERVER-SIDE SAFETY GATE
  ======================================================= */

  if (
    !payload
      .draft
      .complete ||

    payload
      .draft
      .missingFields
      .length > 0 ||

    payload
      .draft
      .validationErrors
      .length > 0
  ) {
    throw new Error(
      'Draft overtime belum memenuhi syarat.',
    );
  }

  const policy =
    payload
      .policyValidation;

  if (
    !policy
      .policyFound ||

    !policy
      .eligible ||

    policy
      .needsHumanReview ||

    policy
      .violations
      .length > 0
  ) {
    throw new Error(
      'Policy validation belum mengizinkan pengajuan overtime.',
    );
  }

  return payload;
}