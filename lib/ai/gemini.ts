import {
  ChatGoogleGenerativeAI,
} from '@langchain/google-genai';

/* =========================================================
   CONFIG
========================================================= */

const PRIMARY_MODEL =
  process.env.GEMINI_PRIMARY_MODEL ||
  'gemini-3.5-flash-lite';

const FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL ||
  'gemini-3.1-flash-lite';

const MAX_RETRIES =
  Number(
    process.env.GEMINI_MAX_RETRIES ||
      2,
  );

const MAX_CONCURRENCY =
  Number(
    process.env.GEMINI_MAX_CONCURRENCY ||
      4,
  );

const API_KEY =
  process.env.GOOGLE_API_KEY ||
  process.env.GEMINI_API_KEY;

/* =========================================================
   MODEL
========================================================= */

const primaryLLM =
  new ChatGoogleGenerativeAI({
    model: PRIMARY_MODEL,
    maxRetries: MAX_RETRIES,
    maxConcurrency:
      MAX_CONCURRENCY,
    apiKey: API_KEY,
  });

const fallbackLLM =
  new ChatGoogleGenerativeAI({
    model: FALLBACK_MODEL,
    maxRetries: MAX_RETRIES,
    maxConcurrency:
      MAX_CONCURRENCY,
    apiKey: API_KEY,
  });

/* =========================================================
   TYPES
========================================================= */

type GeminiTools =
  Parameters<
    ChatGoogleGenerativeAI['bindTools']
  >[0];

type InvokeGeminiOptions = {
  tools?: GeminiTools;
  stage?: string;
  signal?: AbortSignal;
};

export type GeminiResult = {
  response: any;
  model: string;
  modelUsed:
    | 'primary'
    | 'fallback';
};

export type GeminiStreamResult = {
  stream: AsyncIterable<any>;
  model: string;
  modelUsed:
    | 'primary'
    | 'fallback';
};

/* =========================================================
   ERROR CLASS
========================================================= */

export class AIServiceError
  extends Error {
  code:
    | 'AI_RATE_LIMIT'
    | 'AI_UNAVAILABLE'
    | 'AI_REQUEST_FAILED';

  status: number;

  originalError?: unknown;

  constructor({
    message,
    code,
    status,
    originalError,
  }: {
    message: string;

    code:
      | 'AI_RATE_LIMIT'
      | 'AI_UNAVAILABLE'
      | 'AI_REQUEST_FAILED';

    status: number;

    originalError?: unknown;
  }) {
    super(message);

    this.name =
      'AIServiceError';

    this.code =
      code;

    this.status =
      status;

    this.originalError =
      originalError;
  }
}

/* =========================================================
   ERROR HELPERS
========================================================= */

function getErrorMessage(
  error: unknown,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  try {
    return JSON.stringify(
      error,
    );
  } catch {
    return String(error);
  }
}

function getErrorStatus(
  error: unknown,
):
  | number
  | undefined {
  if (
    typeof error !==
      'object' ||
    error === null
  ) {
    return undefined;
  }

  const err =
    error as Record<
      string,
      any
    >;

  return (
    err.status ??
    err.statusCode ??
    err.response?.status ??
    err.cause?.status ??
    err.cause?.statusCode
  );
}

function isRateLimitError(
  error: unknown,
) {
  const status =
    getErrorStatus(error);

  const message =
    getErrorMessage(
      error,
    ).toLowerCase();

  return (
    status === 429 ||
    message.includes('429') ||
    message.includes(
      'resource_exhausted',
    ) ||
    message.includes(
      'resource exhausted',
    ) ||
    message.includes(
      'rate limit',
    ) ||
    message.includes(
      'rate_limit',
    ) ||
    message.includes(
      'quota',
    ) ||
    message.includes(
      'too many requests',
    )
  );
}

