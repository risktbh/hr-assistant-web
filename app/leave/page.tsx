'use client';

import { useMemo, useState } from 'react';

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
} from 'lucide-react';

/* =========================================================
   TYPES
========================================================= */

type LeaveStatus =
  | 'Approved'
  | 'Pending'
  | 'Rejected';

type LeaveType =
  | 'Cuti Tahunan'
  | 'Cuti Sakit'
  | 'Cuti Khusus';

type LeaveItem = {
  id: number;
  type: LeaveType;
  startDate: string;
  endDate: string;
  dateLabel: string;
  days: number;
  status: LeaveStatus;
  note: string;
  submittedAt: string;
};

/* =========================================================
   DUMMY DATA
========================================================= */

const leaveHistory: LeaveItem[] = [
  {
    id: 1,
    type: 'Cuti Tahunan',
    startDate: '2026-08-12',
    endDate: '2026-08-14',
    dateLabel: '12 Agu - 14 Agu 2026',
    days: 3,
    status: 'Approved',
    note: 'Liburan keluarga ke Bali',
    submittedAt: '01 Agu 2026',
  },
  {
    id: 2,
    type: 'Cuti Sakit',
    startDate: '2026-06-05',
    endDate: '2026-06-05',
    dateLabel: '05 Jun 2026',
    days: 1,
    status: 'Approved',
    note: 'Demam tifoid (Surat dokter terlampir)',
    submittedAt: '05 Jun 2026',
  },
  {
    id: 3,
    type: 'Cuti Tahunan',
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    dateLabel: '20 Sep 2026',
    days: 1,
    status: 'Pending',
    note: 'Urus dokumen administrasi kelulusan kampus',
    submittedAt: '22 Agu 2026',
  },
  {
    id: 4,
    type: 'Cuti Khusus',
    startDate: '2026-04-17',
    endDate: '2026-04-17',
    dateLabel: '17 Apr 2026',
    days: 1,
    status: 'Rejected',
    note: 'Keperluan pribadi',
    submittedAt: '10 Apr 2026',
  },
];

/* =========================================================
   MAIN
========================================================= */

