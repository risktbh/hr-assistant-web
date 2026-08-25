'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/app/components/Sidebar';
import Link from 'next/link';

import {
  Briefcase,
  HeartPulse,
  CalendarClock,
  FileSignature,
  Settings,
  FileText,
  Download,
  Search,
  ChevronRight,
  Sparkles,
  Database,
  Files,
  Clock3,
  CheckCircle2,
  ArrowUpRight,
  Filter,
  BookOpen,
  Bot,
  RefreshCw,
  ExternalLink,
  LayoutGrid,
} from 'lucide-react';

type DocumentData = {
  id: string | number;
  filename: string;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    chunks?: number;
  };
};

type DashboardData = {
  totalDocuments: number;
  recentDocuments: DocumentData[];
};

const categories = [
  {
    id: 'policy',
    title: 'Aturan & Kebijakan Kerja',
    shortTitle: 'Kebijakan',
    description:
      'Jam kerja, dress code, panduan WFH/WFO, dan etika kerja perusahaan.',
    icon: Briefcase,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    accent: 'group-hover:border-blue-200',
    docs: [
      'Buku Panduan Karyawan 2026',
      'Kebijakan Hybrid Working',
      'Kode Etik Perusahaan',
    ],
  },
  {
    id: 'benefit',
    title: 'Benefit & Kesejahteraan',
    shortTitle: 'Benefit',
    description:
      'Ketentuan asuransi, fasilitas kesehatan, reimbursement, dan benefit.',
    icon: HeartPulse,
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
    accent: 'group-hover:border-rose-200',
    docs: [
      'Panduan Asuransi Rawat Jalan',
      'Kebijakan Reimbursement Kacamata',
      'Daftar Benefit Karyawan',
    ],
  },
  {
    id: 'leave',
    title: 'Cuti & Kehadiran',
    shortTitle: 'Cuti',
    description:
      'Prosedur cuti, sakit, izin khusus, kehadiran, dan pengajuan lembur.',
    icon: CalendarClock,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    accent: 'group-hover:border-emerald-200',
    docs: [
      'Prosedur Cuti Tahunan & Menikah',
      'SOP Pengajuan Lembur',
      'Kebijakan Cuti Melahirkan',
    ],
  },
  {
    id: 'forms',
    title: 'Formulir & Template',
    shortTitle: 'Template',
    description:
      'Form klaim, surat tugas, perjalanan dinas, dan template administrasi.',
    icon: FileSignature,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    accent: 'group-hover:border-amber-200',
    docs: [
      'Formulir Klaim Reimbursement.pdf',
      'Template Surat Perjalanan Dinas.docx',
    ],
    isForm: true,
  },
];

