'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/app/components/Sidebar';

import {
  Search,
  Mail,
  MessageCircle,
  MapPin,
  UserCircle2,
  Building2,
  Users,
  Home,
  BriefcaseBusiness,
  CalendarOff,
  Grid2X2,
  List,
  SlidersHorizontal,
  ChevronRight,
  ArrowUpRight,
  X,
  Phone,
  UserRound,
  CheckCircle2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

/* =========================================================
   TYPES
========================================================= */

type EmployeeStatus = 'WFO' | 'WFH' | 'CUTI' | string;

type Employee = {
  id: string | number;
  name: string;
  position: string;
  department: string;
  email: string;
  phone: string;
  status: EmployeeStatus;
  location: string;
  initial?: string;
};

type ViewMode = 'grid' | 'list';

type SortOption = 'name-asc' | 'name-desc';

/* =========================================================
   MAIN PAGE
========================================================= */

export default function Directory() {
  const [searchQuery, setSearchQuery] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [activeStatus, setActiveStatus] = useState('ALL');
  const [activeDepartment, setActiveDepartment] = useState('ALL');

  const [sortBy, setSortBy] = useState<SortOption>('name-asc');

  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const [selectedEmployee, setSelectedEmployee] =
    useState<Employee | null>(null);

  /* =======================================================
     FETCH EMPLOYEES
  ======================================================= */

  const fetchEmployees = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      const res = await fetch('/api/employees', {
        cache: 'no-store',
      });

      const data = await res.json();

      if (res.ok) {
        setEmployees(data);
      }
    } catch (error) {
      console.error('Gagal memuat data karyawan:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  /* =======================================================
     DEPARTMENT LIST
  ======================================================= */

  const departments = useMemo(() => {
    return Array.from(
      new Set(
        employees
          .map((employee) => employee.department)
          .filter(Boolean),
      ),
    ).sort();
  }, [employees]);

  /* =======================================================
     STATISTICS
  ======================================================= */

  const employeeStats = useMemo(() => {
    return {
      total: employees.length,

      wfo: employees.filter(
        (employee) => employee.status === 'WFO',
      ).length,

      wfh: employees.filter(
        (employee) => employee.status === 'WFH',
      ).length,

      leave: employees.filter(
        (employee) => employee.status === 'CUTI',
      ).length,
    };
  }, [employees]);

  /* =======================================================
     FILTER + SEARCH + SORT
  ======================================================= */

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const result = employees.filter((employee) => {
      const matchesSearch =
        !query ||
        employee.name?.toLowerCase().includes(query) ||
        employee.position?.toLowerCase().includes(query) ||
        employee.department?.toLowerCase().includes(query) ||
        employee.location?.toLowerCase().includes(query) ||
        employee.email?.toLowerCase().includes(query);

      const matchesStatus =
        activeStatus === 'ALL' ||
        employee.status === activeStatus;

      const matchesDepartment =
        activeDepartment === 'ALL' ||
        employee.department === activeDepartment;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesDepartment
      );
    });

    return result.sort((a, b) => {
      if (sortBy === 'name-desc') {
        return b.name.localeCompare(a.name);
      }

      return a.name.localeCompare(b.name);
    });
  }, [
    employees,
    searchQuery,
    activeStatus,
    activeDepartment,
    sortBy,
  ]);

  /* =======================================================
     CLEAR FILTER
  ======================================================= */

  const clearFilters = () => {
    setSearchQuery('');
    setActiveStatus('ALL');
    setActiveDepartment('ALL');
    setSortBy('name-asc');
  };

  const hasActiveFilter =
    searchQuery ||
    activeStatus !== 'ALL' ||
    activeDepartment !== 'ALL';

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
              Employee Directory
            </h2>

            <p className="mt-1 text-sm text-gray-400">
              Temukan dan hubungi rekan kerja dengan mudah
            </p>
          </div>

          <button
            onClick={() => fetchEmployees(true)}
            className="flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-600 transition hover:border-indigo-200 hover:text-indigo-600"
          >
            <RefreshCw
              size={15}
              className={isRefreshing ? 'animate-spin' : ''}
            />

            <span className="hidden sm:inline">
              Refresh
            </span>
          </button>
        </header>

        {/* ================================================= */}
        {/* PAGE CONTENT */}
        {/* ================================================= */}

        <div className="mx-auto w-full max-w-7xl space-y-7 p-6 pb-20 lg:p-8">
          {/* ================================================= */}
          {/* HERO SEARCH */}
          {/* ================================================= */}

          <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#171443] via-indigo-800 to-violet-700 px-7 py-8 text-white shadow-xl shadow-indigo-950/10 lg:px-9 lg:py-9">
            {/* Decoration */}

            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

            <div className="absolute bottom-0 right-1/3 h-44 w-44 rounded-full bg-violet-300/10 blur-3xl" />

            <div className="relative z-10">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-medium text-indigo-100 backdrop-blur">
                <Users size={14} />

                Company Directory
              </div>

              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Temukan rekan kerja Anda.
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100/70">
                Cari berdasarkan nama, posisi, departemen,
                lokasi kerja, atau email perusahaan.
              </p>

              {/* SEARCH */}

              <div className="mt-7 flex max-w-3xl items-center gap-3 rounded-2xl border border-white/10 bg-white p-2 shadow-xl shadow-black/10">
                <Search
                  size={20}
                  className="ml-3 shrink-0 text-gray-400"
                />

                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) =>
                    setSearchQuery(e.target.value)
                  }
                  placeholder="Cari nama, jabatan, departemen..."
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-sm text-gray-800 outline-none placeholder:text-gray-400"
                />

                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  >
                    <X size={16} />
                  </button>
                )}

                <button className="hidden rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 sm:block">
                  Cari
                </button>
              </div>
            </div>
          </section>

          {/* ================================================= */}
          {/* SUMMARY */}
          {/* ================================================= */}

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <DirectoryStat
              icon={Users}
              label="Total Employee"
              value={
                isLoading
                  ? '...'
                  : employeeStats.total.toString()
              }
              description="Karyawan terdaftar"
              style="bg-indigo-50 text-indigo-600"
            />

            <DirectoryStat
              icon={Building2}
              label="Work From Office"
              value={
                isLoading
                  ? '...'
                  : employeeStats.wfo.toString()
              }
              description="Sedang berada di kantor"
              style="bg-emerald-50 text-emerald-600"
            />

            <DirectoryStat
              icon={Home}
              label="Work From Home"
              value={
                isLoading
                  ? '...'
                  : employeeStats.wfh.toString()
              }
              description="Bekerja remote hari ini"
              style="bg-blue-50 text-blue-600"
            />

            <DirectoryStat
              icon={CalendarOff}
              label="Out of Office"
              value={
                isLoading
                  ? '...'
                  : employeeStats.leave.toString()
              }
              description="Sedang cuti / tidak aktif"
              style="bg-rose-50 text-rose-600"
            />
          </section>

          {/* ================================================= */}
          {/* FILTER BAR */}
          {/* ================================================= */}

          <section className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              {/* STATUS */}

              <div className="flex items-center gap-2 overflow-x-auto">
                <div className="mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
                  <SlidersHorizontal size={16} />
                </div>

                <StatusFilterButton
                  label="Semua"
                  count={employeeStats.total}
                  active={activeStatus === 'ALL'}
                  onClick={() => setActiveStatus('ALL')}
                />

                <StatusFilterButton
                  label="WFO"
                  count={employeeStats.wfo}
                  active={activeStatus === 'WFO'}
                  onClick={() => setActiveStatus('WFO')}
                />

                <StatusFilterButton
                  label="WFH"
                  count={employeeStats.wfh}
                  active={activeStatus === 'WFH'}
                  onClick={() => setActiveStatus('WFH')}
                />

                <StatusFilterButton
                  label="Out of Office"
                  count={employeeStats.leave}
                  active={activeStatus === 'CUTI'}
                  onClick={() => setActiveStatus('CUTI')}
                />
              </div>

              {/* SELECTS + VIEW */}

              <div className="flex flex-wrap items-center gap-2">
                {/* DEPARTMENT */}

                <select
                  value={activeDepartment}
                  onChange={(e) =>
                    setActiveDepartment(e.target.value)
                  }
                  className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 outline-none transition focus:border-indigo-300"
                >
                  <option value="ALL">
                    Semua Departemen
                  </option>

                  {departments.map((department) => (
                    <option
                      key={department}
                      value={department}
                    >
                      {department}
                    </option>
                  ))}
                </select>

                {/* SORT */}

                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target.value as SortOption,
                    )
                  }
                  className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-600 outline-none transition focus:border-indigo-300"
                >
                  <option value="name-asc">
                    Nama A-Z
                  </option>

                  <option value="name-desc">
                    Nama Z-A
                  </option>
                </select>

                {/* VIEW SWITCH */}

                <div className="flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                      viewMode === 'grid'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    <Grid2X2 size={15} />
                  </button>

                  <button
                    onClick={() => setViewMode('list')}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                      viewMode === 'list'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    <List size={16} />
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ================================================= */}
          {/* RESULT INFORMATION */}
          {/* ================================================= */}

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-950">
                Semua Karyawan
              </h3>

              <p className="mt-1 text-xs text-gray-400">
                Menampilkan {filteredEmployees.length} dari{' '}
                {employees.length} karyawan
              </p>
            </div>

            {hasActiveFilter && (
              <button
                onClick={clearFilters}
                className="text-xs font-semibold text-indigo-600 transition hover:text-indigo-800"
              >
                Hapus semua filter
              </button>
            )}
          </div>

          {/* ================================================= */}
          {/* EMPLOYEES */}
          {/* ================================================= */}

          {isLoading ? (
            <EmployeeLoading />
          ) : filteredEmployees.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {filteredEmployees.map((employee) => (
                  <EmployeeCard
                    key={employee.id}
                    employee={employee}
                    onViewProfile={() =>
                      setSelectedEmployee(employee)
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-[24px] border border-gray-200/80 bg-white shadow-sm">
                <div className="divide-y divide-gray-100">
                  {filteredEmployees.map((employee) => (
                    <EmployeeListItem
                      key={employee.id}
                      employee={employee}
                      onViewProfile={() =>
                        setSelectedEmployee(employee)
                      }
                    />
                  ))}
                </div>
              </div>
            )
          ) : (
            <EmployeeEmptyState
              searchQuery={searchQuery}
              onReset={clearFilters}
            />
          )}
        </div>
      </main>

      {/* ================================================= */}
      {/* EMPLOYEE DETAIL MODAL */}
      {/* ================================================= */}

      {selectedEmployee && (
        <EmployeeDetailModal
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </div>
  );
}

/* =========================================================
   STAT CARD
========================================================= */

function DirectoryStat({
  icon: Icon,
  label,
  value,
  description,
  style,
}: any) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-100 hover:shadow-md lg:p-5">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${style}`}
      >
        <Icon size={19} />
      </div>

      <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 sm:text-[11px]">
        {label}
      </p>

      <h4 className="mt-1 text-xl font-bold tracking-tight text-gray-950">
        {value}
      </h4>

      <p className="mt-1 hidden text-xs text-gray-400 sm:block">
        {description}
      </p>
    </div>
  );
}

