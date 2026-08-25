import Sidebar from '@/app/components/Sidebar';
import {
  Megaphone,
  CalendarDays,
  HelpCircle,
  Info,
  Bell,
  Sparkles,
  Umbrella,
  ReceiptText,
  WalletCards,
  FileText,
  ChevronRight,
  ArrowUpRight,
  Clock3,
  CheckCircle2,
  Search,
  MessageSquareText,
} from 'lucide-react';
import Link from 'next/link';

export default function Dashboard() {
  const currentDate = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(new Date());

  const stats = [
    {
      title: 'Sisa Cuti',
      value: '9 Hari',
      description: 'Dari 12 hari tahun ini',
      icon: Umbrella,
      iconStyle: 'bg-violet-50 text-violet-600',
    },
    {
      title: 'Reimbursement',
      value: '2 Proses',
      description: 'Menunggu verifikasi HR',
      icon: ReceiptText,
      iconStyle: 'bg-blue-50 text-blue-600',
    },
    {
      title: 'Gaji Berikutnya',
      value: '28 Agu',
      description: 'Jadwal payroll bulan ini',
      icon: WalletCards,
      iconStyle: 'bg-emerald-50 text-emerald-600',
    },
    {
      title: 'Dokumen',
      value: '4 File',
      description: 'Dokumen personal tersedia',
      icon: FileText,
      iconStyle: 'bg-amber-50 text-amber-600',
    },
  ];

  const quickActions = [
    {
      title: 'Tanya AI',
      description: 'Tanyakan kebijakan HR',
      icon: MessageSquareText,
      style: 'bg-indigo-50 text-indigo-600',
    },
    {
      title: 'Ajukan Cuti',
      description: 'Buat pengajuan baru',
      icon: CalendarDays,
      style: 'bg-violet-50 text-violet-600',
    },
    {
      title: 'Reimbursement',
      description: 'Kirim klaim biaya',
      icon: ReceiptText,
      style: 'bg-blue-50 text-blue-600',
    },
    {
      title: 'Dokumen Saya',
      description: 'Lihat file personal',
      icon: FileText,
      style: 'bg-emerald-50 text-emerald-600',
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#f7f8fc] font-sans text-gray-800">
      {/* SIDEBAR */}
      <Sidebar />

      {/* MAIN CONTENT */}
      <main className="relative flex h-full flex-1 flex-col overflow-y-auto bg-[#f8f9fc]">

        {/* TOP HEADER */}
        <header className="sticky top-0 z-30 flex min-h-20 shrink-0 items-center justify-between border-b border-gray-200/70 bg-white/90 px-8 backdrop-blur-xl">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-950">
              Dashboard
            </h2>

            <p className="mt-1 text-xs font-medium capitalize text-gray-400">
              {currentDate}
            </p>
          </div>

          <div className="flex items-center gap-3">

            {/* Search */}
            <div className="hidden items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 lg:flex">
              <Search size={17} className="text-gray-400" />

              <input
                type="text"
                placeholder="Cari informasi HR..."
                className="w-52 bg-transparent text-sm text-gray-700 outline-none placeholder:text-gray-400"
              />
            </div>

            {/* Notification */}
            <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900">
              <Bell size={18} />

              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
            </button>
          </div>
        </header>

        {/* PAGE */}
        <div className="mx-auto w-full max-w-7xl space-y-8 p-6 pb-20 lg:p-8">

          {/* ====================================================== */}
          {/* HERO / WELCOME */}
          {/* ====================================================== */}

          <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#17144a] via-indigo-800 to-violet-700 px-7 py-8 text-white shadow-xl shadow-indigo-950/10 lg:px-9">

            {/* Decorative glow */}
            <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
            <div className="absolute -bottom-28 right-48 h-56 w-56 rounded-full bg-violet-300/10 blur-3xl" />

            <div className="relative z-10 flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-100 backdrop-blur">
                  <Sparkles size={14} />
                  Employee Workspace
                </div>

                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Selamat datang kembali 👋
                </h1>

                <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100/80">
                  Semua informasi penting HR, aktivitas personal, pengumuman,
                  dan bantuan AI tersedia dalam satu dashboard.
                </p>
              </div>

              {/* Ubah <button> menjadi <Link> dan tambahkan href="/" */}
              <Link 
                href="/" 
                className="group flex w-fit items-center gap-3 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-indigo-700 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                <MessageSquareText size={18} />

                Tanya AI Assistant

                <ArrowUpRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </Link>
            </div>
          </section>

          {/* ====================================================== */}
          {/* PERSONAL STATS */}
          {/* ====================================================== */}

          <section>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-950">
                  Ringkasan Saya
                </h3>

                <p className="mt-1 text-sm text-gray-400">
                  Informasi personal dan status terbaru
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className="group rounded-2xl border border-gray-200/80 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-lg hover:shadow-gray-200/50"
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.iconStyle}`}
                      >
                        <Icon size={21} />
                      </div>

                      <ChevronRight
                        size={17}
                        className="text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-400"
                      />
                    </div>

                    <div className="mt-5">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                        {item.title}
                      </p>

                      <h4 className="mt-1 text-xl font-bold tracking-tight text-gray-950">
                        {item.value}
                      </h4>

                      <p className="mt-1 text-xs text-gray-400">
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ====================================================== */}
          {/* QUICK ACTION */}
          {/* ====================================================== */}

          <section>
            <h3 className="mb-4 text-base font-bold text-gray-950">
              Akses Cepat
            </h3>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {quickActions.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.title}
                    className="group flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-white p-4 text-left shadow-sm transition hover:border-indigo-100 hover:shadow-md"
                  >
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.style}`}
                    >
                      <Icon size={20} />
                    </div>

                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {item.title}
                      </p>

                      <p className="mt-0.5 truncate text-xs text-gray-400">
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ====================================================== */}
          {/* ANNOUNCEMENTS + SCHEDULE */}
          {/* ====================================================== */}

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.6fr_1fr]">

            {/* ANNOUNCEMENTS */}
            <div className="rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm">

              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Megaphone size={20} />
                  </div>

                  <div>
                    <h3 className="font-bold text-gray-950">
                      Pengumuman Terbaru
                    </h3>

                    <p className="mt-0.5 text-xs text-gray-400">
                      Informasi penting dari perusahaan
                    </p>
                  </div>
                </div>

                <button className="text-xs font-semibold text-indigo-600 transition hover:text-indigo-800">
                  Lihat Semua
                </button>
              </div>

              <div className="space-y-3">

                {/* Highlight */}
                <div className="group relative overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 p-5 transition hover:border-indigo-200">

                  <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-indigo-100/50 blur-3xl" />

                  <div className="relative z-10">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <span className="inline-flex rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                        Penting
                      </span>

                      <span className="text-xs text-gray-400">
                        24 Agu 2026
                      </span>
                    </div>

                    <h4 className="font-bold text-gray-950">
                      Pembaruan Benefit Karyawan 2026
                    </h4>

                    <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                      Penyesuaian plafon asuransi rawat jalan telah diperbarui
                      dan berlaku efektif mulai Agustus 2026.
                    </p>

                    <button className="mt-4 flex items-center gap-1.5 text-xs font-bold text-indigo-600">
                      Baca selengkapnya
                      <ChevronRight
                        size={14}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </button>
                  </div>
                </div>

                {/* Announcement Row */}
                <div className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-transparent p-4 transition hover:border-gray-100 hover:bg-gray-50">

                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <CalendarDays size={20} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-gray-900">
                        Jadwal Hari Libur Nasional
                      </h4>

                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-bold uppercase text-red-500">
                        Baru
                      </span>
                    </div>

                    <p className="mt-1 truncate text-xs text-gray-400">
                      Harap sesuaikan jadwal operasional dan pengajuan cuti.
                    </p>
                  </div>

                  <ChevronRight
                    size={17}
                    className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500"
                  />
                </div>

                <div className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-transparent p-4 transition hover:border-gray-100 hover:bg-gray-50">

                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <FileText size={20} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-gray-900">
                      Kebijakan Reimbursement Terbaru
                    </h4>

                    <p className="mt-1 truncate text-xs text-gray-400">
                      Beberapa kategori reimbursement mengalami pembaruan.
                    </p>
                  </div>

                  <ChevronRight
                    size={17}
                    className="text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* UPCOMING */}
            <div className="rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm">

              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                  <CalendarDays size={20} />
                </div>

                <div>
                  <h3 className="font-bold text-gray-950">
                    Agenda Mendatang
                  </h3>

                  <p className="mt-0.5 text-xs text-gray-400">
                    Jadwal terdekat Anda
                  </p>
                </div>
              </div>

              <div className="space-y-5">

                <div className="flex gap-4">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-indigo-50">
                    <span className="text-[10px] font-bold uppercase text-indigo-400">
                      Agu
                    </span>

                    <span className="text-lg font-bold leading-none text-indigo-700">
                      27
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Monthly Town Hall
                    </p>

                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock3 size={13} />
                      15:00 - 16:00 WIB
                    </p>
                  </div>
                </div>

                <div className="h-px bg-gray-100" />

                <div className="flex gap-4">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-50">
                    <span className="text-[10px] font-bold uppercase text-emerald-500">
                      Agu
                    </span>

                    <span className="text-lg font-bold leading-none text-emerald-700">
                      28
                    </span>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Payroll Bulanan
                    </p>

                    <p className="mt-1 text-xs text-gray-400">
                      Estimasi pencairan gaji
                    </p>
                  </div>
                </div>

                <div className="h-px bg-gray-100" />

                <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-50 py-3 text-xs font-semibold text-gray-600 transition hover:bg-indigo-50 hover:text-indigo-600">
                  Lihat Kalender
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </section>

          {/* ====================================================== */}
          {/* RECENT ACTIVITY + AI */}
          {/* ====================================================== */}

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">

            {/* ACTIVITY */}
            <div className="rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm">

              <div className="mb-6">
                <h3 className="font-bold text-gray-950">
                  Aktivitas Terbaru
                </h3>

                <p className="mt-1 text-xs text-gray-400">
                  Riwayat aktivitas akun Anda
                </p>
              </div>

              <div className="space-y-5">
                <div className="flex gap-4">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 size={16} />
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      Pengajuan cuti telah disetujui
                    </p>

                    <p className="mt-1 text-xs text-gray-400">
                      2 jam yang lalu
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                    <ReceiptText size={16} />
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      Reimbursement sedang diverifikasi
                    </p>

                    <p className="mt-1 text-xs text-gray-400">
                      Kemarin
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-600">
                    <FileText size={16} />
                  </div>

                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      Slip gaji terbaru tersedia
                    </p>

                    <p className="mt-1 text-xs text-gray-400">
                      22 Agustus 2026
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* AI CARD */}
            <div className="relative overflow-hidden rounded-[26px] bg-[#15133d] p-7 text-white shadow-xl shadow-indigo-950/10">

              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/30 blur-3xl" />

              <div className="relative z-10">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
                  <Sparkles size={23} />
                </div>

                <span className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-300">
                  AI HR Assistant
                </span>

                <h3 className="mt-2 text-xl font-bold">
                  Ada yang ingin Anda tanyakan?
                </h3>

                <p className="mt-3 max-w-md text-sm leading-6 text-indigo-100/70">
                  AI dapat membantu menjelaskan benefit, kebijakan cuti,
                  reimbursement, payroll, hingga informasi HR lainnya.
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  {[
                    'Sisa cuti saya',
                    'Benefit asuransi',
                    'Status reimbursement',
                  ].map((question) => (
                    <button
                      key={question}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-indigo-100 transition hover:bg-white/10"
                    >
                      {question}
                    </button>
                  ))}
                </div>
                <Link 
                  href="/"
                  className="mt-6 flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50"
                >
                  Mulai Chat
                  <ArrowUpRight size={16} />
                </Link>
              </div>
            </div>
          </section>

          {/* ====================================================== */}
          {/* FAQ */}
          {/* ====================================================== */}

          <section className="rounded-[26px] border border-gray-200/80 bg-white p-6 shadow-sm">

            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <HelpCircle size={20} />
              </div>

              <div>
                <h3 className="font-bold text-gray-950">
                  Pertanyaan Umum
                </h3>

                <p className="mt-0.5 text-xs text-gray-400">
                  Informasi yang sering ditanyakan karyawan
                </p>
              </div>
            </div>

            <div className="divide-y divide-gray-100">

              <details className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5">
                  <div className="flex items-center gap-3">
                    <Info
                      size={18}
                      className="shrink-0 text-indigo-500"
                    />

                    <span className="text-sm font-semibold text-gray-900">
                      Bagaimana cara mengecek sisa cuti saya?
                    </span>
                  </div>

                  <ChevronRight
                    size={18}
                    className="shrink-0 text-gray-400 transition-transform group-open:rotate-90"
                  />
                </summary>

                <p className="ml-8 mt-3 max-w-3xl text-sm leading-6 text-gray-500">
                  Anda dapat membuka menu AI Chat dan menanyakan
                  &quot;Berapa sisa cuti tahunan saya?&quot;. AI akan
                  menampilkan informasi berdasarkan data HR Anda.
                </p>
              </details>

              <details className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5">
                  <div className="flex items-center gap-3">
                    <Info
                      size={18}
                      className="shrink-0 text-indigo-500"
                    />

                    <span className="text-sm font-semibold text-gray-900">
                      Kapan tanggal pencairan gaji bulanan?
                    </span>
                  </div>

                  <ChevronRight
                    size={18}
                    className="shrink-0 text-gray-400 transition-transform group-open:rotate-90"
                  />
                </summary>

                <p className="ml-8 mt-3 max-w-3xl text-sm leading-6 text-gray-500">
                  Sesuai kebijakan perusahaan, pencairan dilakukan setiap
                  tanggal 28. Apabila jatuh pada hari libur, pembayaran akan
                  disesuaikan dengan hari kerja sebelumnya.
                </p>
              </details>

              <details className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5">
                  <div className="flex items-center gap-3">
                    <Info
                      size={18}
                      className="shrink-0 text-indigo-500"
                    />

                    <span className="text-sm font-semibold text-gray-900">
                      Bagaimana mengecek status reimbursement?
                    </span>
                  </div>

                  <ChevronRight
                    size={18}
                    className="shrink-0 text-gray-400 transition-transform group-open:rotate-90"
                  />
                </summary>

                <p className="ml-8 mt-3 max-w-3xl text-sm leading-6 text-gray-500">
                  Status reimbursement dapat dilihat melalui dashboard atau
                  ditanyakan langsung melalui AI Assistant.
                </p>
              </details>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}