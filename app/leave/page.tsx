'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import Link from 'next/link';

import Sidebar from '@/app/components/Sidebar';

import {
  CalendarClock,
  Clock,
  CalendarDays,
  Plus,
  CheckCircle2,
  Clock3,
  XCircle,
  ChevronRight,
  FileText,
  WalletCards,
  Sparkles,
  CalendarCheck,
  Umbrella,
  HeartPulse,
  BriefcaseBusiness,
  ArrowUpRight,
  X,
  Send,
  Info,
  SlidersHorizontal,
  History,
  Timer,
  Plane,
  RefreshCw,
  Circle,
  AlertCircle,
} from 'lucide-react';

/* =========================================================
   TYPES
========================================================= */

type LeaveStatus =
  | 'Approved'
  | 'Pending'
  | 'Rejected'
  | 'Cancelled';

type LeaveType =
  | 'Cuti Tahunan'
  | 'Cuti Sakit'
  | 'Cuti Khusus'
  | 'Cuti Tanpa Bayar';

type ApiLeaveStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type ApiLeaveType =
  | 'ANNUAL'
  | 'SICK'
  | 'SPECIAL'
  | 'UNPAID';

type LeavePerson = {
  id: string;
  name: string;
  email?: string | null;
  position?: string | null;
  department?: string | null;
};

type LeaveRequest = {
  id: string;
  requestCode: string;

  employeeId: string;
  managerId: string | null;

  leaveType: ApiLeaveType;

  startDate: string;
  endDate: string;
  totalDays: number;

  reason: string | null;

  status: ApiLeaveStatus;

  managerDecision:
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED';

  managerDecisionNote: string | null;
  managerDecidedAt: string | null;

  policySource: string | null;

  workflowStatus: WorkflowStatus;
  workflowRunId: string | null;

  requestedAt: string;
  createdAt: string;
  updatedAt: string;

  employee?: LeavePerson;
  manager?: LeavePerson | null;
};

type LeaveItem = {
  id: string;
  requestCode: string;

  type: LeaveType;

  startDate: string;
  endDate: string;

  dateLabel: string;

  days: number;

  status: LeaveStatus;

  note: string;

  submittedAt: string;

  workflowStatus: WorkflowStatus;
  workflowRunId: string | null;

  managerName: string | null;
  managerDecision:
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED';
  managerDecisionNote: string | null;
  managerDecidedAt: string | null;

  policySource: string | null;
};

type LeaveBalanceItem = {
  leaveType: ApiLeaveType;

  balanceConfigured: boolean;

  entitlementDays: number | null;
  approvedDays: number;
  pendingDays: number;
  availableDays: number | null;
};

type LeaveBalanceResponse = {
  employee: {
    id: string;
    name: string;
  };

  year: number;

  balances: LeaveBalanceItem[];
};

type OvertimeStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type ApprovalDecision =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | null;

type OvertimeApprovalStage =
  | 'MANAGER'
  | 'SECOND_APPROVER'
  | 'COMPLETED';

type WorkflowStatus =
  | 'NOT_STARTED'
  | 'TRIGGERED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED';

type OvertimePerson = {
  id: string;
  name: string;
  email?: string;
  position?: string;
  department?: string;
};

type OvertimeRequest = {
  id: string;
  requestCode: string;

  employeeId: string;
  managerId: string | null;

  startAt: string;
  endAt: string;
  timezone: string;

  durationMinutes: number;

  reason: string;
  projectName: string | null;
  taskReference: string | null;

  status: OvertimeStatus;
  approvalStage: OvertimeApprovalStage;

  requiresSecondApproval: boolean;

  managerDecision: ApprovalDecision;
  managerDecisionNote: string | null;
  managerDecidedAt: string | null;

  secondApproverId: string | null;
  secondDecision: ApprovalDecision;
  secondDecisionNote: string | null;
  secondDecidedAt: string | null;

  workflowStatus: WorkflowStatus;

  requestedAt: string;
  createdAt: string;
  updatedAt: string;

  manager?: OvertimePerson | null;
  secondApprover?: OvertimePerson | null;
};

function mapLeaveStatus(
  status: ApiLeaveStatus,
): LeaveStatus {
  switch (status) {
    case 'APPROVED':
      return 'Approved';

    case 'REJECTED':
      return 'Rejected';

    case 'CANCELLED':
      return 'Cancelled';

    case 'DRAFT':
    case 'PENDING':
    default:
      return 'Pending';
  }
}

function mapLeaveType(
  type: ApiLeaveType,
): LeaveType {
  switch (type) {
    case 'SICK':
      return 'Cuti Sakit';

    case 'SPECIAL':
      return 'Cuti Khusus';

    case 'UNPAID':
      return 'Cuti Tanpa Bayar';

    case 'ANNUAL':
    default:
      return 'Cuti Tahunan';
  }
}

function formatLeaveDateOnly(
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

function formatLeaveDateTime(
  value: string | null,
) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

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
      timeZone: 'Asia/Jakarta',
    },
  ).format(date);
}

function formatLeaveDateRange(
  startDate: string,
  endDate: string,
) {
  const start =
    formatLeaveDateOnly(
      startDate,
    );

  const end =
    formatLeaveDateOnly(
      endDate,
    );

  if (
    startDate.slice(0, 10) ===
    endDate.slice(0, 10)
  ) {
    return start;
  }

  return `${start} - ${end}`;
}

function mapLeaveRequest(
  request: LeaveRequest,
): LeaveItem {
  return {
    id: request.id,

    requestCode:
      request.requestCode,

    type: mapLeaveType(
      request.leaveType,
    ),

    startDate:
      request.startDate,

    endDate:
      request.endDate,

    dateLabel:
      formatLeaveDateRange(
        request.startDate,
        request.endDate,
      ),

    days:
      request.totalDays,

    status:
      mapLeaveStatus(
        request.status,
      ),

    note:
      request.reason ||
      'Tidak ada alasan.',

    submittedAt:
      formatLeaveDateOnly(
        request.requestedAt,
      ),

    workflowStatus:
      request.workflowStatus,

    workflowRunId:
      request.workflowRunId,

    managerName:
      request.manager?.name ??
      null,

    managerDecision:
      request.managerDecision,

    managerDecisionNote:
      request.managerDecisionNote,

    managerDecidedAt:
      request.managerDecidedAt,

    policySource:
      request.policySource,
  };
}

/* =========================================================
   MAIN
========================================================= */

