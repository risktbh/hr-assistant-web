import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

import {
  GoogleGenerativeAIEmbeddings,
} from '@langchain/google-genai';

import { tool } from '@langchain/core/tools';

import { z } from 'zod';

import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  AIMessage,
} from '@langchain/core/messages';

import {
  AIServiceError,
  invokeGemini,
} from '@/lib/ai/gemini';

/* =========================================================
   RUNTIME
========================================================= */

export const runtime = 'nodejs';

/* =========================================================
   DATABASE
========================================================= */

const connectionString =
  process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
});

const adapter =
  new PrismaPg(pool);

const prisma =
  new PrismaClient({
    adapter,
  });

/* =========================================================
   HELPERS
========================================================= */

function jsonResponse(
  data: unknown,
  status = 200,
) {
  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        'Content-Type':
          'application/json',
      },
    },
  );
}

/* =========================================================
   POST /api/chat
========================================================= */

export async function POST(
  req: Request,
) {
  try {
    /* =====================================================
       1. REQUEST
    ===================================================== */

    const {
      message,
      history = [],
      sessionId,
    } = await req.json();

    if (
      typeof message !==
        'string' ||
      !message.trim()
    ) {
      return jsonResponse(
        {
          error:
            'Pesan kosong',

          code:
            'EMPTY_MESSAGE',
        },
        400,
      );
    }

    const cleanMessage =
      message.trim();

    /* =====================================================
       GEMINI API KEY
    ===================================================== */

    const apiKey =
      process.env
        .GOOGLE_API_KEY ||
      process.env
        .GEMINI_API_KEY;

    if (!apiKey) {
      console.error(
        'API KEY Gemini tidak ditemukan.',
      );

      return jsonResponse(
        {
          error:
            'Server salah konfigurasi. API Key AI tidak tersedia.',

          code:
            'AI_CONFIG_ERROR',
        },
        500,
      );
    }

    /*
     * Tidak perlu lagi melakukan:
     *
     * process.env.GOOGLE_API_KEY =
     * process.env.GEMINI_API_KEY
     *
     * Sebaiknya gemini.ts sendiri
     * membaca kedua environment variable.
     */

    /* =====================================================
       2. SESSION MANAGEMENT
    ===================================================== */

    let currentSessionId:
      | string
      | null =
      sessionId || null;

    if (!currentSessionId) {
      /*
       * Percakapan baru.
       */

      const newSession =
        await prisma.chatSession.create(
          {
            data: {
              title:
                cleanMessage.length >
                30
                  ? `${cleanMessage.substring(
                      0,
                      30,
                    )}...`
                  : cleanMessage,

              userId:
                'riski',
            },
          },
        );

      currentSessionId =
        newSession.id;
    } else {
      /*
       * Update waktu supaya session
       * naik ke atas di Sidebar.
       */

      await prisma.chatSession.update(
        {
          where: {
            id:
              currentSessionId,
          },

          data: {
            updatedAt:
              new Date(),
          },
        },
      );
    }

    /* =====================================================
       3. SAVE USER MESSAGE
    ===================================================== */

    await prisma.chatMessage.create({
      data: {
        sessionId:
          currentSessionId,

        role:
          'user',

        content:
          cleanMessage,

        sources: [],
      },
    });

    /* =====================================================
       4. TOOL 1
       PERSONAL EMPLOYEE DATA
    ===================================================== */

    const cekSisaCutiTool =
      tool(
        async ({
          nama_karyawan,
        }) => {
          const dummyData: Record<
            string,
            {
              sisa_cuti: number;
              jabatan: string;
            }
          > = {
            riski: {
              sisa_cuti: 4,
              jabatan:
                'HR Manager',
            },

            budi: {
              sisa_cuti: 12,
              jabatan:
                'Software Engineer',
            },
          };

          const normalizedName =
            nama_karyawan
              .trim()
              .toLowerCase();

          const data =
            dummyData[
              normalizedName
            ];

          if (data) {
            return (
              `Data Sisa Cuti untuk ${nama_karyawan}: ` +
              `Sisa cuti ${data.sisa_cuti} hari, ` +
              `Jabatan: ${data.jabatan}.`
            );
          }

          return (
            `Karyawan atas nama ${nama_karyawan} ` +
            `tidak ditemukan di database.`
          );
        },
        {
          name:
            'cek_data_personal_karyawan',

          description:
            'Gunakan tool ini HANYA jika pengguna menanyakan data personal seperti sisa cuti atau jabatan mereka.',

          schema:
            z.object({
              nama_karyawan:
                z
                  .string()
                  .describe(
                    "Nama karyawan. Jika tidak disebutkan, asumsikan 'Riski'.",
                  ),
            }),
        },
      );

    /* =====================================================
       5. TOOL 2
       RAG KNOWLEDGE DATABASE
    ===================================================== */

    const cariKebijakanHRTool =
      tool(
        async () => {
          /*
           * Implementasi sebenarnya
           * dijalankan setelah AI
           * memilih tool.
           */
          return 'Tool dipanggil';
        },
        {
          name:
            'cari_dokumen_kebijakan_hr',

          description:
            'Gunakan tool ini untuk mencari informasi aturan perusahaan, prosedur, atau kebijakan HR di dokumen PDF.',

          schema:
            z.object({
              pertanyaan_pencarian:
                z
                  .string()
                  .describe(
                    'Kata kunci pencarian untuk database kebijakan.',
                  ),
            }),
        },
      );

    const tools = [
      cekSisaCutiTool,
      cariKebijakanHRTool,
    ];

    /* =====================================================
       6. SYSTEM PROMPT
    ===================================================== */

    const systemPrompt = `
Anda adalah "AI HR Assistant" yang cerdas, akurat, dan ramah.

Gunakan tools yang tersedia jika pertanyaan berkaitan dengan:
- data personal karyawan seperti sisa cuti atau jabatan;
- aturan perusahaan;
- kebijakan HR;
- prosedur perusahaan;
- informasi dari dokumen HR.

Jika pertanyaan hanya berupa sapaan atau percakapan umum,
jawab langsung dengan ramah tanpa menggunakan tool.

Jika informasi diperoleh dari tool atau dokumen,
gunakan informasi tersebut sebagai dasar jawaban.

Jangan mengarang informasi yang tidak tersedia.
`.trim();

    /* =====================================================
       7. SLIDING WINDOW HISTORY
    ===================================================== */

    const MAX_HISTORY_MESSAGES =
      6;

    const safeHistory =
      Array.isArray(history)
        ? history
        : [];

    const slidingWindowHistory =
      safeHistory.slice(
        -MAX_HISTORY_MESSAGES,
      );

    const formattedHistory =
      slidingWindowHistory
        .filter(
          (msg: any) =>
            typeof msg?.content ===
            'string',
        )
        .map((msg: any) => {
          if (
            msg.role ===
            'user'
          ) {
            return new HumanMessage(
              msg.content,
            );
          }

          return new AIMessage(
            msg.content,
          );
        });

    /* =====================================================
       8. INITIAL LLM CALL
       PRIMARY → RETRY → FALLBACK
    ===================================================== */

    const messages = [
      new SystemMessage(
        systemPrompt,
      ),

      ...formattedHistory,

      new HumanMessage(
        cleanMessage,
      ),
    ];

    /*
     * invokeGemini akan:
     *
     * primary
     *   ↓
     * retry maksimal 2x
     *   ↓
     * fallback jika 429 / 503 / timeout
     */

    const initialResult =
      await invokeGemini(
        messages,
        {
          tools,

          stage:
            'tool-selection',
        },
      );

    let aiResponse =
      initialResult.response as AIMessage;

    let usedModel =
      initialResult.model;

    let usedModelType =
      initialResult.modelUsed;

    /* =====================================================
       SOURCES
    ===================================================== */

    let extractedSources:
      string[] = [];

    /* =====================================================
       9. TOOL EXECUTION
    ===================================================== */

    const toolCalls =
      aiResponse.tool_calls ??
      [];

    if (
      toolCalls.length > 0
    ) {
      /*
       * Saat ini kita proses
       * satu tool call terlebih dahulu.
       */
      const toolCall =
        toolCalls[0];

      let toolResult = '';

      /* ===================================================
         PERSONAL EMPLOYEE DATA
      =================================================== */

      if (
        toolCall.name ===
        'cek_data_personal_karyawan'
      ) {
        const args =
          toolCall.args as {
            nama_karyawan:
              string;
          };

        toolResult =
          await cekSisaCutiTool.invoke(
            args,
          );
      }

      /* ===================================================
         RAG DATABASE
      =================================================== */

      else if (
        toolCall.name ===
        'cari_dokumen_kebijakan_hr'
      ) {
        const args =
          toolCall.args as {
            pertanyaan_pencarian:
              string;
          };

        /*
         * Embedding tetap menggunakan
         * GoogleGenerativeAIEmbeddings.
         *
         * Fallback saat ini hanya
         * untuk Chat Model.
         */

        const embeddings =
          new GoogleGenerativeAIEmbeddings(
            {
              model:
                'gemini-embedding-2',

              apiKey,
            },
          );

        const queryVector =
          await embeddings.embedQuery(
            args
              .pertanyaan_pencarian,
          );

        const vectorString =
          `[${queryVector.join(
            ',',
          )}]`;

        /*
         * Vector similarity search.
         */

        const relevantChunks:
          any[] =
          await prisma.$queryRaw`
            SELECT
              content,
              metadata
            FROM "DocumentChunk"
            ORDER BY
              embedding <=>
              ${vectorString}::vector
            LIMIT 4;
          `;

        if (
          Array.isArray(
            relevantChunks,
          ) &&
          relevantChunks.length >
            0
        ) {
          /*
           * Gabungkan context.
           */

          toolResult =
            relevantChunks
              .map(
                (
                  chunk: any,
                ) =>
                  chunk.content,
              )
              .filter(Boolean)
              .join(
                '\n\n',
              );

          /*
           * Ambil nama file sumber.
           */

          const sourceNames =
            relevantChunks
              .map(
                (
                  chunk: any,
                ) => {
                  const rawSource =
                    chunk
                      ?.metadata
                      ?.source;

                  if (
                    typeof rawSource !==
                    'string'
                  ) {
                    return null;
                  }

                  return (
                    rawSource
                      .split(
                        /[/\\]/,
                      )
                      .pop() ??
                    null
                  );
                },
              )
              .filter(
                (
                  source,
                ): source is string =>
                  Boolean(
                    source,
                  ),
              );

          extractedSources = [
            ...new Set(
              sourceNames,
            ),
          ];
        } else {
          toolResult =
            'Informasi tidak ditemukan di dokumen.';
        }
      }

      /* ===================================================
         UNKNOWN TOOL
      =================================================== */

      else {
        console.warn(
          '[AI CHAT] Unknown tool:',
          toolCall.name,
        );

        toolResult =
          'Tool yang diminta tidak tersedia.';
      }

      /* ===================================================
         10. TOOL FOLLOW-UP
      =================================================== */

      const followUpMessages =
        [
          new SystemMessage(
            systemPrompt,
          ),

          ...formattedHistory,

          new HumanMessage(
            cleanMessage,
          ),

          /*
           * AI response yang berisi
           * tool call.
           */

          aiResponse,

          /*
           * Hasil tool.
           */

          new ToolMessage({
            tool_call_id:
              toolCall.id ||
              'default_tool_id',

            content:
              String(
                toolResult,
              ),
          }),
        ];

      /*
       * Penting:
       *
       * Jangan lagi:
       *
       * await llm.invoke(...)
       *
       * Semua generation harus
       * melewati invokeGemini().
       */

      const followUpResult =
        await invokeGemini(
          followUpMessages,
          {
            stage:
              'tool-followup',
          },
        );

      aiResponse =
        followUpResult.response as AIMessage;

      usedModel =
        followUpResult.model;

      usedModelType =
        followUpResult.modelUsed;
    }

    /* =====================================================
       11. FINALIZE ANSWER
    ===================================================== */

    let finalAnswer = '';

    /*
     * Seharusnya setelah tool follow-up
     * sudah tidak ada tool call lagi.
     */

    if (
      aiResponse.tool_calls &&
      aiResponse.tool_calls
        .length > 0
    ) {
      finalAnswer =
        'Sistem saya sedang memproses pencarian dokumen, namun terjadi kesalahan. Mohon coba tanyakan kembali.';
    }

    /*
     * Normal text response.
     */

    else if (
      typeof aiResponse.content ===
      'string'
    ) {
      finalAnswer =
        aiResponse.content.trim();
    }

    /*
     * Gemini / LangChain juga
     * dapat memberikan content array.
     */

    else if (
      Array.isArray(
        aiResponse.content,
      )
    ) {
      const textParts =
        aiResponse.content
          .map(
            (content: any) => {
              if (
                typeof content ===
                'string'
              ) {
                return content;
              }

              if (
                content?.type ===
                  'text' &&
                typeof content.text ===
                  'string'
              ) {
                return content.text;
              }

              return '';
            },
          )
          .filter(Boolean);

      finalAnswer =
        textParts.join(
          '\n',
        );
    }

    /*
     * Fallback jika content
     * tidak bisa dibaca.
     */

    if (!finalAnswer) {
      finalAnswer =
        'Maaf, format respons dari AI tidak dapat dibaca.';
    }

    /*
     * Jangan tampilkan sources jika
     * response AI sebenarnya gagal
     * memproses tool.
     */

    if (
      finalAnswer.includes(
        'Sistem saya sedang memproses',
      )
    ) {
      extractedSources = [];
    }

    /* =====================================================
       12. SAVE AI MESSAGE
    ===================================================== */

    await prisma.chatMessage.create({
      data: {
        sessionId:
          currentSessionId,

        role:
          'assistant',

        content:
          finalAnswer,

        sources:
          extractedSources,
      },
    });

    /* =====================================================
       13. SUCCESS RESPONSE
    ===================================================== */

    console.info(
      '[AI CHAT SUCCESS]',
      {
        sessionId:
          currentSessionId,

        model:
          usedModel,

        modelUsed:
          usedModelType,

        sources:
          extractedSources.length,
      },
    );

    return jsonResponse(
      {
        answer:
          finalAnswer,

        sources:
          extractedSources,

        sessionId:
          currentSessionId,

        /*
         * Sangat berguna saat development.
         *
         * primary / fallback
         */

        model:
          usedModel,

        modelUsed:
          usedModelType,
      },
      200,
    );
  } catch (error) {
    /* =====================================================
       GEMINI GRACEFUL ERROR
    ===================================================== */

    console.error(
      '💥 ERROR PADA API CHAT:',
      error,
    );

    /*
     * Error yang sudah diklasifikasikan
     * oleh lib/ai/gemini.ts
     */

    if (
      error instanceof
      AIServiceError
    ) {
      return jsonResponse(
        {
          error:
            error.message,

          code:
            error.code,
        },
        error.status,
      );
    }

    /* =====================================================
       OTHER SERVER ERROR
    ===================================================== */

    return jsonResponse(
      {
        error:
          'Gagal memproses pertanyaan di server.',

        code:
          'INTERNAL_ERROR',
      },
      500,
    );
  }
}