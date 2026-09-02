'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import Link from 'next/link';

import Sidebar from '@/app/components/Sidebar';

import {
  AlertCircle,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  ExternalLink,
  FileText,
  HeartPulse,
  History,
  MoreHorizontal,
  Plane,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Utensils,
  WalletCards,
  XCircle,
} from 'lucide-react';

/* =========================================================
   TYPES
========================================================= */

type ReimbursementStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type ReimbursementType =
  | 'MEDICAL'
  | 'TRAVEL'
  | 'MEAL'
  | 'OTHER';

type ApprovalDecision =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

type WorkflowStatus =
  | 'NOT_STARTED'
  | 'TRIGGERED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED';

type ReimbursementPerson = {
  name: string;
  position?: string | null;
  department?: string | null;
};

type ReimbursementRequest = {
  id: string;
  requestCode: string;

  reimbursementType: ReimbursementType;
  expenseDate: string;

  amount: string;
  currency: string;

  merchant: string | null;
  reason: string;

  receiptUrl: string | null;
  receiptFileName: string | null;

  status: ReimbursementStatus;

  managerDecision: ApprovalDecision;
  managerDecisionNote: string | null;
  managerDecidedAt: string | null;

  policySource: string | null;

  workflowStatus: WorkflowStatus;
  workflowRunId: string | null;

  requestedAt: string;
  createdAt: string;
  updatedAt: string;

  manager: ReimbursementPerson | null;
};

type ReimbursementApiResponse = {
  success: boolean;
  data?: {
    count: number;
    requests: ReimbursementRequest[];
  };
  error?:
    | string
    | {
        code?: string;
        message?: string;
      };
};

type FilterStatus =
  | 'ALL'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'ATTENTION';

type StatusNotice = {
  requestCode: string;
  status: ReimbursementStatus;
  workflowStatus: WorkflowStatus;
  managerDecision: ApprovalDecision;
};

/* =========================================================
   HELPERS
========================================================= */

function getApiError(
  payload: ReimbursementApiResponse | null,
  fallback: string,
) {
  if (!payload?.error) {
    return fallback;
  }

  if (typeof payload.error === 'string') {
    return payload.error;
  }

  return payload.error.message || fallback;
}

function parseMoney(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatMoney(
  amount: string | number,
  currency = 'IDR',
) {
  const numeric =
    typeof amount === 'number'
      ? amount
      : parseMoney(amount);

  try {
    return new Intl.NumberFormat(
      'id-ID',
      {
        style: 'currency',
        currency,
        maximumFractionDigits:
          currency === 'IDR'
            ? 0
            : 2,
      },
    ).format(numeric);
  } catch {
    return `${currency} ${numeric.toLocaleString('id-ID')}`;
  }
}

function formatExpenseDate(
  value: string,
) {
  const dateOnly =
    value.slice(0, 10);

  const date =
    new Date(
      `${dateOnly}T00:00:00Z`,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '-';
  }

  return new Intl.DateTimeFormat(
    'id-ID',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    },
  ).format(date);
}

function formatDateTime(
  value: string | null,
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  return new Intl.DateTimeFormat(
    'id-ID',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone:
        'Asia/Jakarta',
    },
  ).format(date);
}

function formatLastUpdated(
  value: Date,
) {
  return new Intl.DateTimeFormat(
    'id-ID',
    {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone:
        'Asia/Jakarta',
    },
  ).format(value);
}


function isLiveWorkflow(
  request: ReimbursementRequest,
) {
  if (
    request.workflowStatus ===
      'TRIGGERED' ||
    request.workflowStatus ===
      'RUNNING'
  ) {
    return true;
  }

  return (
    request.status ===
      'PENDING' &&
    request.workflowStatus ===
      'NOT_STARTED'
  );
}

function getLiveProgress(
  request: ReimbursementRequest,
) {
  let progress = 25;

  if (
    request.workflowStatus !==
    'NOT_STARTED'
  ) {
    progress = 50;
  }

  if (
    request.managerDecision !==
    'PENDING'
  ) {
    progress = 75;
  }

  if (
    request.workflowStatus ===
    'COMPLETED'
  ) {
    progress = 100;
  }

  return progress;
}

function getLiveStateCopy(
  request: ReimbursementRequest,
) {
  if (
    request.workflowStatus ===
    'FAILED'
  ) {
    return {
      title:
        'Automation perlu perhatian',
      description:
        'Request tetap tersimpan, tetapi workflow approval mengalami kegagalan.',
    };
  }

  if (
    request.managerDecision ===
      'PENDING'
  ) {
    return {
      title:
        'Menunggu keputusan manager',
      description: request.manager
        ?.name
        ? `Approval sedang menunggu ${request.manager.name}.`
        : 'Approval sedang menunggu manager.',
    };
  }

  if (
    request.workflowStatus !==
    'COMPLETED'
  ) {
    return {
      title:
        'Menyelesaikan workflow',
      description:
        'Keputusan manager sudah diterima. Sistem sedang menyelesaikan notification dan callback.',
    };
  }

  return {
    title:
      'Workflow selesai',
    description:
      'Keputusan dan automation sudah tersinkron ke sistem.',
  };
}

function getTypeMeta(
  type: ReimbursementType,
) {
  switch (type) {
    case 'MEDICAL':
      return {
        label: 'Medical',
        icon: HeartPulse,
        style:
          'bg-rose-50 text-rose-600',
      };

    case 'TRAVEL':
      return {
        label: 'Travel',
        icon: Plane,
        style:
          'bg-blue-50 text-blue-600',
      };

    case 'MEAL':
      return {
        label: 'Meal',
        icon: Utensils,
        style:
          'bg-amber-50 text-amber-600',
      };

    case 'OTHER':
    default:
      return {
        label: 'Other',
        icon: MoreHorizontal,
        style:
          'bg-violet-50 text-violet-600',
      };
  }
}

function getStatusMeta(
  status: ReimbursementStatus,
) {
  switch (status) {
    case 'APPROVED':
      return {
        label: 'Disetujui',
        icon: CheckCircle2,
        badge:
          'border-emerald-100 bg-emerald-50 text-emerald-700',
      };

    case 'REJECTED':
      return {
        label: 'Ditolak',
        icon: XCircle,
        badge:
          'border-rose-100 bg-rose-50 text-rose-700',
      };

    case 'CANCELLED':
      return {
        label: 'Dibatalkan',
        icon: XCircle,
        badge:
          'border-gray-200 bg-gray-50 text-gray-500',
      };

    case 'DRAFT':
      return {
        label: 'Draft',
        icon: Circle,
        badge:
          'border-gray-200 bg-gray-50 text-gray-500',
      };

    case 'PENDING':
    default:
      return {
        label: 'Menunggu',
        icon: Clock3,
        badge:
          'border-amber-100 bg-amber-50 text-amber-700',
      };
  }
}

