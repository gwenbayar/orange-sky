import type { EventManifest, MonitorSummary } from '../types';

interface Props {
  event: EventManifest;
  monitors: MonitorSummary[];
}

export function KpiRail({ event, monitors }: Props) {
  const peak = Math.max(0, ...monitors.map((m) => m.summary.peak));
  const monitorsExceeding = monitors.filter((m) => m.summary.hours_exceeded_naaqs > 0).length;
  const fireCount = event.counts.fires;
  const smokeDays = new Set<string>(); // populated lazily via window
  for (let d = new Date(event.window.start); d <= new Date(event.window.end); d.setDate(d.getDate() + 1)) {
    smokeDays.add(d.toISOString().slice(0, 10));
  }

  return (
    <aside className="kpi-rail">
      <div className="kpi">
        <div className="kpi-label">Peak PM2.5</div>
        <div className="kpi-value danger">{peak.toFixed(0)}<span className="kpi-unit"> µg/m³</span></div>
        <div className="kpi-sub">across {monitors.length} monitors</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Monitors exceeding NAAQS</div>
        <div className="kpi-value">{monitorsExceeding}<span className="kpi-unit"> / {monitors.length}</span></div>
        <div className="kpi-sub">24-hr standard 35 µg/m³</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Active fire detects</div>
        <div className="kpi-value">{fireCount.toLocaleString()}</div>
        <div className="kpi-sub">VIIRS, FRP ≥ 20 MW</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Smoke polygons</div>
        <div className="kpi-value">{event.counts.smoke_polygons}</div>
        <div className="kpi-sub">{smokeDays.size} days, NOAA HMS</div>
      </div>
    </aside>
  );
}