export default function KnowledgeHub() {
  const [dbData, setDbData] = useState<DashboardData>({
    totalDocuments: 0,
    recentDocuments: [],
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchDocuments = async (refresh = false) => {
    try {
      if (refresh) setIsRefreshing(true);

      const res = await fetch('/api/dashboard', {
        cache: 'no-store',
      });

      const data = await res.json();

      if (res.ok) {
        setDbData({
          totalDocuments: data.totalDocuments ?? 0,
          recentDocuments: data.recentDocuments ?? [],
        });
      }
    } catch (error) {
      console.error('Gagal mengambil data dokumen:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim()) return dbData.recentDocuments;

    const query = searchQuery.toLowerCase();

    return dbData.recentDocuments.filter((doc) =>
      doc.filename.toLowerCase().includes(query),
    );
  }, [dbData.recentDocuments, searchQuery]);

  const totalChunks = useMemo(() => {
    return dbData.recentDocuments.reduce(
      (total, doc) => total + (doc._count?.chunks ?? 0),
      0,
    );
  }, [dbData.recentDocuments]);

  const filteredCategories =
    activeFilter === 'all'
      ? categories
      : categories.filter((category) => category.id === activeFilter);

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
              Knowledge Hub
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Pusat kebijakan, dokumen, formulir, dan informasi HR
            </p>
          </div>

          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-md"
          >
            <Settings size={16} />
            <span className="hidden sm:inline">Kelola Database</span>
          </Link>
        </header>

        <div className="mx-auto w-full max-w-7xl space-y-8 p-6 pb-20 lg:p-8">
          {/* ================================================= */}
          {/* HERO */}
          {/* ================================================= */}

          <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#171445] via-indigo-800 to-violet-700 px-7 py-8 text-white shadow-xl shadow-indigo-950/10 lg:px-9 lg:py-10">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

            <div className="absolute bottom-0 right-1/3 h-40 w-40 rounded-full bg-violet-300/10 blur-3xl" />

            <div className="relative z-10 max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-100 backdrop-blur">
                <Sparkles size={14} />
                HR Knowledge Center
              </div>

              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                Temukan informasi HR dengan cepat.
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-indigo-100/75">
                Cari kebijakan, benefit, prosedur cuti, formulir, atau dokumen
                internal perusahaan dari satu tempat.
              </p>

              {/* Hero Search */}
              <div className="mt-7">
                <div className="flex max-w-3xl items-center gap-3 rounded-2xl border border-white/10 bg-white p-2 shadow-xl shadow-black/10">
                  <Search
                    size={20}
                    className="ml-3 shrink-0 text-gray-400"
                  />

                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari kebijakan, formulir, benefit, atau dokumen..."
                    className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400"
                  />

                  <button className="hidden shrink-0 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 sm:block">
                    Cari
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-indigo-100/70">
                  <span>Pencarian populer:</span>

                  {['Cuti tahunan', 'Asuransi', 'Reimbursement'].map(
                    (item) => (
                      <button
                        key={item}
                        onClick={() => setSearchQuery(item)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 transition hover:bg-white/10 hover:text-white"
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* ================================================= */}
          {/* DATABASE STATS */}
          {/* ================================================= */}

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Files}
              label="Total Dokumen"
              value={isLoading ? '...' : dbData.totalDocuments.toString()}
              description="Tersedia di Knowledge Hub"
              style="bg-indigo-50 text-indigo-600"
            />

            <StatCard
              icon={Database}
              label="AI Knowledge"
              value={isLoading ? '...' : totalChunks.toLocaleString('id-ID')}
              description="Potongan informasi terindeks"
              style="bg-violet-50 text-violet-600"
            />

            <StatCard
              icon={CheckCircle2}
              label="Status Database"
              value="Aktif"
              description="AI dapat membaca knowledge"
              style="bg-emerald-50 text-emerald-600"
            />

            <StatCard
              icon={Clock3}
              label="Sinkronisasi"
              value="Real-time"
              description="Data terbaru tersedia"
              style="bg-blue-50 text-blue-600"
            />
          </section>

          {/* ================================================= */}
          {/* FILTER CATEGORY */}
          {/* ================================================= */}

          <section>
            <div className="mb-4 flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-950">
                  Jelajahi Knowledge
                </h3>

                <p className="mt-1 text-sm text-gray-400">
                  Pilih kategori informasi yang ingin Anda lihat
                </p>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <div className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400">
                  <Filter size={16} />
                </div>

                <FilterButton
                  label="Semua"
                  active={activeFilter === 'all'}
                  onClick={() => setActiveFilter('all')}
                />

                {categories.map((category) => (
                  <FilterButton
                    key={category.id}
                    label={category.shortTitle}
                    active={activeFilter === category.id}
                    onClick={() => setActiveFilter(category.id)}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {filteredCategories.map((category) => (
                <CategoryCard key={category.id} {...category} />
              ))}
            </div>
          </section>

          {/* ================================================= */}
          {/* DOCUMENTS + AI STATUS */}
          {/* ================================================= */}

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.65fr_0.85fr]">
            {/* DOCUMENT LIST */}
            <div className="overflow-hidden rounded-[26px] border border-gray-200/80 bg-white shadow-sm">
              <div className="flex flex-col justify-between gap-4 border-b border-gray-100 p-6 sm:flex-row sm:items-center">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen size={20} className="text-indigo-600" />

                    <h3 className="font-bold text-gray-950">
                      Dokumen AI Knowledge
                    </h3>
                  </div>

                  <p className="mt-1.5 text-xs text-gray-400">
                    Dokumen yang telah diindeks dan dapat digunakan oleh AI
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
                    {dbData.totalDocuments} Dokumen Aktif
                  </span>

                  <button
                    onClick={() => fetchDocuments(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-indigo-600"
                    title="Refresh"
                  >
                    <RefreshCw
                      size={15}
                      className={isRefreshing ? 'animate-spin' : ''}
                    />
                  </button>
                </div>
              </div>

              <div>
                {isLoading ? (
                  <DocumentLoading />
                ) : filteredDocuments.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {filteredDocuments.map((doc) => (
                      <ActivePdfItem
                        key={doc.id}
                        name={doc.filename}
                        chunks={doc._count?.chunks ?? 0}
                        updatedAt={doc.updatedAt}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-50 text-gray-400">
                      <Search size={24} />
                    </div>

                    <h4 className="mt-4 text-sm font-semibold text-gray-800">
                      Dokumen tidak ditemukan
                    </h4>

                    <p className="mt-1 max-w-sm text-xs leading-5 text-gray-400">
                      Tidak ada dokumen yang cocok dengan pencarian
                      &quot;{searchQuery}&quot;.
                    </p>

                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="mt-4 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        Hapus pencarian
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/70 px-6 py-4">
                <span className="text-xs text-gray-400">
                  Menampilkan {filteredDocuments.length} dokumen
                </span>

                <Link
                  href="/admin"
                  className="flex items-center gap-1 text-xs font-semibold text-indigo-600 transition hover:text-indigo-800"
                >
                  Kelola Semua
                  <ChevronRight size={14} />
                </Link>
              </div>
            </div>

            {/* AI KNOWLEDGE STATUS */}
            <div className="space-y-5">
              <div className="relative overflow-hidden rounded-[26px] bg-[#17143f] p-6 text-white shadow-xl shadow-indigo-950/10">
                <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-violet-500/30 blur-3xl" />

                <div className="relative z-10">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                    <Bot size={21} />
                  </div>

                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.15em] text-indigo-300">
                    AI Knowledge
                  </p>

                  <h3 className="mt-2 text-xl font-bold">
                    Tanya dokumen menggunakan AI
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-indigo-100/65">
                    AI dapat mencari jawaban dari seluruh dokumen yang sudah
                    terindeks di database.
                  </p>

                  <div className="mt-5 space-y-2">
                    {[
                      'Apa benefit rawat jalan saya?',
                      'Berapa jatah cuti tahunan?',
                      'Bagaimana prosedur reimbursement?',
                    ].map((question) => (
                      <button
                        key={question}
                        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3.5 py-3 text-left text-xs text-indigo-100 transition hover:bg-white/10"
                      >
                        <span>{question}</span>

                        <ArrowUpRight size={14} />
                      </button>
                    ))}
                  </div>

                  <Link
                    href="/chat"
                    className="mt-5 flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
                  >
                    <Sparkles size={16} />
                    Tanya AI
                    <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>

              {/* Database Health */}
              <div className="rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">
                      Database Health
                    </h4>

                    <p className="mt-1 text-xs text-gray-400">
                      Status knowledge AI saat ini
                    </p>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Database size={18} />
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <StatusRow
                    label="Vector Database"
                    value="Connected"
                  />

                  <StatusRow
                    label="PDF Indexing"
                    value="Active"
                  />

                  <StatusRow
                    label="AI Retrieval"
                    value="Ready"
                  />
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

/* ========================================================= */
/* COMPONENTS */
/* ========================================================= */

function StatCard({
  icon: Icon,
  label,
  value,
  description,
  style,
}: any) {
  return (
    <div className="group rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-lg hover:shadow-gray-200/50">
      <div className="flex items-start justify-between">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${style}`}
        >
          <Icon size={20} />
        </div>

        <ChevronRight
          size={16}
          className="text-gray-300 transition-transform group-hover:translate-x-0.5"
        />
      </div>

      <p className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>

      <h4 className="mt-1 text-xl font-bold tracking-tight text-gray-950">
        {value}
      </h4>

      <p className="mt-1 text-xs text-gray-400">{description}</p>
    </div>
  );
}

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
      onClick={onClick}
      className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
        active
          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
          : 'border border-gray-200 bg-white text-gray-500 hover:border-indigo-200 hover:text-indigo-600'
      }`}
    >
      {label}
    </button>
  );
}

function CategoryCard({
  icon: Icon,
  iconBg,
  iconColor,
  accent,
  title,
  description,
  docs,
  isForm = false,
}: any) {
  return (
    <div
      className={`group rounded-[24px] border border-gray-200/80 bg-white p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-gray-200/50 ${accent}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconBg} ${iconColor}`}
          >
            <Icon size={22} />
          </div>

          <div>
            <h3 className="text-[16px] font-bold text-gray-950">
              {title}
            </h3>

            <p className="mt-1.5 max-w-md text-sm leading-6 text-gray-500">
              {description}
            </p>
          </div>
        </div>

        <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-300 transition hover:bg-gray-50 hover:text-indigo-600">
          <ArrowUpRight size={17} />
        </button>
      </div>

      <div className="mt-6 space-y-2">
        {docs.map((doc: string, index: number) => (
          <button
            key={index}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent bg-gray-50 px-3.5 py-3 text-left transition hover:border-gray-100 hover:bg-indigo-50/60"
          >
            <div className="flex min-w-0 items-center gap-3">
              <FileText
                size={16}
                className={
                  isForm
                    ? 'shrink-0 text-amber-500'
                    : 'shrink-0 text-indigo-400'
                }
              />

              <span className="truncate text-sm font-medium text-gray-700">
                {doc}
              </span>
            </div>

            {isForm ? (
              <Download
                size={15}
                className="shrink-0 text-gray-400 transition hover:text-indigo-600"
              />
            ) : (
              <ChevronRight
                size={15}
                className="shrink-0 text-gray-300"
              />
            )}
          </button>
        ))}
      </div>

      <button className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-indigo-600 transition hover:text-indigo-800">
        Lihat semua dokumen
        <ChevronRight size={13} />
      </button>
    </div>
  );
}

function ActivePdfItem({
  name,
  chunks,
  updatedAt,
}: {
  name: string;
  chunks: number;
  updatedAt?: string;
}) {
  return (
    <div className="group flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-gray-50/80">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500">
          <FileText size={19} />
        </div>

        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-gray-900">
            {name}
          </h4>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
            <span>{chunks.toLocaleString('id-ID')} knowledge chunks</span>

            <span className="h-1 w-1 rounded-full bg-gray-300" />

            <span>PDF Document</span>

            {updatedAt && (
              <>
                <span className="h-1 w-1 rounded-full bg-gray-300" />

                <span>
                  {new Date(updatedAt).toLocaleDateString('id-ID')}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Indexed
        </span>

        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition hover:bg-white hover:text-indigo-600 hover:shadow-sm">
          <ExternalLink size={15} />
        </button>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>

      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {value}
      </span>
    </div>
  );
}

function DocumentLoading() {
  return (
    <div className="divide-y divide-gray-100">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="flex animate-pulse items-center gap-4 px-6 py-5"
        >
          <div className="h-11 w-11 rounded-xl bg-gray-100" />

          <div className="flex-1">
            <div className="h-3.5 w-1/3 rounded bg-gray-100" />

            <div className="mt-2 h-2.5 w-1/4 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}