function getWorkflowMeta(
  status: WorkflowStatus,
) {
  switch (status) {
    case 'COMPLETED':
      return {
        label: 'Workflow selesai',
        icon: CheckCircle2,
        badge:
          'border-emerald-100 bg-emerald-50 text-emerald-700',
        soft:
          'bg-emerald-50 text-emerald-600',
      };

    case 'FAILED':
      return {
        label: 'Workflow gagal',
        icon: AlertCircle,
        badge:
          'border-rose-100 bg-rose-50 text-rose-700',
        soft:
          'bg-rose-50 text-rose-600',
      };

    case 'RUNNING':
      return {
        label: 'Workflow berjalan',
        icon: RefreshCw,
        badge:
          'border-blue-100 bg-blue-50 text-blue-700',
        soft:
          'bg-blue-50 text-blue-600',
      };

    case 'TRIGGERED':
      return {
        label: 'Workflow dipicu',
        icon: Clock3,
        badge:
          'border-amber-100 bg-amber-50 text-amber-700',
        soft:
          'bg-amber-50 text-amber-600',
      };

    case 'NOT_STARTED':
    default:
      return {
        label: 'Belum dimulai',
        icon: Circle,
        badge:
          'border-gray-200 bg-gray-50 text-gray-500',
        soft:
          'bg-gray-100 text-gray-500',
      };
  }
}

/* =========================================================
   PAGE
========================================================= */

