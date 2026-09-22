'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { usePrincipal } from '../../../lib/usePrincipal';
import { sitesApi } from '../../../lib/api/sitesApi';
import { complianceReportsApi } from '../../../lib/api/complianceReportsApi';

const ALLOWED_ROLES = new Set(['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN']);
const TABS = ['미등록', '조기출근', '미승인 미판정', '사업장 비교', '위반 이력'] as const;
type Tab = (typeof TABS)[number];

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function NoShowTab({ siteId }: { siteId: string }) {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const query = useQuery({ queryKey: ['compliance', 'no-show', siteId, from, to], queryFn: () => complianceReportsApi.noShow({ from, to, siteId: siteId || undefined }) });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">직원</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사업장</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">근로일</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">알림 발송</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(query.data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                  해당 기간 미등록 건이 없습니다.
                </td>
              </tr>
            )}
            {query.data?.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-sm text-slate-700">{r.employeeName}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{r.siteName}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{r.workDate.slice(0, 10)}</td>
                <td className="px-3 py-2 text-sm text-slate-500">{r.notifiedAt ? new Date(r.notifiedAt).toLocaleString('ko-KR') : '미발송'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EarlyClockInTab({ siteId }: { siteId: string }) {
  const [yearMonth, setYearMonth] = useState(thisMonth());
  const query = useQuery({
    queryKey: ['compliance', 'early-clockin', siteId, yearMonth],
    queryFn: () => complianceReportsApi.earlyClockIn({ yearMonth, siteId: siteId || undefined }),
  });

  return (
    <div className="flex flex-col gap-3">
      <input type="month" className="w-fit rounded-lg border border-slate-300 px-3 py-2 text-sm" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">직원</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사업장</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">발생 횟수</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">해소</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(query.data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                  해당 월 조기출근 반복 패턴이 없습니다.
                </td>
              </tr>
            )}
            {query.data?.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-sm text-slate-700">{r.employeeName}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{r.siteName}</td>
                <td className="px-3 py-2 text-right text-sm text-slate-600">{r.occurrenceCount}</td>
                <td className="px-3 py-2 text-sm text-slate-500">{r.resolvedAt ? '해소됨' : '미해소'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnapprovedUnjudgedTab({ siteId }: { siteId: string }) {
  const [yearMonth, setYearMonth] = useState(thisMonth());
  const query = useQuery({
    queryKey: ['compliance', 'unapproved-unjudged', siteId, yearMonth],
    queryFn: () => complianceReportsApi.unapprovedUnjudged({ yearMonth, siteId: siteId || undefined }),
  });
  const isSiteLevel = siteId !== '';

  return (
    <div className="flex flex-col gap-3">
      <input type="month" className="w-fit rounded-lg border border-slate-300 px-3 py-2 text-sm" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">{isSiteLevel ? '직원' : '사업장'}</th>
              {!isSiteLevel && <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">대상 인원</th>}
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">미판정 일수</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">미승인 총(분)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(query.data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                  미판정 건이 없습니다.
                </td>
              </tr>
            )}
            {query.data?.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-sm text-slate-700">{'employeeName' in r ? r.employeeName : r.siteName}</td>
                {'employeeCount' in r && <td className="px-3 py-2 text-right text-sm text-slate-600">{r.employeeCount}</td>}
                <td className="px-3 py-2 text-right text-sm text-slate-600">{r.unresolvedDayCount}</td>
                <td className="px-3 py-2 text-right text-sm text-slate-600">{r.totalUnapprovedMinutes.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SiteComparisonTab() {
  const [period, setPeriod] = useState(thisMonth());
  const query = useQuery({ queryKey: ['compliance', 'site-comparison', period], queryFn: () => complianceReportsApi.siteComparison(period) });

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        placeholder="YYYY-MM 또는 YYYY-Qn"
        className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
      />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사업장</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">가산대상 연장(분)</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">위반 주차 수</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">위험 인원</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(query.data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                  데이터가 없습니다.
                </td>
              </tr>
            )}
            {query.data?.map((r) => (
              <tr key={r.siteId}>
                <td className="px-3 py-2 text-sm text-slate-700">{r.siteName}</td>
                <td className="px-3 py-2 text-right text-sm text-slate-600">{r.totalOvertimeForPremiumMinutes.toLocaleString()}</td>
                <td className={`px-3 py-2 text-right text-sm ${r.violationWeekCount > 0 ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
                  {r.violationWeekCount}
                </td>
                <td className="px-3 py-2 text-right text-sm text-slate-600">{r.atRiskEmployeeCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ViolationHistoryTab({ siteId }: { siteId: string }) {
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(today());
  const query = useQuery({
    queryKey: ['compliance', 'violation-history', siteId, from, to],
    queryFn: () => complianceReportsApi.violationHistory({ from, to, siteId: siteId || undefined }),
  });
  const exportMutation = useMutation({
    mutationFn: async () => {
      const blob = await complianceReportsApi.exportViolationHistory({ from, to, siteId: siteId || undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `violation-history-${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        <button
          type="button"
          disabled={exportMutation.isPending}
          onClick={() => exportMutation.mutate()}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40"
        >
          엑셀 내보내기
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">직원</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사업장</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">주 시작일</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">총 근로(분)</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">40h 초과(분)</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">단계</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(query.data ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-400">
                  위반 이력이 없습니다.
                </td>
              </tr>
            )}
            {query.data?.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-sm text-slate-700">{r.employeeName}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{r.siteName}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{r.weekStartDate.slice(0, 10)}</td>
                <td className="px-3 py-2 text-right text-sm text-slate-600">{r.totalWorkMinutes.toLocaleString()}</td>
                <td className="px-3 py-2 text-right text-sm font-semibold text-red-600">{r.over40Minutes.toLocaleString()}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{r.alertStage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 요구사항서 4.4④ 준법 리포트 — 미등록/조기출근/미승인미판정/사업장
 * 비교/위반이력 5개 하위 리포트를 탭으로 묶는다. */
export default function ComplianceReportsPage() {
  const [tab, setTab] = useState<Tab>('미등록');
  const [siteId, setSiteId] = useState('');
  const principalQuery = usePrincipal();
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 사업장·권역·본사 관리자만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">컴플라이언스 리포트</h1>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {t}
            </button>
          ))}
        </div>
        {tab !== '사업장 비교' && (
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">전체 사업장</option>
            {sitesQuery.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {tab === '미등록' && <NoShowTab siteId={siteId} />}
      {tab === '조기출근' && <EarlyClockInTab siteId={siteId} />}
      {tab === '미승인 미판정' && <UnapprovedUnjudgedTab siteId={siteId} />}
      {tab === '사업장 비교' && <SiteComparisonTab />}
      {tab === '위반 이력' && <ViolationHistoryTab siteId={siteId} />}
    </div>
  );
}
