import {
  ChatGoogleGenerativeAI,
} from "@langchain/google-genai";

/* =========================================================
   CONFIG
========================================================= */

const PRIMARY_MODEL =
  process.env.GEMINI_PRIMARY_MODEL ||
  "gemini-3.5-flash-lite";

const FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL ||
  "gemini-3.1-flash-lite";

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

/* =========================================================
   MODEL
========================================================= */

const primaryLLM =
  new ChatGoogleGenerativeAI({
    model: PRIMARY_MODEL,
    maxRetries: MAX_RETRIES,
    maxConcurrency:
      MAX_CONCURRENCY,
  });

const fallbackLLM =
  new ChatGoogleGenerativeAI({
    model: FALLBACK_MODEL,
    maxRetries: MAX_RETRIES,
    maxConcurrency:
      MAX_CONCURRENCY,
  });

/* =========================================================
   TYPES
========================================================= */

type GeminiTools =
  Parameters<
    ChatGoogleGenerativeAI["bindTools"]
  >[0];

type InvokeGeminiOptions = {
  tools?: GeminiTools;
  stage?: string;
};

export type GeminiResult = {
  response: any;
  model: string;
  modelUsed:
    | "primary"
    | "fallback";
};

/* =========================================================
   ERROR CLASS
========================================================= */

export class AIServiceError
  extends Error {
  code:
    | "AI_RATE_LIMIT"
    | "AI_UNAVAILABLE"
    | "AI_REQUEST_FAILED";

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
      | "AI_RATE_LIMIT"
      | "AI_UNAVAILABLE"
      | "AI_REQUEST_FAILED";

    status: number;

    originalError?: unknown;
  }) {
    super(message);

    this.name =
      "AIServiceError";

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
      "object" ||
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
    message.includes("429") ||
    message.includes(
      "resource_exhausted",
    ) ||
    message.includes(
      "resource exhausted",
    ) ||
    message.includes(
      "rate limit",
    ) ||
    message.includes(
      "rate_limit",
    ) ||
    message.includes(
      "quota",
    ) ||
    message.includes(
      "too many requests",
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
      "resource_exhausted",
    ) ||
    message.includes(
      "rate limit",
    ) ||
    message.includes(
      "quota",
    ) ||
    message.includes(
      "too many requests",
    ) ||
    message.includes(
      "service unavailable",
    ) ||
    message.includes(
      "overloaded",
    ) ||
    message.includes(
      "timeout",
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
) {
  /*
   * Kalau ada tools:
   *
   * llm.bindTools(tools).invoke(...)
   *
   * Kalau tidak:
   *
   * llm.invoke(...)
   */

  if (
    tools &&
    tools.length > 0
  ) {
    const llmWithTools =
      llm.bindTools(tools);

    return llmWithTools.invoke(
      input,
    );
  }

  return llm.invoke(input);
}

/* =========================================================
   PRIMARY + FALLBACK
========================================================= */

export async function invokeGemini(
  input: any,
  options: InvokeGeminiOptions = {},
): Promise<GeminiResult> {
  const {
    tools,
    stage = "chat",
  } = options;

  /*
   * =====================================================
   * PRIMARY
   * =====================================================
   */

  try {
    console.info(
      `[Gemini:${stage}] primary → ${PRIMARY_MODEL}`,
    );

    const response =
      await invokeModel(
        primaryLLM,
        input,
        tools,
      );

    console.info(
      `[Gemini:${stage}] success → ${PRIMARY_MODEL}`,
    );

    return {
      response,
      model:
        PRIMARY_MODEL,
      modelUsed:
        "primary",
    };
  } catch (primaryError) {
    console.error(
      `[Gemini:${stage}] primary failed`,
      primaryError,
    );

    /*
     * Jangan fallback untuk error seperti:
     *
     * 400 invalid request
     * 401 API key
     * malformed prompt
     */
    if (
      !shouldFallback(
        primaryError,
      )
    ) {
      throw new AIServiceError({
        message:
          "Permintaan ke AI tidak dapat diproses.",

        code:
          "AI_REQUEST_FAILED",

        status: 500,

        originalError:
          primaryError,
      });
    }
  }

  /*
   * =====================================================
   * FALLBACK
   * =====================================================
   */

  try {
    console.warn(
      `[Gemini:${stage}] fallback → ${FALLBACK_MODEL}`,
    );

    const response =
      await invokeModel(
        fallbackLLM,
        input,
        tools,
      );

    console.info(
      `[Gemini:${stage}] fallback success → ${FALLBACK_MODEL}`,
    );

    return {
      response,
      model:
        FALLBACK_MODEL,
      modelUsed:
        "fallback",
    };
  } catch (fallbackError) {
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
          "AI Assistant sedang mencapai batas penggunaan. Silakan coba kembali beberapa saat lagi.",

        code:
          "AI_RATE_LIMIT",

        status: 503,

        originalError:
          fallbackError,
      });
    }

    throw new AIServiceError({
      message:
        "AI Assistant sedang tidak tersedia sementara. Silakan coba kembali beberapa saat lagi.",

      code:
        "AI_UNAVAILABLE",

      status: 503,

      originalError:
        fallbackError,
    });
  }
}