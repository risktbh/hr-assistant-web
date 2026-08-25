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
  streamGemini,
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

function sseEvent(
  event: string,
  data: unknown,
) {
  return (
    `event: ${event}\n` +
    `data: ${JSON.stringify(
      data,
    )}\n\n`
  );
}

/*
 * LangChain dapat mengembalikan content sebagai:
 * - string
 * - array content block
 */
function extractText(
  content: any,
): string {
  if (
    content == null
  ) {
    return '';
  }

  /*
   * String langsung
   */
  if (
    typeof content ===
    'string'
  ) {
    return content;
  }

  /*
   * Number / boolean / dll
   */
  if (
    typeof content !==
    'object'
  ) {
    return '';
  }

  /*
   * Array content blocks
   */
  if (
    Array.isArray(content)
  ) {
    return content
      .map((part) =>
        extractText(part),
      )
      .filter(Boolean)
      .join('');
  }

  /*
   * {
   *   text: "..."
   * }
   */
  if (
    typeof content.text ===
    'string'
  ) {
    return content.text;
  }

  /*
   * {
   *   content: "..."
   * }
   */
  if (
    typeof content.content ===
    'string'
  ) {
    return content.content;
  }

  /*
   * Nested:
   * {
   *   content: {...}
   * }
   */
  if (
    content.content
  ) {
    const nestedText =
      extractText(
        content.content,
      );

    if (
      nestedText
    ) {
      return nestedText;
    }
  }

  /*
   * Structured content:
   * {
   *   parts: [...]
   * }
   */
  if (
    Array.isArray(
      content.parts,
    )
  ) {
    return content.parts
      .map((part: any) =>
        extractText(part),
      )
      .filter(Boolean)
      .join('');
  }

  return '';
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

    /* =====================================================
       2. SESSION MANAGEMENT
    ===================================================== */

    let currentSessionId:
      | string
      | null =
      sessionId || null;

    if (!currentSessionId) {
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
       TOOL SELECTION
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
     * Tool selection tetap non-streaming.
     *
     * Alasannya:
     * server perlu mengetahui apakah Gemini memilih
     * personal data, RAG, atau tidak memakai tool.
     */
    const initialResult =
      await invokeGemini(
        messages,
        {
          tools,
          stage:
            'tool-selection',
          signal:
            req.signal,
        },
      );

    const aiResponse =
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

    /*
     * Jika null:
     * initialResult adalah jawaban langsung.
     *
     * Jika ada array:
     * jawaban final akan dibuat melalui streamGemini().
     */
    let followUpMessages:
      any[] | null = null;

    if (
      toolCalls.length > 0
    ) {
      /*
       * Versi sekarang memproses satu
       * tool call terlebih dahulu.
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

        const relevantChunks:
          any[] =
          await prisma.$queryRaw`
            SELECT
              content,
              metadata
            FROM "DocumentChunk"
            WHERE embedding IS NOT NULL
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
         10. BUILD TOOL FOLLOW-UP
      =================================================== */

      followUpMessages = [
        new SystemMessage(
          systemPrompt,
        ),

        ...formattedHistory,

        new HumanMessage(
          cleanMessage,
        ),

        /*
         * AI response yang berisi tool call.
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
    }

    /* =====================================================
       11. PREPARE SSE STREAM
    ===================================================== */

    const encoder =
      new TextEncoder();

    /*
     * Jika tidak ada tool, initial Gemini call sudah
     * menghasilkan jawaban final.
     *
     * Jawaban direct-chat akan dikirim sebagai satu delta.
     * Pertanyaan tool / RAG akan benar-benar token streaming.
     */
    const directAnswer =
      followUpMessages
        ? ''
        : extractText(
            aiResponse.content,
          ).trim();

    const stream =
      new ReadableStream({
        async start(
          controller,
        ) {
          let finalAnswer = '';

          let assistantSaved =
            false;

          const send = (
            event: string,
            data: unknown,
          ) => {
            try {
              controller.enqueue(
                encoder.encode(
                  sseEvent(
                    event,
                    data,
                  ),
                ),
              );

              return true;
            } catch {
              return false;
            }
          };

          const saveAssistant =
            async () => {
              if (
                assistantSaved ||
                !finalAnswer.trim()
              ) {
                return;
              }

              assistantSaved =
                true;

              await prisma.chatMessage.create(
                {
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
                },
              );
            };

          try {
            /* ===============================================
               META
            =============================================== */

            send(
              'meta',
              {
                sessionId:
                  currentSessionId,

                sources:
                  extractedSources,
              },
            );

            /* ===============================================
               TOOL / RAG FINAL RESPONSE - REAL STREAM
            =============================================== */
            /* ===============================================
              TOOL / RAG FINAL RESPONSE - REAL STREAM
            =============================================== */

            if (
              followUpMessages
            ) {
              const followUpResult =
                await streamGemini(
                  followUpMessages,
                  {
                    stage:
                      'tool-followup',

                    signal:
                      req.signal,
                  },
                );

              usedModel =
                followUpResult.model;

              usedModelType =
                followUpResult.modelUsed;

              let chunkCount = 0;
              let textChunkCount = 0;

              for await (
                const chunk of
                  followUpResult.stream
              ) {
                if (
                  req.signal.aborted
                ) {
                  break;
                }

                chunkCount++;

                let text = '';

                /*
                * PRIORITAS:
                * AIMessageChunk.text
                */
                if (
                  typeof chunk?.text ===
                    'string' &&
                  chunk.text.length > 0
                ) {
                  text =
                    chunk.text;
                }

                /*
                * FALLBACK:
                * chunk.content
                */
                else {
                  text =
                    extractText(
                      chunk?.content,
                    );
                }

                /*
                * DEBUG SEMENTARA
                * Lihat hasilnya di Vercel Logs
                */
                console.log(
                  '[STREAM CHUNK]',
                  {
                    chunkNumber:
                      chunkCount,

                    text:
                      chunk?.text,

                    content:
                      chunk?.content,

                    extractedText:
                      text,
                  },
                );

                if (!text) {
                  continue;
                }

                textChunkCount++;

                finalAnswer +=
                  text;

                send(
                  'delta',
                  {
                    text,
                  },
                );
              }

              console.log(
                '[STREAM SUMMARY]',
                {
                  chunkCount,

                  textChunkCount,

                  answerLength:
                    finalAnswer.length,
                },
              );
            }

            /* ===============================================
              DIRECT RESPONSE / TANPA TOOL
            =============================================== */

            else {
              finalAnswer =
                directAnswer;

              if (
                finalAnswer
              ) {
                send(
                  'delta',
                  {
                    text:
                      finalAnswer,
                  },
                );
              }
            }

            /* ===============================================
               STOP GENERATION
            =============================================== */

            if (
              req.signal.aborted
            ) {
              /*
               * Jika ada partial answer, coba simpan
               * agar Chat History tetap konsisten.
               */
              try {
                await saveAssistant();
              } catch (
                saveError
              ) {
                console.error(
                  '[AI CHAT] Gagal menyimpan partial response:',
                  saveError,
                );
              }

              console.info(
                '[AI CHAT] Stream aborted by client',
              );

              try {
                controller.close();
              } catch {}

              return;
            }

            /* ===============================================
               EMPTY RESPONSE FALLBACK
            =============================================== */

            if (
              !finalAnswer.trim()
            ) {
              finalAnswer =
                'Maaf, format respons dari AI tidak dapat dibaca.';

              send(
                'delta',
                {
                  text:
                    finalAnswer,
                },
              );
            }

            /* ===============================================
               SAVE COMPLETE AI MESSAGE
            =============================================== */

            await saveAssistant();

            /* ===============================================
               LOG
            =============================================== */

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

                streamed:
                  Boolean(
                    followUpMessages,
                  ),
              },
            );

            /* ===============================================
               DONE
            =============================================== */

            send(
              'done',
              {
                model:
                  usedModel,

                modelUsed:
                  usedModelType,
              },
            );

            controller.close();
          } catch (error) {
            /*
             * Browser menekan Stop / request disconnect.
             */
            if (
              req.signal.aborted
            ) {
              try {
                await saveAssistant();
              } catch (
                saveError
              ) {
                console.error(
                  '[AI CHAT] Gagal menyimpan partial response:',
                  saveError,
                );
              }

              console.info(
                '[AI CHAT] Stream aborted by client',
              );

              try {
                controller.close();
              } catch {}

              return;
            }

            console.error(
              '[AI STREAM ERROR]',
              error,
            );

            /*
             * Jika stream sudah menghasilkan partial text,
             * simpan bagian yang sudah diterima.
             */
            try {
              await saveAssistant();
            } catch (
              saveError
            ) {
              console.error(
                '[AI CHAT] Gagal menyimpan partial response setelah stream error:',
                saveError,
              );
            }

            let errorMessage =
              'Terjadi kesalahan saat menghasilkan jawaban AI.';

            let errorCode =
              'AI_STREAM_ERROR';

            if (
              error instanceof
              AIServiceError
            ) {
              errorMessage =
                error.message;

              errorCode =
                error.code;
            }

            send(
              'error',
              {
                message:
                  errorMessage,

                code:
                  errorCode,
              },
            );

            try {
              controller.close();
            } catch {}
          }
        },
      });

    /* =====================================================
       12. STREAM RESPONSE
    ===================================================== */

    return new Response(
      stream,
      {
        status: 200,

        headers: {
          'Content-Type':
            'text/event-stream; charset=utf-8',

          'Cache-Control':
            'no-cache, no-transform',

          Connection:
            'keep-alive',

          'X-Accel-Buffering':
            'no',
        },
      },
    );
  } catch (error) {
    /* =====================================================
       GEMINI GRACEFUL ERROR
    ===================================================== */

    console.error(
      '💥 ERROR PADA API CHAT:',
      error,
    );

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
       ABORT BEFORE STREAM STARTED
    ===================================================== */

    if (
      error instanceof Error &&
      error.name ===
        'AbortError'
    ) {
      return jsonResponse(
        {
          error:
            'Request dibatalkan.',

          code:
            'REQUEST_ABORTED',
        },
        499,
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