export default function ReimbursementPage() {
  const [
    requests,
    setRequests,
  ] =
    useState<
      ReimbursementRequest[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    refreshError,
    setRefreshError,
  ] =
    useState<
      string | null
    >(null);

  const [
    lastUpdated,
    setLastUpdated,
  ] =
    useState<
      Date | null
    >(null);

  const [
    filter,
    setFilter,
  ] =
    useState<FilterStatus>(
      'ALL',
    );

  const [
    focusedRequestCode,
    setFocusedRequestCode,
  ] =
    useState<string | null>(
      null,
    );

  const [
    openedFromAI,
    setOpenedFromAI,
  ] =
    useState(false);

  const [
    focusedRequestLoading,
    setFocusedRequestLoading,
  ] =
    useState(false);

  const [
    focusedRequestError,
    setFocusedRequestError,
  ] =
    useState<string | null>(
      null,
    );

  const focusedRequestFetchRef =
    useRef<string | null>(
      null,
    );

  const [
    statusNotice,
    setStatusNotice,
  ] =
    useState<StatusNotice | null>(
      null,
    );

  const [
    isPageVisible,
    setIsPageVisible,
  ] =
    useState(true);

  const previousStateRef =
    useRef(
      new Map<
        string,
        {
          status: ReimbursementStatus;
          workflowStatus: WorkflowStatus;
          managerDecision: ApprovalDecision;
        }
      >(),
    );

  const requestInFlightRef =
    useRef(false);

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search,
      );

    const requestCode =
      params
        .get('request')
        ?.trim()
        .toUpperCase() ||
      null;

    if (
      requestCode &&
      /^RB-\d{8}-[A-Z0-9]{6}$/.test(
        requestCode,
      )
    ) {
      setFocusedRequestCode(
        requestCode,
      );

      setFilter('ALL');
    }

    setOpenedFromAI(
      params.get('from') ===
        'ai',
    );
  }, []);

  const loadRequests =
    useCallback(
      async (
        silent = false,
      ) => {
        if (
          requestInFlightRef.current
        ) {
          return;
        }

        requestInFlightRef.current =
          true;

        try {
          if (silent) {
            setRefreshing(
              true,
            );
            setRefreshError(
              null,
            );
          } else {
            setLoading(
              true,
            );
            setError(
              null,
            );
          }

          const response =
            await fetch(
              '/api/reimbursement?limit=30',
              {
                method:
                  'GET',
                cache:
                  'no-store',
              },
            );

          const payload =
            (await response.json()) as
              ReimbursementApiResponse;

          if (
            !response.ok ||
            payload.success !==
              true
          ) {
            throw new Error(
              getApiError(
                payload,
                'Gagal mengambil data reimbursement.',
              ),
            );
          }

          const nextRequests =
            Array.isArray(
              payload.data
                ?.requests,
            )
              ? payload.data!
                  .requests
              : [];

          if (
            silent &&
            previousStateRef.current
              .size > 0
          ) {
            for (
              const request of
              nextRequests
            ) {
              const previous =
                previousStateRef.current.get(
                  request.id,
                );

              if (
                previous &&
                (
                  previous.status !==
                    request.status ||
                  previous.workflowStatus !==
                    request.workflowStatus ||
                  previous.managerDecision !==
                    request.managerDecision
                )
              ) {
                setStatusNotice({
                  requestCode:
                    request.requestCode,
                  status:
                    request.status,
                  workflowStatus:
                    request.workflowStatus,
                  managerDecision:
                    request.managerDecision,
                });

                break;
              }
            }
          }

          previousStateRef.current =
            new Map(
              nextRequests.map(
                (request) => [
                  request.id,
                  {
                    status:
                      request.status,
                    workflowStatus:
                      request.workflowStatus,
                    managerDecision:
                      request.managerDecision,
                  },
                ],
              ),
            );

          setRequests(
            nextRequests,
          );

          setError(null);
          setRefreshError(
            null,
          );
          setLastUpdated(
            new Date(),
          );
        } catch (caught) {
          console.error(
            '[REIMBURSEMENT UI LOAD ERROR]',
            caught,
          );

          const message =
            caught instanceof
            Error
              ? caught.message
              : 'Gagal mengambil data reimbursement.';

          if (silent) {
            setRefreshError(
              message,
            );
          } else {
            setError(
              message,
            );
          }
        } finally {
          requestInFlightRef.current =
            false;

          setLoading(
            false,
          );
          setRefreshing(
            false,
          );
        }
      },
      [],
    );

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (
      !focusedRequestCode ||
      loading
    ) {
      return;
    }

    const existing =
      requests.some(
        (request) =>
          request.requestCode ===
          focusedRequestCode,
      );

    if (existing) {
      setFocusedRequestError(
        null,
      );

      return;
    }

    if (
      focusedRequestFetchRef.current ===
      focusedRequestCode
    ) {
      return;
    }

    focusedRequestFetchRef.current =
      focusedRequestCode;

    let cancelled =
      false;

    const loadFocusedRequest =
      async () => {
        try {
          setFocusedRequestLoading(
            true,
          );

          setFocusedRequestError(
            null,
          );

          const response =
            await fetch(
              `/api/reimbursement?requestId=${encodeURIComponent(
                focusedRequestCode,
              )}`,
              {
                method:
                  'GET',
                cache:
                  'no-store',
              },
            );

          const payload =
            (await response.json()) as {
              success: boolean;
              data?:
                ReimbursementRequest;
              error?:
                | string
                | {
                    code?:
                      string;
                    message?:
                      string;
                  };
            };

          if (
            !response.ok ||
            payload.success !==
              true ||
            !payload.data
          ) {
            throw new Error(
              typeof payload.error ===
                'string'
                ? payload.error
                : payload.error
                    ?.message ||
                  'Klaim reimbursement tidak ditemukan.',
            );
          }

          if (cancelled) {
            return;
          }

          const focused =
            payload.data;

          setRequests(
            (current) => [
              focused,
              ...current.filter(
                (request) =>
                  request.id !==
                    focused.id &&
                  request.requestCode !==
                    focused
                      .requestCode,
              ),
            ],
          );

          previousStateRef.current.set(
            focused.id,
            {
              status:
                focused.status,
              workflowStatus:
                focused.workflowStatus,
              managerDecision:
                focused.managerDecision,
            },
          );
        } catch (caught) {
          if (cancelled) {
            return;
          }

          console.error(
            '[REIMBURSEMENT FOCUSED REQUEST ERROR]',
            caught,
          );

          setFocusedRequestError(
            caught instanceof Error
              ? caught.message
              : 'Klaim reimbursement tidak ditemukan.',
          );
        } finally {
          if (!cancelled) {
            setFocusedRequestLoading(
              false,
            );
          }
        }
      };

    void loadFocusedRequest();

    return () => {
      cancelled =
        true;
    };
  }, [
    focusedRequestCode,
    loading,
    requests,
  ]);

  useEffect(() => {
    if (
      !focusedRequestCode
    ) {
      return;
    }

    if (
      filter !== 'ALL'
    ) {
      setFilter('ALL');
      return;
    }

    const exists =
      requests.some(
        (request) =>
          request.requestCode ===
          focusedRequestCode,
      );

    if (!exists) {
      return;
    }

    const timeout =
      window.setTimeout(
        () => {
          document
            .getElementById(
              `reimbursement-${focusedRequestCode}`,
            )
            ?.scrollIntoView({
              behavior:
                'smooth',
              block:
                'center',
            });
        },
        250,
      );

    return () => {
      window.clearTimeout(
        timeout,
      );
    };
  }, [
    filter,
    focusedRequestCode,
    requests,
  ]);

  const clearFocusedRequest =
    () => {
      setFocusedRequestCode(
        null,
      );

      setOpenedFromAI(
        false,
      );

      setFocusedRequestError(
        null,
      );

      focusedRequestFetchRef.current =
        null;

      const url =
        new URL(
          window.location.href,
        );

      url.searchParams.delete(
        'request',
      );

      url.searchParams.delete(
        'from',
      );

      window.history.replaceState(
        {},
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    };

  useEffect(() => {
    setIsPageVisible(
      !document.hidden,
    );

    const handleVisibilityChange =
      () => {
        const visible =
          !document.hidden;

        setIsPageVisible(
          visible,
        );

        if (visible) {
          void loadRequests(
            true,
          );
        }
      };

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange,
    );

    return () => {
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
      );
    };
  }, [loadRequests]);

  useEffect(() => {
    if (!statusNotice) {
      return;
    }

    const timeout =
      window.setTimeout(
        () => {
          setStatusNotice(
            null,
          );
        },
        5500,
      );

    return () => {
      window.clearTimeout(
        timeout,
      );
    };
  }, [statusNotice]);

  const filteredRequests =
    useMemo(() => {
      if (
        filter === 'ALL'
      ) {
        return requests;
      }

      if (
        filter ===
        'ATTENTION'
      ) {
        return requests.filter(
          (request) =>
            request.workflowStatus ===
            'FAILED',
        );
      }

      return requests.filter(
        (request) =>
          request.status ===
          filter,
      );
    }, [
      filter,
      requests,
    ]);

  const stats =
    useMemo(() => {
      const pending =
        requests.filter(
          (request) =>
            request.status ===
            'PENDING',
        );

      const approved =
        requests.filter(
          (request) =>
            request.status ===
            'APPROVED',
        );

      const rejected =
        requests.filter(
          (request) =>
            request.status ===
            'REJECTED',
        );

      const idrApprovedAmount =
        approved
          .filter(
            (request) =>
              request.currency ===
              'IDR',
          )
          .reduce(
            (
              total,
              request,
            ) =>
              total +
              parseMoney(
                request.amount,
              ),
            0,
          );

      const idrPendingAmount =
        pending
          .filter(
            (request) =>
              request.currency ===
              'IDR',
          )
          .reduce(
            (
              total,
              request,
            ) =>
              total +
              parseMoney(
                request.amount,
              ),
            0,
          );

      return {
        total:
          requests.length,
        pending:
          pending.length,
        approved:
          approved.length,
        rejected:
          rejected.length,
        liveWorkflows:
          requests.filter(
            isLiveWorkflow,
          ).length,
        failedWorkflows:
          requests.filter(
            (request) =>
              request.workflowStatus ===
              'FAILED',
          ).length,
        idrApprovedAmount,
        idrPendingAmount,
      };
    }, [requests]);

  const liveRequest =
    useMemo(
      () =>
        requests
          .filter(
            isLiveWorkflow,
          )
          .sort(
            (a, b) =>
              b.updatedAt.localeCompare(
                a.updatedAt,
              ),
          )[0] ?? null,
      [requests],
    );

  const hasLiveWorkflow =
    stats.liveWorkflows > 0;

  const pollIntervalMs =
    hasLiveWorkflow
      ? 5000
      : 20000;

  useEffect(() => {
    if (!isPageVisible) {
      return;
    }

    const interval =
      window.setInterval(
        () => {
          void loadRequests(
            true,
          );
        },
        pollIntervalMs,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    isPageVisible,
    loadRequests,
    pollIntervalMs,
  ]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f8fc] font-sans text-gray-800">
      <Sidebar />

      <main className="relative flex h-full flex-1 flex-col overflow-y-auto bg-[#f8f9fc]">
        {statusNotice && (
          <StatusChangeToast
            notice={
              statusNotice
            }
            onClose={() =>
              setStatusNotice(
                null,
              )
            }
          />
        )}

        {/* HEADER */}

        <header className="sticky top-0 z-30 flex min-h-20 shrink-0 items-center justify-between gap-4 border-b border-gray-200/70 bg-white/90 px-5 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold tracking-tight text-gray-950">
              Expenses & Claims
            </h2>

            <p className="mt-1 hidden text-sm text-gray-400 sm:block">
              Pantau reimbursement, approval, dan workflow klaim Anda
            </p>
          </div>

          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-md"
          >
            <Sparkles
              size={16}
            />

            <span className="hidden sm:inline">
              Ajukan via AI
            </span>

            <span className="sm:hidden">
              AI
            </span>
          </Link>
        </header>

        <div className="mx-auto w-full max-w-7xl space-y-7 p-5 pb-20 sm:p-6 lg:p-8">
          {/* TOOLBAR */}

          <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div>
                <p className="text-xs font-semibold text-gray-600">
                  {refreshing
                    ? 'Memperbarui data...'
                    : lastUpdated
                      ? `Diperbarui ${formatLastUpdated(
                          lastUpdated,
                        )}`
                      : 'Belum disinkronkan'}
                </p>

                <p className="mt-0.5 text-[10px] text-gray-400">
                  {isPageVisible
                    ? `Auto refresh ${
                        hasLiveWorkflow
                          ? '5 detik saat workflow aktif'
                          : '20 detik saat idle'
                      }`
                    : 'Auto refresh dijeda saat tab tidak aktif'}
                </p>
              </div>

              <span
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold ${
                  hasLiveWorkflow
                    ? 'border-blue-100 bg-blue-50 text-blue-700'
                    : 'border-emerald-100 bg-emerald-50 text-emerald-700'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    hasLiveWorkflow
                      ? 'animate-pulse bg-blue-500'
                      : 'bg-emerald-500'
                  }`}
                />
                {hasLiveWorkflow
                  ? `${stats.liveWorkflows} workflow live`
                  : 'Data tersinkron'}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadRequests(
                  true,
                )
              }
              disabled={
                refreshing
              }
              className="flex w-fit items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-gray-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-60"
            >
              <RefreshCw
                size={14}
                className={
                  refreshing
                    ? 'animate-spin'
                    : ''
                }
              />

              Refresh
            </button>
          </section>

          {refreshError &&
            !loading && (
              <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <AlertCircle
                    size={18}
                    className="mt-0.5 shrink-0 text-amber-600"
                  />

                  <div>
                    <p className="text-xs font-bold text-amber-800">
                      Refresh otomatis gagal
                    </p>

                    <p className="mt-1 text-xs leading-5 text-amber-700">
                      Data terakhir tetap ditampilkan. {refreshError}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void loadRequests(
                      true,
                    )
                  }
                  disabled={
                    refreshing
                  }
                  className="shrink-0 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                >
                  Coba lagi
                </button>
              </div>
            )}

          {/* HERO */}

          <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#171443] via-indigo-800 to-violet-700 px-7 py-8 text-white shadow-xl shadow-indigo-950/10 lg:px-9 lg:py-9">
            <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

            <div className="absolute bottom-0 right-1/3 h-44 w-44 rounded-full bg-violet-300/10 blur-3xl" />

            <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-center">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-100 backdrop-blur">
                  <WalletCards
                    size={14}
                  />
                  Reimbursement
                </div>

                <h1 className="max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">
                  Klaim yang transparan, dari request sampai keputusan.
                </h1>

                <p className="mt-3 max-w-2xl text-sm leading-6 text-indigo-100/70">
                  Lihat nominal, policy source, keputusan manager, dan status automation untuk setiap reimbursement Anda.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/"
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-indigo-700 shadow-lg transition hover:bg-indigo-50"
                >
                  <Sparkles
                    size={17}
                  />
                  Ajukan lewat AI
                </Link>

                <a
                  href="#reimbursement-history"
                  className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
                >
                  <History
                    size={16}
                  />
                  Lihat riwayat
                </a>
              </div>
            </div>
          </section>

          {/* LIVE WORKFLOW */}

          {!loading &&
            liveRequest && (
              <LiveWorkflowPanel
                request={
                  liveRequest
                }
                refreshing={
                  refreshing
                }
                onRefresh={() =>
                  void loadRequests(
                    true,
                  )
                }
              />
            )}

          {!loading &&
            stats.failedWorkflows >
              0 && (
              <AttentionBanner
                count={
                  stats.failedWorkflows
                }
                onShow={() =>
                  setFilter(
                    'ATTENTION',
                  )
                }
              />
            )}

          {/* SUMMARY */}

          {loading ? (
            <SummarySkeleton />
          ) : (
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryCard
                icon={
                  WalletCards
                }
                label="Total Klaim"
                value={
                  stats.total
                }
                description={`${stats.total} reimbursement tercatat`}
                style="bg-indigo-50 text-indigo-600"
              />

              <SummaryCard
                icon={Clock3}
                label="Menunggu"
                value={
                  stats.pending
                }
                description={
                  stats.idrPendingAmount >
                  0
                    ? formatMoney(
                        stats.idrPendingAmount,
                      )
                    : 'Tidak ada nilai pending IDR'
                }
                style="bg-amber-50 text-amber-600"
              />

              <SummaryCard
                icon={
                  CheckCircle2
                }
                label="Disetujui"
                value={
                  stats.approved
                }
                description={
                  stats.idrApprovedAmount >
                  0
                    ? formatMoney(
                        stats.idrApprovedAmount,
                      )
                    : 'Belum ada nominal approved IDR'
                }
                style="bg-emerald-50 text-emerald-600"
              />

              <SummaryCard
                icon={
                  XCircle
                }
                label="Ditolak"
                value={
                  stats.rejected
                }
                description={`${stats.rejected} klaim ditolak`}
                style="bg-rose-50 text-rose-600"
              />
            </section>
          )}

          {/* AI POLICY NOTE */}

          <section className="relative overflow-hidden rounded-[26px] border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                  <Sparkles
                    size={19}
                  />
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-500">
                    Policy-aware workflow
                  </p>

                  <h3 className="mt-1 font-bold text-gray-950">
                    Pengajuan baru dimulai dari People Assistant
                  </h3>

                  <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">
                    AI memeriksa policy dan data klaim sebelum membuat request. Beberapa kategori dapat membutuhkan verifikasi atau human review tambahan.
                  </p>
                </div>
              </div>

              <Link
                href="/"
                className="flex w-fit shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
              >
                Buka AI Assistant
                <ArrowUpRight
                  size={14}
                />
              </Link>
            </div>
          </section>

          {/* HISTORY */}

          <section
            id="reimbursement-history"
            className="scroll-mt-28"
          >
            {focusedRequestCode && (
              <AIFocusedClaimBanner
                requestCode={
                  focusedRequestCode
                }
                openedFromAI={
                  openedFromAI
                }
                loading={
                  focusedRequestLoading
                }
                error={
                  focusedRequestError
                }
                found={requests.some(
                  (request) =>
                    request.requestCode ===
                    focusedRequestCode,
                )}
                onClose={
                  clearFocusedRequest
                }
              />
            )}

            <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <div className="flex items-center gap-2">
                  <History
                    size={19}
                    className="text-indigo-600"
                  />

                  <h3 className="text-lg font-bold text-gray-950">
                    Riwayat Reimbursement
                  </h3>
                </div>

                <p className="mt-1 text-sm text-gray-400">
                  Pantau request, approval, dan workflow terbaru.
                </p>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
                  <SlidersHorizontal
                    size={15}
                  />
                </div>

                <FilterButton
                  label="Semua"
                  active={
                    filter ===
                    'ALL'
                  }
                  onClick={() =>
                    setFilter(
                      'ALL',
                    )
                  }
                />

                <FilterButton
                  label="Pending"
                  active={
                    filter ===
                    'PENDING'
                  }
                  onClick={() =>
                    setFilter(
                      'PENDING',
                    )
                  }
                />

                <FilterButton
                  label="Approved"
                  active={
                    filter ===
                    'APPROVED'
                  }
                  onClick={() =>
                    setFilter(
                      'APPROVED',
                    )
                  }
                />

                <FilterButton
                  label="Rejected"
                  active={
                    filter ===
                    'REJECTED'
                  }
                  onClick={() =>
                    setFilter(
                      'REJECTED',
                    )
                  }
                />

                <FilterButton
                  label={
                    stats.failedWorkflows >
                    0
                      ? `Perlu perhatian (${stats.failedWorkflows})`
                      : 'Perlu perhatian'
                  }
                  active={
                    filter ===
                    'ATTENTION'
                  }
                  onClick={() =>
                    setFilter(
                      'ATTENTION',
                    )
                  }
                />
              </div>
            </div>

            {loading ? (
              <HistorySkeleton />
            ) : error &&
              requests.length ===
                0 ? (
              <SectionError
                message={
                  error
                }
                onRetry={() =>
                  void loadRequests()
                }
              />
            ) : filteredRequests.length ===
              0 ? (
              <EmptyState
                filter={
                  filter
                }
              />
            ) : (
              <div className="space-y-4">
                {filteredRequests.map(
                  (
                    request,
                  ) => (
                    <ReimbursementCard
                      key={
                        request.id
                      }
                      request={
                        request
                      }
                      initiallyExpanded={
                        focusedRequestCode ===
                        request.requestCode
                      }
                      highlighted={
                        focusedRequestCode ===
                        request.requestCode
                      }
                    />
                  ),
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

/* =========================================================
   LIVE WORKFLOW
========================================================= */

function LiveWorkflowPanel({
  request,
  refreshing,
  onRefresh,
}: {
  request: ReimbursementRequest;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const type =
    getTypeMeta(
      request.reimbursementType,
    );

  const TypeIcon =
    type.icon;

  const state =
    getLiveStateCopy(
      request,
    );

  const progress =
    getLiveProgress(
      request,
    );

  return (
    <section className="overflow-hidden rounded-[26px] border border-blue-100 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-5 border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-5 py-5 sm:px-6 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ${type.style}`}
          >
            <TypeIcon
              size={19}
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[10px] font-bold text-blue-700">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                LIVE WORKFLOW
              </span>

              <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                {
                  request.requestCode
                }
              </span>
            </div>

            <h3 className="mt-2 text-base font-bold text-gray-950">
              {
                state.title
              }
            </h3>

            <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">
              {
                state.description
              }
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={
            onRefresh
          }
          disabled={
            refreshing
          }
          className="flex w-fit shrink-0 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60"
        >
          <RefreshCw
            size={14}
            className={
              refreshing
                ? 'animate-spin'
                : ''
            }
          />
          Update sekarang
        </button>
      </div>

      <div className="grid gap-5 px-5 py-5 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-gray-700">
              Progress automation
            </p>

            <p className="text-xs font-bold text-indigo-600">
              {progress}%
            </p>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{
                width: `${progress}%`,
              }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] sm:grid-cols-4">
            <LiveStage
              label="Submitted"
              done
            />

            <LiveStage
              label="Workflow"
              done={
                request.workflowStatus !==
                'NOT_STARTED'
              }
              current={
                request.workflowStatus ===
                  'TRIGGERED' ||
                request.workflowStatus ===
                  'RUNNING'
              }
            />

            <LiveStage
              label="Manager"
              done={
                request.managerDecision !==
                'PENDING'
              }
              current={
                request.managerDecision ===
                'PENDING'
              }
            />

            <LiveStage
              label="Final sync"
              done={
                request.workflowStatus ===
                'COMPLETED'
              }
              current={
                request.managerDecision !==
                  'PENDING' &&
                request.workflowStatus !==
                  'COMPLETED'
              }
            />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 lg:min-w-52">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Nilai klaim
          </p>

          <p className="mt-1 text-lg font-black text-gray-950">
            {formatMoney(
              request.amount,
              request.currency,
            )}
          </p>

          <p className="mt-1 text-[11px] text-gray-400">
            {type.label} ·{' '}
            {formatExpenseDate(
              request.expenseDate,
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

function LiveStage({
  label,
  done = false,
  current = false,
}: {
  label: string;
  done?: boolean;
  current?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
        done
          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
          : current
            ? 'border-blue-100 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-gray-50 text-gray-400'
      }`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          done
            ? 'bg-emerald-500'
            : current
              ? 'animate-pulse bg-blue-500'
              : 'bg-gray-300'
        }`}
      />

      <span className="font-bold">
        {label}
      </span>
    </div>
  );
}