export default function TimeAndLeave() {
  const [activeTab, setActiveTab] =
    useState<'LEAVE' | 'OVERTIME'>('LEAVE');
  const [leaveRequests, setLeaveRequests] =
    useState<LeaveItem[]>([]);

  const [leaveBalances, setLeaveBalances] =
    useState<LeaveBalanceItem[]>([]);

  const [leaveBalanceYear, setLeaveBalanceYear] =
    useState(
      new Date().getFullYear(),
    );

  const [leaveLoading, setLeaveLoading] =
    useState(false);

  const [leaveRefreshing, setLeaveRefreshing] =
    useState(false);

  const [leaveError, setLeaveError] =
    useState<string | null>(null);

  const [leaveRefreshError, setLeaveRefreshError] =
    useState<string | null>(null);

  const [leaveLastUpdated, setLeaveLastUpdated] =
    useState<Date | null>(null);

  const [overtimeRequests, setOvertimeRequests] =
    useState<OvertimeRequest[]>([]);

  const [overtimeLoading, setOvertimeLoading] =
    useState(false);

  const [overtimeRefreshing, setOvertimeRefreshing] =
    useState(false);

  const [overtimeError, setOvertimeError] =
    useState<string | null>(null);
  const loadLeaveData =
    useCallback(
      async (
        silent = false,
      ) => {
        try {
          if (silent) {
            setLeaveRefreshing(
              true,
            );
            setLeaveRefreshError(
              null,
            );
          } else {
            setLeaveLoading(
              true,
            );
            setLeaveError(
              null,
            );
          }

          const year =
            new Date().getFullYear();

          const [
            requestsResponse,
            balanceResponse,
          ] = await Promise.all([
            fetch(
              '/api/leave?limit=20',
              {
                method: 'GET',
                cache: 'no-store',
              },
            ),

            fetch(
              `/api/leave?view=balance&year=${year}`,
              {
                method: 'GET',
                cache: 'no-store',
              },
            ),
          ]);

          const [
            requestsPayload,
            balancePayload,
          ] = await Promise.all([
            requestsResponse.json(),
            balanceResponse.json(),
          ]);

          if (
            !requestsResponse.ok
          ) {
            throw new Error(
              requestsPayload
                ?.error?.message ||
                requestsPayload
                  ?.error ||
                'Gagal mengambil pengajuan cuti.',
            );
          }

          if (
            !balanceResponse.ok
          ) {
            throw new Error(
              balancePayload
                ?.error?.message ||
                balancePayload
                  ?.error ||
                'Gagal mengambil saldo cuti.',
            );
          }

          const rawRequests:
            LeaveRequest[] =
            Array.isArray(
              requestsPayload?.data,
            )
              ? requestsPayload.data
              : [];

          setLeaveRequests(
            rawRequests.map(
              mapLeaveRequest,
            ),
          );

          const balanceData =
            balancePayload?.data as
              | LeaveBalanceResponse
              | undefined;

          setLeaveBalances(
            Array.isArray(
              balanceData?.balances,
            )
              ? balanceData.balances
              : [],
          );

          if (
            typeof balanceData?.year ===
            'number'
          ) {
            setLeaveBalanceYear(
              balanceData.year,
            );
          }

          setLeaveError(
            null,
          );
          setLeaveRefreshError(
            null,
          );
          setLeaveLastUpdated(
            new Date(),
          );
        } catch (error) {
          console.error(
            '[LEAVE LOAD ERROR]',
            error,
          );

          const message =
            error instanceof Error
              ? error.message
              : 'Gagal mengambil data cuti.';

          if (silent) {
            setLeaveRefreshError(
              message,
            );
          } else {
            setLeaveError(
              message,
            );
          }
        } finally {
          setLeaveLoading(false);
          setLeaveRefreshing(false);
        }
      },
      [],
    );
  const loadOvertimeRequests =
    useCallback(
      async (
        silent = false,
      ) => {
        try {
          if (silent) {
            setOvertimeRefreshing(
              true,
            );
          } else {
            setOvertimeLoading(
              true,
            );
          }

          setOvertimeError(
            null,
          );

          const response =
            await fetch(
              '/api/overtime?limit=20',
              {
                method:
                  'GET',

                cache:
                  'no-store',
              },
            );

          const payload =
            await response.json();

          if (
            !response.ok
          ) {
            throw new Error(
              payload?.error ||
                'Gagal mengambil data overtime.',
            );
          }

          const data =
            Array.isArray(
              payload?.data,
            )
              ? payload.data
              : Array.isArray(
                    payload,
                  )
                ? payload
                : [];

          setOvertimeRequests(
            data,
          );
        } catch (
          error
        ) {
          console.error(
            '[OVERTIME LOAD ERROR]',
            error,
          );

          setOvertimeError(
            error instanceof
              Error
              ? error.message
              : 'Gagal mengambil data overtime.',
          );
        } finally {
          setOvertimeLoading(
            false,
          );

          setOvertimeRefreshing(
            false,
          );
        }
      },
      [],
    );
  useEffect(() => {
    if (
      activeTab !== 'LEAVE'
    ) {
      return;
    }

    void loadLeaveData();

    const interval =
      window.setInterval(
        () => {
          void loadLeaveData(
            true,
          );
        },
        10000,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    activeTab,
    loadLeaveData,
  ]);
  useEffect(() => {
    if (
      activeTab !==
      'OVERTIME'
    ) {
      return;
    }

    void loadOvertimeRequests();

    const interval =
      window.setInterval(
        () => {
          void loadOvertimeRequests(
            true,
          );
        },
        10000,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    activeTab,
    loadOvertimeRequests,
  ]);
  const [historyFilter, setHistoryFilter] =
    useState<'ALL' | LeaveStatus>('ALL');

  const [showLeaveModal, setShowLeaveModal] =
    useState(false);

  const filteredHistory =
    useMemo(() => {
      if (
        historyFilter ===
        'ALL'
      ) {
        return leaveRequests;
      }

      return leaveRequests.filter(
        (item) =>
          item.status ===
          historyFilter,
      );
    }, [
      historyFilter,
      leaveRequests,
    ]);

  const stats = useMemo(() => {
    return {
      total:
        leaveRequests.length,

      approved:
        leaveRequests.filter(
          (item) =>
            item.status ===
            'Approved',
        ).length,

      pending:
        leaveRequests.filter(
          (item) =>
            item.status ===
            'Pending',
        ).length,

      rejected:
        leaveRequests.filter(
          (item) =>
            item.status ===
            'Rejected',
        ).length,
    };
  }, [
    leaveRequests,
  ]);

  const annualBalance =
    useMemo(
      () =>
        leaveBalances.find(
          (balance) =>
            balance.leaveType ===
            'ANNUAL',
        ) ?? null,
      [leaveBalances],
    );

  const sickBalance =
    useMemo(
      () =>
        leaveBalances.find(
          (balance) =>
            balance.leaveType ===
            'SICK',
        ) ?? null,
      [leaveBalances],
    );

  const specialBalance =
    useMemo(
      () =>
        leaveBalances.find(
          (balance) =>
            balance.leaveType ===
            'SPECIAL',
        ) ?? null,
      [leaveBalances],
    );

  const upcomingLeave =
    useMemo(() => {
      const today =
        new Date()
          .toISOString()
          .slice(0, 10);

      return (
        leaveRequests
          .filter(
            (request) =>
              (
                request.status ===
                  'Approved' ||
                request.status ===
                  'Pending'
              ) &&
              request.endDate.slice(
                0,
                10,
              ) >= today,
          )
          .sort(
            (a, b) =>
              a.startDate.localeCompare(
                b.startDate,
              ),
          )[0] ?? null
      );
    }, [
      leaveRequests,
    ]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f8fc] font-sans text-gray-800">
      <Sidebar />

      <main className="relative flex h-full flex-1 flex-col overflow-y-auto bg-[#f8f9fc]">

        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <header className="sticky top-0 z-30 flex min-h-20 shrink-0 items-center justify-between border-b border-gray-200/70 bg-white/90 px-6 backdrop-blur-xl lg:px-8">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-950">
              Time & Leave
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Kelola saldo cuti, pengajuan, dan waktu kerja Anda
            </p>
          </div>

          <button
            onClick={() => setShowLeaveModal(true)}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-md"
          >
            <Plus size={17} />

            <span className="hidden sm:inline">
              Ajukan Cuti
            </span>
          </button>
        </header>

        {/* ================================================= */}
        {/* CONTENT */}
        {/* ================================================= */}

        <div className="mx-auto w-full max-w-7xl space-y-7 p-6 pb-20 lg:p-8">
          <section className="flex items-center justify-between">
            <div className="inline-flex rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() =>
                  setActiveTab(
                    'LEAVE',
                  )
                }
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                  activeTab ===
                  'LEAVE'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-indigo-600'
                }`}
              >
                Leave
              </button>

              <button
                type="button"
                onClick={() =>
                  setActiveTab(
                    'OVERTIME',
                  )
                }
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                  activeTab ===
                  'OVERTIME'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-indigo-600'
                }`}
              >
                Overtime
              </button>
            </div>

            <div className="flex items-center gap-3">
              {activeTab === 'LEAVE' && (
                <div className="hidden text-right sm:block">
                  <p className="text-[11px] font-semibold text-gray-600">
                    {leaveRefreshing
                      ? 'Memperbarui data...'
                      : leaveLastUpdated
                        ? `Diperbarui ${formatLeaveLastUpdated(
                            leaveLastUpdated,
                          )}`
                        : 'Belum disinkronkan'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-gray-400">
                    Auto refresh setiap 10 detik
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (activeTab === 'LEAVE') {
                    void loadLeaveData(true);
                    return;
                  }

                  void loadOvertimeRequests(true);
                }}
                disabled={
                  activeTab === 'LEAVE'
                    ? leaveRefreshing
                    : overtimeRefreshing
                }
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-gray-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:opacity-60"
              >
                <RefreshCw
                  size={14}
                  className={
                    (
                      activeTab === 'LEAVE'
                        ? leaveRefreshing
                        : overtimeRefreshing
                    )
                      ? 'animate-spin'
                      : ''
                  }
                />

                Refresh
              </button>
            </div>
          </section>

          {activeTab === 'LEAVE' &&
            leaveRefreshError &&
            !leaveLoading && (
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
                      Data terakhir tetap ditampilkan. {leaveRefreshError}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    void loadLeaveData(true)
                  }
                  disabled={leaveRefreshing}
                  className="shrink-0 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
                >
                  Coba lagi
                </button>
              </div>
            )}

          {activeTab === 'LEAVE' && (
            <>
          {/* ================================================= */}
          {/* HERO */}
          {/* ================================================= */}

          <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#171443] via-indigo-800 to-violet-700 px-7 py-8 text-white shadow-xl shadow-indigo-950/10 lg:px-9 lg:py-9">

            <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

            <div className="absolute bottom-0 right-1/3 h-44 w-44 rounded-full bg-violet-300/10 blur-3xl" />

            <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-center">

              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-100 backdrop-blur">
                  <CalendarCheck size={14} />
                  Leave Management
                </div>

                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Kelola waktu istirahat Anda.
                </h1>

                <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100/70">
                  Pantau saldo cuti, lihat status pengajuan, dan
                  rencanakan waktu istirahat dari satu tempat.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setShowLeaveModal(true)}
                  className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-indigo-700 shadow-lg transition hover:bg-indigo-50"
                >
                  <Plus size={17} />
                  Ajukan Cuti
                </button>

                <button className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15">
                  <Sparkles size={17} />
                  Tanya AI
                </button>
              </div>
            </div>
          </section>

          {/* ================================================= */}
          {/* LEAVE BALANCE */}
          {/* ================================================= */}

          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-950">
                  Saldo Cuti
                </h3>

                <p className="mt-1 text-sm text-gray-400">
                  Periode Januari - Desember {leaveBalanceYear}
                </p>
              </div>

              <span className="hidden rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 sm:block">
                Tahun {leaveBalanceYear}
              </span>
            </div>

            {leaveLoading ? (
              <LeaveBalanceSkeleton />
            ) : leaveError &&
              leaveBalances.length === 0 ? (
              <LeaveSectionError
                title="Saldo cuti belum dapat dimuat"
                message={leaveError}
                onRetry={() =>
                  void loadLeaveData()
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <LeaveBalanceCard
                  title="Cuti Tahunan"
                  subtitle="Annual Leave"
                  icon={Umbrella}
                  approved={annualBalance?.approvedDays ?? 0}
                  pending={annualBalance?.pendingDays ?? 0}
                  total={annualBalance?.entitlementDays ?? null}
                  available={annualBalance?.availableDays ?? null}
                  configured={annualBalance?.balanceConfigured ?? false}
                  color="indigo"
                  desc={`Berlaku hingga 31 Des ${leaveBalanceYear}`}
                />

                <LeaveBalanceCard
                  title="Cuti Sakit"
                  subtitle="Medical Leave"
                  icon={HeartPulse}
                  approved={sickBalance?.approvedDays ?? 0}
                  pending={sickBalance?.pendingDays ?? 0}
                  total={sickBalance?.entitlementDays ?? null}
                  available={sickBalance?.availableDays ?? null}
                  configured={sickBalance?.balanceConfigured ?? false}
                  color="rose"
                  desc="Surat dokter mungkin diperlukan"
                />

                <LeaveBalanceCard
                  title="Cuti Khusus"
                  subtitle="Special Leave"
                  icon={CalendarClock}
                  approved={specialBalance?.approvedDays ?? 0}
                  pending={specialBalance?.pendingDays ?? 0}
                  total={specialBalance?.entitlementDays ?? null}
                  available={specialBalance?.availableDays ?? null}
                  configured={specialBalance?.balanceConfigured ?? false}
                  color="emerald"
                  desc="Menikah, kedukaan, dan kebutuhan khusus"
                />
              </div>
            )}
          </section>

          {/* ================================================= */}
          {/* STATUS SUMMARY */}
          {/* ================================================= */}

          {leaveLoading ? (
            <LeaveSummarySkeleton />
          ) : (
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <LeaveSummaryCard
                icon={CalendarDays}
                label="Total Pengajuan"
                value={stats.total}
                description={`${stats.total} pengajuan pada ${leaveBalanceYear}`}
                style="bg-indigo-50 text-indigo-600"
              />

              <LeaveSummaryCard
                icon={CheckCircle2}
                label="Disetujui"
                value={stats.approved}
                description={`${stats.approved} pengajuan disetujui`}
                style="bg-emerald-50 text-emerald-600"
              />

              <LeaveSummaryCard
                icon={Clock3}
                label="Menunggu"
                value={stats.pending}
                description={`${stats.pending} pengajuan menunggu`}
                style="bg-amber-50 text-amber-600"
              />

              <LeaveSummaryCard
                icon={XCircle}
                label="Ditolak"
                value={stats.rejected}
                description={`${stats.rejected} pengajuan ditolak`}
                style="bg-rose-50 text-rose-600"
              />
            </section>
          )}

          {/* ================================================= */}
          {/* UPCOMING + QUICK ACTION */}
          {/* ================================================= */}

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1fr]">

            {/* UPCOMING LEAVE */}

            <UpcomingLeavePanel
              item={upcomingLeave}
              loading={leaveLoading}
              error={
                leaveError &&
                leaveRequests.length === 0
                  ? leaveError
                  : null
              }
              onRetry={() =>
                void loadLeaveData()
              }
            />

            {/* QUICK ACTION */}

            <div className="rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm">
              <div className="mb-5">
                <h3 className="font-bold text-gray-950">
                  Akses Cepat
                </h3>

                <p className="mt-1 text-xs text-gray-400">
                  Form dan layanan terkait waktu kerja
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <QuickAction
                  icon={Timer}
                  title="Form Lembur"
                  description="Ajukan overtime"
                  style="bg-amber-50 text-amber-600"
                />

                <QuickAction
                  icon={WalletCards}
                  title="Expenses & Claims"
                  description="Pantau dan ajukan via AI"
                  style="bg-blue-50 text-blue-600"
                  href="/reimbursement"
                />

                <QuickAction
                  icon={CalendarClock}
                  title="Riwayat Absensi"
                  description="Lihat kehadiran"
                  style="bg-violet-50 text-violet-600"
                />

                <QuickAction
                  icon={BriefcaseBusiness}
                  title="Work Schedule"
                  description="Jadwal kerja Anda"
                  style="bg-emerald-50 text-emerald-600"
                />
              </div>
            </div>
          </section>

          {/* ================================================= */}
          {/* AI ASSISTANT */}
          {/* ================================================= */}

          <section className="relative overflow-hidden rounded-[26px] bg-[#17143f] p-6 text-white shadow-xl shadow-indigo-950/10 lg:p-7">

            <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full bg-violet-500/30 blur-3xl" />

            <div className="relative z-10 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">

              <div className="flex gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                  <Sparkles size={22} />
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-indigo-300">
                    AI HR Assistant
                  </span>

                  <h3 className="mt-1 text-lg font-bold">
                    Bingung dengan kebijakan cuti?
                  </h3>

                  <p className="mt-2 max-w-xl text-sm leading-6 text-indigo-100/65">
                    Tanyakan aturan cuti, jumlah saldo, persyaratan
                    dokumen, atau proses approval melalui AI.
                  </p>
                </div>
              </div>

              <button className="flex w-fit shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50">
                Tanya AI
                <ArrowUpRight size={15} />
              </button>
            </div>
          </section>

          {/* ================================================= */}
          {/* HISTORY */}
          {/* ================================================= */}

          <section>
            <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">

              <div>
                <div className="flex items-center gap-2">
                  <History
                    size={19}
                    className="text-indigo-600"
                  />

                  <h3 className="text-lg font-bold text-gray-950">
                    Riwayat Pengajuan
                  </h3>
                </div>

                <p className="mt-1 text-sm text-gray-400">
                  Pantau semua pengajuan cuti Anda
                </p>
              </div>

              {/* FILTER */}

              <div className="flex items-center gap-2 overflow-x-auto">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
                  <SlidersHorizontal size={15} />
                </div>

                <HistoryFilter
                  label="Semua"
                  active={historyFilter === 'ALL'}
                  onClick={() => setHistoryFilter('ALL')}
                />

                <HistoryFilter
                  label="Approved"
                  active={
                    historyFilter === 'Approved'
                  }
                  onClick={() =>
                    setHistoryFilter('Approved')
                  }
                />

                <HistoryFilter
                  label="Pending"
                  active={
                    historyFilter === 'Pending'
                  }
                  onClick={() =>
                    setHistoryFilter('Pending')
                  }
                />

                <HistoryFilter
                  label="Rejected"
                  active={
                    historyFilter === 'Rejected'
                  }
                  onClick={() =>
                    setHistoryFilter('Rejected')
                  }
                />

                <HistoryFilter
                  label="Cancelled"
                  active={
                    historyFilter === 'Cancelled'
                  }
                  onClick={() =>
                    setHistoryFilter('Cancelled')
                  }
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-[26px] border border-gray-200/80 bg-white shadow-sm">
              {leaveLoading ? (
                <LeaveHistorySkeleton />
              ) : leaveError &&
                leaveRequests.length === 0 ? (
                <div className="p-5">
                  <LeaveSectionError
                    title="Riwayat cuti belum dapat dimuat"
                    message={leaveError}
                    onRetry={() =>
                      void loadLeaveData()
                    }
                  />
                </div>
              ) : filteredHistory.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {filteredHistory.map((item) => (
                    <LeaveHistoryItem
                      key={item.id}
                      item={item}
                    />
                  ))}
                </div>
              ) : (
                <div className="px-6 py-14 text-center">
                  <CalendarClock
                    size={30}
                    className="mx-auto text-gray-300"
                  />

                  <p className="mt-3 text-sm font-semibold text-gray-700">
                    {historyFilter === 'ALL'
                      ? 'Belum ada pengajuan cuti'
                      : `Tidak ada pengajuan ${historyFilter.toLowerCase()}`}
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    {historyFilter === 'ALL'
                      ? 'Pengajuan dari People Assistant akan muncul di sini.'
                      : 'Coba pilih filter lain untuk melihat riwayat pengajuan.'}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/60 px-6 py-4">
                <span className="text-xs text-gray-400">
                  {filteredHistory.length} pengajuan
                </span>

                <button className="flex items-center gap-1 text-xs font-semibold text-indigo-600">
                  Lihat Semua
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </section>
        </>
      )}

      {activeTab === 'OVERTIME' && (
        <OvertimePanel
          requests={overtimeRequests}
          loading={overtimeLoading}
          error={overtimeError}
        />
      )}
    </div>
  </main>

      {/* ================================================= */}
      {/* LEAVE MODAL */}
      {/* ================================================= */}

      {showLeaveModal && (
        <LeaveRequestModal
          onClose={() => setShowLeaveModal(false)}
        />
      )}
    </div>
  );
}

