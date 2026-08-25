'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import Image from 'next/image';
import ReactMarkdown from 'react-markdown';

import Sidebar from '@/app/components/Sidebar';

import {
  ArrowDown,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  HeartPulse,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  WalletCards,
  XCircle,
} from 'lucide-react';

/* =========================================================
   TYPES
========================================================= */

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  time: string;
  isError?: boolean;
};

/* =========================================================
   SUGGESTED PROMPTS
========================================================= */

const suggestedPrompts = [
  {
    title: 'Sisa Cuti',
    description: 'Cek jatah dan aturan cuti tahunan',
    prompt:
      'Berapa hari jatah cuti tahunan saya dan bagaimana aturan penggunaannya?',
    icon: CalendarDays,
    style: 'bg-violet-50 text-violet-600',
  },
  {
    title: 'Benefit Kesehatan',
    description: 'Asuransi dan reimbursement medis',
    prompt:
      'Apa saja benefit kesehatan dan bagaimana cara klaim reimbursement medis?',
    icon: HeartPulse,
    style: 'bg-rose-50 text-rose-600',
  },
  {
    title: 'Payroll',
    description: 'Informasi pembayaran gaji',
    prompt:
      'Kapan jadwal pencairan gaji setiap bulan dan bagaimana jika jatuh di hari libur?',
    icon: WalletCards,
    style: 'bg-emerald-50 text-emerald-600',
  },
  {
    title: 'Overtime',
    description: 'Aturan dan prosedur lembur',
    prompt:
      'Apa saja aturan dan prosedur pengajuan kerja lembur atau overtime?',
    icon: Clock3,
    style: 'bg-amber-50 text-amber-600',
  },
];

