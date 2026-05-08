// Thin typed wrappers around the /api/* endpoints. Vite proxies /api → :8000.
import type {
  EventManifest, MonitorSummary, MonitorTSPoint, YearlyAggregate,
  FeatureCollection, FireProps, SmokeProps,
} from './types';

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${r.statusText}`);
  return r.json();
}

export const fetchEvent = () => getJson<EventManifest>('/api/event');
export const fetchFires = () => getJson<FeatureCollection<{ type: 'Point'; coordinates: [number, number] }, FireProps>>('/api/fires');
export const fetchSmoke = () => getJson<FeatureCollection<{ type: 'Polygon'; coordinates: number[][][] }, SmokeProps>>('/api/smoke-polygons');
export const fetchMonitors = () => getJson<{ monitors: MonitorSummary[] }>('/api/monitors');
export const fetchMonitorTS = (id: string) => getJson<MonitorTSPoint[]>(`/api/monitors/${id}/ts`);
export const fetchHistoricYearly = () => getJson<YearlyAggregate[]>('/api/historic/yearly');