function AttentionBanner({
  count,
  onShow,
}: {
  count: number;
  onShow: () => void;
}) {
  return (
    <section className="flex flex-col justify-between gap-4 rounded-[22px] border border-rose-100 bg-rose-50 px-5 py-4 sm:flex-row sm:items-center">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rose-600 shadow-sm">
          <AlertCircle
            size={17}
          />
        </div>

        <div>
          <p className="text-sm font-bold text-rose-800">
            {count} workflow perlu perhatian
          </p>

          <p className="mt-1 text-xs leading-5 text-rose-600">
            Status bisnis request tetap terpisah dari status automation. Review workflow gagal tanpa menganggap klaim otomatis ditolak.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={
          onShow
        }
        className="w-fit shrink-0 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
      >
        Lihat workflow
      </button>
    </section>
  );
}

function StatusChangeToast({
  notice,
  onClose,
}: {
  notice: StatusNotice;
  onClose: () => void;
}) {
  const status =
    getStatusMeta(
      notice.status,
    );

  const workflow =
    getWorkflowMeta(
      notice.workflowStatus,
    );

  const StatusIcon =
    status.icon;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] w-[calc(100%-2rem)] max-w-sm sm:right-6 sm:top-6">
      <div className="pointer-events-auto rounded-2xl border border-indigo-100 bg-white p-4 shadow-2xl shadow-indigo-950/10">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <StatusIcon
              size={18}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">
                  Live update
                </p>

                <p className="mt-1 text-sm font-bold text-gray-950">
                  {notice.requestCode}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  onClose
                }
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Tutup notifikasi"
              >
                <XCircle
                  size={15}
                />
              </button>
            </div>

            <p className="mt-2 text-xs leading-5 text-gray-500">
              Business status{' '}
              <strong className="font-bold text-gray-700">
                {status.label}
              </strong>
              {' · '}
              {workflow.label}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SUMMARY