/* =========================================================
   STATUS FILTER
========================================================= */

function StatusFilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
        active
          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
          : 'border border-gray-200 bg-white text-gray-500 hover:border-indigo-200 hover:text-indigo-600'
      }`}
    >
      {label}

      <span
        className={`rounded-md px-1.5 py-0.5 text-[9px] ${
          active
            ? 'bg-white/15 text-white'
            : 'bg-gray-100 text-gray-500'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* =========================================================
   EMPLOYEE CARD
========================================================= */

function EmployeeCard({
  employee,
  onViewProfile,
}: {
  employee: Employee;
  onViewProfile: () => void;
}) {
  const status = getEmployeeStatus(employee.status);

  const whatsappNumber = employee.phone.replace(
    /[^0-9]/g,
    '',
  );

  return (
    <div className="group relative overflow-hidden rounded-[24px] border border-gray-200/80 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-indigo-100 hover:shadow-xl hover:shadow-gray-200/60">
      {/* subtle top accent */}

      <div className={`h-1 w-full ${status.bar}`} />

      <div className="p-5">
        {/* STATUS */}

        <div className="flex items-start justify-between gap-4">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${status.badge}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
            />

            {status.label}
          </span>

          <button
            onClick={onViewProfile}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition hover:bg-gray-50 hover:text-indigo-600"
          >
            <ArrowUpRight size={16} />
          </button>
        </div>

        {/* PROFILE */}

        <div className="mt-5 flex items-center gap-4">
          <div className="relative">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 text-lg font-bold text-indigo-700 ring-1 ring-indigo-100">
              {employee.initial ||
                getInitial(employee.name)}
            </div>

            <span
              className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-[3px] border-white ${status.dot}`}
            />
          </div>

          <div className="min-w-0">
            <h3 className="truncate text-[16px] font-bold text-gray-950">
              {employee.name}
            </h3>

            <p className="mt-1 truncate text-sm font-medium text-indigo-600">
              {employee.position}
            </p>
          </div>
        </div>

        {/* INFORMATION */}

        <div className="mt-5 space-y-2.5">
          <EmployeeInfoRow
            icon={Building2}
            value={employee.department}
          />

          <EmployeeInfoRow
            icon={MapPin}
            value={employee.location}
          />
        </div>

        {/* DIVIDER */}

        <div className="my-5 h-px bg-gray-100" />

        {/* ACTIONS */}

        <div className="flex gap-2">
          <a
            href={`mailto:${employee.email}`}
            title={`Email ${employee.name}`}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-xs font-semibold text-gray-600 transition hover:border-indigo-200 hover:bg-indigo-50/50 hover:text-indigo-600"
          >
            <Mail size={15} />

            Email
          </a>

          <a
            href={`https://wa.me/${whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            title={`WhatsApp ${employee.name}`}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 py-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
          >
            <MessageCircle size={15} />

            WhatsApp
          </a>
        </div>

        <button
          onClick={onViewProfile}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-gray-400 transition hover:bg-gray-50 hover:text-indigo-600"
        >
          Lihat Profil

          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   LIST VIEW
========================================================= */

function EmployeeListItem({
  employee,
  onViewProfile,
}: {
  employee: Employee;
  onViewProfile: () => void;
}) {
  const status = getEmployeeStatus(employee.status);

  const whatsappNumber = employee.phone.replace(
    /[^0-9]/g,
    '',
  );

  return (
    <div className="group flex flex-col gap-4 p-5 transition hover:bg-gray-50/70 lg:flex-row lg:items-center">
      {/* PERSON */}

      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="relative">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-violet-100 text-sm font-bold text-indigo-700">
            {employee.initial ||
              getInitial(employee.name)}
          </div>

          <span
            className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-[3px] border-white ${status.dot}`}
          />
        </div>

        <div className="min-w-0">
          <h4 className="truncate text-sm font-bold text-gray-900">
            {employee.name}
          </h4>

          <p className="mt-1 truncate text-xs font-medium text-indigo-600">
            {employee.position}
          </p>
        </div>
      </div>

      {/* DEPARTMENT */}

      <div className="hidden min-w-[160px] xl:block">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Department
        </p>

        <p className="mt-1 text-xs font-medium text-gray-700">
          {employee.department}
        </p>
      </div>

      {/* LOCATION */}

      <div className="hidden min-w-[140px] lg:block">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Location
        </p>

        <p className="mt-1 text-xs font-medium text-gray-700">
          {employee.location}
        </p>
      </div>

      {/* STATUS */}

      <div className="min-w-[110px]">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${status.badge}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
          />

          {status.label}
        </span>
      </div>

      {/* ACTION */}

      <div className="flex items-center gap-2">
        <a
          href={`mailto:${employee.email}`}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 transition hover:border-indigo-200 hover:text-indigo-600"
        >
          <Mail size={15} />
        </a>

        <a
          href={`https://wa.me/${whatsappNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100"
        >
          <MessageCircle size={15} />
        </a>

        <button
          onClick={onViewProfile}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 transition hover:border-indigo-200 hover:text-indigo-600"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   DETAIL MODAL
========================================================= */

function EmployeeDetailModal({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  const status = getEmployeeStatus(employee.status);

  const whatsappNumber = employee.phone.replace(
    /[^0-9]/g,
    '',
  );

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/30 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-[28px] bg-white shadow-2xl"
      >
        {/* HEADER */}

        <div className="relative overflow-hidden bg-gradient-to-br from-[#181543] via-indigo-800 to-violet-700 px-7 pb-16 pt-7">
          <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full bg-white/10 blur-3xl" />

          <button
            onClick={onClose}
            className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
          >
            <X size={17} />
          </button>

          <div className="relative z-10">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-indigo-100">
              <Sparkles size={12} />
              Employee Profile
            </span>
          </div>
        </div>

        {/* PROFILE AVATAR */}

        <div className="-mt-10 px-7">
          <div className="relative inline-flex">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border-[5px] border-white bg-gradient-to-br from-indigo-100 to-violet-100 text-2xl font-bold text-indigo-700 shadow-lg">
              {employee.initial ||
                getInitial(employee.name)}
            </div>

            <span
              className={`absolute bottom-1 right-0 h-4 w-4 rounded-full border-[3px] border-white ${status.dot}`}
            />
          </div>
        </div>

        {/* CONTENT */}

        <div className="px-7 pb-7 pt-4">
          <div className="flex items-start justify-between gap-5">
            <div>
              <h2 className="text-xl font-bold text-gray-950">
                {employee.name}
              </h2>

              <p className="mt-1 text-sm font-semibold text-indigo-600">
                {employee.position}
              </p>
            </div>

            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${status.badge}`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${status.dot}`}
              />

              {status.label}
            </span>
          </div>

          {/* INFO BOX */}

          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            <ProfileDetailRow
              icon={Building2}
              label="Department"
              value={employee.department}
            />

            <ProfileDetailRow
              icon={BriefcaseBusiness}
              label="Position"
              value={employee.position}
            />

            <ProfileDetailRow
              icon={MapPin}
              label="Work Location"
              value={employee.location}
            />

            <ProfileDetailRow
              icon={Mail}
              label="Email"
              value={employee.email}
            />

            <ProfileDetailRow
              icon={Phone}
              label="Phone"
              value={`+${employee.phone}`}
              last
            />
          </div>

          {/* STATUS NOTE */}

          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-gray-50 p-4">
            <CheckCircle2
              size={18}
              className="mt-0.5 shrink-0 text-indigo-500"
            />

            <div>
              <p className="text-xs font-semibold text-gray-800">
                Work Status
              </p>

              <p className="mt-1 text-xs leading-5 text-gray-500">
                {status.description}
              </p>
            </div>
          </div>

          {/* ACTIONS */}

          <div className="mt-6 grid grid-cols-2 gap-3">
            <a
              href={`mailto:${employee.email}`}
              className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600"
            >
              <Mail size={16} />
              Email
            </a>

            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <MessageCircle size={16} />
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function EmployeeInfoRow({
  icon: Icon,
  value,
}: {
  icon: any;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-xs text-gray-500">
      <Icon
        size={14}
        className="shrink-0 text-gray-400"
      />

      <span className="truncate font-medium">
        {value}
      </span>
    </div>
  );
}

function ProfileDetailRow({
  icon: Icon,
  label,
  value,
  last = false,
}: {
  icon: any;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 px-4 py-3.5 ${
        !last ? 'border-b border-gray-100' : ''
      }`}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
        <Icon size={16} />
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </p>

        <p className="mt-0.5 truncate text-sm font-medium text-gray-800">
          {value}
        </p>
      </div>
    </div>
  );
}

/* =========================================================
   LOADING
========================================================= */

function EmployeeLoading() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((item) => (
        <div
          key={item}
          className="animate-pulse rounded-[24px] border border-gray-200 bg-white p-5"
        >
          <div className="h-5 w-20 rounded-full bg-gray-100" />

          <div className="mt-5 flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gray-100" />

            <div className="flex-1">
              <div className="h-4 w-2/3 rounded bg-gray-100" />

              <div className="mt-2 h-3 w-1/2 rounded bg-gray-100" />
            </div>
          </div>

          <div className="mt-6 h-3 w-2/3 rounded bg-gray-100" />

          <div className="mt-3 h-3 w-1/2 rounded bg-gray-100" />

          <div className="mt-6 grid grid-cols-2 gap-2">
            <div className="h-10 rounded-xl bg-gray-100" />
            <div className="h-10 rounded-xl bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* =========================================================
   EMPTY STATE
========================================================= */

function EmployeeEmptyState({
  searchQuery,
  onReset,
}: {
  searchQuery: string;
  onReset: () => void;
}) {
  return (
    <div className="rounded-[26px] border border-dashed border-gray-200 bg-white px-6 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-50 text-gray-300">
        <UserCircle2 size={30} />
      </div>

      <h3 className="mt-4 font-bold text-gray-800">
        Karyawan tidak ditemukan
      </h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-400">
        {searchQuery
          ? `Tidak ada karyawan yang cocok dengan pencarian "${searchQuery}".`
          : 'Tidak ada karyawan yang sesuai dengan filter yang sedang digunakan.'}
      </p>

      <button
        onClick={onReset}
        className="mt-5 rounded-xl bg-indigo-50 px-4 py-2.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100"
      >
        Reset Pencarian
      </button>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getInitial(name: string) {
  if (!name) return 'HR';

  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
}

function getEmployeeStatus(status: string) {
  switch (status) {
    case 'WFO':
      return {
        label: 'WFO',
        badge:
          'border-emerald-100 bg-emerald-50 text-emerald-700',
        dot: 'bg-emerald-500',
        bar: 'bg-emerald-400',
        description:
          'Karyawan sedang bekerja dari kantor dan tersedia untuk dihubungi.',
      };

    case 'WFH':
      return {
        label: 'WFH',
        badge:
          'border-blue-100 bg-blue-50 text-blue-700',
        dot: 'bg-blue-500',
        bar: 'bg-blue-400',
        description:
          'Karyawan sedang bekerja secara remote dan tetap aktif selama jam kerja.',
      };

    case 'CUTI':
      return {
        label: 'Out of Office',
        badge:
          'border-rose-100 bg-rose-50 text-rose-700',
        dot: 'bg-rose-500',
        bar: 'bg-rose-400',
        description:
          'Karyawan sedang cuti atau tidak berada dalam jam kerja aktif.',
      };

    default:
      return {
        label: status || 'Unknown',
        badge:
          'border-gray-200 bg-gray-50 text-gray-600',
        dot: 'bg-gray-400',
        bar: 'bg-gray-300',
        description:
          'Status kerja karyawan belum tersedia.',
      };
  }
}