/* =========================================================
   PAGE
========================================================= */

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] =
    useState(false);

  const [
    hasReceivedFirstChunk,
    setHasReceivedFirstChunk,
  ] = useState(false);

  const [
    currentSessionId,
    setCurrentSessionId,
  ] = useState<string | null>(null);

  const [
    copiedMessageId,
    setCopiedMessageId,
  ] = useState<string | null>(null);

  const [
    showScrollButton,
    setShowScrollButton,
  ] = useState(false);

  const messagesEndRef =
    useRef<HTMLDivElement>(null);

  const chatContainerRef =
    useRef<HTMLDivElement>(null);

  const textareaRef =
    useRef<HTMLTextAreaElement>(null);

  /* Request jawaban AI */
  const abortControllerRef =
    useRef<AbortController | null>(null);

  /* Request untuk loading session/history */
  const sessionAbortRef =
    useRef<AbortController | null>(null);

  /* Session yang sudah berhasil dimuat */
  const loadedSessionRef =
    useRef<string | null>(null);

  /* Session yang sedang dimuat */
  const loadingSessionRef =
    useRef<string | null>(null);
  

  /* =======================================================
     WELCOME MESSAGE
  ======================================================= */

  const createWelcomeMessage =
    useCallback((): Message => ({
      id: 'welcome-msg',
      role: 'assistant',
      content:
        'Halo Riski! 👋 Saya **People Assistant**, AI HR yang siap membantu menjawab pertanyaan tentang cuti, benefit, reimbursement, payroll, kebijakan kerja, dan informasi perusahaan lainnya.',
      time: new Date().toLocaleTimeString(
        'id-ID',
        {
          hour: '2-digit',
          minute: '2-digit',
        },
      ),
    }), []);

  const [
    messages,
    setMessages,
  ] = useState<Message[]>(() => [
    {
      id: 'welcome-msg',
      role: 'assistant',
      content:
        'Halo Riski! 👋 Saya **People Assistant**, AI HR yang siap membantu menjawab pertanyaan tentang cuti, benefit, reimbursement, payroll, kebijakan kerja, dan informasi perusahaan lainnya.',
      time: new Date().toLocaleTimeString(
        'id-ID',
        {
          hour: '2-digit',
          minute: '2-digit',
        },
      ),
    },
  ]);

  /* =======================================================
     SCROLL
  ======================================================= */

  const scrollToBottom = (
    behavior: ScrollBehavior = 'smooth',
  ) => {
    messagesEndRef.current?.scrollIntoView({
      behavior,
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleChatScroll = () => {
    const container =
      chatContainerRef.current;

    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    setShowScrollButton(
      distanceFromBottom > 300,
    );
  };

  /* =======================================================
     NEW CHAT
  ======================================================= */

  const handleNewChat =
    useCallback(() => {
      abortControllerRef.current?.abort();
      sessionAbortRef.current?.abort();

      abortControllerRef.current = null;
      sessionAbortRef.current = null;
      loadedSessionRef.current = null;
      loadingSessionRef.current = null;

      setCurrentSessionId(null);
      setInput('');
      setIsLoading(false);
      setMessages([
        createWelcomeMessage(),
      ]);

      /* Hapus ?session=xxx dari URL */
      router.replace('/', {
        scroll: false,
      });

      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }, [
      router,
      createWelcomeMessage,
    ]);

  /* =======================================================
     LOAD SESSION
  ======================================================= */

  const handleSelectSession =
    useCallback(
      async (id: string) => {
        if (!id) return;

        /* Session ini sudah berhasil dimuat */
        if (
          loadedSessionRef.current === id
        ) {
          setCurrentSessionId(id);
          return;
        }

        /* Session yang sama sedang diproses */
        if (
          loadingSessionRef.current === id
        ) {
          return;
        }

        /* Stop generate AI jika user pindah history */
        abortControllerRef.current?.abort();

        /* Batalkan fetch session sebelumnya */
        sessionAbortRef.current?.abort();

        const controller =
          new AbortController();

        sessionAbortRef.current =
          controller;

        loadingSessionRef.current = id;

        setCurrentSessionId(id);
        setIsLoading(true);

        try {
          const res = await fetch(
            `/api/sessions/${encodeURIComponent(
              id,
            )}`,
            {
              cache: 'no-store',
              signal: controller.signal,
            },
          );

          const data = await res.json();

          if (!res.ok) {
            throw new Error(
              data?.error ||
                'Gagal memuat sesi chat.',
            );
          }

          if (!Array.isArray(data)) {
            throw new Error(
              'Format data session tidak valid.',
            );
          }

          if (controller.signal.aborted) {
            return;
          }

          const formattedMessages: Message[] =
            data.map((msg: any) => ({
              id: msg.id,
              role:
                msg.role === 'user'
                  ? 'user'
                  : 'assistant',
              content: msg.content ?? '',
              sources: Array.isArray(
                msg.sources,
              )
                ? msg.sources
                : [],
              time: new Date(
                msg.createdAt,
              ).toLocaleTimeString(
                'id-ID',
                {
                  hour: '2-digit',
                  minute: '2-digit',
                },
              ),
            }));

          loadedSessionRef.current = id;
          loadingSessionRef.current = null;

          if (
            formattedMessages.length === 0
          ) {
            setMessages([
              {
                id: `empty-${id}`,
                role: 'assistant',
                content:
                  'Percakapan ini belum memiliki pesan.',
                time:
                  new Date().toLocaleTimeString(
                    'id-ID',
                    {
                      hour: '2-digit',
                      minute: '2-digit',
                    },
                  ),
              },
            ]);
            return;
          }

          setMessages(
            formattedMessages,
          );
        } catch (error: any) {
          if (
            error?.name === 'AbortError'
          ) {
            return;
          }

          console.error(
            'Gagal memuat riwayat obrolan:',
            error,
          );

          setMessages([
            {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content:
                'Maaf, riwayat percakapan tidak dapat dimuat saat ini.',
              isError: true,
              time:
                new Date().toLocaleTimeString(
                  'id-ID',
                  {
                    hour: '2-digit',
                    minute: '2-digit',
                  },
                ),
            },
          ]);
        } finally {
          if (
            sessionAbortRef.current ===
            controller
          ) {
            sessionAbortRef.current = null;
            loadingSessionRef.current = null;
            setIsLoading(false);
          }
        }
      },
      [],
    );

  /* =======================================================
     LOAD SESSION FROM URL
  ======================================================= */

  useEffect(() => {
    const sessionId =
      searchParams.get('session');

    /* /?session=abc -> buka history abc */
    if (sessionId) {
      if (
        loadedSessionRef.current ===
          sessionId ||
        loadingSessionRef.current ===
          sessionId
      ) {
        return;
      }

      handleSelectSession(sessionId);
      return;
    }

    /*
     * Browser Back dari /?session=abc ke /
     * harus kembali ke New Chat.
     */
    if (
      loadedSessionRef.current ||
      loadingSessionRef.current
    ) {
      sessionAbortRef.current?.abort();

      sessionAbortRef.current = null;
      loadedSessionRef.current = null;
      loadingSessionRef.current = null;

      setCurrentSessionId(null);
      setIsLoading(false);
      setMessages([
        createWelcomeMessage(),
      ]);
    }
  }, [
    searchParams,
    handleSelectSession,
    createWelcomeMessage,
  ]);

  /* =======================================================
     SEND MESSAGE
  ======================================================= */

  const sendMessage = async (
    messageText?: string,
  ) => {
    const userText = (
      messageText ?? input
    ).trim();

    if (
      !userText ||
      isLoading
    ) {
      return;
    }

    const currentTime =
      new Date().toLocaleTimeString(
        'id-ID',
        {
          hour: '2-digit',
          minute: '2-digit',
        },
      );

    const newUserMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      time: currentTime,
    };

    /*
     * Snapshot history sebelum pesan user baru
     * dimasukkan ke state.
     */
    const historySnapshot =
      messages
        .filter(
          (msg) =>
            msg.id !==
            'welcome-msg',
        )
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

    setMessages((prev) => [
      ...prev,
      newUserMessage,
    ]);

    setInput('');
    setIsLoading(true);
    setHasReceivedFirstChunk(false);

    /* RESET TEXTAREA */

    if (textareaRef.current) {
      textareaRef.current.style.height =
        'auto';
    }

    /* ABORT CONTROLLER */

    const controller =
      new AbortController();

    abortControllerRef.current =
      controller;

    /*
     * Bubble assistant dibuat ketika delta pertama tiba.
     * ID tetap sama selama seluruh proses streaming.
     */
    const assistantMessageId =
      `assistant-${Date.now()}`;

    const assistantTime =
      new Date().toLocaleTimeString(
        'id-ID',
        {
          hour: '2-digit',
          minute: '2-digit',
        },
      );

    let assistantCreated =
      false;

    let pendingSources:
      string[] = [];

    try {
      const response =
        await fetch('/api/chat', {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          signal:
            controller.signal,

          body: JSON.stringify({
            message: userText,

            history:
              historySnapshot,

            sessionId:
              currentSessionId,
          }),
        });

      /*
       * Error yang terjadi sebelum SSE dimulai
       * masih dikembalikan backend sebagai JSON.
       */
      if (!response.ok) {
        const errorData =
          await response
            .json()
            .catch(
              () => null,
            );

        throw new Error(
          errorData?.error ||
            'Chat request gagal.',
        );
      }

      if (!response.body) {
        throw new Error(
          'Streaming response tidak tersedia.',
        );
      }

      const reader =
        response.body.getReader();

      const decoder =
        new TextDecoder();

      let buffer = '';

      while (true) {
        const {
          value,
          done,
        } = await reader.read();

        if (done) {
          break;
        }

        buffer +=
          decoder.decode(
            value,
            {
              stream: true,
            },
          );

        /*
         * Format SSE:
         *
         * event: delta
         * data: {"text":"..."}
         *
         * <baris kosong>
         */
        const blocks =
          buffer.split(
            /\r?\n\r?\n/,
          );

        /*
         * Potongan terakhir mungkin belum lengkap.
         * Simpan untuk read() berikutnya.
         */
        buffer =
          blocks.pop() || '';

        for (
          const block of blocks
        ) {
          if (!block.trim()) {
            continue;
          }

          const lines =
            block.split(
              /\r?\n/,
            );

          let eventName = '';
          let dataString = '';

          for (
            const line of lines
          ) {
            if (
              line.startsWith(
                'event:',
              )
            ) {
              eventName =
                line
                  .slice(6)
                  .trim();

              continue;
            }

            if (
              line.startsWith(
                'data:',
              )
            ) {
              dataString +=
                line
                  .slice(5)
                  .trim();
            }
          }

          if (!dataString) {
            continue;
          }

          let data: any;

          try {
            data =
              JSON.parse(
                dataString,
              );
          } catch {
            console.warn(
              '[SSE] Data JSON tidak valid:',
              dataString,
            );

            continue;
          }

          /* =============================================
             META
          ============================================= */

          if (
            eventName ===
            'meta'
          ) {
            if (
              data.sessionId
            ) {
              const newSessionId =
                data.sessionId as string;

              loadedSessionRef.current =
                newSessionId;

              loadingSessionRef.current =
                null;

              setCurrentSessionId(
                newSessionId,
              );

              router.replace(
                `/?session=${encodeURIComponent(
                  newSessionId,
                )}`,
                {
                  scroll: false,
                },
              );
            }

            if (
              Array.isArray(
                data.sources,
              )
            ) {
              pendingSources =
                data.sources;

              /*
               * Jika bubble AI sudah ada,
               * sources dapat langsung di-update.
               */
              if (
                assistantCreated
              ) {
                setMessages(
                  (prev) =>
                    prev.map(
                      (msg) =>
                        msg.id ===
                        assistantMessageId
                          ? {
                              ...msg,

                              sources:
                                pendingSources,
                            }
                          : msg,
                    ),
                );
              }
            }

            continue;
          }

          /* =============================================
             DELTA
          ============================================= */

          if (
            eventName ===
            'delta'
          ) {
            const text =
              typeof data.text ===
              'string'
                ? data.text
                : '';

            if (!text) {
              continue;
            }

            setHasReceivedFirstChunk(
              true,
            );

            /*
             * Delta pertama:
             * buat bubble assistant.
             */
            if (
              !assistantCreated
            ) {
              assistantCreated =
                true;

              setMessages(
                (prev) => [
                  ...prev,

                  {
                    id:
                      assistantMessageId,

                    role:
                      'assistant',

                    content:
                      text,

                    sources:
                      pendingSources,

                    time:
                      assistantTime,
                  },
                ],
              );
            }

            /*
             * Delta berikutnya:
             * append ke bubble yang sama.
             */
            else {
              setMessages(
                (prev) =>
                  prev.map(
                    (msg) =>
                      msg.id ===
                      assistantMessageId
                        ? {
                            ...msg,

                            content:
                              msg.content +
                              text,
                          }
                        : msg,
                  ),
              );
            }

            continue;
          }

          /* =============================================
             STREAM ERROR
          ============================================= */

          if (
            eventName ===
            'error'
          ) {
            throw new Error(
              data.message ||
                'Streaming AI gagal.',
            );
          }

          /* =============================================
             DONE
          ============================================= */

          if (
            eventName ===
            'done'
          ) {
            console.info(
              '[AI STREAM DONE]',
              {
                model:
                  data.model,

                modelUsed:
                  data.modelUsed,
              },
            );
          }
        }
      }
    } catch (error: any) {
      /*
       * User menekan Stop Generation.
       * Partial response yang sudah tampil tetap dipertahankan.
       */
      if (
        error?.name ===
        'AbortError'
      ) {
        return;
      }

      console.error(
        '[CHAT STREAM ERROR]',
        error,
      );

      setMessages((prev) => [
        ...prev,

        {
          id:
            `error-${Date.now()}`,

          role:
            'assistant',

          content:
            error?.message ||
            'Maaf, terjadi masalah saat menghubungkan ke AI. Silakan coba kembali.',

          isError:
            true,

          time:
            new Date().toLocaleTimeString(
              'id-ID',
              {
                hour:
                  '2-digit',

                minute:
                  '2-digit',
              },
            ),
        },
      ]);
    } finally {
      setIsLoading(false);

      setHasReceivedFirstChunk(
        false,
      );

      if (
        abortControllerRef.current ===
        controller
      ) {
        abortControllerRef.current =
          null;
      }
    }
  };

  /* =======================================================
     SUBMIT
  ======================================================= */

  const handleSubmit = (
    e: React.FormEvent,
  ) => {
    e.preventDefault();

    sendMessage();
  };

  /* =======================================================
     KEYBOARD
  ======================================================= */

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey
    ) {
      e.preventDefault();

      sendMessage();
    }
  };

  /* =======================================================
     TEXTAREA AUTO RESIZE
  ======================================================= */

  const handleInputChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setInput(e.target.value);

    e.target.style.height =
      'auto';

    e.target.style.height = `${Math.min(
      e.target.scrollHeight,
      160,
    )}px`;
  };

  /* =======================================================
     STOP GENERATION
  ======================================================= */

  const handleStopGeneration =
    () => {
      abortControllerRef.current?.abort();

      abortControllerRef.current =
        null;

      setIsLoading(false);
    };

  /* =======================================================
     COPY MESSAGE
  ======================================================= */

  const handleCopy = async (
    message: Message,
  ) => {
    try {
      await navigator.clipboard.writeText(
        message.content,
      );

      setCopiedMessageId(
        message.id,
      );

      setTimeout(() => {
        setCopiedMessageId(null);
      }, 1800);
    } catch (error) {
      console.error(
        'Gagal copy:',
        error,
      );
    }
  };

  /* =======================================================
     REGENERATE
  ======================================================= */

  const handleRegenerate = () => {
    if (isLoading) return;

    const lastUserMessage = [
      ...messages,
    ]
      .reverse()
      .find(
        (message) =>
          message.role === 'user',
      );

    if (!lastUserMessage) {
      return;
    }

    sendMessage(
      lastUserMessage.content,
    );
  };

  /* =======================================================
     WELCOME STATE
  ======================================================= */

  const isWelcomeState =
    messages.length === 1 &&
    messages[0]?.id ===
      'welcome-msg';

  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f8fc] font-sans text-gray-800">

      {/* ================================================= */}
      {/* SIDEBAR */}
      {/* ================================================= */}

      <Sidebar
        onSelectSession={
          handleSelectSession
        }
        currentSessionId={
          currentSessionId
        }
        onNewChat={
          handleNewChat
        }
      />

      {/* ================================================= */}
      {/* MAIN */}
      {/* ================================================= */}

      <main className="relative z-10 flex h-full min-w-0 flex-1 flex-col bg-[#fafbfc]">

        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <header className="flex min-h-20 shrink-0 items-center justify-between border-b border-gray-200/70 bg-white/90 px-6 backdrop-blur-xl lg:px-8">

          <div className="flex min-w-0 items-center gap-3">

            {/* AI AVATAR */}

            <div className="relative hidden h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:block">
              <Image
                src="/ai-avatar.png"
                alt="AI Assistant"
                fill
                sizes="40px"
                className="object-cover"
              />

              <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
            </div>

            <div className="min-w-0">

              <div className="flex items-center gap-2">

                <h2 className="truncate text-lg font-bold tracking-tight text-gray-950 sm:text-xl">
                  People Assistant
                </h2>

                <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600 md:inline-flex">

                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

                  Online
                </span>
              </div>

              <p className="mt-0.5 hidden truncate text-xs text-gray-400 sm:block">
                AI HR Assistant
              </p>
            </div>
          </div>

          {/* NEW CHAT */}

          <button
            onClick={
              handleNewChat
            }
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-gray-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/40 hover:text-indigo-600"
          >
            <Plus size={15} />

            <span className="hidden sm:inline">
              Chat Baru
            </span>
          </button>
        </header>

        {/* ================================================= */}
        {/* CHAT BODY */}
        {/* ================================================= */}

        <div className="flex min-h-0 flex-1">

          <div className="relative flex min-w-0 flex-1 flex-col">

            {/* ================================================= */}
            {/* MESSAGE AREA */}
            {/* ================================================= */}

            <div
              ref={
                chatContainerRef
              }
              onScroll={
                handleChatScroll
              }
              className="flex-1 overflow-y-auto scroll-smooth"
            >
              <div className="mx-auto w-full max-w-5xl px-5 py-8 lg:px-8">

                {isWelcomeState ? (

                  /* ================================ */
                  /* WELCOME */
                  /* ================================ */

                  <WelcomeState
                    onPromptClick={
                      sendMessage
                    }
                  />

                ) : (

                  /* ================================ */
                  /* CONVERSATION */
                  /* ================================ */

                  <div className="space-y-7">

                    {messages
                      .filter(
                        (msg) =>
                          msg.id !==
                          'welcome-msg',
                      )
                      .map(
                        (
                          message,
                          index,
                        ) => {
                          const visibleMessages =
                            messages.filter(
                              (msg) =>
                                msg.id !==
                                'welcome-msg',
                            );

                          return (
                            <ChatMessage
                              key={
                                message.id
                              }
                              message={
                                message
                              }
                              copied={
                                copiedMessageId ===
                                message.id
                              }
                              onCopy={() =>
                                handleCopy(
                                  message,
                                )
                              }
                              showRegenerate={
                                message.role ===
                                  'assistant' &&
                                index ===
                                  visibleMessages.length -
                                    1
                              }
                              onRegenerate={
                                handleRegenerate
                              }
                            />
                          );
                        },
                      )}

                    {/* TYPING */}

                    {isLoading &&
                      !hasReceivedFirstChunk && (
                        <TypingIndicator />
                      )}

                    <div
                      ref={
                        messagesEndRef
                      }
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ================================================= */}
            {/* SCROLL TO BOTTOM */}
            {/* ================================================= */}

            {showScrollButton && (
              <button
                onClick={() =>
                  scrollToBottom()
                }
                className="absolute bottom-40 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-lg transition hover:border-indigo-200 hover:text-indigo-600"
                title="Scroll ke bawah"
              >
                <ArrowDown
                  size={16}
                />
              </button>
            )}

            {/* ================================================= */}
            {/* COMPOSER */}
            {/* ================================================= */}

            <div className="shrink-0 border-t border-gray-200/70 bg-white/95 px-4 pb-4 pt-3 backdrop-blur-xl lg:px-8">

              <div className="mx-auto max-w-5xl">

                {/* SUGGESTION CHIPS */}

                {!isWelcomeState && (
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">

                    {suggestedPrompts.map(
                      (item) => (
                        <button
                          key={
                            item.title
                          }
                          type="button"
                          onClick={() =>
                            setInput(
                              item.prompt,
                            )
                          }
                          className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-medium text-gray-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
                        >
                          {
                            item.title
                          }
                        </button>
                      ),
                    )}
                  </div>
                )}

                {/* INPUT FORM */}

                <form
                  onSubmit={
                    handleSubmit
                  }
                  className="rounded-[22px] border border-gray-200 bg-white p-2 shadow-lg shadow-gray-200/40 transition-all focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-50"
                >

                  <textarea
                    ref={
                      textareaRef
                    }
                    rows={1}
                    value={input}
                    onChange={
                      handleInputChange
                    }
                    onKeyDown={
                      handleKeyDown
                    }
                    disabled={
                      isLoading
                    }
                    placeholder="Tanyakan tentang cuti, benefit, payroll, reimbursement..."
                    className="max-h-40 min-h-[48px] w-full resize-none bg-transparent px-3 py-3 text-sm leading-6 text-gray-800 outline-none placeholder:text-gray-400 disabled:opacity-60"
                  />

                  {/* INPUT FOOTER */}

                  <div className="flex items-center justify-between px-2 pb-1">

                    <div className="flex items-center gap-2 text-[10px] text-gray-400">

                      <Sparkles
                        size={12}
                        className="text-indigo-400"
                      />

                      AI Assistant aktif
                    </div>

                    <div className="flex items-center gap-2">

                      <span className="hidden text-[10px] text-gray-300 sm:block">
                        Enter kirim • Shift+Enter baris baru
                      </span>

                      {/* STOP / SEND */}

                      {isLoading ? (
                        <button
                          type="button"
                          onClick={
                            handleStopGeneration
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-white transition hover:bg-gray-700"
                          title="Hentikan response"
                        >
                          <Square
                            size={13}
                            fill="currentColor"
                          />
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={
                            !input.trim()
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
                          title="Kirim pesan"
                        >
                          <Send
                            size={16}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                </form>

                {/* DISCLAIMER */}

                <p className="mt-2.5 text-center text-[10px] leading-4 text-gray-400">
                  AI dapat membuat kesalahan. Verifikasi informasi penting dengan HR sebelum mengambil keputusan.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/* =========================================================
   PAGE WRAPPER
========================================================= */

export default function Home() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HomeContent />
    </Suspense>
  );
}

function PageLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-[#f7f8fc]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600" />

        <p className="text-sm text-gray-500">
          Memuat People Assistant...
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   WELCOME STATE
========================================================= */

function WelcomeState({
  onPromptClick,
}: {
  onPromptClick: (
    prompt: string,
  ) => void;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-260px)] max-w-3xl flex-col justify-center py-8">

      {/* AI AVATAR */}

      <div className="relative mb-5 h-14 w-14 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg shadow-indigo-100">

        <Image
          src="/ai-avatar.png"
          alt="People Assistant"
          fill
          sizes="56px"
          className="object-cover"
        />

        <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
      </div>

      {/* AI LABEL */}

      <div className="mb-2 flex items-center gap-2">

        <span className="text-xs font-semibold text-indigo-600">
          People Assistant
        </span>

        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-600">
          AI
        </span>
      </div>

      {/* TITLE */}

      <h1 className="max-w-xl text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">
        Ada yang bisa saya bantu?
      </h1>

      {/* DESCRIPTION */}

      <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">
        Tanyakan informasi seputar kebijakan HR,
        cuti, benefit, payroll, reimbursement,
        atau aturan perusahaan.
      </p>

      {/* ================================================= */}
      {/* SUGGESTED QUESTIONS */}
      {/* ================================================= */}

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">

        {suggestedPrompts.map(
          (item) => {
            const Icon =
              item.icon;

            return (
              <button
                key={
                  item.title
                }
                onClick={() =>
                  onPromptClick(
                    item.prompt,
                  )
                }
                className="group flex items-start gap-4 rounded-2xl border border-gray-200/80 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
              >

                {/* ICON */}

                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.style}`}
                >
                  <Icon
                    size={18}
                  />
                </div>

                {/* TEXT */}

                <div className="min-w-0 flex-1">

                  <p className="text-sm font-semibold text-gray-800 transition group-hover:text-indigo-600">
                    {item.title}
                  </p>

                  <p className="mt-1 text-xs leading-5 text-gray-400">
                    {
                      item.description
                    }
                  </p>
                </div>
              </button>
            );
          },
        )}
      </div>
    </div>
  );
}

/* =========================================================
   CHAT MESSAGE
========================================================= */

function ChatMessage({
  message,
  copied,
  onCopy,
  showRegenerate,
  onRegenerate,
}: {
  message: Message;
  copied: boolean;
  onCopy: () => void;
  showRegenerate: boolean;
  onRegenerate: () => void;
}) {
  const isUser =
    message.role === 'user';

  return (
    <div
      className={`group flex gap-3 ${
        isUser
          ? 'justify-end'
          : 'justify-start'
      }`}
    >

      {/* ================================================= */}
      {/* AI AVATAR */}
      {/* ================================================= */}

      {!isUser && (
        <div className="relative mt-1 h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

          <Image
            src="/ai-avatar.png"
            alt="People Assistant"
            fill
            sizes="36px"
            className="object-cover"
          />
        </div>
      )}

      {/* ================================================= */}
      {/* MESSAGE */}
      {/* ================================================= */}

      <div
        className={`min-w-0 ${
          isUser
            ? 'max-w-[80%] sm:max-w-[75%]'
            : 'max-w-[90%] sm:max-w-[85%] lg:max-w-[78%]'
        }`}
      >

        {/* NAME */}

        <div
          className={`mb-1.5 flex items-center gap-2 ${
            isUser
              ? 'justify-end'
              : ''
          }`}
        >

          <span className="text-[11px] font-semibold text-gray-500">
            {isUser
              ? 'Anda'
              : 'People Assistant'}
          </span>

          {!isUser && (
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-indigo-600">
              AI
            </span>
          )}
        </div>

        {/* BUBBLE */}

        <div
          className={`rounded-[20px] px-5 py-4 text-sm leading-7 ${
            isUser
              ? 'rounded-tr-md bg-indigo-600 text-white shadow-sm shadow-indigo-100'
              : message.isError
                ? 'rounded-tl-md border border-rose-100 bg-rose-50 text-rose-800'
                : 'rounded-tl-md border border-gray-200/80 bg-white text-gray-700 shadow-sm'
          }`}
        >

          {/* ERROR */}

          {message.isError && (
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-rose-600">

              <XCircle
                size={14}
              />

              Connection Error
            </div>
          )}

          {/* MARKDOWN CONTENT */}

          <div
            className={
              isUser
                ? `
                  prose prose-sm max-w-none
                  prose-p:text-white
                  prose-strong:text-white
                  prose-li:text-white
                  prose-headings:text-white
                `
                : `
                  prose prose-sm max-w-none
                  prose-headings:text-gray-900
                  prose-p:text-gray-700
                  prose-li:text-gray-700
                  prose-strong:text-gray-900
                  prose-a:text-indigo-600
                `
            }
          >
            <ReactMarkdown>
              {message.content}
            </ReactMarkdown>
          </div>

          {/* ================================================= */}
          {/* SOURCES */}
          {/* ================================================= */}

          {!isUser &&
            message.sources &&
            message.sources.length > 0 && (
              <SourceList
                sources={
                  message.sources
                }
              />
            )}

          {/* ================================================= */}
          {/* TIME */}
          {/* ================================================= */}

          <div
            className={`mt-3 flex items-center gap-1 ${
              isUser
                ? 'justify-end text-indigo-200'
                : 'text-gray-400'
            }`}
          >

            <span className="text-[9px]">
              {message.time}
            </span>

            {isUser && (
              <CheckCircle2
                size={10}
              />
            )}
          </div>
        </div>

        {/* ================================================= */}
        {/* AI ACTIONS */}
        {/* ================================================= */}

        {!isUser &&
          !message.isError && (
            <div className="mt-1.5 flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">

              {/* COPY */}

              <button
                onClick={
                  onCopy
                }
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-medium text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                {copied ? (
                  <>
                    <Check
                      size={12}
                    />

                    Copied
                  </>
                ) : (
                  <>
                    <Copy
                      size={12}
                    />

                    Copy
                  </>
                )}
              </button>

              {/* REGENERATE */}

              {showRegenerate && (
                <button
                  onClick={
                    onRegenerate
                  }
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-medium text-gray-400 transition hover:bg-gray-100 hover:text-indigo-600"
                >
                  <RefreshCw
                    size={12}
                  />

                  Regenerate
                </button>
              )}
            </div>
          )}
      </div>

      {/* ================================================= */}
      {/* USER AVATAR */}
      {/* ================================================= */}
      {/* USER AVATAR */}
      {/* ================================================= */}

      {isUser && (
        <div className="mt-1 relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-indigo-100 overflow-hidden bg-gray-50">
          <Image 
            src="/foto-profil.png"
            alt="Profil User"
            fill
            sizes="36px"
            className="object-cover"
          />
        </div>
      )}
    </div>
  );
}

/* =========================================================
   SOURCE LIST
========================================================= */

function SourceList({
  sources,
}: {
  sources: string[];
}) {
  return (
    <div className="mt-5 border-t border-gray-100 pt-4">

      {/* SOURCE TITLE */}

      <div className="mb-2.5 flex items-center gap-1.5">

        <BookOpen
          size={12}
          className="text-indigo-500"
        />

        <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-gray-400">
          Referensi
        </span>
      </div>

      {/* SOURCE ITEMS */}

      <div className="flex flex-wrap gap-2">

        {sources.map(
          (
            source,
            index,
          ) => (
            <div
              key={`${source}-${index}`}
              className="flex max-w-full items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[10px] font-medium text-gray-600"
            >

              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-indigo-100 text-[8px] font-bold text-indigo-600">
                {index + 1}
              </span>

              <span className="truncate">
                {source}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

/* =========================================================
   TYPING INDICATOR
========================================================= */

function TypingIndicator() {
  return (
    <div className="flex gap-3">

      {/* AVATAR */}

      <div className="relative mt-1 h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">

        <Image
          src="/ai-avatar.png"
          alt="AI typing"
          fill
          sizes="36px"
          className="object-cover"
        />
      </div>

      {/* TYPING */}

      <div>

        <div className="mb-1.5 flex items-center gap-2">

          <span className="text-[11px] font-semibold text-gray-500">
            People Assistant
          </span>

          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[8px] font-bold text-indigo-600">
            AI
          </span>
        </div>

        <div className="flex items-center gap-3 rounded-[20px] rounded-tl-md border border-gray-200 bg-white px-5 py-4 shadow-sm">

          {/* DOTS */}

          <div className="flex items-center gap-1">

            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" />

            <span
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400"
              style={{
                animationDelay:
                  '150ms',
              }}
            />

            <span
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400"
              style={{
                animationDelay:
                  '300ms',
              }}
            />
          </div>

          <span className="text-[11px] text-gray-400">
            Mencari jawaban...
          </span>
        </div>
      </div>
    </div>
  );
}