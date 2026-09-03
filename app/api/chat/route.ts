import {
  prisma,
} from '@/lib/db/prisma';

import {
  GoogleGenerativeAIEmbeddings,
} from '@langchain/google-genai';

import { tool } from '@langchain/core/tools';
import { z } from 'zod';

import {
  HumanMessage,
  SystemMessage,
  AIMessage,
} from '@langchain/core/messages';

import {
  AIServiceError,
  invokeGemini,
  streamGemini,
} from '@/lib/ai/gemini';

import {
  getJakartaNowContext,
  prepareOvertimeRequestTool,
  type OvertimeDraftResult,
} from '@/lib/ai/overtime-intent';

import {
  validateOvertimeDraftWithRag,
  type OvertimePolicyValidation,
} from '@/lib/ai/overtime-policy';

import {
  createOvertimeActionToken,
} from '@/lib/security/overtime-action-token';

import {
  getEmployeeOvertimeRequests,
  getOvertimeRequest,
  OvertimeServiceError,
} from '@/lib/services/overtime-service';

import {
  createGetLeaveStatusTool,
} from '@/lib/ai/leave-status';

import {
  createGetEmployeeContextTool,
} from '@/lib/ai/employee-context';

import {
  prepareReimbursementRequestTool,
  type ReimbursementDraftResult,
} from '@/lib/ai/reimbursement-intent';

import {
  validateReimbursementPolicyWithRag,
  type ReimbursementPolicyWithRagResult,
} from '@/lib/ai/reimbursement-policy';

import {
  createReimbursementActionToken,
} from '@/lib/security/reimbursement-action-token';

import {
  createGetReimbursementStatusTool,
} from '@/lib/ai/reimbursement-status';


/* =========================================================
   RUNTIME
========================================================= */