function shouldFallback(
  error: unknown,
) {
  const status =
    getErrorStatus(error);

  const message =
    getErrorMessage(
      error,
    ).toLowerCase();

  if (
    status === 429 ||
    status === 503 ||
    status === 504
  ) {
    return true;
  }

  return (
    message.includes(
      'resource_exhausted',
    ) ||
    message.includes(
      'rate limit',
    ) ||
    message.includes(
      'quota',
    ) ||
    message.includes(
      'too many requests',
    ) ||
    message.includes(
      'service unavailable',
    ) ||
    message.includes(
      'overloaded',
    ) ||
    message.includes(
      'timeout',
    )
  );
}

/* =========================================================
   INVOKE MODEL
========================================================= */

async function invokeModel(
  llm: ChatGoogleGenerativeAI,
  input: any,
  tools?: GeminiTools,
  signal?: AbortSignal,
) {
  if (
    tools &&
    tools.length > 0
  ) {
    const llmWithTools =
      llm.bindTools(tools);

    return llmWithTools.invoke(
      input,
      {
        signal,
      },
    );
  }

  return llm.invoke(
    input,
    {
      signal,
    },
  );
}

/* =========================================================
   STREAM MODEL
========================================================= */

async function streamModel(
  llm: ChatGoogleGenerativeAI,
  input: any,
  tools?: GeminiTools,
  signal?: AbortSignal,
) {
  if (
    tools &&
    tools.length > 0
  ) {
    const llmWithTools =
      llm.bindTools(tools);

    return llmWithTools.stream(
      input,
      {
        signal,
      },
    );
  }

  return llm.stream(
    input,
    {
      signal,
    },
  );
}

/* =========================================================
   OPEN / PRIME STREAM
========================================================= */

/*
 * Ambil chunk pertama sebelum stream dikembalikan.
 *
 * Manfaat:
 * - jika primary gagal sebelum output pertama,
 *   kita masih bisa mencoba fallback;
 * - setelah token sudah dikirim ke browser,
 *   kita tidak mencoba mencampur jawaban primary
 *   dan fallback dalam satu response.
 */
async function openStream(
  llm: ChatGoogleGenerativeAI,
  input: any,
  tools?: GeminiTools,
  signal?: AbortSignal,
): Promise<AsyncIterable<any>> {
  const source =
    await streamModel(
      llm,
      input,
      tools,
      signal,
    );

  const iterator =
    source[
      Symbol.asyncIterator
    ]();

  const first =
    await iterator.next();

  async function* replayStream() {
    if (!first.done) {
      yield first.value;
    }

    while (true) {
      const next =
        await iterator.next();

      if (next.done) {
        break;
      }

      yield next.value;
    }
  }

  return replayStream();
}

/* =========================================================
   PRIMARY + FALLBACK (NON-STREAM)
========================================================= */

