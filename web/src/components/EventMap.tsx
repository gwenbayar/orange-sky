import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type {
  EventManifest, FeatureCollection, FireProps, MonitorSummary, SmokeProps,
} from '../types';
import { aqiBucket, AQI_BUCKETS_FOR_LEGEND } from '../aqi';

interface Props {
  event: EventManifest;
  fires: FeatureCollection<{ type: 'Point'; coordinates: [number, number] }, FireProps>;
  smoke: FeatureCollection<{ type: 'Polygon'; coordinates: number[][][] }, SmokeProps>;
  monitors: MonitorSummary[];
  selectedMonitorId: string | null;
  onSelectMonitor: (id: string) => void;
}

const WIDTH = 740;
const HEIGHT = 520;
const MAX_FIRES_RENDERED = 4000;     // cap for SVG perf — rank by FRP

const DENSITY_FILL: Record<string, string> = {
  Heavy: 'rgba(122,26,26,0.28)',
  Medium: 'rgba(184,101,26,0.22)',
  Light: 'rgba(212,160,23,0.15)',
  Unknown: 'rgba(120,120,120,0.12)',
};

export function EventMap({
  event, fires, smoke, monitors, selectedMonitorId, onSelectMonitor,
}: Props) {
  const [statesGeo, setStatesGeo] = useState<GeoJSON.FeatureCollection | null>(null);
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch('/us-states-10m.json')
      .then((r) => r.json())
      .then((topo) => setStatesGeo(feature(topo, topo.objects.states) as unknown as GeoJSON.FeatureCollection))
      .catch(() => setStatesGeo(null));
  }, []);

  // Mercator centered on the event bbox is plenty for PNW.
  const projection = useMemo(() => {
    const [w, s, e, n] = event.bbox;
    return geoMercator()
      .center([(w + e) / 2, (s + n) / 2])
      .scale(2400)
      .translate([WIDTH / 2, HEIGHT / 2]);
  }, [event.bbox]);

  const path = useMemo(() => geoPath(projection), [projection]);

  // Rank fires by FRP and cap, so SVG stays responsive.
  const topFires = useMemo(() => {
    return [...fires.features]
      .sort((a, b) => b.properties.frp - a.properties.frp)
      .slice(0, MAX_FIRES_RENDERED);
  }, [fires]);

  return (
    <div className="map-card">
      <div className="card-title">Map — {event.name}</div>
      <svg ref={ref} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="event-map" role="img" aria-label="Map of fire detections, smoke polygons, and air quality monitors">
        {/* ocean / negative-space background */}
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="map-bg" />

        {/* state outlines (land masses) */}
        {statesGeo && (
          <g className="states">
            {statesGeo.features.map((f, i) => (
              <path key={i} d={path(f as never) || undefined} className="state-outline" />
            ))}
          </g>
        )}

        {/* event bbox */}
        <rect
          x={projection([event.bbox[0], event.bbox[3]])![0]}
          y={projection([event.bbox[0], event.bbox[3]])![1]}
          width={projection([event.bbox[2], event.bbox[1]])![0] - projection([event.bbox[0], event.bbox[3]])![0]}
          height={projection([event.bbox[2], event.bbox[1]])![1] - projection([event.bbox[0], event.bbox[3]])![1]}
          className="event-bbox"
        />

        {/* smoke polygons under fires — skip Unknown so a parser regression
            can't blanket the map */}
        <g className="smoke">
          {smoke.features
            .filter((f) => f.properties.density !== 'Unknown')
            .map((f, i) => (
              <path
                key={i}
                d={path(f as never) || undefined}
                fill={DENSITY_FILL[f.properties.density] ?? 'transparent'}
                stroke="none"
              />
            ))}
        </g>

        {/* fire detects */}
        <g className="fires">
          {topFires.map((f, i) => {
            const [lon, lat] = f.geometry.coordinates;
            const [x, y] = projection([lon, lat]) || [0, 0];
            const r = Math.min(3.5, 0.9 + Math.log1p(f.properties.frp) * 0.4);
            return <circle key={i} cx={x} cy={y} r={r} className="fire-dot" />;
          })}
        </g>

        {/* monitors on top */}
        <g className="monitors">
          {monitors.map((m) => {
            const [x, y] = projection([m.lon, m.lat]) || [0, 0];
            const bucket = aqiBucket(m.summary.peak);
            const isSelected = m.id === selectedMonitorId;
            return (
              <circle
                key={m.id}
                cx={x}
                cy={y}
                r={isSelected ? 7 : 4.5}
                fill={bucket.color}
                stroke={isSelected ? '#1a1a1a' : bucket.outline}
                strokeWidth={isSelected ? 2 : 1}
                onClick={() => onSelectMonitor(m.id)}
                className="monitor-dot"
              >
                <title>
                  {m.name} ({m.state}) — peak {m.summary.peak} µg/m³, {m.summary.hours_exceeded_naaqs} h over NAAQS
                </title>
              </circle>
            );
          })}
        </g>
      </svg>

      <div className="legend">
        <div className="legend-row">
          <span className="legend-label">Monitor peak PM2.5 (µg/m³):</span>
          {AQI_BUCKETS_FOR_LEGEND.map((b) => (
            <span key={b.label} className="legend-chip" style={{ background: b.color, borderColor: b.outline }}>
              {b.threshold === Infinity ? '250+' : `≤${b.threshold}`}
            </span>
          ))}
        </div>
        <div className="legend-row">
          <span className="legend-label">Smoke density:</span>
          <span className="legend-chip" style={{ background: DENSITY_FILL.Heavy, borderColor: '#7a1a1a' }}>Heavy</span>
          <span className="legend-chip" style={{ background: DENSITY_FILL.Medium, borderColor: '#8b572a' }}>Medium</span>
          <span className="legend-chip" style={{ background: DENSITY_FILL.Light, borderColor: '#8a7a30' }}>Light</span>
          <span className="legend-label">· Fire detects: dark dots sized by FRP (top {MAX_FIRES_RENDERED.toLocaleString()} of {fires.features.length.toLocaleString()})</span>
        </div>
      </div>
    </div>
  );
}