function OvertimePanel({
  requests,
  loading,
  error,
}: {
  requests: OvertimeRequest[];
  loading: boolean;
  error: string | null;
}) {
  const stats =
    useMemo(() => {
      return {
        total:
          requests.length,

        pending:
          requests.filter(
            (request) =>
              request.status ===
              'PENDING',
          ).length,

        approved:
          requests.filter(
            (request) =>
              request.status ===
              'APPROVED',
          ).length,

        rejected:
          requests.filter(
            (request) =>
              request.status ===
              'REJECTED',
          ).length,
      };
    }, [
      requests,
    ]);

  return (
    <>
      {/* HERO */}

      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#171443] via-indigo-800 to-violet-700 px-7 py-8 text-white shadow-xl shadow-indigo-950/10 lg:px-9 lg:py-9">
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-100 backdrop-blur">
            <Timer
              size={14}
            />

            Overtime Tracking
          </div>

          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            Pantau pengajuan
            lembur Anda.
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100/70">
            Lihat proses
            approval,
            keputusan manager,
            second approval,
            dan status akhir
            overtime dari satu
            tempat.
          </p>
        </div>
      </section>

      {/* SUMMARY */}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <OvertimeSummaryCard
          label="Total"
          value={
            stats.total
          }
          icon={
            CalendarClock
          }
          style="bg-indigo-50 text-indigo-600"
        />

        <OvertimeSummaryCard
          label="Menunggu"
          value={
            stats.pending
          }
          icon={Clock3}
          style="bg-amber-50 text-amber-600"
        />

        <OvertimeSummaryCard
          label="Disetujui"
          value={
            stats.approved
          }
          icon={
            CheckCircle2
          }
          style="bg-emerald-50 text-emerald-600"
        />

        <OvertimeSummaryCard
          label="Ditolak"
          value={
            stats.rejected
          }
          icon={
            XCircle
          }
          style="bg-rose-50 text-rose-600"
        />
      </section>

      {/* REQUEST LIST */}

      <section>
        <div className="mb-5">
          <h3 className="text-lg font-bold text-gray-950">
            Overtime Requests
          </h3>

          <p className="mt-1 text-sm text-gray-400">
            Status approval
            pengajuan lembur
            terbaru Anda.
          </p>
        </div>

        {loading ? (
          <div className="flex min-h-56 items-center justify-center rounded-[26px] border border-gray-200 bg-white">
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <RefreshCw
                size={17}
                className="animate-spin text-indigo-500"
              />

              Memuat overtime...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-[26px] border border-rose-100 bg-rose-50 p-6">
            <div className="flex items-start gap-3">
              <AlertCircle
                size={20}
                className="mt-0.5 text-rose-500"
              />

              <div>
                <p className="text-sm font-bold text-rose-700">
                  Gagal memuat
                  overtime
                </p>

                <p className="mt-1 text-xs text-rose-600">
                  {error}
                </p>
              </div>
            </div>
          </div>
        ) : requests.length ===
          0 ? (
          <div className="rounded-[26px] border border-gray-200 bg-white px-6 py-14 text-center">
            <Timer
              size={32}
              className="mx-auto text-gray-300"
            />

            <p className="mt-3 text-sm font-semibold text-gray-700">
              Belum ada
              pengajuan overtime
            </p>

            <p className="mt-1 text-xs text-gray-400">
              Pengajuan overtime
              dari People
              Assistant akan
              muncul di sini.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map(
              (
                request,
              ) => (
                <OvertimeRequestCard
                  key={
                    request.id
                  }
                  request={
                    request
                  }
                />
              ),
            )}
          </div>
        )}
      </section>
    </>
  );
}

