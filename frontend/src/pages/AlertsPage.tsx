/** Early-warning alerts across the monitoring network. */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../api/client';
import type { AlertsResponse, Alert, RiskCategory } from '../api/types';
import { AlertCard } from '../components/AlertCard';
import { AlertTimeline } from '../components/AlertTimeline';
import { ReportExport } from '../components/ReportExport';
import {
  Badge,
  EmptyState,
  ErrorState,
  LoadingState,
  Panel,
} from '../components/Primitives';
import { Metric, MetricStrip } from '../components/RiskCard';
import { useAppState } from '../state/AppState';
import { formatDate } from '../lib/format';

type Filter = 'ALL' | RiskCategory;

export function AlertsPage() {
  const { selection, risk, setLocation, setVariable, setHorizon } = useAppState();
  const navigate = useNavigate();
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .alerts(selection.base_date)
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load alerts');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selection?.base_date]); // eslint-disable-line react-hooks/exhaustive-deps

  const alerts = useMemo(() => {
    const all = data?.alerts ?? [];
    return filter === 'ALL' ? all : all.filter((a) => a.severity === filter);
  }, [data, filter]);

  const openAnalysis = (alert: Alert) => {
    setLocation(alert.location_id);
    setVariable(alert.variable_id);
    setHorizon(alert.horizon);
    navigate('/analysis');
  };

  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4">
      <MetricStrip>
        <Metric
          label="Active alerts"
          value={data ? data.alerts.length : '--'}
          detail={
            data
              ? `rainfall - p(bust) above ${(data.probability_threshold * 100).toFixed(0)}%`
              : undefined
          }
          tip="Raised when the fitted bust probability exceeds roughly twice the base rate. Rainfall only - the model is fitted on real IMD rainfall observations and does not transfer to the other variables."
          accent="#fab219"
          loading={loading && !data}
        />
        <Metric
          label="Severe"
          value={data ? data.counts.SEVERE : '--'}
          detail="bust risk above 80%"
          accent="#d03b3b"
          loading={loading && !data}
        />
        <Metric
          label="High"
          value={data ? data.counts.HIGH : '--'}
          detail="bust risk 61-80%"
          accent="#ec835a"
          loading={loading && !data}
        />
        <Metric
          label="Issued"
          value={data ? formatDate(data.base_date) : '--'}
          detail="model initialisation"
        />
        <Metric
          label="Highest risk"
          value={data?.alerts[0] ? `${data.alerts[0].risk_score.toFixed(0)}%` : '--'}
          detail={data?.alerts[0]?.location_name}
          accent="#d03b3b"
          loading={loading && !data}
        />
      </MetricStrip>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel
          title="Early warnings"
          subtitle="Rainfall forecast reliability notices - not weather warnings"
          tip="AtmosGuard flags forecasts that may be unreliable. It does not predict weather severity and it is not an official warning service."
          actions={
            <div className="flex flex-wrap gap-1">
              {(['ALL', 'SEVERE', 'HIGH'] as Filter[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  aria-pressed={filter === option}
                  className={`segment ${filter === option ? 'segment-active' : ''}`}
                >
                  {option === 'ALL' ? 'All' : option}
                </button>
              ))}
            </div>
          }
        >
          {loading && !data ? (
            <LoadingState label="Scanning monitoring network" rows={5} />
          ) : alerts.length === 0 ? (
            <EmptyState
              title="No active alerts"
              detail="No monitored site currently crosses the 61% bust-risk threshold for this initialisation."
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onAnalyse={openAnalysis}
                  onExport={(a) => {
                    openAnalysisNoNav(a);
                    setReportOpen(true);
                  }}
                />
              ))}
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel
            title="Risk escalation"
            subtitle={
              risk.data
                ? `${risk.data.location.name} - valid ${formatDate(risk.data.valid_date)}`
                : undefined
            }
            tip="Successive model runs for one valid date. Rising risk as the event nears is the early warning."
          >
            {risk.data ? <AlertTimeline rows={risk.data.risk_timeline} /> : <LoadingState rows={3} />}
          </Panel>

          <Panel title="How to read an alert">
            <ul className="space-y-2.5 text-2xs leading-relaxed text-ink-secondary">
              <li>
                <Badge tone="accent">Bust risk</Badge> measures how likely this forecast is to turn
                out materially wrong - not how severe the weather will be. It is a 0-100 index; the
                Verification page shows the bust rate actually observed in each band.
              </li>
              <li>
                <Badge>Confidence</Badge> on the card is confidence in the assessment itself. A high
                risk with high confidence is the strongest signal to act on.
              </li>
              <li>
                <Badge tone="warn">Action</Badge> means shifting weight towards ensemble and
                short-range guidance for that valid time - not changing the forecast value.
              </li>
            </ul>
            {data?.disclaimer && (
              <p className="mt-3 border-t border-edge pt-3 text-2xs leading-relaxed text-ink-muted">
                {data.disclaimer}
              </p>
            )}
          </Panel>
        </div>
      </div>

      {reportOpen && risk.data && <ReportExport risk={risk.data} onClose={() => setReportOpen(false)} />}
    </div>
  );

  function openAnalysisNoNav(alert: Alert) {
    setLocation(alert.location_id);
    setVariable(alert.variable_id);
    setHorizon(alert.horizon);
  }
}
