import { useEffect, useState } from 'react';
import {
  fetchEvent, fetchFires, fetchHistoricYearly, fetchMonitorTS, fetchMonitors, fetchSmoke,
} from './api';
import type {
  EventManifest, FeatureCollection, FireProps, MonitorSummary, MonitorTSPoint, SmokeProps,
  YearlyAggregate,
} from './types';
import { KpiRail } from './components/KpiRail';
import { EventMap } from './components/EventMap';
import { PM25Chart } from './components/PM25Chart';
import { HistoricStrip } from './components/HistoricStrip';
import { AboutPanel } from './components/AboutPanel';
import './App.css';

type FiresFC = FeatureCollection<{ type: 'Point'; coordinates: [number, number] }, FireProps>;
type SmokeFC = FeatureCollection<{ type: 'Polygon'; coordinates: number[][][] }, SmokeProps>;

export default function App() {
  const [event, setEvent] = useState<EventManifest | null>(null);
  const [fires, setFires] = useState<FiresFC | null>(null);
  const [smoke, setSmoke] = useState<SmokeFC | null>(null);
  const [monitors, setMonitors] = useState<MonitorSummary[]>([]);
  const [yearly, setYearly] = useState<YearlyAggregate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedMonitorId, setSelectedMonitorId] = useState<string | null>(null);
  const [series, setSeries] = useState<MonitorTSPoint[] | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchEvent(),
      fetchFires(),
      fetchSmoke(),
      fetchMonitors(),
      fetchHistoricYearly(),
    ])
      .then(([e, f, s, m, y]) => {
        setEvent(e);
        setFires(f);
        setSmoke(s);
        setMonitors(m.monitors);
        setYearly(y);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedMonitorId) return;
    setSeriesLoading(true);
    setSeries(null);
    fetchMonitorTS(selectedMonitorId)
      .then(setSeries)
      .catch((err: Error) => setError(err.message))
      .finally(() => setSeriesLoading(false));
  }, [selectedMonitorId]);

  if (error) {
    return (
      <div className="error-page">
        <h1>API error</h1>
        <p>{error}</p>
        <p className="hint">
          Did you start the API? <code>uvicorn api.main:app --port 8000</code>
        </p>
      </div>
    );
  }

  if (!event || !fires || !smoke) {
    return <div className="loading-page">Loading dashboard…</div>;
  }

  const selectedMonitor = monitors.find((m) => m.id === selectedMonitorId) ?? null;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <div className="brand-eyebrow">PNW Air Quality Response</div>
          <h1 className="brand-title">{event.name}</h1>
          <div className="brand-sub">
            {event.window.start} → {event.window.end} · bbox {event.bbox.join(', ')}
          </div>
        </div>
        <div className="header-attrib">
          Sources: NASA FIRMS · NOAA HMS · AirNow · USFS FPA FOD
        </div>
      </header>

      <AboutPanel event={event} />

      <div className="layout">
        <KpiRail event={event} monitors={monitors} />
        <main className="main-col">
          <EventMap
            event={event}
            fires={fires}
            smoke={smoke}
            monitors={monitors}
            selectedMonitorId={selectedMonitorId}
            onSelectMonitor={setSelectedMonitorId}
          />
          <PM25Chart monitor={selectedMonitor} series={series} loading={seriesLoading} />
          <HistoricStrip yearly={yearly} />
        </main>
      </div>

      <footer className="app-footer">
        Built {new Date(event.built_at).toISOString().slice(0, 10)} · snapshot {event.id} ·
        {' '}{event.counts.fires.toLocaleString()} fires · {event.counts.smoke_polygons} smoke polygons ·
        {' '}{event.counts.monitors} monitors
      </footer>
    </div>
  );
}