function OvertimeSummaryCard({
  label,
  value,
  icon: Icon,
  style,
}: {
  label: string;
  value: number;
  icon: any;
  style: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${style}`}
      >
        <Icon size={18} />
      </div>

      <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {label}
      </p>

      <p className="mt-1 text-xl font-bold text-gray-950">
        {value}
      </p>
    </div>
  );
}

function OvertimeRequestCard({
  request,
}: {
  request: OvertimeRequest;
}) {
  const progress =
    getOvertimeProgress(
      request,
    );

  return (
    <article className="overflow-hidden rounded-[26px] border border-gray-200/80 bg-white shadow-sm transition hover:border-indigo-100 hover:shadow-md">
      <div className="flex flex-col justify-between gap-4 border-b border-gray-100 px-6 py-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-bold text-gray-950">
              {
                request.requestCode
              }
            </h4>

            <OvertimeStatusBadge
              status={
                request.status
              }
            />
          </div>

          <p className="mt-2 text-sm font-medium text-gray-700">
            {request.reason}
          </p>

          <p className="mt-1 text-xs text-gray-400">
            {formatOvertimeDate(
              request.startAt,
            )}
            {' â€¢ '}
            {
              request.durationMinutes
            }{' '}
            menit
          </p>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
            Current Stage
          </p>

          <p className="mt-1 text-sm font-bold text-gray-800">
            {
              progress.label
            }
          </p>
        </div>
      </div>

      <div className="px-6 py-6">
        <OvertimeTimeline
          request={
            request
          }
        />
      </div>

      {progress.note && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-4">
          <p className="text-xs leading-5 text-gray-500">
            {
              progress.note
            }
          </p>
        </div>
      )}
    </article>
  );
}

function OvertimeTimeline({
  request,
}: {
  request: OvertimeRequest;
}) {
  const managerRejected =
    request.managerDecision ===
    'REJECTED';

  const managerApproved =
    request.managerDecision ===
    'APPROVED';

  const secondRejected =
    request.secondDecision ===
    'REJECTED';

  const secondApproved =
    request.secondDecision ===
    'APPROVED';

  return (
    <div className="space-y-0">
      <TimelineStep
        state="done"
        title="Request submitted"
        description="Pengajuan overtime berhasil dibuat."
      />

      <TimelineStep
        state={
          managerRejected
            ? 'rejected'
            : managerApproved
              ? 'done'
              : 'current'
        }
        title={
          request.manager
            ?.name
            ? `${request.manager.name} Â· Line Manager`
            : 'Line Manager Approval'
        }
        description={
          managerRejected
            ? request.managerDecisionNote ||
              'Pengajuan ditolak oleh manager.'
            : managerApproved
              ? 'Line Manager telah menyetujui pengajuan.'
              : 'Menunggu keputusan Line Manager.'
        }
      />

      {request.requiresSecondApproval && (
        <TimelineStep
          state={
            managerRejected
              ? 'disabled'
              : secondRejected
                ? 'rejected'
                : secondApproved
                  ? 'done'
                  : request.approvalStage ===
                      'SECOND_APPROVER'
                    ? 'current'
                    : 'disabled'
          }
          title={
            request.secondApprover
              ?.name
              ? `${request.secondApprover.name} Â· Second Approver`
              : 'Second Approval'
          }
          description={
            managerRejected
              ? 'Tidak diperlukan karena manager menolak pengajuan.'
              : secondRejected
                ? request.secondDecisionNote ||
                  'Second approver menolak pengajuan.'
                : secondApproved
                  ? 'Second approver telah menyetujui pengajuan.'
                  : request.approvalStage ===
                      'SECOND_APPROVER'
                    ? 'Menunggu second approval.'
                    : 'Menunggu manager approval terlebih dahulu.'
          }
        />
      )}

      <TimelineStep
        last
        state={
          request.status ===
          'APPROVED'
            ? 'done'
            : request.status ===
                'REJECTED'
              ? 'rejected'
              : 'disabled'
        }
        title="Final Decision"
        description={
          request.status ===
          'APPROVED'
            ? 'Pengajuan overtime telah disetujui.'
            : request.status ===
                'REJECTED'
              ? 'Pengajuan overtime telah ditolak.'
              : 'Menunggu seluruh approval selesai.'
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
    state === 'done' ? (
      <CheckCircle2 size={17} />
    ) : state === 'rejected' ? (
      <XCircle size={17} />
    ) : state === 'current' ? (
      <Clock3 size={17} />
    ) : (
      <Circle size={17} />
    );

  const style =
    state === 'done'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
      : state === 'rejected'
        ? 'border-rose-200 bg-rose-50 text-rose-600'
        : state === 'current'
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

function getOvertimeProgress(
  request: OvertimeRequest,
) {
  if (
    request.status ===
      'REJECTED' &&
    request.managerDecision ===
      'REJECTED'
  ) {
    return {
      label:
        'Rejected by Manager',

      note:
        request.managerDecisionNote ||
        'Pengajuan ditolak oleh Line Manager.',
    };
  }

  if (
    request.status ===
      'REJECTED' &&
    request.secondDecision ===
      'REJECTED'
  ) {
    return {
      label:
        'Rejected by Second Approver',

      note:
        request.secondDecisionNote ||
        'Pengajuan ditolak pada second approval.',
    };
  }

  if (
    request.status ===
      'APPROVED' &&
    request.approvalStage ===
      'COMPLETED'
  ) {
    return {
      label:
        'Fully Approved',

      note:
        'Seluruh proses approval telah selesai.',
    };
  }

  if (
    request.approvalStage ===
    'SECOND_APPROVER'
  ) {
    return {
      label:
        'Waiting Second Approval',

      note:
        'Line Manager telah menyetujui. Menunggu keputusan second approver.',
    };
  }

  return {
    label:
      'Waiting Manager Approval',

    note:
      'Pengajuan sedang menunggu keputusan Line Manager.',
  };
}

function OvertimeStatusBadge({
  status,
}: {
  status: OvertimeStatus;
}) {
  const map: Record<
    OvertimeStatus,
    string
  > = {
    APPROVED:
      'border-emerald-100 bg-emerald-50 text-emerald-700',

    PENDING:
      'border-amber-100 bg-amber-50 text-amber-700',

    REJECTED:
      'border-rose-100 bg-rose-50 text-rose-700',

    CANCELLED:
      'border-gray-200 bg-gray-50 text-gray-500',

    DRAFT:
      'border-gray-200 bg-gray-50 text-gray-500',
  };

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${map[status]}`}
    >
      {status}
    </span>
  );
}

