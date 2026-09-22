'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/apiClient';
import { dashboardApi } from '../../../lib/api/dashboardApi';
import { sitesApi } from '../../../lib/api/sitesApi';

interface SessionPrincipal {
  employeeId: string;
  employeeNo: string;
  role: string;
  status: string;
}

const HQ_ROLES = new Set(['REGIONAL', 'HQ_HR', 'ADMIN']);

function StatTile({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'warning' | 'danger';
  hint?: string;
}) {
  // 색상만으로 상태를 구분하지 않는다 — tone별로 라벨 앞에 텍스트 태그를 붙인다.
  const toneTag = tone === 'danger' ? '⚠ 위험 ' : tone === 'warning' ? '● 주의 ' : '';
  const toneClass =
    tone === 'danger'
      ? 'border-red-300 bg-red-50 text-red-800'
      : tone === 'warning'
        ? 'border-amber-300 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-white text-slate-800';

  return (
    <div className={`rounded-xl border p-5 ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">
        {toneTag}
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs opacity-70">{hint}</p>}
    </div>
  );
}

/** 텍스트 라벨을 항상 함께 표시하는 진행률 막대 — 색상만으로 정보를 전달하지 않는다. */
function RateBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-slate-700">오늘 출근률</span>
        <span className="font-bold text-slate-900">{percent.toFixed(1)}%</span>
      </div>
      <div className="mt-2 h-3 w-full rounded-full bg-slate-100">
        <div
          className="h-3 rounded-full bg-blue-600"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}

function HqDashboardView() {
  const query = useQuery({ queryKey: ['dashboard', 'hq'], queryFn: dashboardApi.getHq, refetchInterval: 60_000 });

  if (query.isError) return <p className="text-red-600">본사 대시보드를 불러올 수 없습니다.</p>;
  if (!query.data) return <p className="text-slate-500">불러오는 중...</p>;
  const d = query.data;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">본사 대시보드</h1>

      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-5">
        <RateBar percent={d.todayAttendanceRatePercent} />
        <p className="mt-3 text-xs text-slate-500">
          오늘 계획 {d.todayScheduledCount}명 중 {d.todayCheckedInCount}명 출근
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="관할 인원" value={d.totalHeadcount} hint="관할 사업장 인원수(합계)" />
        <StatTile label="휴무자" value={d.dayOffCount} hint="오늘 승인된 휴가로 휴무" />
        <StatTile label="미등록" value={d.todayNoShowCount} tone={d.todayNoShowCount > 0 ? 'warning' : 'neutral'} hint="오늘 미출근 감지" />
        <StatTile
          label="52시간 위험 인원"
          value={d.atRiskEmployeeCount}
          tone={d.atRiskEmployeeCount > 0 ? 'danger' : 'neutral'}
          hint="이번 주 위험·초과 단계"
        />
        <StatTile label="파견 승인대기" value={d.pendingApprovalCount} tone={d.pendingApprovalCount > 0 ? 'warning' : 'neutral'} />
        <StatTile
          label="수정사항"
          value={d.fraudReviewQueueCount}
          tone={d.fraudReviewQueueCount > 0 ? 'warning' : 'neutral'}
          hint="오늘 발생한 이상 타각 신호"
        />
        <StatTile
          label="결재대기"
          value={d.unapprovedUnjudgedCount}
          tone={d.unapprovedUnjudgedCount > 0 ? 'warning' : 'neutral'}
          hint="관리자 확인이 필요한 미승인 실적"
        />
      </div>
    </div>
  );
}

function SiteDashboardView({ siteId, siteName }: { siteId: string; siteName: string }) {
  const query = useQuery({
    queryKey: ['dashboard', 'site', siteId],
    queryFn: () => dashboardApi.getSite(siteId),
    refetchInterval: 60_000,
  });

  if (query.isError) return <p className="text-red-600">사업장 대시보드를 불러올 수 없습니다.</p>;
  if (!query.data) return <p className="text-slate-500">불러오는 중...</p>;
  const d = query.data;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">{siteName} 대시보드</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="오늘 근무 인원" value={d.todayWorkingCount} />
        <StatTile label="휴무자" value={d.dayOffCount} hint="오늘 승인된 휴가로 휴무" />
        <StatTile label="미출근자" value={d.todayNoShowCount} tone={d.todayNoShowCount > 0 ? 'warning' : 'neutral'} />
        <StatTile label="파견 승인대기" value={d.pendingApprovalCount} tone={d.pendingApprovalCount > 0 ? 'warning' : 'neutral'} />
        <StatTile
          label="초과근로 위험자"
          value={d.atRiskEmployeeCount}
          tone={d.atRiskEmployeeCount > 0 ? 'danger' : 'neutral'}
          hint="이번 주"
        />
      </div>
    </div>
  );
}

/** 역할에 따라 본사/사업장 대시보드를 자동으로 고른다(요구사항서 4.4⑤).
 * SITE_MANAGER는 본사 대시보드 API 자체가 403이라 사업장 대시보드로 보낸다. */
export default function DashboardPage() {
  const principalQuery = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: () => apiFetch<{ principal: SessionPrincipal }>('/auth/session'),
    staleTime: 5 * 60 * 1000,
  });
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });

  if (principalQuery.isLoading || sitesQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;

  const role = principalQuery.data?.principal.role;
  if (role && HQ_ROLES.has(role)) return <HqDashboardView />;

  const site = sitesQuery.data?.items[0];
  if (!site) return <p className="text-slate-600">배정된 사업장이 없습니다.</p>;
  return <SiteDashboardView siteId={site.id} siteName={site.name} />;
}