========================================================= */

function SummaryCard({
  icon: Icon,
  label,
  value,
  description,
  style,
}: {
  icon: typeof WalletCards;
  label: string;
  value: number;
  description: string;
  style: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md lg:p-5">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${style}`}
      >
        <Icon size={18} />
      </div>

      <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {label}
      </p>

      <h4 className="mt-1 text-xl font-bold text-gray-950">
        {value}
      </h4>

      <p className="mt-1 hidden text-xs text-gray-400 sm:block">
        {description}
      </p>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map(
        (item) => (
          <div
            key={item}
            className="animate-pulse rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm lg:p-5"
          >
            <div className="h-10 w-10 rounded-xl bg-gray-100" />
            <div className="mt-4 h-2.5 w-24 rounded bg-gray-100" />
            <div className="mt-3 h-6 w-10 rounded bg-gray-100" />
            <div className="mt-3 h-2.5 w-28 rounded bg-gray-100" />
          </div>
        ),
      )}
    </section>
  );
}

/* =========================================================
   AI FOCUSED CLAIM
========================================================= */

function AIFocusedClaimBanner({
  requestCode,
  openedFromAI,
  loading,
  error,
  found,
  onClose,
}: {
  requestCode: string;
  openedFromAI: boolean;
  loading: boolean;
  error: string | null;
  found: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={`mb-5 rounded-[22px] border px-5 py-4 ${
        error
          ? 'border-rose-200 bg-rose-50'
          : 'border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50'
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ${
              error
                ? 'text-rose-600'
                : 'text-indigo-600'
            }`}
          >
            {loading ? (
              <RefreshCw
                size={17}
                className="animate-spin"
              />
            ) : error ? (
              <AlertCircle
                size={17}
              />
            ) : (
              <Sparkles
                size={17}
              />
            )}
          </div>

          <div className="min-w-0">
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
                error
                  ? 'text-rose-500'
                  : 'text-indigo-500'
              }`}
            >
              {openedFromAI
                ? 'Dibuka dari People Assistant'
                : 'Focused reimbursement'}
            </p>

            <p
              className={`mt-1 text-sm font-bold ${
                error
                  ? 'text-rose-800'
                  : 'text-gray-950'
              }`}
            >
              {loading
                ? `Mencari ${requestCode}...`
                : error
                  ? `Klaim ${requestCode} belum dapat dibuka`
                  : `Klaim ${requestCode} siap dipantau`}
            </p>

            <p
              className={`mt-1 text-xs leading-5 ${
                error
                  ? 'text-rose-600'
                  : 'text-gray-500'
              }`}
            >
              {error
                ? error
                : found
                  ? 'Detail klaim otomatis dibuka. Status approval dan workflow akan terus diperbarui dari data transaksi.'
                  : 'Mengambil detail klaim langsung dari server...'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={
            onClose
          }
          className={`w-fit shrink-0 rounded-xl border bg-white px-3 py-2 text-xs font-semibold transition ${
            error
              ? 'border-rose-200 text-rose-700 hover:bg-rose-100'
              : 'border-indigo-200 text-indigo-700 hover:bg-indigo-100'
          }`}
        >
          Tutup fokus
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   FILTER
========================================================= */

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
        active
          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
          : 'border border-gray-200 bg-white text-gray-500 hover:border-indigo-200 hover:text-indigo-600'
      }`}
    >
      {label}
    </button>
  );
}