export async function invokeGemini(
  input: any,
  options: InvokeGeminiOptions = {},
): Promise<GeminiResult> {
  const {
    tools,
    stage = 'chat',
    signal,
  } = options;

  /* =====================================================
     PRIMARY
  ===================================================== */

  try {
    console.info(
      `[Gemini:${stage}] primary → ${PRIMARY_MODEL}`,
    );

    const response =
      await invokeModel(
        primaryLLM,
        input,
        tools,
        signal,
      );

    console.info(
      `[Gemini:${stage}] success → ${PRIMARY_MODEL}`,
    );

    return {
      response,
      model:
        PRIMARY_MODEL,
      modelUsed:
        'primary',
    };
  } catch (primaryError) {
    if (signal?.aborted) {
      throw primaryError;
    }

    console.error(
      `[Gemini:${stage}] primary failed`,
      primaryError,
    );

    if (
      !shouldFallback(
        primaryError,
      )
    ) {
      throw new AIServiceError({
        message:
          'Permintaan ke AI tidak dapat diproses.',

        code:
          'AI_REQUEST_FAILED',

        status: 500,

        originalError:
          primaryError,
      });
    }
  }

  /* =====================================================
     FALLBACK
  ===================================================== */

  try {
    console.warn(
      `[Gemini:${stage}] fallback → ${FALLBACK_MODEL}`,
    );

    const response =
      await invokeModel(
        fallbackLLM,
        input,
        tools,
        signal,
      );

    console.info(
      `[Gemini:${stage}] fallback success → ${FALLBACK_MODEL}`,
    );

    return {
      response,
      model:
        FALLBACK_MODEL,
      modelUsed:
        'fallback',
    };
  } catch (fallbackError) {
    if (signal?.aborted) {
      throw fallbackError;
    }

    console.error(
      `[Gemini:${stage}] fallback failed`,
      fallbackError,
    );

    if (
      isRateLimitError(
        fallbackError,
      )
    ) {
      throw new AIServiceError({
        message:
          'AI Assistant sedang mencapai batas penggunaan. Silakan coba kembali beberapa saat lagi.',

        code:
          'AI_RATE_LIMIT',

        status: 503,

        originalError:
          fallbackError,
      });
    }

    throw new AIServiceError({
      message:
        'AI Assistant sedang tidak tersedia sementara. Silakan coba kembali beberapa saat lagi.',

      code:
        'AI_UNAVAILABLE',

      status: 503,

      originalError:
        fallbackError,
    });
  }
}

/* =========================================================
   PRIMARY + FALLBACK (STREAM)
========================================================= */

export async function streamGemini(
  input: any,
  options: InvokeGeminiOptions = {},
): Promise<GeminiStreamResult> {
  const {
    tools,
    stage = 'chat-stream',
    signal,
  } = options;

  /* =====================================================
     PRIMARY
  ===================================================== */

  try {
    console.info(
      `[Gemini:${stage}] streaming primary → ${PRIMARY_MODEL}`,
    );

    const stream =
      await openStream(
        primaryLLM,
        input,
        tools,
        signal,
      );

    console.info(
      `[Gemini:${stage}] stream started → ${PRIMARY_MODEL}`,
    );

    return {
      stream,
      model:
        PRIMARY_MODEL,
      modelUsed:
        'primary',
    };
  } catch (primaryError) {
    if (signal?.aborted) {
      throw primaryError;
    }

    console.error(
      `[Gemini:${stage}] primary stream failed`,
      primaryError,
    );

    if (
      !shouldFallback(
        primaryError,
      )
    ) {
      throw new AIServiceError({
        message:
          'Permintaan ke AI tidak dapat diproses.',

        code:
          'AI_REQUEST_FAILED',

        status: 500,

        originalError:
          primaryError,
      });
    }
  }

  /* =====================================================
     FALLBACK
  ===================================================== */

  try {
    console.warn(
      `[Gemini:${stage}] streaming fallback → ${FALLBACK_MODEL}`,
    );

    const stream =
      await openStream(
        fallbackLLM,
        input,
        tools,
        signal,
      );

    console.info(
      `[Gemini:${stage}] fallback stream started → ${FALLBACK_MODEL}`,
    );

    return {
      stream,
      model:
        FALLBACK_MODEL,
      modelUsed:
        'fallback',
    };
  } catch (fallbackError) {
    if (signal?.aborted) {
      throw fallbackError;
    }

    console.error(
      `[Gemini:${stage}] fallback stream failed`,
      fallbackError,
    );

    if (
      isRateLimitError(
        fallbackError,
      )
    ) {
      throw new AIServiceError({
        message:
          'AI Assistant sedang mencapai batas penggunaan. Silakan coba kembali beberapa saat lagi.',

        code:
          'AI_RATE_LIMIT',

        status: 503,

        originalError:
          fallbackError,
      });
    }

    throw new AIServiceError({
      message:
        'AI Assistant sedang tidak tersedia sementara. Silakan coba kembali beberapa saat lagi.',

      code:
        'AI_UNAVAILABLE',

      status: 503,

      originalError:
        fallbackError,
    });
  }
}