export default function TimeAndLeave() {
  const [historyFilter, setHistoryFilter] =
    useState<'ALL' | LeaveStatus>('ALL');

  const [showLeaveModal, setShowLeaveModal] =
    useState(false);

  const filteredHistory = useMemo(() => {
    if (historyFilter === 'ALL') {
      return leaveHistory;
    }

    return leaveHistory.filter(
      (item) => item.status === historyFilter,
    );
  }, [historyFilter]);

  const stats = useMemo(() => {
    return {
      approved: leaveHistory.filter(
        (item) => item.status === 'Approved',
      ).length,

      pending: leaveHistory.filter(
        (item) => item.status === 'Pending',
      ).length,

      rejected: leaveHistory.filter(
        (item) => item.status === 'Rejected',
      ).length,
    };
  }, []);

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
                  Periode Januari - Desember 2026
                </p>
              </div>

              <span className="hidden rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 sm:block">
                Tahun 2026
              </span>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
              <LeaveBalanceCard
                title="Cuti Tahunan"
                subtitle="Annual Leave"
                icon={Umbrella}
                used={4}
                total={12}
                color="indigo"
                desc="Berlaku hingga 31 Des 2026"
              />

              <LeaveBalanceCard
                title="Cuti Sakit"
                subtitle="Medical Leave"
                icon={HeartPulse}
                used={2}
                total={14}
                color="rose"
                desc="Surat dokter mungkin diperlukan"
              />

              <LeaveBalanceCard
                title="Cuti Khusus"
                subtitle="Special Leave"
                icon={CalendarClock}
                used={0}
                total={3}
                color="emerald"
                desc="Menikah, kedukaan, dan kebutuhan khusus"
              />
            </div>
          </section>

          {/* ================================================= */}
          {/* STATUS SUMMARY */}
          {/* ================================================= */}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <LeaveSummaryCard
              icon={CalendarDays}
              label="Total Pengajuan"
              value={leaveHistory.length}
              description="Sepanjang tahun 2026"
              style="bg-indigo-50 text-indigo-600"
            />

            <LeaveSummaryCard
              icon={CheckCircle2}
              label="Disetujui"
              value={stats.approved}
              description="Pengajuan approved"
              style="bg-emerald-50 text-emerald-600"
            />

            <LeaveSummaryCard
              icon={Clock3}
              label="Menunggu"
              value={stats.pending}
              description="Menunggu persetujuan"
              style="bg-amber-50 text-amber-600"
            />

            <LeaveSummaryCard
              icon={XCircle}
              label="Ditolak"
              value={stats.rejected}
              description="Tidak disetujui"
              style="bg-rose-50 text-rose-600"
            />
          </section>

          {/* ================================================= */}
          {/* UPCOMING + QUICK ACTION */}
          {/* ================================================= */}

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1fr]">

            {/* UPCOMING LEAVE */}

            <div className="rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
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

                <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
                  PENDING
                </span>
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 to-violet-50 p-5">
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
                      Cuti Tahunan
                    </p>

                    <h4 className="mt-2 text-lg font-bold text-gray-950">
                      20 September 2026
                    </h4>

                    <p className="mt-1 text-sm text-gray-500">
                      1 Hari • Urus dokumen administrasi
                    </p>
                  </div>

                  <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-white shadow-sm">
                    <span className="text-[10px] font-bold uppercase text-indigo-400">
                      Sep
                    </span>

                    <span className="text-xl font-black text-indigo-700">
                      20
                    </span>
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-indigo-100 pt-4 text-xs text-gray-500">
                  <Clock3
                    size={14}
                    className="text-amber-500"
                  />

                  Menunggu persetujuan manager
                </div>
              </div>
            </div>

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
                  icon={FileText}
                  title="Reimburse Medis"
                  description="Klaim biaya kesehatan"
                  style="bg-blue-50 text-blue-600"
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
              </div>
            </div>

            <div className="overflow-hidden rounded-[26px] border border-gray-200/80 bg-white shadow-sm">
              {filteredHistory.length > 0 ? (
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
                    Tidak ada pengajuan
                  </p>

                  <p className="mt-1 text-xs text-gray-400">
                    Belum ada pengajuan dengan status tersebut.
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

/* =========================================================
   LEAVE BALANCE CARD
========================================================= */

function LeaveBalanceCard({
  title,
  subtitle,
  icon: Icon,
  used,
  total,
  color,
  desc,
}: any) {
  const remaining = total - used;

  const percentage =
    total === 0
      ? 0
      : Math.min((used / total) * 100, 100);

  const colorMap: Record<
    string,
    {
      bg: string;
      text: string;
      progress: string;
      soft: string;
    }
  > = {
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
  };

  const theme = colorMap[color];

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

      <div className="mt-7 flex items-end gap-2">
        <span className="text-4xl font-black tracking-tight text-gray-950">
          {remaining}
        </span>

        <span className="mb-1 text-sm font-medium text-gray-400">
          dari {total} hari
        </span>
      </div>

      <p className="mt-1 text-xs text-gray-400">
        Saldo tersedia
      </p>

      {/* PROGRESS */}

      <div className={`mt-5 h-2 overflow-hidden rounded-full ${theme.soft}`}>
        <div
          className={`h-full rounded-full ${theme.progress}`}
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-gray-400">
          Digunakan{' '}
          <strong className="font-semibold text-gray-700">
            {used} hari
          </strong>
        </span>

        <span className="truncate text-[10px] text-gray-400">
          {desc}
        </span>
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
}: any) {
  return (
    <button className="group flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-gray-50/70 p-4 text-left transition hover:border-indigo-100 hover:bg-white hover:shadow-sm">

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
  const status = getStatusStyle(item.status);

  return (
    <div className="group flex cursor-pointer flex-col gap-4 px-6 py-5 transition hover:bg-gray-50/70 sm:flex-row sm:items-center sm:justify-between">

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

          <p className="mt-2 truncate text-xs text-gray-400">
            {item.note}
          </p>
        </div>
      </div>

      <ChevronRight
        size={18}
        className="hidden shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500 sm:block"
      />
    </div>
  );
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
  }
}