/* =========================================================
   CARD
========================================================= */

function ReimbursementCard({
  request,
  initiallyExpanded = false,
  highlighted = false,
}: {
  request: ReimbursementRequest;
  initiallyExpanded?: boolean;
  highlighted?: boolean;
}) {
  const [
    expanded,
    setExpanded,
  ] =
    useState(
      initiallyExpanded,
    );

  useEffect(() => {
    if (
      initiallyExpanded
    ) {
      setExpanded(true);
    }
  }, [
    initiallyExpanded,
  ]);

  const status =
    getStatusMeta(
      request.status,
    );

  const workflow =
    getWorkflowMeta(
      request.workflowStatus,
    );

  const type =
    getTypeMeta(
      request.reimbursementType,
    );

  const TypeIcon =
    type.icon;

  const StatusIcon =
    status.icon;

  const WorkflowIcon =
    workflow.icon;

  const managerDecisionAt =
    formatDateTime(
      request.managerDecidedAt,
    );

  const submittedAt =
    formatDateTime(
      request.requestedAt,
    );

  return (
    <article
      id={`reimbursement-${request.requestCode}`}
      className={`scroll-mt-28 overflow-hidden rounded-[26px] border bg-white transition ${
        highlighted
          ? 'border-indigo-300 ring-2 ring-indigo-200 shadow-lg shadow-indigo-100/70'
          : 'border-gray-200/80 shadow-sm hover:border-indigo-100 hover:shadow-md'
      }`}
    >
      <button
        type="button"
        onClick={() =>
          setExpanded(
            (current) =>
              !current,
          )
        }
        className="group flex w-full flex-col gap-5 px-5 py-5 text-left sm:px-6 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="flex min-w-0 flex-1 gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${type.style}`}
          >
            <TypeIcon
              size={20}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-bold text-gray-950">
                {
                  request.requestCode
                }
              </h4>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${status.badge}`}
              >
                <StatusIcon
                  size={11}
                />
                {status.label}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${workflow.badge}`}
              >
                <WorkflowIcon
                  size={11}
                  className={
                    request.workflowStatus ===
                    'RUNNING'
                      ? 'animate-spin'
                      : ''
                  }
                />
                {
                  workflow.label
                }
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span className="font-bold text-gray-800">
                {formatMoney(
                  request.amount,
                  request.currency,
                )}
              </span>

              <span className="h-1 w-1 rounded-full bg-gray-300" />

              <span>
                {
                  type.label
                }
              </span>

              <span className="h-1 w-1 rounded-full bg-gray-300" />

              <span>
                {formatExpenseDate(
                  request.expenseDate,
                )}
              </span>

              {request.merchant && (
                <>
                  <span className="h-1 w-1 rounded-full bg-gray-300" />

                  <span className="max-w-56 truncate">
                    {
                      request.merchant
                    }
                  </span>
                </>
              )}
            </div>

            <p className="mt-2 max-w-3xl text-xs leading-5 text-gray-400">
              {
                request.reason
              }
            </p>

            {request.workflowStatus ===
              'FAILED' && (
              <div className="mt-3 flex max-w-3xl items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5">
                <AlertCircle
                  size={14}
                  className="mt-0.5 shrink-0 text-rose-500"
                />

                <p className="text-[11px] leading-5 text-rose-700">
                  Request tetap tersimpan, tetapi automation approval mengalami kegagalan dan perlu ditangani.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-full shrink-0 items-center justify-between gap-4 border-t border-gray-100 pt-4 lg:w-auto lg:border-0 lg:pt-0">
          {isLiveWorkflow(
            request,
          ) && (
            <span className="hidden items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700 xl:inline-flex">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              Live
            </span>
          )}

          <div className="lg:text-right">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
              Manager
            </p>

            <p className="mt-1 text-sm font-bold text-gray-800">
              {request.manager
                ?.name ||
                'Belum ditetapkan'}
            </p>

            <p className="mt-0.5 text-[11px] text-gray-400">
              {request.managerDecision ===
              'APPROVED'
                ? 'Approved'
                : request.managerDecision ===
                    'REJECTED'
                  ? 'Rejected'
                  : 'Waiting decision'}
            </p>
          </div>

          <ChevronRight
            size={18}
            className={`shrink-0 text-gray-300 transition ${
              expanded
                ? 'rotate-90 text-indigo-500'
                : 'group-hover:translate-x-0.5 group-hover:text-indigo-500'
            }`}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-6 sm:px-6">
          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-gray-200/80 bg-white p-5">
              <div className="mb-5">
                <p className="text-sm font-bold text-gray-900">
                  Approval Timeline
                </p>

                <p className="mt-1 text-xs text-gray-400">
                  Proses request sampai keputusan akhir.
                </p>
              </div>

              <ReimbursementTimeline
                request={
                  request
                }
              />
            </div>

            <div className="space-y-3">
              <MetaCard
                label="Policy Source"
                value={
                  request.policySource ||
                  '-'
                }
                description="Policy yang digunakan saat validasi request."
                icon={FileText}
                style="bg-violet-50 text-violet-600"
              />

              <MetaCard
                label="Manager"
                value={
                  request.manager
                    ?.name ||
                  'Belum ditetapkan'
                }
                description={
                  request.manager
                    ?.position ||
                  'Approval owner'
                }
                icon={
                  BriefcaseBusiness
                }
                style="bg-indigo-50 text-indigo-600"
              />

              <MetaCard
                label="Workflow"
                value={
                  workflow.label
                }
                description={
                  request.workflowStatus ===
                  'COMPLETED'
                    ? 'Automation approval telah selesai.'
                    : request.workflowStatus ===
                        'FAILED'
                      ? 'Automation mengalami kegagalan.'
                      : 'Automation masih diproses.'
                }
                icon={
                  workflow.icon
                }
                style={
                  workflow.soft
                }
              />

              <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                  Detail Waktu
                </p>

                <div className="mt-3 space-y-2 text-xs text-gray-500">
                  <div className="flex items-center justify-between gap-3">
                    <span>Diajukan</span>
                    <strong className="text-right font-semibold text-gray-700">
                      {submittedAt ||
                        '-'}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span>Keputusan manager</span>
                    <strong className="text-right font-semibold text-gray-700">
                      {managerDecisionAt ||
                        '-'}
                    </strong>
                  </div>

                  {request.workflowRunId && (
                    <div className="flex items-center justify-between gap-3">
                      <span>
                        Workflow Run ID
                      </span>
                      <strong className="font-semibold text-gray-700">
                        {
                          request.workflowRunId
                        }
                      </strong>
                    </div>
                  )}
                </div>
              </div>

              {request.receiptUrl && (
                <a
                  href={
                    request.receiptUrl
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200/80 bg-white p-4 transition hover:border-indigo-200"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <FileText
                        size={16}
                      />
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                        Receipt
                      </p>

                      <p className="mt-1 truncate text-sm font-bold text-gray-900">
                        {request.receiptFileName ||
                          'Buka bukti transaksi'}
                      </p>
                    </div>
                  </div>

                  <ExternalLink
                    size={15}
                    className="shrink-0 text-gray-400"
                  />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

/* =========================================================
   TIMELINE
========================================================= */

function ReimbursementTimeline({
  request,
}: {
  request: ReimbursementRequest;
}) {
  const managerRejected =
    request.managerDecision ===
    'REJECTED';

  const managerApproved =
    request.managerDecision ===
    'APPROVED';

  const workflowStarted =
    request.workflowStatus !==
    'NOT_STARTED';

  const workflowFailed =
    request.workflowStatus ===
    'FAILED';

  const workflowCompleted =
    request.workflowStatus ===
    'COMPLETED';

  const managerDescription =
    managerRejected
      ? request.managerDecisionNote ||
        'Pengajuan ditolak oleh manager.'
      : managerApproved
        ? request.managerDecisionNote ||
          'Manager telah menyetujui reimbursement.'
        : workflowFailed
          ? 'Workflow approval gagal sebelum keputusan manager selesai.'
          : `Menunggu keputusan ${
              request.manager
                ?.name ||
              'manager'
            }.`;

  return (
    <div>
      <TimelineStep
        state="done"
        title="Request submitted"
        description={`Reimbursement ${request.requestCode} berhasil dibuat.`}
      />

      <TimelineStep
        state={
          workflowFailed
            ? 'rejected'
            : workflowStarted
              ? 'done'
              : 'current'
        }
        title="Approval workflow"
        description={
          workflowFailed
            ? 'Automation approval gagal dan membutuhkan perhatian.'
            : workflowStarted
              ? `Automation sudah dimulai · ${getWorkflowMeta(
                  request.workflowStatus,
                ).label}.`
              : 'Menunggu automation approval dimulai.'
        }
      />

      <TimelineStep
        state={
          managerRejected
            ? 'rejected'
            : managerApproved
              ? 'done'
              : workflowFailed
                ? 'disabled'
                : 'current'
        }
        title={
          request.manager
            ?.name
            ? `${request.manager.name} · Manager Decision`
            : 'Manager Decision'
        }
        description={
          managerDescription
        }
      />

      <TimelineStep
        last
        state={
          workflowCompleted
            ? 'done'
            : workflowFailed
              ? 'rejected'
              : request.managerDecision !==
                  'PENDING'
                ? 'current'
                : 'disabled'
        }
        title="Final sync"
        description={
          workflowCompleted
            ? `Business status ${request.status} dan workflow telah tersinkron.`
            : workflowFailed
              ? 'Final callback belum selesai karena automation gagal.'
              : request.managerDecision !==
                  'PENDING'
                ? 'Keputusan manager sudah ada. Menyelesaikan notification dan workflow callback.'
                : 'Menunggu keputusan manager sebelum final sync.'
        }
      />
    </div>
  );
}

function TimelineStep({
  state,
  title,
  description,
  last = false,
}: {
  state:
    | 'done'
    | 'current'
    | 'rejected'
    | 'disabled';
  title: string;
  description: string;
  last?: boolean;
}) {
  const icon =
    state ===
    'done' ? (
      <CheckCircle2
        size={17}
      />
    ) : state ===
      'rejected' ? (
      <XCircle
        size={17}
      />
    ) : state ===
      'current' ? (
      <Clock3
        size={17}
      />
    ) : (
      <Circle
        size={17}
      />
    );

  const style =
    state ===
    'done'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
      : state ===
          'rejected'
        ? 'border-rose-200 bg-rose-50 text-rose-600'
        : state ===
            'current'
          ? 'border-amber-200 bg-amber-50 text-amber-600'
          : 'border-gray-200 bg-gray-50 text-gray-300';

  return (
    <div className="relative flex gap-4">
      <div className="relative flex flex-col items-center">
        <div
          className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border ${style}`}
        >
          {icon}
        </div>

        {!last && (
          <div className="min-h-12 w-px flex-1 bg-gray-200" />
        )}
      </div>

      <div
        className={
          last
            ? 'pb-0 pt-1'
            : 'pb-6 pt-1'
        }
      >
        <p className="text-sm font-bold text-gray-800">
          {title}
        </p>

        <p className="mt-1 text-xs leading-5 text-gray-400">
          {description}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   META / EMPTY / ERROR
