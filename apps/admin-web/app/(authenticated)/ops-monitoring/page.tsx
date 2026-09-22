'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../../lib/apiClient';
import { opsMonitoringApi, type QueueHealth } from '../../../lib/api/opsMonitoringApi';

interface SessionPrincipal {
  employeeId: string;
  employeeNo: string;
  role: string;
  status: string;
}

const ALLOWED_ROLES = new Set(['HQ_HR', 'ADMIN']);
const RETENTION_QUEUE_NAME = 'punch-location-retention';

function MetricTile({
  label,
  value,
  tone = 'neutral',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'warning' | 'danger';
  hint?: string;
}) {
  // 색상만으로 상태를 구분하지 않는다 — tone별로 라벨 앞에 텍스트 태그를 붙인다(dashboard/page.tsx와 동일 컨벤션).
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

function formatPercent(value: number | null): string {
  return value === null ? 'N/A' : `${value.toFixed(1)}%`;
}

function QueueRow({ queue }: { queue: QueueHealth }) {
  const danger = queue.failedBacklog > 0;
  const isRetention = queue.queueName === RETENTION_QUEUE_NAME;
  return (
    <tr className={danger ? 'bg-red-50' : undefined}>
      <td className="px-3 py-2 text-sm font-medium text-slate-700">
        {queue.queueName}
        {isRetention && danger && <span className="ml-2 text-xs font-semibold text-red-700">★최우선</span>}
      </td>
      <td className="px-3 py-2 text-right text-sm text-slate-600">{queue.completed.toLocaleString()}</td>
      <td className="px-3 py-2 text-right text-sm text-slate-600">{queue.failed.toLocaleString()}</td>
      <td className="px-3 py-2 text-right text-sm text-slate-600">{formatPercent(queue.successRatePercent)}</td>
      <td className={`px-3 py-2 text-right text-sm font-semibold ${danger ? 'text-red-700' : 'text-slate-600'}`}>
        {queue.failedBacklog.toLocaleString()}
      </td>
    </tr>
  );
}

function MonitoringView() {
  const query = useQuery({
    queryKey: ['ops-monitoring'],
    queryFn: opsMonitoringApi.getSummary,
    refetchInterval: 60_000,
  });

  if (query.isError) return <p className="text-red-600">운영 모니터링 데이터를 불러올 수 없습니다.</p>;
  if (!query.data) return <p className="text-slate-500">불러오는 중...</p>;
  const d = query.data;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">운영 모니터링</h1>
      <p className="text-sm text-slate-500">
        60초마다 자동 갱신됩니다. 지표 해석·대응 절차는{' '}
        <span className="font-medium text-slate-700">docs/INCIDENT_RUNBOOK.md</span>를 참고하세요.
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <MetricTile label="타각 실패율 (24h)" value={formatPercent(d.punchFailureRatePercent)} hint="access_log 인증·인가 실패 근사치" />
        <MetricTile
          label="오늘 미등록"
          value={d.todayNoShowCount.toLocaleString()}
          tone={d.todayNoShowCount > 0 ? 'warning' : 'neutral'}
        />
        <MetricTile
          label="미승인 실적 미판정"
          value={d.unapprovedUnjudgedCount.toLocaleString()}
          tone={d.unapprovedUnjudgedCount > 0 ? 'warning' : 'neutral'}
        />
        <MetricTile label="알림 발송 성공률 (24h)" value={formatPercent(d.notificationSuccessRatePercent)} />
        <MetricTile label="배치 성공률" value={formatPercent(d.batchSuccessRatePercent)} hint="BullMQ completed/failed 누적 기준" />
        <MetricTile
          label="DLQ 적체"
          value={d.totalFailedBacklog.toLocaleString()}
          tone={d.totalFailedBacklog > 0 ? 'danger' : 'neutral'}
          hint="10개 큐 failed 합산"
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">큐별 상태</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">큐</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">완료</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">실패</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">성공률</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">DLQ 적체</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {d.queues.map((q) => (
                <QueueRow key={q.queueName} queue={q} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** STEP12 §B5. 백엔드 @Roles('HQ_HR','ADMIN')와 동일 기준으로 화면에서도
 * 가드한다 — 다른 역할은 API가 403을 주기 전에 안내 메시지로 막는다. */
export default function OpsMonitoringPage() {
  const principalQuery = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: () => apiFetch<{ principal: SessionPrincipal }>('/auth/session'),
    staleTime: 5 * 60 * 1000,
  });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;

  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 HQ_HR·ADMIN 권한만 볼 수 있습니다.</p>;
  }

  return <MonitoringView />;
}