function formatOvertimeDate(
  value: string,
) {
  const date =
    new Date(value);

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
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone:
        'Asia/Jakarta',
    },
  ).format(date);
}

function formatLeaveLastUpdated(
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

function LeaveSectionError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-[24px] border border-rose-100 bg-rose-50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <AlertCircle
            size={20}
            className="mt-0.5 shrink-0 text-rose-500"
          />
          <div>
            <p className="text-sm font-bold text-rose-700">
              {title}
            </p>
            <p className="mt-1 text-xs leading-5 text-rose-600">
              {message}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
        >
          Coba lagi
        </button>
      </div>
    </div>
  );
}

function LeaveBalanceSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-[24px] border border-gray-200/80 bg-white p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-gray-100" />
            <div className="space-y-2">
              <div className="h-3 w-28 rounded bg-gray-100" />
              <div className="h-2.5 w-20 rounded bg-gray-100" />
            </div>
          </div>
          <div className="mt-8 h-9 w-24 rounded bg-gray-100" />
          <div className="mt-3 h-2.5 w-32 rounded bg-gray-100" />
          <div className="mt-6 h-2 w-full rounded-full bg-gray-100" />
          <div className="mt-4 flex justify-between">
            <div className="h-2.5 w-24 rounded bg-gray-100" />
            <div className="h-2.5 w-20 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LeaveSummarySkeleton() {
  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm lg:p-5"
        >
          <div className="h-10 w-10 rounded-xl bg-gray-100" />
          <div className="mt-4 h-2.5 w-24 rounded bg-gray-100" />
          <div className="mt-3 h-6 w-10 rounded bg-gray-100" />
          <div className="mt-3 h-2.5 w-28 rounded bg-gray-100" />
        </div>
      ))}
    </section>
  );
}