========================================================= */

function MetaCard({
  label,
  value,
  description,
  icon: Icon,
  style,
}: {
  label: string;
  value: string;
  description: string;
  icon: typeof FileText;
  style: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style}`}
        >
          <Icon size={16} />
        </div>

        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
            {label}
          </p>

          <p className="mt-1 truncate text-sm font-bold text-gray-900">
            {value}
          </p>

          <p className="mt-1 text-xs leading-5 text-gray-400">
            {
              description
            }
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-[26px] border border-rose-100 bg-rose-50 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle
            size={20}
            className="mt-0.5 shrink-0 text-rose-500"
          />

          <div>
            <p className="text-sm font-bold text-rose-700">
              Reimbursement belum dapat dimuat
            </p>

            <p className="mt-1 text-xs leading-5 text-rose-600">
              {message}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRetry}
          className="w-fit shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          Coba lagi
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  filter,
}: {
  filter: FilterStatus;
}) {
  const label =
    filter === 'ALL'
      ? 'Belum ada reimbursement'
      : filter ===
          'ATTENTION'
        ? 'Tidak ada workflow yang perlu perhatian'
        : `Tidak ada reimbursement ${filter.toLowerCase()}`;

  return (
    <div className="rounded-[26px] border border-gray-200 bg-white px-6 py-16 text-center shadow-sm">
      <WalletCards
        size={34}
        className="mx-auto text-gray-300"
      />

      <p className="mt-3 text-sm font-semibold text-gray-700">
        {label}
      </p>

      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-gray-400">
        Pengajuan reimbursement yang dibuat melalui People Assistant akan muncul di halaman ini.
      </p>

      <Link
        href="/"
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
      >
        <Sparkles
          size={14}
        />
        Ajukan via AI
      </Link>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map(
        (item) => (
          <div
            key={item}
            className="animate-pulse rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm"
          >
            <div className="flex gap-4">
              <div className="h-12 w-12 shrink-0 rounded-2xl bg-gray-100" />

              <div className="flex-1">
                <div className="flex gap-2">
                  <div className="h-4 w-40 rounded bg-gray-100" />
                  <div className="h-5 w-20 rounded-full bg-gray-100" />
                </div>

                <div className="mt-3 h-3 w-72 max-w-full rounded bg-gray-100" />

                <div className="mt-3 h-3 w-2/3 rounded bg-gray-100" />
              </div>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

