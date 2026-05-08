// Response types for the /api endpoints. Kept loose where the dashboard
// doesn't pin a strict shape (e.g., we treat fires/smoke as plain GeoJSON).

export interface EventManifest {
  id: string;
  name: string;
  window: { start: string; end: string };
  bbox: [number, number, number, number];
  states: string[];
  built_at: string;
  sources: Record<string, { name: string }>;
  counts: { fires: number; smoke_polygons: number; monitors: number };
}

export interface MonitorSummary {
  id: string;
  name: string;
  state: string;
  lat: number;
  lon: number;
  agency: string;
  summary: { peak: number; hours_exceeded_naaqs: number };
}

export interface MonitorTSPoint {
  ts: string;
  pm25: number;
}

export interface YearlyAggregate {
  year: number;
  fires: number;
  acres: number;
}

export interface FeatureCollection<G = unknown, P = unknown> {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: G;
    properties: P;
  }>;
}

export interface FireProps {
  acq_datetime: string;
  confidence: string;
  frp: number;
}

export interface SmokeProps {
  day: string;
  density: 'Heavy' | 'Medium' | 'Light' | 'Unknown';
}