export const runtime = 'nodejs';

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
    const serverEmployeeId =
      process.env
        .DEMO_EMPLOYEE_ID
        ?.trim();

    if (!serverEmployeeId) {
      return jsonResponse(
        {
          error:
            'Server belum memiliki employee context.',
          code:
            'EMPLOYEE_CONTEXT_NOT_CONFIGURED',
        },
        500,
      );
    }

    const getLeaveStatusTool =
      createGetLeaveStatusTool({
        prisma,
        employeeId:
          serverEmployeeId,
      });

    /*
     * 8J.2 — Reimbursement status tool.
     * Employee identity berasal dari serverEmployeeId,
     * bukan dari LLM / browser.
     */
    const getReimbursementStatusTool =
      createGetReimbursementStatusTool({
        prisma,
        employeeId:
          serverEmployeeId,
      });

    const getEmployeeContextTool =
      createGetEmployeeContextTool({
        employeeId:
          serverEmployeeId,
      });

    /* =====================================================
       4. TOOL 1
       REAL EMPLOYEE CONTEXT / LEAVE BALANCE
    ===================================================== */

    /*
     * getEmployeeContextTool sudah dibuat menggunakan
     * serverEmployeeId. Employee identity tidak berasal
     * dari LLM atau browser.
     */


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

         /* =====================================================
       TOOL 3
       OVERTIME STATUS
    ===================================================== */

    const getOvertimeStatusTool =
      tool(
        async ({
          requestCode,
          limit,
        }) => {
          /*
           * Identity TIDAK boleh berasal dari LLM.
           *
           * Untuk MVP masih menggunakan DEMO_EMPLOYEE_ID.
           * Nanti saat Auth/RBAC selesai, ganti dengan
           * employeeId dari authenticated session.
           */
          const employeeId =
            process.env
              .DEMO_EMPLOYEE_ID
              ?.trim();

          if (!employeeId) {
            return JSON.stringify({
              kind:
                'OVERTIME_STATUS',

              success:
                false,

              code:
                'EMPLOYEE_CONTEXT_MISSING',

              message:
                'Konteks employee untuk membaca status overtime belum tersedia.',
            });
          }

          /*
           * Normalize data yang dikirim ke AI.
           *
           * Jangan memberikan seluruh Prisma object
           * kepada model.
           */
          const serializeRequest =
            (request: any) => {
              return {
                requestCode:
                  request.requestCode,

                status:
                  request.status,

                approvalStage:
                  request.approvalStage,

                requiresSecondApproval:
                  request
                    .requiresSecondApproval,

                startAt:
                  request.startAt
                    .toISOString(),

                endAt:
                  request.endAt
                    .toISOString(),

                timezone:
                  request.timezone,

                durationMinutes:
                  request
                    .durationMinutes,

                reason:
                  request.reason,

                projectName:
                  request.projectName,

                taskReference:
                  request.taskReference,

                requestedAt:
                  request.requestedAt
                    .toISOString(),

                manager: request.manager
                  ? {
                      name:
                        request
                          .manager
                          .name,

                      decision:
                        request
                          .managerDecision,

                      note:
                        request
                          .managerDecisionNote,

                      decidedAt:
                        request
                          .managerDecidedAt
                          ?.toISOString() ??
                        null,
                    }
                  : null,

                secondApprover:
                  request.secondApprover
                    ? {
                        name:
                          request
                            .secondApprover
                            .name,

                        decision:
                          request
                            .secondDecision,

                        note:
                          request
                            .secondDecisionNote,

                        decidedAt:
                          request
                            .secondDecidedAt
                            ?.toISOString() ??
                          null,
                      }
                    : null,

                workflowStatus:
                  request
                    .workflowStatus,
              };
            };

          /*
           * ===============================================
           * REQUEST TERTENTU
           * ===============================================
           */

          const normalizedRequestCode =
            requestCode
              ?.trim();

          if (
            normalizedRequestCode
          ) {
            try {
              const request =
                await getOvertimeRequest(
                  normalizedRequestCode,
                );

              /*
               * SECURITY:
               *
               * getOvertimeRequest() dapat menemukan request
               * berdasarkan requestCode secara global.
               *
               * Jangan pernah expose request employee lain.
               */
              if (
                request.employeeId !==
                employeeId
              ) {
                return JSON.stringify({
                  kind:
                    'OVERTIME_STATUS',

                  success:
                    true,

                  found:
                    false,

                  requests:
                    [],

                  message:
                    'Pengajuan overtime tidak ditemukan untuk employee aktif.',
                });
              }

              return JSON.stringify({
                kind:
                  'OVERTIME_STATUS',

                success:
                  true,

                found:
                  true,

                mode:
                  'SINGLE',

                requests: [
                  serializeRequest(
                    request,
                  ),
                ],
              });
            } catch (error) {
              if (
                error instanceof
                  OvertimeServiceError &&
                error.code ===
                  'OVERTIME_NOT_FOUND'
              ) {
                return JSON.stringify({
                  kind:
                    'OVERTIME_STATUS',

                  success:
                    true,

                  found:
                    false,

                  requests:
                    [],

                  message:
                    'Pengajuan overtime dengan request code tersebut tidak ditemukan.',
                });
              }

              throw error;
            }
          }

          /*
           * ===============================================
           * REQUEST TERBARU EMPLOYEE
           * ===============================================
           */

          const safeLimit =
            Math.min(
              Math.max(
                limit ?? 1,
                1,
              ),
              5,
            );

          const requests =
            await getEmployeeOvertimeRequests(
              employeeId,
              {
                limit:
                  safeLimit,
              },
            );

          if (
            requests.length === 0
          ) {
            return JSON.stringify({
              kind:
                'OVERTIME_STATUS',

              success:
                true,

              found:
                false,

              mode:
                'LATEST',

              requests:
                [],

              message:
                'Employee belum memiliki pengajuan overtime.',
            });
          }

          return JSON.stringify({
            kind:
              'OVERTIME_STATUS',

            success:
              true,

            found:
              true,

            mode:
              'LATEST',

            requests:
              requests.map(
                serializeRequest,
              ),
          });
        },
        {
          name:
            'get_overtime_status',

          description:
            'Gunakan tool ini HANYA untuk membaca status, progress approval, keputusan manager, keputusan second approver, atau status pengajuan overtime/lembur milik employee aktif. Tool ini read-only dan tidak membuat atau mengubah pengajuan.',

          schema:
            z.object({
              requestCode:
                z
                  .string()
                  .trim()
                  .optional()
                  .describe(
                    'Request code overtime seperti OT-20260827-ABCDE jika pengguna menyebutkannya. Kosongkan jika pengguna hanya menanyakan overtime terbaru.',
                  ),

              limit:
                z
                  .number()
                  .int()
                  .min(1)
                  .max(5)
                  .optional()
                  .describe(
                    'Jumlah pengajuan terbaru yang ingin dilihat. Default 1. Gunakan lebih dari 1 hanya jika pengguna meminta beberapa riwayat.',
                  ),
            }),
        },
      );

    const tools = [
      getEmployeeContextTool,
      cariKebijakanHRTool,
      getOvertimeStatusTool,
      prepareOvertimeRequestTool,
      prepareReimbursementRequestTool,
      getLeaveStatusTool,

      getReimbursementStatusTool,
    ];

    /* =====================================================
       6. SYSTEM PROMPT
    ===================================================== */
    const jakartaNow =
      getJakartaNowContext();

    const systemPrompt = `
Anda adalah "AI HR Assistant" yang cerdas,
akurat, dan ramah.

WAKTU ACUAN SAAT INI:
${jakartaNow}

ATURAN DATA TRANSAKSIONAL — WAJIB — 8J.3

Untuk pertanyaan CURRENT STATE tentang data employee,
saldo, status, progress, approval, atau transaksi:

1. WAJIB baca ulang tool transactional pada TURN SAAT INI.
2. Chat history hanya context percakapan, BUKAN source of truth.
3. Jangan menjawab current state hanya dari pesan assistant lama.
4. Jangan gunakan RAG / knowledge base untuk status transaksi.
5. Jika nilai di chat history berbeda dengan hasil tool terbaru,
   HASIL TOOL TERBARU yang authoritative.

ROUTING CURRENT STATE:
- profil employee / saldo / sisa cuti
  → get_employee_context
- status / progress pengajuan cuti
  → get_leave_status
- status / progress overtime
  → get_overtime_status
- status / progress / ringkasan reimbursement
  → get_reimbursement_status

CONTOH WAJIB TOOL:
"Berapa sisa cuti saya sekarang?"
→ get_employee_context

"Status cuti saya sekarang?"
→ get_leave_status

"Overtime terakhir saya sudah disetujui?"
→ get_overtime_status

"Status reimbursement saya?"
→ get_reimbursement_status

"RB-... sekarang bagaimana?"
→ get_reimbursement_status

PENTING:
- Pertanyaan follow-up seperti "kalau sekarang bagaimana?",
  "sudah berubah?", "masih pending?", "sudah approved?"
  tetap WAJIB membaca tool transactional lagi jika domain
  transaksi dapat ditentukan dari konteks percakapan.
- workflowStatus FAILED bukan business rejection.
- Jangan mengarang current state jika tool gagal atau data
  tidak ditemukan.


Gunakan tools berdasarkan intent pengguna.

ATURAN ROUTING:

1. DATA PERSONAL / SALDO CUTI

Jika pengguna bertanya tentang employee aktif seperti:
- nama;
- jabatan;
- department;
- jatah / entitlement cuti;
- sisa cuti;
- hari cuti yang sudah approved;
- hari cuti yang masih pending;

→ gunakan get_employee_context

PENTING:
- get_employee_context bersifat READ-ONLY.
- Employee identity berasal dari server.
- JANGAN meminta atau mengarang nama employee untuk lookup.
- JANGAN gunakan RAG untuk saldo cuti aktual.
- Jika pengguna menyebut tahun tertentu, isi year.
- Jika tidak menyebut tahun, kosongkan year agar tool
  memakai tahun berjalan Asia/Jakarta.


2. PERTANYAAN KEBIJAKAN / KNOWLEDGE

Jika pengguna hanya bertanya tentang:
- aturan perusahaan;
- kebijakan HR;
- prosedur;
- syarat overtime;
- batas overtime;
- kompensasi overtime;
- cara pengajuan overtime secara umum;

→ gunakan cari_dokumen_kebijakan_hr

Contoh:
"Apa aturan overtime?"
"Bagaimana prosedur lembur?"
"Berapa batas maksimal lembur?"


3. STATUS OVERTIME

Jika pengguna ingin mengetahui:
- status pengajuan lembur;
- status overtime terbaru;
- apakah overtime sudah disetujui;
- apakah overtime ditolak;
- siapa yang sedang menunggu approval;
- progress manager approval;
- progress second approval;
- atau menyebut request code overtime untuk mengecek status;

→ gunakan get_overtime_status

Contoh:
"Status lembur saya?"
"Lembur terakhir saya sudah disetujui belum?"
"Siapa yang sedang memproses overtime saya?"
"Status OT-20260827-ABCDE bagaimana?"
"Apakah Kevin sudah approve lembur saya?"

PENTING:
- get_overtime_status bersifat READ-ONLY.
- JANGAN gunakan prepare_overtime_request jika pengguna
  hanya ingin melihat status.
- JANGAN membuat request baru.
- JANGAN mengubah approval.
- Tool hanya boleh membaca overtime milik employee aktif.


4. STATUS CUTI / LEAVE REQUEST

Jika pengguna menanyakan status pengajuan cuti miliknya:

→ gunakan get_leave_status

Contoh:
"Status cuti saya?"
"Pengajuan cuti terakhir saya bagaimana?"
"Cuti saya tanggal 6 Oktober sudah disetujui?"
"Status LV-20260901-DSLBCN?"
"Berapa pengajuan cuti saya yang masih pending?"

Routing get_leave_status:
- tanpa tanggal atau kode request → mode LATEST
- menyebut tanggal tertentu → mode BY_DATE
- menyebut request code LV-... → mode BY_REQUEST_CODE
- meminta jumlah/ringkasan → mode SUMMARY
- jika meminta ringkasan status tertentu,
  isi juga filter status yang sesuai

Untuk BY_DATE:
- ubah tanggal natural seperti "6 Oktober", "besok",
  atau "tanggal 6 Oktober 2026" menjadi YYYY-MM-DD;
- gunakan WAKTU ACUAN SAAT INI;
- gunakan timezone Asia/Jakarta UTC+07:00;
- jangan mengarang tanggal jika maksud pengguna ambigu.

PENTING:
- status pengajuan cuti adalah data transactional.
- JANGAN gunakan RAG untuk mencari status request cuti.
- JANGAN gunakan get_employee_context
  untuk status request cuti.
- get_leave_status bersifat READ-ONLY.
- JANGAN membuat atau mengubah LeaveRequest dari tool ini.
- status adalah keputusan bisnis utama.
- workflowStatus hanya menjelaskan automation.
- workflowStatus FAILED TIDAK berarti pengajuan ditolak.


5. INTENT MEMBUAT OVERTIME REQUEST

Jika pengguna secara eksplisit ingin:
- mengajukan lembur;
- membuat overtime request;
- meminta lembur;
- menyiapkan pengajuan lembur;

→ gunakan prepare_overtime_request

Contoh:
"Saya mau lembur besok jam 7 sampai 10 malam
untuk deployment."

"Tolong ajukan overtime malam ini."

Untuk prepare_overtime_request:
- ubah waktu relatif seperti "besok",
  "hari ini", atau "malam ini" berdasarkan
  WAKTU ACUAN SAAT INI;
- gunakan timezone Asia/Jakarta UTC+07:00;
- gunakan ISO-8601 untuk startAt dan endAt;
- jangan mengarang data yang tidak diberikan;
- jika jam, tanggal, atau alasan belum tersedia,
  biarkan field tersebut kosong.

PENTING:
- prepare_overtime_request hanya membuat DRAFT.
- JANGAN menganggap pengajuan sudah dikirim.
- JANGAN mengatakan request sudah dibuat.
- JANGAN membuat perubahan database.
- Pengajuan aktual baru boleh dilakukan setelah
  pengguna melakukan konfirmasi.

STATUS REIMBURSEMENT / CLAIM — TRANSACTIONAL

Jika pengguna menanyakan status, progress, riwayat,
jumlah, atau request reimbursement miliknya:

→ gunakan get_reimbursement_status

Contoh:
"Status reimbursement saya?"
"Status RB-20260902-7A987A bagaimana?"
"Ada berapa reimbursement saya yang masih pending?"
"Ringkas reimbursement saya."

Routing:
- status terbaru tanpa kode → mode LATEST
- menyebut RB-... → mode BY_REQUEST_CODE
- meminta jumlah/ringkasan → mode SUMMARY
- meminta daftar yang masih pending → mode PENDING
- jika menyebut jenis MEDICAL/TRAVEL/MEAL/OTHER,
  isi reimbursementType bila relevan.

PENTING:
- get_reimbursement_status bersifat READ-ONLY.
- Employee identity sudah di-scope server.
- Jangan meminta employeeId dari pengguna.
- Jangan gunakan RAG untuk membaca status transaksi.
- Jangan membuat reimbursement baru untuk pertanyaan status.
- status adalah business status.
- workflowStatus adalah status automation.
- workflowStatus FAILED TIDAK berarti reimbursement REJECTED.
- Jika request tidak ditemukan, jangan menebak apakah kode
  tersebut milik employee lain.

6. INTENT MEMBUAT REIMBURSEMENT REQUEST

Jika pengguna secara eksplisit ingin:
- mengajukan reimbursement;
- membuat klaim biaya;
- meminta penggantian biaya;
- menyiapkan reimbursement request;

→ gunakan prepare_reimbursement_request

Contoh:
"Saya mau reimburse biaya transport Rp275.000
tanggal 30 Agustus untuk kunjungan client."

Untuk prepare_reimbursement_request:
- ubah tanggal natural menjadi YYYY-MM-DD berdasarkan
  WAKTU ACUAN SAAT INI;
- jangan mengarang merchant, receipt, approval,
  pre-approval, atau konteks biaya yang tidak diberikan;
- reimbursementType harus MEDICAL, TRAVEL, MEAL,
  atau OTHER berdasarkan konteks pengguna;
- jika kategori belum cukup jelas, biarkan kosong;
- tool hanya membuat DRAFT, bukan database record.

PENTING:
- DRAFT reimbursement wajib divalidasi policy.
- MEDICAL / TRAVEL atau kategori lain yang menurut
  current policy memerlukan human review TIDAK boleh
  diberi tombol konfirmasi standard workflow.
- Jangan mengatakan request sudah dikirim sebelum
  endpoint confirmation berhasil.
- Jangan menggunakan RAG sebagai pengganti status
  transaksi aktual.



7. PERCAKAPAN UMUM

Jika pertanyaan hanya berupa sapaan atau
percakapan umum, jawab langsung dengan ramah.

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

    let pendingAction:
      OvertimeDraftResult |
      null =
      null;

    let policyValidation:
      OvertimePolicyValidation |
      null =
      null;

        let reimbursementPendingAction:
      ReimbursementDraftResult |
      null =
      null;

    let reimbursementPolicyValidation:
      ReimbursementPolicyWithRagResult |
      null =
      null;

    let reimbursementCanConfirm =
      false;

    let reimbursementActionToken:
      string | null =
      null;

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
         REAL EMPLOYEE CONTEXT / LEAVE BALANCE
      =================================================== */

      if (
        toolCall.name ===
        'get_employee_context'
      ) {
        const rawResult =
          await getEmployeeContextTool.invoke(
            toolCall.args as {
              year?:
                number;
            },
          );

        toolResult =
          String(
            rawResult,
          );

        console.info(
          '[EMPLOYEE CONTEXT TOOL]',
          {
            employeeId:
              serverEmployeeId,

            args:
              toolCall.args,
          },
        );
      }

      /* ===================================================
         OVERTIME STATUS
      =================================================== */

      else if (
        toolCall.name ===
        'get_overtime_status'
      ) {
        const rawResult =
          await getOvertimeStatusTool.invoke(
            toolCall.args as {
              requestCode?: string;
              limit?: number;
            },
          );

        toolResult =
          String(
            rawResult,
          );

        console.info(
          '[OVERTIME STATUS LOOKUP]',
          {
            args:
              toolCall.args,

            result:
              toolResult,
          },
        );
      }
      /* ===================================================
        OVERTIME INTENT / DRAFT
      =================================================== */

      else if (
        toolCall.name ===
        'prepare_overtime_request'
      ) {
        const rawResult =
          await prepareOvertimeRequestTool.invoke(
            toolCall.args as any,
          );

        toolResult =
          String(
            rawResult,
          );

        /* ===============================================
          PARSE DRAFT
        =============================================== */

        try {
          pendingAction =
            JSON.parse(
              toolResult,
            ) as OvertimeDraftResult;
        } catch (
          parseError
        ) {
          console.error(
            '[OVERTIME INTENT PARSE ERROR]',
            parseError,
          );

          pendingAction =
            null;
        }

        /* ===============================================
          DRAFT BERHASIL
        =============================================== */

        if (
          pendingAction
        ) {
          console.info(
            '[OVERTIME INTENT]',
            {
              complete:
                pendingAction.complete,

              missingFields:
                pendingAction
                  .missingFields,

              validationErrors:
                pendingAction
                  .validationErrors,

              data:
                pendingAction.data,
            },
          );

          /* =============================================
            POLICY VALIDATION
          ============================================= */

          if (
            pendingAction.complete &&
            pendingAction
              .missingFields
              .length === 0 &&
            pendingAction
              .validationErrors
              .length === 0
          ) {
            try {
              policyValidation =
                await validateOvertimeDraftWithRag(
                  {
                    draft:
                      pendingAction,

                    originalQuestion:
                      cleanMessage,

                    signal:
                      req.signal,
                  },
                );

              extractedSources =
                policyValidation
                  .sourceFiles;
            } catch (
              policyError
            ) {
              console.error(
                '[OVERTIME POLICY ERROR]',
                policyError,
              );

              policyValidation =
                null;

              extractedSources =
                [];
            }
          }

          /* =============================================
            FINAL TOOL CONTEXT
          ============================================= */
          const canConfirm =
            Boolean(
              pendingAction
                ?.complete &&

              policyValidation
                ?.policyFound &&

              policyValidation
                ?.eligible &&

              !policyValidation
                ?.needsHumanReview &&

              policyValidation
                .violations
                .length === 0
            );

          toolResult =
            JSON.stringify(
              {
                draft:
                  pendingAction,

                policyValidation,

                canConfirm,
              },
            );
        }
      }
      /* ===================================================
         RAG DATABASE
      =================================================== */

      /* ===================================================
         REIMBURSEMENT INTENT / DRAFT
      =================================================== */

      /* ===================================================
         REIMBURSEMENT STATUS — 8J.2
      =================================================== */

      else if (
        toolCall.name ===
        'get_reimbursement_status'
      ) {
        const rawResult =
          await getReimbursementStatusTool.invoke(
            toolCall.args as any,
          );

        toolResult =
          String(
            rawResult,
          );

        /*
         * Status transaksi tidak memiliki source dokumen RAG.
         */
        extractedSources =
          [];

        console.info(
          '[REIMBURSEMENT STATUS TOOL]',
          {
            employeeId:
              serverEmployeeId,

            args:
              toolCall.args,
          },
        );
      }

      else if (
        toolCall.name ===
        'prepare_reimbursement_request'
      ) {
        const rawResult =
          await prepareReimbursementRequestTool.invoke(
            toolCall.args as any,
          );

        toolResult =
          String(
            rawResult,
          );

        try {
          reimbursementPendingAction =
            JSON.parse(
              toolResult,
            ) as
              ReimbursementDraftResult;
        } catch (
          parseError
        ) {
          console.error(
            '[REIMBURSEMENT INTENT PARSE ERROR]',
            parseError,
          );

          reimbursementPendingAction =
            null;
        }

        if (
          reimbursementPendingAction
        ) {
          console.info(
            '[REIMBURSEMENT INTENT]',
            {
              complete:
                reimbursementPendingAction
                  .complete,

              missingFields:
                reimbursementPendingAction
                  .missingFields,

              validationErrors:
                reimbursementPendingAction
                  .validationErrors,

              data:
                reimbursementPendingAction
                  .data,
            },
          );

          if (
            reimbursementPendingAction
              .complete &&
            reimbursementPendingAction
              .missingFields
              .length ===
              0 &&
            reimbursementPendingAction
              .validationErrors
              .length ===
              0
          ) {
            try {
              const draft =
                reimbursementPendingAction
                  .data;

              if (
                !draft
                  .reimbursementType ||
                !draft
                  .expenseDate ||
                !draft
                  .amount ||
                !draft
                  .reason
              ) {
                throw new Error(
                  'Draft reimbursement tidak lengkap setelah normalisasi.',
                );
              }

              reimbursementPolicyValidation =
                await validateReimbursementPolicyWithRag(
                  {
                    employeeId:
                      serverEmployeeId,

                    reimbursementType:
                      draft
                        .reimbursementType,

                    expenseDate:
                      draft
                        .expenseDate,

                    amount:
                      draft
                        .amount,

                    currency:
                      draft
                        .currency,

                    merchant:
                      draft
                        .merchant,

                    reason:
                      draft
                        .reason,

                    receiptUrl:
                      draft
                        .receiptUrl,

                    receiptFileName:
                      draft
                        .receiptFileName,

                    lostReceiptDeclaration:
                      draft
                        .lostReceiptDeclaration,

                    lateClaimReason:
                      draft
                        .lateClaimReason,

                    isPersonalExpense:
                      draft
                        .isPersonalExpense,

                    paidByOtherParty:
                      draft
                        .paidByOtherParty,

                    categoryRequiresPreApproval:
                      draft
                        .categoryRequiresPreApproval,

                    preApproved:
                      draft
                        .preApproved,

                    isRoutineMealAtNormalWorkLocation:
                      draft
                        .isRoutineMealAtNormalWorkLocation,

                    relatedToBusinessTravel:
                      draft
                        .relatedToBusinessTravel,

                    relatedToQualifyingOvertime:
                      draft
                        .relatedToQualifyingOvertime,

                    authorizedEvent:
                      draft
                        .authorizedEvent,

                    travelScope:
                      draft
                        .travelScope,

                    travelEmergency:
                      draft
                        .travelEmergency,

                    perDiemDuplicate:
                      draft
                        .perDiemDuplicate,

                    includesPersonalExpense:
                      draft
                        .includesPersonalExpense,

                    personalExpenseSeparated:
                      draft
                        .personalExpenseSeparated,

                    costCenter:
                      draft
                        .costCenter,

                    originalQuestion:
                      cleanMessage,
                  },
                );

              extractedSources =
                reimbursementPolicyValidation
                  .sourceFiles;
            } catch (
              policyError
            ) {
              console.error(
                '[REIMBURSEMENT POLICY ERROR]',
                policyError,
              );

              reimbursementPolicyValidation =
                null;

              extractedSources =
                [];
            }
          }

          reimbursementCanConfirm =
            Boolean(
              reimbursementPendingAction
                .complete &&

              reimbursementPolicyValidation
                ?.policyFound &&

              reimbursementPolicyValidation
                ?.eligible &&

              reimbursementPolicyValidation
                ?.autoSubmittable &&

              !reimbursementPolicyValidation
                ?.needsHumanReview &&

              reimbursementPolicyValidation
                ?.violations
                .length ===
                0
            );

          if (
            reimbursementCanConfirm &&
            currentSessionId &&
            reimbursementPolicyValidation
          ) {
            try {
              const draft =
                reimbursementPendingAction
                  .data;

              if (
                !draft
                  .reimbursementType ||
                !draft
                  .expenseDate ||
                !draft
                  .amount ||
                !draft
                  .reason
              ) {
                throw new Error(
                  'Draft reimbursement tidak lengkap untuk action token.',
                );
              }

              reimbursementActionToken =
                createReimbursementActionToken(
                  {
                    employeeId:
                      serverEmployeeId,

                    sessionId:
                      currentSessionId,

                    draft: {
                      reimbursementType:
                        draft
                          .reimbursementType,

                      expenseDate:
                        draft
                          .expenseDate,

                      amount:
                        draft
                          .amount,

                      currency:
                        draft
                          .currency,

                      merchant:
                        draft
                          .merchant,

                      reason:
                        draft
                          .reason,

                      receiptUrl:
                        draft
                          .receiptUrl,

                      receiptFileName:
                        draft
                          .receiptFileName,

                      lostReceiptDeclaration:
                        draft
                          .lostReceiptDeclaration,

                      lateClaimReason:
                        draft
                          .lateClaimReason,

                      isPersonalExpense:
                        draft
                          .isPersonalExpense,

                      paidByOtherParty:
                        draft
                          .paidByOtherParty,

                      categoryRequiresPreApproval:
                        draft
                          .categoryRequiresPreApproval,

                      preApproved:
                        draft
                          .preApproved,

                      isRoutineMealAtNormalWorkLocation:
                        draft
                          .isRoutineMealAtNormalWorkLocation,

                      relatedToBusinessTravel:
                        draft
                          .relatedToBusinessTravel,

                      relatedToQualifyingOvertime:
                        draft
                          .relatedToQualifyingOvertime,

                      authorizedEvent:
                        draft
                          .authorizedEvent,

                      travelScope:
                        draft
                          .travelScope,

                      travelEmergency:
                        draft
                          .travelEmergency,

                      perDiemDuplicate:
                        draft
                          .perDiemDuplicate,

                      includesPersonalExpense:
                        draft
                          .includesPersonalExpense,

                      personalExpenseSeparated:
                        draft
                          .personalExpenseSeparated,

                      costCenter:
                        draft
                          .costCenter,
                    },

                    policy:
                      reimbursementPolicyValidation,
                  },
                ).token;
            } catch (
              tokenError
            ) {
              console.error(
                '[REIMBURSEMENT ACTION TOKEN ERROR]',
                tokenError,
              );

              reimbursementCanConfirm =
                false;

              reimbursementActionToken =
                null;
            }
          }

          toolResult =
            JSON.stringify(
              {
                kind:
                  'REIMBURSEMENT_DRAFT',

                draft:
                  reimbursementPendingAction,

                policyValidation:
                  reimbursementPolicyValidation,

                canConfirm:
                  reimbursementCanConfirm,
              },
            );
        }
      }

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

        type RetrievedChunk = {
          content: string;
          metadata: any;
          similarity: number;
        };

        const candidateChunks:
          RetrievedChunk[] =
          await prisma.$queryRaw`
            SELECT
              content,
              metadata,

              1 - (
                embedding <=>
                ${vectorString}::vector
              ) AS similarity

            FROM "DocumentChunk"

            WHERE
              embedding IS NOT NULL

            ORDER BY
              embedding <=>
              ${vectorString}::vector

            LIMIT 8;
          `;
          /* =========================================
          DEBUG RETRIEVAL
        ========================================= */

        console.log(
          '[RAG RETRIEVAL]',
          candidateChunks.map(
            (
              chunk,
              index,
            ) => ({
              rank:
                index + 1,

              similarity:
                Number(
                  chunk.similarity,
                ).toFixed(4),

              source:
                chunk
                  ?.metadata
                  ?.source,

              preview:
                chunk.content
                  ?.slice(
                    0,
                    100,
                  ),
            }),
          ),
        );

        /* =========================================
          SIMILARITY FILTER
        ========================================= */

        const SIMILARITY_THRESHOLD =
          0.60;

        const relevantChunks =
          candidateChunks
            .filter(
              (chunk) =>
                Number(
                  chunk.similarity,
                ) >=
                SIMILARITY_THRESHOLD,
            )
            .slice(
              0,
              4,
            );

        console.log(
          '[RAG FILTER]',
          {
            threshold:
              SIMILARITY_THRESHOLD,

            candidates:
              candidateChunks.length,

            accepted:
              relevantChunks.length,
          },
        );

        /* =========================================
          BUILD CONTEXT
        ========================================= */

        if (
          relevantChunks.length >
          0
        ) {
          toolResult =
            relevantChunks
              .map(
                (chunk) =>
                  chunk.content,
              )
              .filter(Boolean)
              .join(
                '\n\n',
              );

          const sourceNames =
            relevantChunks
              .map(
                (chunk) => {
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
            'Informasi yang cukup relevan tidak ditemukan di knowledge base.';

          extractedSources = [];
        }
      }
      /* ===================================================
        LEAVE STATUS
      =================================================== */

      else if (
        toolCall.name ===
        'get_leave_status'
      ) {
        const rawResult =
          await getLeaveStatusTool.invoke(
            toolCall.args as any,
          );

        toolResult =
          String(rawResult);

        console.info(
          '[LEAVE STATUS TOOL]',
          {
            employeeId:
              serverEmployeeId,

            args:
              toolCall.args,
          },
        );
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
        FINAL ANSWER PROMPT
      =================================================== */

      const finalSystemPrompt = `
      FRESHNESS GUARD FINAL ANSWER — 8J.3

      Jika HASIL TOOL / CONTEXT berasal dari tool transactional:
      - gunakan hasil tool pada TURN INI sebagai source of truth;
      - abaikan nilai status/saldo lama dari chat history jika berbeda;
      - jangan mencampurkan data transactional lama dengan hasil terbaru;
      - jangan mengatakan "berdasarkan percakapan sebelumnya"
        untuk current state;
      - jika tool tidak menemukan data, katakan tidak ditemukan;
      - jika tool gagal, jangan fallback ke status lama dari history.

      Tool transactional yang authoritative:
      - EMPLOYEE_CONTEXT_RESULT;
      - LEAVE_STATUS_RESULT;
      - OVERTIME_STATUS / hasil get_overtime_status;
      - REIMBURSEMENT_STATUS_RESULT.


      Anda adalah "AI HR Assistant" yang cerdas,
      akurat, dan ramah.

      Pada tahap ini proses tool dan policy validation
      SUDAH SELESAI.

      JANGAN memanggil tool atau function lagi.

      Gunakan HASIL TOOL / CONTEXT sebagai
      satu-satunya sumber keputusan.

      Jangan mengarang informasi.
      HASIL TOOL DAPAT MEMILIKI FIELD:

      "kind": "OVERTIME_STATUS"

      Jika kind = OVERTIME_STATUS,
      berarti pengguna sedang membaca status overtime,
      BUKAN membuat pengajuan baru.

      ATURAN OVERTIME STATUS:

      1. Jika success = false:

      - jelaskan bahwa status belum dapat dibaca;
      - gunakan message dari hasil tool;
      - jangan mengarang status.

      2. Jika found = false:

      - jelaskan bahwa pengajuan tidak ditemukan;
      - jangan membuat request baru secara otomatis;
      - jangan meminta konfirmasi.

      3. Jika found = true:

      Gunakan requests sebagai sumber kebenaran.

      Terjemahkan state menjadi Bahasa Indonesia
      yang mudah dipahami.

      Jika:

      status = PENDING
      approvalStage = MANAGER

      → jelaskan bahwa pengajuan sedang menunggu
      persetujuan line manager.

      Jika:

      status = PENDING
      approvalStage = SECOND_APPROVER

      → jelaskan bahwa line manager sudah menyelesaikan
      tahap approval dan pengajuan sedang menunggu
      second approver.

      Jika:

      status = APPROVED

      → jelaskan bahwa pengajuan overtime sudah disetujui.

      Jika:

      status = REJECTED

      → jelaskan bahwa pengajuan overtime ditolak.

      Jika:

      status = CANCELLED

      → jelaskan bahwa pengajuan dibatalkan.

      Tampilkan jika tersedia:

      - requestCode;
      - tanggal dan waktu overtime;
      - durasi;
      - status;
      - nama line manager dan keputusannya;
      - nama second approver dan keputusannya;
      - alasan rejection jika ada.

      JANGAN menampilkan internal database ID.

      JANGAN mengatakan policy validation sedang dilakukan.

      JANGAN meminta pengguna mengonfirmasi.

      JANGAN memanggil tool lagi.

      workflowStatus adalah status automation,
      BUKAN keputusan approval.

      Jika workflowStatus = FAILED,
      boleh jelaskan bahwa automation mengalami masalah,
      tetapi jangan mengganti status approval berdasarkan
      workflowStatus.


      HASIL TOOL DAPAT MEMILIKI:

      "type": "EMPLOYEE_CONTEXT_RESULT"

      Jika type = EMPLOYEE_CONTEXT_RESULT,
      berarti pengguna sedang membaca profil employee aktif
      atau saldo cuti aktual dari database.

      ATURAN EMPLOYEE CONTEXT:

      1. Jika success = false atau found = false:
      - gunakan message dari hasil tool;
      - jangan mengarang employee atau saldo.

      2. Jika pengguna bertanya profil:
      - gunakan employee.name;
      - employee.position;
      - employee.department.

      3. Jika pengguna bertanya saldo / sisa cuti:
      - gunakan leaveBalance.year dan leaveBalance.balances;
      - untuk cuti tahunan pilih leaveType = ANNUAL;
      - entitlementDays = total hak cuti;
      - approvedDays = jumlah HARI approved;
      - pendingDays = jumlah HARI pending;
      - availableDays = jumlah HARI yang masih tersedia.

      4. Jika balanceConfigured = false:
      - katakan entitlement jenis cuti tersebut
        belum dikonfigurasi;
      - JANGAN mengubah null menjadi 0.

      JANGAN menyebut data dummy.
      JANGAN gunakan knowledge base sebagai sumber saldo aktual.
      JANGAN meminta konfirmasi.
      JANGAN memanggil tool lagi.


      HASIL TOOL JUGA DAPAT MEMILIKI:

      "type": "LEAVE_STATUS_RESULT"

      Jika type = LEAVE_STATUS_RESULT,
      berarti pengguna sedang membaca status pengajuan cuti,
      BUKAN membuat pengajuan baru.

      ATURAN LEAVE STATUS:

      1. Jika found = false:

      - jelaskan bahwa pengajuan cuti yang dimaksud
        tidak ditemukan;
      - gunakan message jika tersedia;
      - jangan membuat request baru secara otomatis;
      - jangan meminta konfirmasi.

      2. Jika mode = SUMMARY:

      - gunakan summary dan filteredCount
        sebagai sumber kebenaran;
      - jika pengguna meminta status tertentu,
        jawab jumlah berdasarkan filter status tersebut;
      - recentRequests hanya detail tambahan jika relevan.

      3. Jika mode = LATEST, BY_DATE,
         atau BY_REQUEST_CODE:

      - gunakan latest dan requests
        sebagai sumber kebenaran;
      - utamakan field status sebagai keputusan bisnis.

      Interpretasi status leave:

      - DRAFT = masih berupa draft;
      - PENDING = masih menunggu keputusan;
      - APPROVED = disetujui;
      - REJECTED = ditolak;
      - CANCELLED = dibatalkan.

      4. Jika relevan, tampilkan:

      - requestCode;
      - jenis cuti;
      - tanggal cuti;
      - total hari;
      - status;
      - nama manager;
      - managerDecision;
      - managerDecisionNote;
      - workflowStatus.

      5. workflowStatus BUKAN keputusan approval.

      Jika workflowStatus = FAILED,
      boleh jelaskan bahwa automation mengalami masalah,
      tetapi JANGAN mengatakan pengajuan ditolak
      kecuali status memang REJECTED.

      JANGAN menampilkan internal database ID.
      JANGAN melakukan policy validation untuk
      pertanyaan status.
      JANGAN meminta pengguna mengonfirmasi.
      JANGAN memanggil tool lagi.


      ATURAN REIMBURSEMENT STATUS — 8J.2

      HASIL TOOL dapat memiliki:
      "type": "REIMBURSEMENT_STATUS_RESULT"

      Jika type = REIMBURSEMENT_STATUS_RESULT,
      berarti pengguna sedang MEMBACA data transaksi
      reimbursement, bukan membuat request baru.

      Gunakan hasil tool sebagai source of truth.

      1. Jika found = false:
      - gunakan message jika tersedia;
      - katakan request/data reimbursement tidak ditemukan;
      - jangan menebak apakah request milik employee lain;
      - jangan membuat request baru;
      - jangan meminta konfirmasi.

      2. Jika mode = LATEST atau BY_REQUEST_CODE:
      - gunakan latest;
      - tampilkan requestCode;
      - reimbursementType;
      - expenseDate;
      - amount + currency;
      - status;
      - managerDecision;
      - workflowStatus;
      - manager.name jika tersedia;
      - managerDecisionNote hanya jika relevan.

      3. Jika mode = SUMMARY:
      - gunakan summary.total;
      - summary.pending;
      - summary.approved;
      - summary.rejected;
      - summary.cancelled;
      - gunakan filteredCount jika ada filter eksplisit.

      4. Jika mode = PENDING:
      - gunakan count dan requests;
      - jangan mengatakan semua klaim pending jika
        tool hanya mengembalikan subset karena limit.

      5. BUSINESS STATUS:
      - PENDING = masih menunggu keputusan bisnis;
      - APPROVED = disetujui;
      - REJECTED = ditolak;
      - CANCELLED = dibatalkan;
      - DRAFT = draft bila state tersebut ada.

      6. WORKFLOW STATUS:
      workflowStatus hanya menjelaskan automation.
      Jika workflowStatus = FAILED tetapi status = PENDING,
      jelaskan bahwa request masih PENDING dan automation
      mengalami masalah. JANGAN menyebutnya ditolak.

      Jangan menampilkan internal database ID.
      Jangan melakukan policy validation untuk pertanyaan status.
      Jangan menggunakan knowledge base / RAG untuk mengganti
      status transactional dari hasil tool.
      Jangan meminta pengguna mengonfirmasi.
      Jangan memanggil tool lagi.

      KHUSUS PEMBUATAN REIMBURSEMENT:

      Jika HASIL TOOL memiliki:
      "kind": "REIMBURSEMENT_DRAFT"

      maka draft tersebut adalah DRAFT reimbursement,
      bukan request yang sudah dibuat.

      Gunakan:
      - draft.complete;
      - draft.missingFields;
      - draft.validationErrors;
      - draft.data;
      - policyValidation;
      - canConfirm.

      ATURAN REIMBURSEMENT:

      1. Jika draft.complete = false:
      - tanyakan hanya field wajib yang masih kurang;
      - jangan mengatakan klaim sudah dibuat;
      - jangan meminta konfirmasi.

      2. Jika draft.validationErrors tidak kosong:
      - jelaskan kesalahan secara singkat;
      - minta pengguna memperbaikinya;
      - jangan meminta konfirmasi.

      3. Jika policyValidation = null:
      - katakan kebijakan belum berhasil diverifikasi;
      - jangan menawarkan submission.

      4. Jika policyValidation.eligible = false:
      - jelaskan request belum memenuhi policy;
      - gunakan violations dan warnings;
      - jangan meminta konfirmasi.

      5. Jika policyValidation.needsHumanReview = true
         ATAU policyValidation.autoSubmittable = false:
      - jelaskan bahwa klaim memerlukan pemeriksaan manusia;
      - gunakan matchedRules / warnings sebagai dasar;
      - jangan mengatakan request sudah disetujui;
      - jangan menawarkan standard manager-only submission;
      - jangan meminta konfirmasi.

      6. HANYA jika canConfirm = true:
      - rangkum jenis reimbursement;
      - tanggal transaksi;
      - nominal dan mata uang;
      - merchant jika tersedia;
      - alasan;
      - status bukti transaksi jika relevan;
      - jelaskan policy validation berhasil;
      - jelaskan request BELUM dikirim;
      - minta pengguna menekan tombol konfirmasi
        yang tersedia pada UI.

      PENTING REIMBURSEMENT:
      - eligible berarti boleh diajukan, bukan approved;
      - workflowStatus bukan keputusan bisnis;
      - MEDICAL / TRAVEL tidak boleh dipaksa masuk
        standard workflow jika policy meminta human review;
      - jangan menampilkan atau menyebut action token.

      KHUSUS PEMBUATAN OVERTIME:

      Jika HASIL TOOL berisi:

      {
        "draft": {...},
        "policyValidation": {...},
        "canConfirm": true | false
      }

      maka gunakan aturan pembuatan overtime berikut:


      ATURAN PRIORITAS:

      1. Jika draft.complete = false:

      - tanyakan hanya field yang masih kurang;
      - jangan mengatakan request sudah dibuat;
      - jangan meminta konfirmasi.


      2. Jika draft.validationErrors tidak kosong:

      - jelaskan kesalahan;
      - minta pengguna memperbaikinya;
      - jangan meminta konfirmasi.


      3. Jika policyValidation = null:

      - jelaskan policy belum dapat divalidasi;
      - jangan meminta konfirmasi.


      4. Jika policyValidation.eligible = false:

      - jelaskan request belum dapat diajukan;
      - jelaskan violations;
      - tampilkan warning jika ada;
      - jangan meminta konfirmasi.


      5. Jika policyValidation.needsHumanReview = true:

      - jelaskan request memerlukan review manusia;
      - jelaskan alasannya berdasarkan warnings atau matchedRules;
      - jangan mengatakan request sudah disetujui;
      - JANGAN menawarkan pengiriman;
      - JANGAN meminta konfirmasi.


      6. HANYA jika canConfirm = true:

      - rangkum tanggal dan waktu;
      - tampilkan durasi;
      - tampilkan alasan;
      - tampilkan project/task jika tersedia;
      - jelaskan policy validation berhasil;
      - sebutkan manager approval jika diperlukan;
      - sebutkan second approval jika diperlukan;
      - tampilkan warning penting jika ada;
      - jelaskan request BELUM dikirim;
      - minta pengguna melakukan konfirmasi.


      PENTING:

      Jika canConfirm = false,
      DILARANG meminta pengguna mengonfirmasi
      atau menawarkan mengirim pengajuan.

      Policy validation BUKAN approval manager.

      Eligible berarti request dapat DIAJUKAN,
      bukan berarti request sudah DISETUJUI.

      Gunakan Bahasa Indonesia yang jelas,
      ringkas, dan profesional.
      `.trim();

      followUpMessages = [
        new SystemMessage(
          finalSystemPrompt,
        ),

        ...formattedHistory,

        new HumanMessage(
          `
      PERTANYAAN PENGGUNA:

      ${cleanMessage}


      HASIL TOOL / CONTEXT:

      ${String(toolResult)}


      Berikan jawaban final langsung kepada pengguna.
      Jangan melakukan function call atau tool call lagi.
      `.trim(),
        ),
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

              assistantSaved =
                true;
            };

          try {
            /* ===============================================
               META
            =============================================== */

            let canConfirm =
              Boolean(
                pendingAction
                  ?.complete &&

                policyValidation
                  ?.policyFound &&

                policyValidation
                  ?.eligible &&

                !policyValidation
                  ?.needsHumanReview &&

                policyValidation
                  .violations
                  .length === 0
              );

            let actionToken:
              string | null =
              null;

            const employeeId =
              process.env
                .DEMO_EMPLOYEE_ID
                ?.trim() ||
              null;

            /*
            * Untuk sementara belum ada authentication.
            * Karena itu actor diambil dari env demo.
            */
            if (
              canConfirm &&
              employeeId &&
              currentSessionId &&
              pendingAction &&
              policyValidation
            ) {
              try {
                actionToken =
                  createOvertimeActionToken(
                    {
                      employeeId,

                      sessionId:
                        currentSessionId,

                      draft:
                        pendingAction,

                      policyValidation,
                    },
                  );
              } catch (
                tokenError
              ) {
                console.error(
                  '[OVERTIME ACTION TOKEN ERROR]',
                  tokenError,
                );

                /*
                * Fail closed.
                * Kalau token gagal dibuat,
                * UI tidak boleh bisa confirm.
                */
                canConfirm =
                  false;

                actionToken =
                  null;
              }
            }

            send(
              'meta',
              {
                sessionId:
                  currentSessionId,

                sources:
                  extractedSources,

                pendingAction,

                policyValidation,

                canConfirm,

                actionToken,


                reimbursementAction:
                  reimbursementPendingAction
                    ? {
                        canConfirm:
                          reimbursementCanConfirm,

                        actionToken:
                          reimbursementActionToken,

                        sessionId:
                          currentSessionId,

                        draft:
                          reimbursementPendingAction,

                        policyValidation:
                          reimbursementPolicyValidation,
                      }
                    : null,
},
            );
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

                if (
                  Array.isArray(
                    chunk?.tool_calls,
                  ) &&
                  chunk.tool_calls.length > 0
                ) {
                  console.warn(
                    '[AI FINAL RESPONSE] Unexpected tool call:',
                    chunk.tool_calls,
                  );

                  continue;
                }

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

                    toolCalls:
                      chunk?.tool_calls,

                    toolCallChunks:
                      chunk
                        ?.tool_call_chunks,

                    responseMetadata:
                      chunk
                        ?.response_metadata,

                    additionalKwargs:
                      chunk
                        ?.additional_kwargs,

                    usageMetadata:
                      chunk
                        ?.usage_metadata,
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
              !finalAnswer.trim() &&
              followUpMessages
            ) {
              console.warn(
                '[AI STREAM EMPTY] Mencoba recovery generation...',
                {
                  sessionId:
                    currentSessionId,

                  model:
                    usedModel,
                },
              );

              try {
                /*
                * Streaming tadi selesai tetapi tidak
                * menghasilkan text.
                *
                * Coba sekali lagi menggunakan invoke biasa.
                */
                const recoveryResult =
                  await invokeGemini(
                    followUpMessages,
                    {
                      stage:
                        'tool-followup-recovery',

                      signal:
                        req.signal,
                    },
                  );

                usedModel =
                  recoveryResult.model;

                usedModelType =
                  recoveryResult.modelUsed;

                const recoveryResponse =
                  recoveryResult.response as AIMessage;

                /*
                * Coba .text terlebih dahulu,
                * lalu fallback ke content.
                */
                let recoveryText = '';

                if (
                  typeof recoveryResponse?.text ===
                    'string' &&
                  recoveryResponse.text.trim()
                ) {
                  recoveryText =
                    recoveryResponse.text;
                }

                else {
                  recoveryText =
                    extractText(
                      recoveryResponse?.content,
                    );
                }

                if (
                  recoveryText.trim()
                ) {
                  finalAnswer =
                    recoveryText.trim();

                  console.info(
                    '[AI STREAM RECOVERY SUCCESS]',
                    {
                      answerLength:
                        finalAnswer.length,

                      model:
                        usedModel,

                      modelUsed:
                        usedModelType,
                    },
                  );

                  send(
                    'delta',
                    {
                      text:
                        finalAnswer,
                    },
                  );
                }
              } catch (
                recoveryError
              ) {
                console.error(
                  '[AI STREAM RECOVERY FAILED]',
                  recoveryError,
                );
              }
            }

            /* ===============================================
              FINAL EMPTY FALLBACK
            =============================================== */

            if (
              !finalAnswer.trim()
            ) {
              console.error(
                '[AI EMPTY RESPONSE]',
                {
                  sessionId:
                    currentSessionId,

                  model:
                    usedModel,

                  sources:
                    extractedSources.length,
                },
              );

              finalAnswer =
                'Maaf, AI tidak menghasilkan jawaban untuk pertanyaan tersebut. Silakan coba kembali.';

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
