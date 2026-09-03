'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import Image from 'next/image';
import Link from 'next/link';

import {
  usePathname,
  useRouter,
} from 'next/navigation';

import {
  MessageSquare,
  LayoutDashboard,
  Database,
  Users,
  Clock,
  WalletCards,
  Plus,
  Trash2,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Sparkles,
  ChevronRight,
  UserRound,
} from 'lucide-react';

/* =========================================================
   TYPES
========================================================= */

type CurrentEmployee = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: string;
};

type SidebarProps = {
  onSelectSession?: (
    id: string,
  ) => void;

  currentSessionId?:
    | string
    | null;

  onNewChat?: () => void;
};

/* =========================================================
   NAVIGATION
========================================================= */

const navigationItems = [
  {
    href: '/',
    label: 'AI Chat',
    icon: MessageSquare,
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/knowledge',
    label: 'Knowledge Hub',
    icon: Database,
  },
  {
    href: '/directory',
    label: 'Directory',
    icon: Users,
  },
  {
    href: '/leave',
    label: 'Time & Leave',
    icon: Clock,
  },
  {
    href: '/reimbursement',
    label: 'Expenses & Claims',
    icon: WalletCards,
  },
];

/* =========================================================
   SIDEBAR
========================================================= */

export default function Sidebar({
  onSelectSession,
  currentSessionId,
  onNewChat,
}: SidebarProps) {
  const pathname =
    usePathname();

  const router =
    useRouter();

  const [
    sessions,
    setSessions,
  ] = useState<
    ChatSession[]
  >([]);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    isRefreshing,
    setIsRefreshing,
  ] = useState(false);

  const [
    historySearch,
    setHistorySearch,
  ] = useState('');

  const [
    isCollapsed,
    setIsCollapsed,
  ] = useState(false);

  const [
    currentEmployee,
    setCurrentEmployee,
  ] = useState<CurrentEmployee | null>(
    null,
  );

  /* =======================================================
     FETCH CHAT HISTORY
  ======================================================= */

  const fetchSessions =
    useCallback(
      async (
        refresh = false,
      ) => {
        try {
          if (refresh) {
            setIsRefreshing(
              true,
            );
          } else {
            setIsLoading(
              true,
            );
          }

          const res =
            await fetch(
              '/api/sessions',
              {
                cache:
                  'no-store',
              },
            );

          const data =
            await res.json();

          if (
            res.ok &&
            Array.isArray(data)
          ) {
            setSessions(
              data,
            );
          }
        } catch (error) {
          console.error(
            'Gagal memuat riwayat chat:',
            error,
          );
        } finally {
          setIsLoading(
            false,
          );

          setIsRefreshing(
            false,
          );
        }
      },
      [],
    );

  useEffect(() => {
    fetchSessions();
  }, [
    fetchSessions,
    currentSessionId,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentEmployee() {
      try {
        const response =
          await fetch(
            '/api/me',
            {
              cache:
                'no-store',
            },
          );

        const payload =
          await response
            .json();

        if (
          !response.ok ||
          !payload?.success ||
          !payload?.data
        ) {
          throw new Error(
            payload
              ?.error
              ?.message ||
              'Employee profile tidak tersedia.',
          );
        }

        if (!cancelled) {
          setCurrentEmployee(
            payload.data as CurrentEmployee,
          );
        }
      } catch (error) {
        console.error(
          '[CURRENT EMPLOYEE LOAD ERROR]',
          error,
        );
      }
    }

    void loadCurrentEmployee();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =======================================================
     FILTER HISTORY
  ======================================================= */

  const filteredSessions =
    useMemo(() => {
      const query =
        historySearch
          .trim()
          .toLowerCase();

      if (!query) {
        return sessions;
      }

      return sessions.filter(
        (session) =>
          (
            session.title ??
            ''
          )
            .toLowerCase()
            .includes(
              query,
            ),
      );
    }, [
      sessions,
      historySearch,
    ]);

  /* =======================================================
     OPEN SESSION
  ======================================================= */

  const handleOpenSession =
    (
      id: string,
    ) => {
      const sessionUrl =
        `/?session=${encodeURIComponent(
          id,
        )}`;

      /*
       * Jika user sedang berada
       * di halaman AI Chat:
       *
       * 1. update URL
       * 2. buka session langsung
       *
       * Ini tetap kompatibel dengan
       * implementasi AI Chat lama.
       */
      if (
        pathname === '/'
      ) {
        router.replace(
          sessionUrl,
          {
            scroll: false,
          },
        );

        /*
         * Jika callback tersedia,
         * buka session langsung.
         */
        if (
          onSelectSession
        ) {
          onSelectSession(
            id,
          );
        }

        return;
      }

      /*
       * Jika user sedang berada di:
       *
       * Dashboard
       * Knowledge
       * Directory
       * Time & Leave
       *
       * pindah ke AI Chat sambil
       * membawa ID session.
       */
      router.push(
        sessionUrl,
      );
    };

  /* =======================================================
     NEW CHAT
  ======================================================= */

  const handleNewChat =
    () => {
      /*
       * Jika sudah berada di
       * AI Chat.
       */
      if (
        pathname === '/'
      ) {
        onNewChat?.();

        router.replace(
          '/',
          {
            scroll: false,
          },
        );

        return;
      }

      /*
       * Jika sedang berada di
       * halaman lain, pindah
       * ke AI Chat.
       */
      router.push(
        '/',
      );
    };

  /* =======================================================
     DELETE SESSION
  ======================================================= */

  const handleDeleteSession =
    async (
      e: React.MouseEvent,
      id: string,
    ) => {
      /*
       * Mencegah klik delete
       * ikut membuka session.
       */
      e.stopPropagation();

      const confirmed =
        window.confirm(
          'Yakin ingin menghapus riwayat obrolan ini?',
        );

      if (!confirmed) {
        return;
      }

      try {
        const res =
          await fetch(
            `/api/sessions/${id}`,
            {
              method:
                'DELETE',
            },
          );

        if (!res.ok) {
          throw new Error(
            'Gagal menghapus sesi.',
          );
        }

        /*
         * Hapus langsung dari UI.
         */
        setSessions(
          (prev) =>
            prev.filter(
              (
                session,
              ) =>
                session.id !==
                id,
            ),
        );

        /*
         * Kalau session yang
         * sedang terbuka dihapus.
         */
        if (
          currentSessionId ===
          id
        ) {
          if (
            pathname ===
            '/'
          ) {
            onNewChat?.();

            router.replace(
              '/',
              {
                scroll:
                  false,
              },
            );
          }
        }
      } catch (error) {
        console.error(
          'Gagal menghapus chat:',
          error,
        );

        /*
         * Sinkron ulang jika
         * delete gagal.
         */
        fetchSessions(
          true,
        );
      }
    };

  /* =======================================================
     ACTIVE PATH
  ======================================================= */

  const isPathActive =
    (
      href: string,
    ) => {
      if (
        href === '/'
      ) {
        return (
          pathname === '/'
        );
      }

      return pathname.startsWith(
        href,
      );
    };

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <aside
      className={`
        relative flex h-full shrink-0 flex-col
        border-r border-gray-200/70
        bg-white
        transition-all duration-300

        ${
          isCollapsed
            ? 'w-[84px]'
            : 'w-[272px]'
        }
      `}
    >
      {/* ================================================= */}
      {/* LOGO */}
      {/* ================================================= */}

      <div
        className={`
          flex h-20 shrink-0 items-center
          border-b border-gray-100/80

          ${
            isCollapsed
              ? 'justify-center px-3'
              : 'justify-between px-5'
          }
        `}
      >
        <div className="flex min-w-0 items-center gap-3">

          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl">
            <Image
              src="/logo.png"
              alt="ElevateHR"
              fill
              sizes="40px"
              className="object-contain"
              priority
            />
          </div>

          {!isCollapsed && (
            <div className="min-w-0">

              <h1 className="truncate text-[15px] font-bold tracking-tight text-gray-950">
                ElevateHR
              </h1>

              <p className="mt-0.5 truncate text-[9px] font-medium text-gray-400">
                Empowering People,
                Intelligently
              </p>
            </div>
          )}
        </div>

        {!isCollapsed && (
          <button
            type="button"
            onClick={() =>
              setIsCollapsed(
                true,
              )
            }
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            title="Tutup sidebar"
          >
            <PanelLeftClose
              size={16}
            />
          </button>
        )}
      </div>

      {/* ================================================= */}
      {/* OPEN COLLAPSED */}
      {/* ================================================= */}

      {isCollapsed && (
        <button
          type="button"
          onClick={() =>
            setIsCollapsed(
              false,
            )
          }
          className="absolute -right-3 top-[92px] z-20 flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm transition hover:text-indigo-600"
          title="Buka sidebar"
        >
          <PanelLeftOpen
            size={13}
          />
        </button>
      )}

      {/* ================================================= */}
      {/* CONTENT */}
      {/* ================================================= */}

      <div className="flex min-h-0 flex-1 flex-col">

        {/* ================================================= */}
        {/* NEW CHAT */}
        {/* ================================================= */}

        <div
          className={
            isCollapsed
              ? 'px-3 pb-3 pt-4'
              : 'px-4 pb-3 pt-4'
          }
        >
          <button
            type="button"
            onClick={
              handleNewChat
            }
            title="Chat Baru"
            className={`
              group flex w-full items-center
              rounded-xl bg-indigo-600
              text-white
              shadow-sm shadow-indigo-200
              transition-all
              hover:bg-indigo-700
              hover:shadow-md

              ${
                isCollapsed
                  ? 'h-11 justify-center px-0'
                  : 'h-11 justify-between px-3.5'
              }
            `}
          >
            <div className="flex items-center gap-2.5">

              <Sparkles
                size={17}
              />

              {!isCollapsed && (
                <span className="text-sm font-semibold">
                  Chat Baru
                </span>
              )}
            </div>

            {!isCollapsed && (
              <Plus
                size={16}
                className="opacity-80 transition-transform group-hover:rotate-90"
              />
            )}
          </button>
        </div>

        {/* ================================================= */}
        {/* NAVIGATION */}
        {/* ================================================= */}

        <div
          className={
            isCollapsed
              ? 'px-3'
              : 'px-4'
          }
        >
          {!isCollapsed && (
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Workspace
            </p>
          )}

          <nav className="space-y-1">

            {navigationItems.map(
              (
                item,
              ) => (
                <NavItem
                  key={
                    item.href
                  }
                  href={
                    item.href
                  }
                  label={
                    item.label
                  }
                  icon={
                    item.icon
                  }
                  active={isPathActive(
                    item.href,
                  )}
                  collapsed={
                    isCollapsed
                  }
                />
              ),
            )}
          </nav>
        </div>

        {/* ================================================= */}
        {/* CHAT HISTORY */}
        {/* ================================================= */}

        {!isCollapsed && (
          <div className="mt-6 flex min-h-0 flex-1 flex-col border-t border-gray-100 px-4 pt-5">

            {/* HEADER */}

            <div className="mb-3 flex items-center justify-between px-1">

              <div className="flex items-center gap-2">

                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Chat History
                </h3>

                {!isLoading && (
                  <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-500">
                    {
                      sessions.length
                    }
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">

                {/* REFRESH */}

                <button
                  type="button"
                  onClick={() =>
                    fetchSessions(
                      true,
                    )
                  }
                  disabled={
                    isRefreshing
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-indigo-600 disabled:opacity-50"
                  title="Refresh riwayat"
                >
                  <RefreshCw
                    size={13}
                    className={
                      isRefreshing
                        ? 'animate-spin'
                        : ''
                    }
                  />
                </button>

                {/* NEW CHAT */}

                <button
                  type="button"
                  onClick={
                    handleNewChat
                  }
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                  title="Chat baru"
                >
                  <Plus
                    size={14}
                  />
                </button>
              </div>
            </div>

            {/* ================================================= */}
            {/* SEARCH */}
            {/* ================================================= */}

            <div className="relative mb-3">

              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                type="text"
                value={
                  historySearch
                }
                onChange={(
                  e,
                ) =>
                  setHistorySearch(
                    e.target
                      .value,
                  )
                }
                placeholder="Cari percakapan..."
                className="h-9 w-full rounded-xl border border-gray-200 bg-gray-50/70 pl-9 pr-3 text-[11px] text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-indigo-300 focus:bg-white focus:ring-4 focus:ring-indigo-50"
              />
            </div>

            {/* ================================================= */}
            {/* HISTORY LIST */}
            {/* ================================================= */}

            <div className="min-h-0 flex-1 overflow-y-auto pb-4 pr-1">

              {isLoading ? (

                <HistorySkeleton />

              ) : filteredSessions.length >
                0 ? (

                <div className="space-y-1">

                  {filteredSessions.map(
                    (
                      session,
                    ) => (
                      <HistoryItem
                        key={
                          session.id
                        }

                        label={
                          session.title
                        }

                        date={formatRelativeDate(
                          session.updatedAt,
                        )}

                        active={
                          pathname ===
                            '/' &&
                          session.id ===
                            currentSessionId
                        }

                        /*
                         * FIX UTAMA
                         */
                        onClick={() =>
                          handleOpenSession(
                            session.id,
                          )
                        }

                        onDelete={(
                          e,
                        ) =>
                          handleDeleteSession(
                            e,
                            session.id,
                          )
                        }
                      />
                    ),
                  )}
                </div>

              ) : historySearch ? (

                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-3 py-5 text-center">

                  <Search
                    size={18}
                    className="mx-auto text-gray-300"
                  />

                  <p className="mt-2 text-[11px] font-medium text-gray-500">
                    Percakapan tidak ditemukan
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      setHistorySearch(
                        '',
                      )
                    }
                    className="mt-2 text-[10px] font-semibold text-indigo-600"
                  >
                    Hapus pencarian
                  </button>
                </div>

              ) : (

                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-3 py-5 text-center">

                  <MessageSquare
                    size={20}
                    className="mx-auto text-gray-300"
                  />

                  <p className="mt-2 text-[11px] font-medium text-gray-500">
                    Belum ada riwayat
                  </p>

                  <p className="mt-1 text-[9px] leading-4 text-gray-400">
                    Percakapan baru akan muncul di sini.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* COLLAPSED */}
        {/* ================================================= */}

        {isCollapsed && (
          <div className="mt-5 flex flex-1 flex-col items-center">

            <div className="h-px w-8 bg-gray-100" />

            <div className="mt-5 flex h-9 w-9 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
              <MessageSquare
                size={16}
              />
            </div>
          </div>
        )}
      </div>

      {/* ================================================= */}
      {/* PROFILE */}
      {/* ================================================= */}

      <div
        className={`
          shrink-0 border-t
          border-gray-100

          ${
            isCollapsed
              ? 'p-3'
              : 'p-4'
          }
        `}
      >
        <div
          className={`
            group flex items-center
            rounded-2xl
            border border-gray-100
            bg-gray-50/70
            transition-all
            hover:border-indigo-100
            hover:bg-white
            hover:shadow-sm

            ${
              isCollapsed
                ? 'justify-center p-2'
                : 'justify-between p-3'
            }
          `}
        >
          <div className="flex min-w-0 items-center gap-3">

            {/* PROFILE */}

            <div className="relative shrink-0">
              {/* Avatar dengan foto dari folder public */}
              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-indigo-100 overflow-hidden bg-gray-50">
                <span className="text-xs font-bold text-indigo-600">
                  {(currentEmployee?.name ??
                    'Employee')
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map(
                      (part) =>
                        part.charAt(0),
                    )
                    .join('')
                    .toUpperCase()}
                </span>
              </div>

              {/* Titik hijau status aktif */}
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 z-10" />
            </div>

            {!isCollapsed && (
              <div className="min-w-0">

                <p className="truncate text-xs font-bold text-gray-900">
                  {currentEmployee?.name ??
                    'Employee'}
                </p>

                <div className="mt-1 flex items-center gap-1.5">

                  <UserRound
                    size={10}
                    className="text-gray-400"
                  />

                  <p className="truncate text-[10px] text-gray-400">
                    {currentEmployee?.position ??
                      currentEmployee?.department ??
                      'Employee'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <ChevronRight
              size={15}
              className="shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500"
            />
          )}
        </div>
      </div>
    </aside>
  );
}

/* =========================================================
   NAV ITEM
========================================================= */

function NavItem({
  icon: Icon,
  label,
  active = false,
  href = '#',
  collapsed = false,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  href?: string;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      title={
        collapsed
          ? label
          : undefined
      }
      className={`
        relative flex items-center
        rounded-xl
        transition-all

        ${
          collapsed
            ? 'h-11 justify-center'
            : 'h-10 gap-3 px-3'
        }

        ${
          active
            ? 'bg-indigo-50 text-indigo-700'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
        }
      `}
    >
      {active && (
        <span
          className={`
            absolute rounded-full
            bg-indigo-600

            ${
              collapsed
                ? '-left-3 h-5 w-1'
                : '-left-4 h-5 w-1'
            }
          `}
        />
      )}

      <Icon
        size={17}
        strokeWidth={
          active
            ? 2.3
            : 2
        }
        className="shrink-0"
      />

      {!collapsed && (
        <>
          <span
            className={`
              min-w-0 flex-1 truncate
              text-[13px]

              ${
                active
                  ? 'font-semibold'
                  : 'font-medium'
              }
            `}
          >
            {label}
          </span>

          {active && (
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
          )}
        </>
      )}
    </Link>
  );
}

/* =========================================================
   HISTORY ITEM
========================================================= */

function HistoryItem({
  label,
  date,
  active = false,
  onClick,
  onDelete,
}: {
  label: string;
  date: string;
  active?: boolean;
  onClick?: () => void;
  onDelete?: (
    e: React.MouseEvent,
  ) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={
        onClick
      }
      onKeyDown={(
        e,
      ) => {
        if (
          e.key ===
            'Enter' ||
          e.key ===
            ' '
        ) {
          e.preventDefault();

          onClick?.();
        }
      }}
      className={`
        group relative
        flex cursor-pointer
        items-center gap-2.5
        rounded-xl border
        px-2.5 py-2.5
        transition-all
        outline-none

        focus:ring-2
        focus:ring-indigo-100

        ${
          active
            ? 'border-indigo-100 bg-indigo-50/80'
            : 'border-transparent hover:border-gray-100 hover:bg-gray-50'
        }
      `}
    >
      {/* ICON */}

      <div
        className={`
          flex h-7 w-7 shrink-0
          items-center justify-center
          rounded-lg
          transition-colors

          ${
            active
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'bg-gray-50 text-gray-400 group-hover:bg-white group-hover:text-indigo-500'
          }
        `}
      >
        <MessageSquare
          size={12}
        />
      </div>

      {/* TITLE */}

      <div className="min-w-0 flex-1">

        <p
          className={`
            truncate
            text-[11px]

            ${
              active
                ? 'font-semibold text-indigo-900'
                : 'font-medium text-gray-600 group-hover:text-gray-900'
            }
          `}
        >
          {label ||
            'Percakapan Baru'}
        </p>

        <p
          className={`
            mt-0.5
            text-[9px]

            ${
              active
                ? 'text-indigo-400'
                : 'text-gray-400'
            }
          `}
        >
          {date}
        </p>
      </div>

      {/* DELETE */}

      <button
        type="button"
        onClick={
          onDelete
        }
        title="Hapus percakapan"
        className="
          flex h-7 w-7 shrink-0
          items-center justify-center
          rounded-lg
          text-gray-300
          opacity-0
          transition-all

          hover:bg-rose-50
          hover:text-rose-500

          group-hover:opacity-100
        "
      >
        <Trash2
          size={13}
        />
      </button>

      {/* ACTIVE LINE */}

      {active && (
        <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-indigo-500" />
      )}
    </div>
  );
}

/* =========================================================
   HISTORY SKELETON
========================================================= */

function HistorySkeleton() {
  return (
    <div className="space-y-2">

      {[1, 2, 3, 4].map(
        (
          item,
        ) => (
          <div
            key={item}
            className="flex animate-pulse items-center gap-2.5 rounded-xl px-2.5 py-2.5"
          >
            <div className="h-7 w-7 shrink-0 rounded-lg bg-gray-100" />

            <div className="flex-1">

              <div className="h-2.5 w-3/4 rounded bg-gray-100" />

              <div className="mt-2 h-2 w-1/3 rounded bg-gray-100" />
            </div>
          </div>
        ),
      )}
    </div>
  );
}

/* =========================================================
   DATE FORMATTER
========================================================= */

function formatRelativeDate(
  dateString: string,
) {
  const date =
    new Date(
      dateString,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '';
  }

  const now =
    new Date();

  const today =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

  const targetDate =
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );

  const diff =
    Math.round(
      (
        today.getTime() -
        targetDate.getTime()
      ) /
        (
          1000 *
          60 *
          60 *
          24
        ),
    );

  if (
    diff === 0
  ) {
    return 'Hari ini';
  }

  if (
    diff === 1
  ) {
    return 'Kemarin';
  }

  if (
    diff > 1 &&
    diff < 7
  ) {
    return `${diff} hari lalu`;
  }

  return date.toLocaleDateString(
    'id-ID',
    {
      day: 'numeric',
      month: 'short',
    },
  );
}