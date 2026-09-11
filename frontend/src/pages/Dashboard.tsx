/**
 * Command centre.
 *
 * The whole product in one screen: what the network looks like right now, the
 * assessment for the selected forecast, why it is at risk, and what the
 * ensemble is doing. On first load this is the Jaipur Day 5 rainfall case.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../api/client';
import type { AlertsResponse } from '../api/types';

import { EnsembleSpreadChart } from '../components/EnsembleSpreadChart';
import { AlertTimeline } from '../components/AlertTimeline';
import { AnaloguePanel } from '../components/AnaloguePanel';
import { DemoScenarios } from '../components/DemoScenarios';
import { ForecastSelector } from '../components/ForecastSelector';
import { LocationSearch } from '../components/LocationSearch';
import { Metric, MetricStrip } from '../components/RiskCard';
import { RiskGauge } from '../components/RiskGauge';
import { RiskMap } from '../components/RiskMap';
import { ReportExport } from '../components/ReportExport';
import { ShapExplanation } from '../components/ShapExplanation';
import {
  DemoNotice,
  ErrorState,
  LoadingState,
  Panel,
  RiskChip,
} from '../components/Primitives';
import { useAppState } from '../state/AppState';
import { formatDate } from '../lib/format';
import { RISK_DEFINITION, riskColor } from '../lib/risk';

export function Dashboard() {
  const { meta, risk, network, selection, setLocation, reload } = useAppState();
  const navigate = useNavigate();
  const [reportOpen, setReportOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertsResponse | null>(null);

  // The alert count is not the same thing as the high-risk-area count: the
  // alert engine scans every monitored variable and lead time, while the map
  // shows one variable at one lead time. Showing the map's number twice would
  // be misleading, so this comes from the alert scan itself.
  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    api
      .alerts(selection.base_date)
      .then((data) => {
        if (!cancelled) setAlerts(data);
      })
      .catch(() => {
        if (!cancelled) setAlerts(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selection?.base_date]); // eslint-disable-line react-hooks/exhaustive-deps

  if (meta.error) return <ErrorState message={meta.error} onRetry={reload} />;

  const r = risk.data;
  const net = network.data;

  return (
    <div className="space-y-4">
      {/* Positioning statement - the product explained in two lines. */}
      <section className="panel px-4 py-3.5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="text-lg font-bold tracking-tight text-ink-primary">
              Reads the forecast before it fails.
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
              AtmosGuard detects medium-range forecast bust risk before the weather event occurs -
              helping forecasters identify uncertainty, understand its causes, and act earlier.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate('/analysis')}
              className="rounded border border-accent/50 bg-accent/12 px-3 py-1.5 text-xs
                         font-semibold text-accent transition-colors hover:bg-accent/20"
            >
              Analyze Forecast
            </button>
            <button
              type="button"
              onClick={() => navigate('/map')}
              className="rounded border border-edge-strong px-3 py-1.5 text-xs font-medium
                         text-ink-secondary transition-colors hover:text-ink-primary"
            >
              View Risk Map
            </button>
          </div>
        </div>
      </section>

      {/* KPI row */}
      <MetricStrip>
        <Metric
          label="Active high-risk areas"
          value={net ? net.high_risk_areas : '--'}
          detail={net ? `of ${net.network_size} monitored sites` : undefined}
          tip="Sites currently assessed at HIGH or SEVERE bust risk for the selected variable and lead time."
          accent="#ec835a"
          loading={network.loading && !net}
        />
        <Metric
          label="Highest bust risk"
          value={net?.highest_risk ? `${net.highest_risk.risk_score.toFixed(0)}%` : '--'}
          detail={net?.highest_risk?.name}
          tip={RISK_DEFINITION}
          accent={net?.highest_risk ? riskColor(net.highest_risk.risk_category) : undefined}
          loading={network.loading && !net}
        />
        <Metric
          label="Forecast horizon"
          value={selection ? `Day ${selection.horizon}` : '--'}
          detail={r ? `valid ${formatDate(r.valid_date)}` : undefined}
          tip="The lead time currently selected. All panels on this page describe this lead time."
        />
        <Metric
          label="Active alerts"
          value={alerts ? alerts.alerts.length : '--'}
          detail={alerts ? `${alerts.counts.SEVERE} severe - rainfall` : undefined}
          tip="Rainfall alerts across every monitored site and lead time. Raised on the fitted bust probability, not the index, so the alert rate reflects how unsettled the atmosphere actually is."
          accent="#fab219"
          loading={!alerts}
        />
        <Metric
          label="Model confidence"
          value={net ? `${net.mean_model_confidence.toFixed(0)}%` : '--'}
          detail="mean across network"
          tip="Confidence in the risk assessment itself - distinct from confidence in the weather forecast."
          accent="#38bdf8"
          trend={r?.horizon_profile.map((h) => h.model_confidence)}
          loading={network.loading && !net}
        />
      </MetricStrip>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* Map */}
        <Panel
          title="National forecast bust risk"
          subtitle={
            r
              ? `Day ${r.forecast_horizon} ${r.variable.label.toLowerCase()} - ${r.model.label}`
              : 'Loading network'
          }
          tip="Each marker is a monitored site. Risk is shown by colour and by marker size, so the ordering reads without relying on colour alone."
          updated={selection ? formatDate(selection.base_date) : undefined}
          bodyClassName="p-0"
          className="min-h-[460px]"
        >
          <div className="h-[480px] w-full p-1">
            {network.error ? (
              <div className="p-3">
                <ErrorState message={network.error} onRetry={reload} />
              </div>
            ) : net ? (
              <RiskMap
                sites={net.sites}
                selectedId={selection?.location_id}
                onSelect={setLocation}
              />
            ) : (
              <div className="p-3">
                <LoadingState label="Loading monitoring network" rows={4} />
              </div>
            )}
          </div>
        </Panel>

        {/* Risk panel */}
        <div className="space-y-4">
          <Panel
            title="Forecast bust risk"
            subtitle={r ? `${r.location.name}, ${r.location.state}` : undefined}
            tip={RISK_DEFINITION}
            actions={
              r && (
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="rounded border border-edge-strong px-2 py-1 text-2xs font-medium
                             text-ink-secondary transition-colors hover:border-accent hover:text-accent"
                >
                  Report
                </button>
              )
            }
          >
            <div className="mb-3 space-y-3">
              <LocationSearch />
              <DemoScenarios />
            </div>

            {risk.error ? (
              <ErrorState message={risk.error} onRetry={reload} />
            ) : r ? (
              <>
                <RiskGauge
                  score={r.risk_score}
                  category={r.risk_category}
                  forecastConfidence={r.forecast_confidence}
                  horizon={r.forecast_horizon}
                />
                <dl className="mt-3 space-y-1.5 border-t border-edge pt-3 text-2xs">
                  <Row term="Risk category" value={<RiskChip category={r.risk_category} size="sm" />} />
                  <Row
                    term="Confidence in assessment"
                    value={<span className="tabular">{r.model_confidence.toFixed(0)}%</span>}
                  />
                  <Row term="Synoptic regime" value={<span className="text-right">{r.synoptic.regime}</span>} />
                  <Row term="Valid date" value={formatDate(r.valid_date)} />
                </dl>
              </>
            ) : (
              <LoadingState label="Assessing forecast" rows={4} />
            )}
          </Panel>

          <Panel
            title="Forecast selection"
            subtitle="Every panel on this page follows this selection"
          >
            <ForecastSelector />
          </Panel>
        </div>
      </div>

      {/* Explanation + ensemble */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Why is this forecast at risk?"
          subtitle="Contribution of each monitored driver to the assessed risk"
          tip="Each bar shows how far this driver sits from its dataset average, weighted by its importance in the model. Red raises the assessed risk; blue lowers it."
        >
          {r ? (
            <ShapExplanation
              contributions={r.feature_contributions}
              explanation={r.explanation}
              method={r.explanation_method}
              label={r.explanation_label}
            />
          ) : (
            <LoadingState label="Computing contributions" rows={6} />
          )}
        </Panel>

        <div className="space-y-4">
          <Panel
            title="Ensemble spread"
            subtitle={r ? `${r.ensemble.member_count} members - ${r.model.label}` : undefined}
            tip="Measures disagreement between ensemble forecast members. Higher spread generally indicates greater forecast uncertainty."
            unit={r?.variable.unit}
          >
            {r ? (
              <EnsembleSpreadChart ensemble={r.ensemble} horizon={r.forecast_horizon} />
            ) : (
              <LoadingState label="Loading ensemble" rows={4} />
            )}
          </Panel>

          <Panel
            title="Risk escalation timeline"
            subtitle={r ? `Successive model runs verifying on ${formatDate(r.valid_date)}` : undefined}
            tip="Each point is a different model initialisation for the same valid date, from Day 7 down to Day 3."
          >
            {r ? <AlertTimeline rows={r.risk_timeline} /> : <LoadingState rows={3} />}
          </Panel>
        </div>
      </div>

      {/* Analogues */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Historical analogue analysis"
          subtitle="Similar past atmospheric patterns and how their forecasts performed"
          tip="How closely the current pattern matches historical situations for which the forecast outcome is known."
        >
          {r ? (
            <AnaloguePanel
              analogues={r.analogues}
              note={r.analogue_summary.note}
              bestSimilarity={r.analogue_summary.best_similarity}
              bustCount={r.analogue_summary.bust_count}
            />
          ) : (
            <LoadingState rows={5} />
          )}
        </Panel>

        <Panel
          title="Risk across the forecast horizon"
          subtitle="How bust risk varies with lead time from this initialisation"
          tip="Risk generally grows with lead time, but a pattern transition inside the window can make one specific lead time far riskier than its neighbours."
        >
          {r ? (
            <ul className="space-y-2">
              {r.horizon_profile.map((row) => (
                <li key={row.horizon} className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-2xs font-medium text-ink-secondary">
                    {row.label}
                  </span>
                  <span className="h-5 flex-1 overflow-hidden rounded-sm bg-surface-2">
                    <span
                      className="flex h-full items-center justify-end rounded-sm px-1.5
                                 text-[10px] font-bold text-surface-0 transition-all duration-300"
                      style={{
                        width: `${Math.max(row.risk_score, 8)}%`,
                        background: riskColor(row.risk_category),
                      }}
                    >
                      {row.risk_score.toFixed(0)}%
                    </span>
                  </span>
                  <span className="w-20 shrink-0 text-right">
                    <RiskChip category={row.risk_category} size="sm" />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <LoadingState rows={5} />
          )}
          <DemoNotice notice={meta.data?.demo_notice ?? null} className="mt-3" />
        </Panel>
      </div>

      {reportOpen && r && <ReportExport risk={r} onClose={() => setReportOpen(false)} />}
    </div>
  );
}

function Row({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{term}</dt>
      <dd className="font-medium text-ink-primary">{value}</dd>
    </div>
  );
}