function LeaveHistorySkeleton() {
  return (
    <div className="divide-y divide-gray-100">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flex animate-pulse gap-4 px-6 py-5"
        >
          <div className="h-11 w-11 shrink-0 rounded-xl bg-gray-100" />
          <div className="flex-1">
            <div className="flex gap-2">
              <div className="h-3.5 w-28 rounded bg-gray-100" />
              <div className="h-5 w-16 rounded-full bg-gray-100" />
            </div>
            <div className="mt-3 h-2.5 w-56 max-w-full rounded bg-gray-100" />
            <div className="mt-3 h-2.5 w-2/3 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   LEAVE BALANCE CARD
========================================================= */

function LeaveBalanceCard({
  title,
  subtitle,
  icon: Icon,
  approved,
  pending,
  total,
  available,
  configured,
  color,
  desc,
}: {
  title: string;
  subtitle: string;
  icon: any;
  approved: number;
  pending: number;
  total: number | null;
  available: number | null;
  configured: boolean;
  color: 'indigo' | 'rose' | 'emerald';
  desc: string;
}) {
  const committed =
    approved + pending;

  const percentage =
    configured &&
    typeof total === 'number' &&
    total > 0
      ? Math.min(
          (committed / total) * 100,
          100,
        )
      : 0;

  const colorMap = {
    indigo: {
      bg: 'bg-indigo-50',
      text: 'text-indigo-600',
      progress: 'bg-indigo-500',
      soft: 'bg-indigo-100',
    },

    rose: {
      bg: 'bg-rose-50',
      text: 'text-rose-600',
      progress: 'bg-rose-500',
      soft: 'bg-rose-100',
    },

    emerald: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
      progress: 'bg-emerald-500',
      soft: 'bg-emerald-100',
    },
  } satisfies Record<
    'indigo' | 'rose' | 'emerald',
    {
      bg: string;
      text: string;
      progress: string;
      soft: string;
    }
  >;

  const theme =
    colorMap[color];

  return (
    <div className="group rounded-[24px] border border-gray-200/80 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-lg hover:shadow-gray-200/50">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-xl ${theme.bg} ${theme.text}`}
          >
            <Icon size={20} />
          </div>

          <div>
            <h4 className="text-sm font-bold text-gray-950">
              {title}
            </h4>

            <p className="mt-0.5 text-[11px] text-gray-400">
              {subtitle}
            </p>
          </div>
        </div>

        <ChevronRight
          size={17}
          className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500"
        />
      </div>

      {configured ? (
        <>
          <div className="mt-7 flex items-end gap-2">
            <span className="text-4xl font-black tracking-tight text-gray-950">
              {available ?? 0}
            </span>

            <span className="mb-1 text-sm font-medium text-gray-400">
              dari {total ?? 0} hari
            </span>
          </div>

          <p className="mt-1 text-xs text-gray-400">
            Saldo tersedia
          </p>

          <div
            className={`mt-5 h-2 overflow-hidden rounded-full ${theme.soft}`}
          >
            <div
              className={`h-full rounded-full ${theme.progress}`}
              style={{
                width: `${percentage}%`,
              }}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-gray-400">
              Disetujui{' '}
              <strong className="font-semibold text-gray-700">
                {approved} hari
              </strong>
            </span>

            <span className="text-xs text-gray-400">
              Pending{' '}
              <strong className="font-semibold text-amber-600">
                {pending} hari
              </strong>
            </span>
          </div>
        </>
      ) : (
        <div className="mt-7">
          <p className="text-2xl font-black tracking-tight text-gray-400">
            â€”
          </p>

          <p className="mt-2 text-sm font-semibold text-gray-600">
            Belum dikonfigurasi
          </p>

          <p className="mt-1 text-xs leading-5 text-gray-400">
            Entitlement untuk jenis cuti ini belum tersedia di sistem.
          </p>
        </div>
      )}

      <p className="mt-4 truncate text-[10px] text-gray-400">
        {desc}
      </p>
    </div>
  );
}

function UpcomingLeavePanel({
  item,
  loading,
  error,
  onRetry,
}: {
  item: LeaveItem | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3 text-sm text-gray-500">
          <RefreshCw
            size={17}
            className="animate-spin text-indigo-500"
          />
          Memuat upcoming leave...
        </div>
      </div>
    );
  }

  if (error && !item) {
    return (
      <div className="rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <AlertCircle size={19} />
          </div>

          <div>
            <h3 className="font-bold text-gray-950">
              Upcoming Leave
            </h3>
            <p className="mt-0.5 text-xs text-gray-400">
              Pengajuan cuti terdekat Anda
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-rose-100 bg-rose-50 p-5">
          <p className="text-sm font-bold text-rose-700">
            Data belum dapat dimuat
          </p>
          <p className="mt-1 text-xs leading-5 text-rose-600">
            {error}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
          >
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Plane size={19} />
          </div>

          <div>
            <h3 className="font-bold text-gray-950">
              Upcoming Leave
            </h3>
            <p className="mt-0.5 text-xs text-gray-400">
              Pengajuan cuti terdekat Anda
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center">
          <CalendarDays
            size={28}
            className="mx-auto text-gray-300"
          />
          <p className="mt-3 text-sm font-semibold text-gray-700">
            Belum ada cuti mendatang
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Pengajuan pending atau approved akan muncul di sini.
          </p>
        </div>
      </div>
    );
  }

  const status =
    getStatusStyle(
      item.status,
    );

  const StatusIcon =
    status.icon;

  const dateOnly =
    item.startDate.slice(
      0,
      10,
    );

  const date =
    new Date(
      `${dateOnly}T00:00:00Z`,
    );

  const month =
    new Intl.DateTimeFormat(
      'id-ID',
      {
        month: 'short',
        timeZone: 'UTC',
      },
    ).format(date);

  const day =
    new Intl.DateTimeFormat(
      'id-ID',
      {
        day: '2-digit',
        timeZone: 'UTC',
      },
    ).format(date);

  const progressText =
    item.status ===
    'Approved'
      ? item.workflowStatus ===
        'COMPLETED'
        ? 'Pengajuan telah disetujui dan workflow selesai.'
        : 'Pengajuan telah disetujui manager.'
      : item.status ===
          'Rejected'
        ? item.managerDecisionNote ||
          'Pengajuan ditolak oleh manager.'
        : item.status ===
            'Cancelled'
          ? 'Pengajuan telah dibatalkan.'
          : item.workflowStatus ===
              'FAILED'
            ? 'Pengajuan tersimpan, tetapi workflow approval perlu dicoba kembali.'
            : `Menunggu persetujuan ${
                item.managerName ||
                'manager'
              }.`;

  return (
    <div className="rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <Plane size={19} />
          </div>

          <div>
            <h3 className="font-bold text-gray-950">
              Upcoming Leave
            </h3>

            <p className="mt-0.5 text-xs text-gray-400">
              Pengajuan cuti terdekat Anda
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${status.badge}`}
        >
          <StatusIcon size={11} />
          {status.label}
        </span>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-5">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
              {item.type}
            </p>

            <h4 className="mt-2 text-lg font-bold text-gray-950">
              {item.dateLabel}
            </h4>

            <p className="mt-1 text-sm text-gray-500">
              {item.days}{' '}
              Hari â€¢{' '}
              {item.note}
            </p>

            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {item.requestCode}
            </p>
          </div>

          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-white shadow-sm">
            <span className="text-[10px] font-bold uppercase text-indigo-400">
              {month}
            </span>

            <span className="text-xl font-black text-indigo-700">
              {day}
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-2 border-t border-indigo-100 pt-4 text-xs leading-5 text-gray-500">
          <Clock3
            size={14}
            className="mt-0.5 shrink-0 text-amber-500"
          />

          <span>
            {progressText}
          </span>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SUMMARY CARD
========================================================= */

function LeaveSummaryCard({
  icon: Icon,
  label,
  value,
  description,
  style,
}: any) {
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

/* =========================================================
   QUICK ACTION
========================================================= */

function QuickAction({
  icon: Icon,
  title,
  description,
  style,
  href,
}: any) {
  const className =
    'group flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 text-left transition hover:border-indigo-100 hover:bg-white hover:shadow-sm';

  const content = (
    <>
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style}`}
      >
        <Icon size={18} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">
          {title}
        </p>

        <p className="mt-0.5 truncate text-xs text-gray-400">
          {description}
        </p>
      </div>

      <ChevronRight
        size={15}
        className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500"
      />
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
    >
      {content}
    </button>
  );
}

/* =========================================================
   FILTER
========================================================= */

function HistoryFilter({
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
   HISTORY ITEM
========================================================= */

function LeaveHistoryItem({
  item,
}: {
  item: LeaveItem;
}) {
  const [expanded, setExpanded] =
    useState(false);

  const status =
    getStatusStyle(item.status);

  const workflow =
    getLeaveWorkflowStyle(
      item.workflowStatus,
    );

  const managerState:
    | 'done'
    | 'current'
    | 'rejected'
    | 'disabled' =
    item.status === 'Cancelled'
      ? 'disabled'
      : item.managerDecision ===
          'REJECTED'
        ? 'rejected'
        : item.managerDecision ===
            'APPROVED'
          ? 'done'
          : 'current';

  const finalState:
    | 'done'
    | 'current'
    | 'rejected'
    | 'disabled' =
    item.status === 'Approved'
      ? 'done'
      : item.status === 'Rejected'
        ? 'rejected'
        : 'disabled';

  const managerDecisionTime =
    formatLeaveDateTime(
      item.managerDecidedAt,
    );

  const managerDescription =
    item.managerDecision === 'REJECTED'
      ? `${
          item.managerDecisionNote ||
          'Pengajuan ditolak oleh Line Manager.'
        }${
          managerDecisionTime
            ? ` Â· ${managerDecisionTime}`
            : ''
        }`
      : item.managerDecision === 'APPROVED'
        ? `${
            item.managerDecisionNote ||
            'Line Manager telah menyetujui pengajuan.'
          }${
            managerDecisionTime
              ? ` Â· ${managerDecisionTime}`
              : ''
          }`
        : item.workflowStatus === 'FAILED'
          ? 'Workflow approval gagal dijalankan. Pengajuan perlu dicoba kembali.'
          : `Menunggu keputusan ${
              item.managerName ||
              'Line Manager'
            }.`;

  const finalDescription =
    item.status === 'Approved'
      ? 'Pengajuan cuti telah disetujui.'
      : item.status === 'Rejected'
        ? 'Pengajuan cuti telah ditolak.'
        : item.status === 'Cancelled'
          ? 'Pengajuan cuti telah dibatalkan.'
          : 'Menunggu keputusan manager.';

  return (
    <article className="overflow-hidden border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() =>
          setExpanded(
            (current) => !current,
          )
        }
        className="group flex w-full flex-col gap-4 px-6 py-5 text-left transition hover:bg-gray-50/70 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <CalendarDays size={19} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-bold text-gray-900">
                {item.type}
              </h4>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${status.badge}`}
              >
                <status.icon size={11} />
                {status.label}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${workflow.badge}`}
              >
                <workflow.icon size={11} />
                {workflow.label}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>{item.dateLabel}</span>

              <span className="h-1 w-1 rounded-full bg-gray-300" />

              <span className="font-semibold text-gray-700">
                {item.days} Hari
              </span>

              <span className="h-1 w-1 rounded-full bg-gray-300" />

              <span>
                Diajukan {item.submittedAt}
              </span>
            </div>

            <p className="mt-2 text-xs text-gray-400 sm:max-w-2xl sm:truncate">
              {item.note}
            </p>

            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {item.requestCode}
            </p>

            {item.workflowStatus === 'FAILED' && (
              <div className="mt-3 flex max-w-2xl items-start gap-2 rounded-xl border border-rose-100 bg-rose-50 px-3 py-2.5">
                <AlertCircle
                  size={14}
                  className="mt-0.5 shrink-0 text-rose-500"
                />
                <p className="text-[11px] leading-5 text-rose-700">
                  Workflow approval gagal. Request tetap tersimpan sebagai{' '}
                  <strong className="font-bold">
                    {item.status}
                  </strong>{' '}
                  dan membutuhkan retry automation.
                </p>
              </div>
            )}
          </div>
        </div>

        <ChevronRight
          size={18}
          className={`hidden shrink-0 text-gray-300 transition sm:block ${
            expanded
              ? 'rotate-90 text-indigo-500'
              : 'group-hover:translate-x-0.5 group-hover:text-indigo-500'
          }`}
        />
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-6">
          <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="rounded-2xl border border-gray-200/80 bg-white p-5">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    Approval Timeline
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Status proses persetujuan cuti.
                  </p>
                </div>

                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[10px] font-bold text-gray-500">
                  {item.requestCode}
                </span>
              </div>

              <TimelineStep
                state="done"
                title="Request submitted"
                description={`Pengajuan cuti dibuat pada ${item.submittedAt}.`}
              />

              <TimelineStep
                state={managerState}
                title={
                  item.managerName
                    ? `${item.managerName} Â· Line Manager`
                    : 'Line Manager Approval'
                }
                description={
                  managerDescription
                }
              />

              <TimelineStep
                last
                state={finalState}
                title={
                  item.status ===
                  'Cancelled'
                    ? 'Request Cancelled'
                    : 'Final Decision'
                }
                description={
                  finalDescription
                }
              />
            </div>

            <div className="space-y-3">
              <LeaveMetaCard
                label="Workflow"
                value={workflow.label}
                description={
                  item.workflowStatus ===
                  'FAILED'
                    ? 'Request aman di database, tetapi automation approval gagal dan perlu retry.'
                    : item.workflowStatus ===
                        'COMPLETED'
                      ? 'Automation approval selesai.'
                      : 'Automation masih diproses.'
                }
                icon={workflow.icon}
                style={workflow.soft}
              />

              <LeaveMetaCard
                label="Manager"
                value={
                  item.managerName ||
                  'Line Manager'
                }
                description={
                  item.managerDecision ===
                  'APPROVED'
                    ? 'Keputusan: Approved'
                    : item.managerDecision ===
                        'REJECTED'
                      ? 'Keputusan: Rejected'
                      : 'Menunggu keputusan'
                }
                icon={BriefcaseBusiness}
                style="bg-indigo-50 text-indigo-600"
              />

              <LeaveMetaCard
                label="Policy"
                value={
                  item.policySource || '-'
                }
                description="Policy source yang digunakan saat validasi."
                icon={FileText}
                style="bg-violet-50 text-violet-600"
              />

              {item.workflowRunId && (
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
                  Workflow Run ID:{' '}
                  <strong className="font-semibold text-gray-700">
                    {item.workflowRunId}
                  </strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function LeaveMetaCard({
  label,
  value,
  description,
  icon: Icon,
  style,
}: {
  label: string;
  value: string;
  description: string;
  icon: any;
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
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function getLeaveWorkflowStyle(
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
   REQUEST MODAL
========================================================= */

function LeaveRequestModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [leaveType, setLeaveType] =
    useState('Cuti Tahunan');

  const [startDate, setStartDate] =
    useState('');

  const [endDate, setEndDate] =
    useState('');

  const [reason, setReason] =
    useState('');

  const estimatedDays = useMemo(() => {
    if (!startDate || !endDate) {
      return 0;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) return 0;

    const diff =
      end.getTime() - start.getTime();

    return (
      Math.floor(
        diff / (1000 * 60 * 60 * 24),
      ) + 1
    );
  }, [startDate, endDate]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/30 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-[28px] bg-white shadow-2xl"
      >
        {/* MODAL HEADER */}

        <div className="relative overflow-hidden bg-gradient-to-br from-[#171443] via-indigo-800 to-violet-700 px-7 py-7 text-white">

          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl" />

          <button
            onClick={onClose}
            className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/20"
          >
            <X size={17} />
          </button>

          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-indigo-100">
              <CalendarCheck size={12} />
              LEAVE REQUEST
            </span>

            <h2 className="mt-3 text-xl font-bold">
              Ajukan Cuti
            </h2>

            <p className="mt-1 text-sm text-indigo-100/70">
              Lengkapi informasi pengajuan cuti Anda.
            </p>
          </div>
        </div>

        {/* FORM */}

        <div className="space-y-5 p-7">

          {/* TYPE */}

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-700">
              Jenis Cuti
            </label>

            <select
              value={leaveType}
              onChange={(e) =>
                setLeaveType(e.target.value)
              }
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
            >
              <option>
                Cuti Tahunan
              </option>

              <option>
                Cuti Sakit
              </option>

              <option>
                Cuti Khusus
              </option>
            </select>
          </div>

          {/* DATE */}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-700">
                Tanggal Mulai
              </label>

              <input
                type="date"
                value={startDate}
                onChange={(e) =>
                  setStartDate(e.target.value)
                }
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold text-gray-700">
                Tanggal Selesai
              </label>

              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) =>
                  setEndDate(e.target.value)
                }
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
              />
            </div>
          </div>

          {/* ESTIMATED DAYS */}

          {estimatedDays > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3.5">
              <CalendarDays
                size={17}
                className="text-indigo-600"
              />

              <div>
                <p className="text-xs font-semibold text-indigo-800">
                  Estimasi Durasi
                </p>

                <p className="mt-0.5 text-xs text-indigo-600">
                  {estimatedDays} hari kalender
                </p>
              </div>
            </div>
          )}

          {/* REASON */}

          <div>
            <label className="mb-2 block text-xs font-semibold text-gray-700">
              Alasan Cuti
            </label>

            <textarea
              rows={4}
              value={reason}
              onChange={(e) =>
                setReason(e.target.value)
              }
              placeholder="Contoh: Liburan keluarga..."
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition placeholder:text-gray-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50"
            />
          </div>

          {/* INFO */}

          <div className="flex gap-3 rounded-xl bg-gray-50 p-4">
            <Info
              size={17}
              className="mt-0.5 shrink-0 text-indigo-500"
            />

            <p className="text-xs leading-5 text-gray-500">
              Pengajuan akan diteruskan kepada manager
              untuk proses persetujuan. Beberapa jenis cuti
              mungkin membutuhkan dokumen pendukung.
            </p>
          </div>

          {/* ACTION */}

          <div className="flex justify-end gap-3 border-t border-gray-100 pt-5">
            <button
              onClick={onClose}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Batal
            </button>

            <button className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700">
              <Send size={15} />
              Kirim Pengajuan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   STATUS HELPER
========================================================= */

function getStatusStyle(
  status: LeaveStatus,
) {
  switch (status) {
    case 'Approved':
      return {
        label: 'Disetujui',
        icon: CheckCircle2,
        badge:
          'border-emerald-100 bg-emerald-50 text-emerald-700',
      };

    case 'Pending':
      return {
        label: 'Menunggu',
        icon: Clock3,
        badge:
          'border-amber-100 bg-amber-50 text-amber-700',
      };

    case 'Rejected':
      return {
        label: 'Ditolak',
        icon: XCircle,
        badge:
          'border-rose-100 bg-rose-50 text-rose-700',
      };

    case 'Cancelled':
      return {
        label: 'Dibatalkan',
        icon: XCircle,
        badge:
          'border-gray-200 bg-gray-50 text-gray-500',
      };
  }
}

