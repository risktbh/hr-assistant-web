import {
  timingSafeEqual,
} from 'node:crypto';

/* =========================================================
   VERIFY N8N SHARED SECRET
========================================================= */

export function verifyN8nSecret(
  request: Request,
) {
  const expected =
    process.env
      .N8N_SHARED_SECRET
      ?.trim();

  const received =
    request.headers
      .get('x-n8n-secret')
      ?.trim();

  if (
    !expected ||
    !received
  ) {
    return false;
  }

  const expectedBuffer =
    Buffer.from(
      expected,
      'utf8',
    );

  const receivedBuffer =
    Buffer.from(
      received,
      'utf8',
    );

  if (
    expectedBuffer.length !==
    receivedBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    expectedBuffer,
    receivedBuffer,
  );
}