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

const DENSITY_ORDER = ['Light', 'Medium', 'Heavy'] as const;
type Density = typeof DENSITY_ORDER[number];

const DENSITY_FILL: Record<Density, string> = {
  Heavy: '#7a1a1a',
  Medium: '#c8741a',
  Light: '#e0b021',
};
const DENSITY_OPACITY: Record<Density, number> = {
  Heavy: 0.45,
  Medium: 0.30,
  Light: 0.18,
};
const DENSITY_STROKE: Record<Density, string> = {
  Heavy: '#5a0f0f',
  Medium: '#9a4f0a',
  Light: '#a07a10',
};

// 2-letter abbr → full state name. Only the western states the event window
// can plausibly touch, plus their nearest neighbors for orientation context.
const STATE_NAMES: Record<string, string> = {
  WA: 'Washington', OR: 'Oregon', ID: 'Idaho', MT: 'Montana', CA: 'California',
  NV: 'Nevada', UT: 'Utah', WY: 'Wyoming', AZ: 'Arizona', NM: 'New Mexico',
  CO: 'Colorado', ND: 'North Dakota', SD: 'South Dakota', NE: 'Nebraska',
  KS: 'Kansas', OK: 'Oklahoma', TX: 'Texas',
};

function fmtDay(iso: string): string {
  const [, m, d] = iso.split('-');
  const month = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][parseInt(m, 10)];
  return `${month} ${parseInt(d, 10)}`;
}

// Neighbors of the event states (for orientation context). Hand-picked rather
// than computed because we want a curated framing, not every state that
// happens to share a border.
const NEIGHBOR_BUFFER: Record<string, string[]> = {
  WA: ['ID', 'OR'],
  OR: ['CA', 'NV', 'ID', 'WA'],
  ID: ['WA', 'OR', 'NV', 'UT', 'WY', 'MT'],
  MT: ['ID', 'WY', 'ND', 'SD'],
  CA: ['OR', 'NV', 'AZ'],
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

  // Event-state geometries (the smoke containment region) and a wider context
  // ring (event states + their neighbors) for orientation.
  const eventStateNames = useMemo(
    () => new Set(event.states.map((s) => STATE_NAMES[s]).filter(Boolean)),
    [event.states],
  );
  const contextStateNames = useMemo(() => {
    const set = new Set(eventStateNames);
    for (const s of event.states) for (const n of NEIGHBOR_BUFFER[s] ?? []) {
      const name = STATE_NAMES[n];
      if (name) set.add(name);
    }
    return set;
  }, [event.states, eventStateNames]);

  const eventStateFeatures = useMemo(() => {
    if (!statesGeo) return [];
    return statesGeo.features.filter((f) => eventStateNames.has((f.properties as { name: string })?.name));
  }, [statesGeo, eventStateNames]);
  const contextStateFeatures = useMemo(() => {
    if (!statesGeo) return [];
    return statesGeo.features.filter((f) => contextStateNames.has((f.properties as { name: string })?.name));
  }, [statesGeo, contextStateNames]);

  // Sorted unique smoke days + per-day polygon counts (used by the day strip).
  const dayStats = useMemo(() => {
    const counts = new Map<string, { Light: number; Medium: number; Heavy: number; total: number }>();
    for (const f of smoke.features) {
      const day = f.properties.day;
      const d = f.properties.density as Density | 'Unknown';
      if (d === 'Unknown') continue;
      if (!counts.has(day)) counts.set(day, { Light: 0, Medium: 0, Heavy: 0, total: 0 });
      const row = counts.get(day)!;
      row[d] += 1;
      row.total += 1;
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, c]) => ({ day, ...c }));
  }, [smoke]);

  // selectedDay === null means "Overall" — the event-window aggregate view.
  // The user can step into a specific day for a single-day snapshot.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const isOverall = selectedDay === null;

  // Fit the projection to the context-state ring once it loads. Until then,
  // fall back to fitting the event bbox so monitors/fires render at all.
  const projection = useMemo(() => {
    const proj = geoMercator();
    if (contextStateFeatures.length) {
      proj.fitExtent(
        [[14, 14], [WIDTH - 14, HEIGHT - 14]],
        { type: 'FeatureCollection', features: contextStateFeatures } as unknown as GeoJSON.GeoJsonObject,
      );
    } else {
      const [w, s, e, n] = event.bbox;
      proj.fitExtent(
        [[14, 14], [WIDTH - 14, HEIGHT - 14]],
        { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } as GeoJSON.Polygon,
      );
    }
    return proj;
  }, [event.bbox, contextStateFeatures]);

  const path = useMemo(() => geoPath(projection), [projection]);

  // Overall view: all event fires (top 4000 by FRP). Day view: same filter
  // applied to that day only.
  const dayFires = useMemo(() => {
    const pool = isOverall
      ? fires.features
      : fires.features.filter((f) => f.properties.acq_datetime.slice(0, 10) === selectedDay);
    const rendered = [...pool]
      .sort((a, b) => b.properties.frp - a.properties.frp)
      .slice(0, MAX_FIRES_RENDERED);
    return { rendered, total: pool.length };
  }, [fires, selectedDay, isOverall]);
  const topFires = dayFires.rendered;

  // Smoke is intrinsically a daily field — only render when a day is picked.
  const dayFiltered = useMemo(() => {
    if (isOverall) return [];
    return smoke.features.filter((f) => f.properties.day === selectedDay);
  }, [smoke, selectedDay, isOverall]);

  const maxDayTotal = useMemo(() => Math.max(1, ...dayStats.map((d) => d.total)), [dayStats]);

  return (
    <div className="map-card">
      <div className="card-title">
        <span>Map — {event.name}</span>
        <span className="card-title-meta">
          {isOverall ? 'view: event-window aggregate' : `day in view: ${fmtDay(selectedDay!)}`}
        </span>
      </div>

      {/* Day selector — first pill is the event-window aggregate ("Overall");
          the rest are single-day snapshots that filter fires + smoke + monitor
          color all at once. Bar height on day pills encodes that day's smoke
          polygon count so spikes mark the worst smoke days. */}
      <div className="day-strip" role="tablist" aria-label="Select event day">
        <button
          role="tab"
          aria-selected={isOverall}
          className={`day-pill day-pill-overall${isOverall ? ' active' : ''}`}
          onClick={() => setSelectedDay(null)}
          title="Overall — event-window aggregate (monitors colored by event peak, all fires shown, smoke hidden)"
        >
          <span className="day-bar day-bar-overall" />
          <span className="day-label">Overall</span>
        </button>
        {dayStats.map((d) => {
          const isActive = d.day === selectedDay;
          return (
            <button
              key={d.day}
              role="tab"
              aria-selected={isActive}
              className={`day-pill${isActive ? ' active' : ''}`}
              onClick={() => setSelectedDay(d.day)}
              title={`${d.day} — ${d.total} smoke polygons (${d.Heavy} Heavy / ${d.Medium} Medium / ${d.Light} Light)`}
            >
              <span className="day-bar" style={{ height: `${(d.total / maxDayTotal) * 22 + 4}px` }} />
              <span className="day-label">{fmtDay(d.day)}</span>
            </button>
          );
        })}
      </div>

      <svg
        ref={ref}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="event-map"
        role="img"
        aria-label="Map of fire detections, smoke polygons, and air quality monitors"
      >
        <defs>
          {/* Smoke is clipped to the event states' actual silhouettes, so it
              follows real borders instead of an artificial rectangle. */}
          <clipPath id="smoke-states-clip">
            {eventStateFeatures.map((f, i) => (
              <path key={i} d={path(f as never) || undefined} />
            ))}
          </clipPath>
        </defs>

        {/* ocean / negative-space background */}
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} className="map-bg" />

        {/* Context states — neighbors of the event states, drawn first so the
            event states paint on top. */}
        {statesGeo && (
          <g className="states states-context">
            {contextStateFeatures
              .filter((f) => !eventStateNames.has((f.properties as { name: string })?.name))
              .map((f, i) => (
                <path key={i} d={path(f as never) || undefined} className="state-outline state-outline-context" />
              ))}
          </g>
        )}

        {/* Event states — the focus of the dashboard. Slightly warmer fill +
            sharper stroke so they read as "in scope". */}
        {statesGeo && (
          <g className="states states-event">
            {eventStateFeatures.map((f, i) => (
              <path key={i} d={path(f as never) || undefined} className="state-outline state-outline-event" />
            ))}
          </g>
        )}

        {/* Smoke polygons grouped by density, clipped to event-state silhouettes.
            Within each group, overlapping polygons flatten to a single shape
            before the group composites at the tier opacity — prevents alpha
            buildup. Light → Medium → Heavy paint order so denser smoke reads
            on top. */}
        <g clipPath="url(#smoke-states-clip)">
          {DENSITY_ORDER.map((density) => (
            <g
              key={density}
              className={`smoke smoke-${density.toLowerCase()}`}
              style={{ opacity: DENSITY_OPACITY[density], isolation: 'isolate' }}
            >
              {dayFiltered
                .filter((f) => f.properties.density === density)
                .map((f, i) => (
                  <path
                    key={i}
                    d={path(f as never) || undefined}
                    fill={DENSITY_FILL[density]}
                    stroke={DENSITY_STROKE[density]}
                    strokeWidth={0.6}
                    strokeOpacity={0.6}
                  />
                ))}
            </g>
          ))}
        </g>

        {/* Re-stroke event-state outlines on top of smoke so borders stay
            readable through the tinted layer. */}
        {statesGeo && (
          <g className="states states-event-overlay">
            {eventStateFeatures.map((f, i) => (
              <path
                key={i}
                d={path(f as never) || undefined}
                className="state-outline state-outline-event-overlay"
              />
            ))}
          </g>
        )}

        {/* fire detects */}
        <g className="fires">
          {topFires.map((f, i) => {
            const [lon, lat] = f.geometry.coordinates;
            const [x, y] = projection([lon, lat]) || [0, 0];
            const r = Math.min(3.5, 0.9 + Math.log1p(f.properties.frp) * 0.4);
            return <circle key={i} cx={x} cy={y} r={r} className="fire-dot" />;
          })}
        </g>

        {/* monitors on top — colored by that day's peak when a day is picked,
            by event-window peak in the Overall view */}
        <g className="monitors">
          {monitors.map((m) => {
            const [x, y] = projection([m.lon, m.lat]) || [0, 0];
            const dayPeak = isOverall ? null : m.daily_peak?.[selectedDay!] ?? null;
            const refValue = dayPeak ?? m.summary.peak;
            const bucket = aqiBucket(refValue);
            const isSelected = m.id === selectedMonitorId;
            const noData = !isOverall && dayPeak === null;
            return (
              <circle
                key={m.id}
                cx={x}
                cy={y}
                r={isSelected ? 7 : 4.5}
                fill={noData ? '#d8d3c5' : bucket.color}
                stroke={isSelected ? '#1a1a1a' : noData ? '#a39d8c' : bucket.outline}
                strokeWidth={isSelected ? 2 : 1}
                opacity={noData ? 0.55 : 1}
                onClick={() => onSelectMonitor(m.id)}
                className="monitor-dot"
              >
                <title>
                  {m.name} ({m.state})
                  {isOverall
                    ? ` — event peak ${m.summary.peak} µg/m³, ${m.summary.hours_exceeded_naaqs} h over NAAQS`
                    : dayPeak !== null
                    ? ` — ${fmtDay(selectedDay!)} peak ${dayPeak} µg/m³ (event peak ${m.summary.peak})`
                    : ` — no reading on ${fmtDay(selectedDay!)} (event peak ${m.summary.peak})`}
                </title>
              </circle>
            );
          })}
        </g>

        {/* corner badge: top-right, so it sits over neighboring (out-of-scope)
            states like ND/SD instead of covering monitors/fires in WA/OR. */}
        {(() => {
          const badgeW = isOverall ? 168 : 132;
          const x = WIDTH - badgeW - 14;
          return (
            <g className="day-badge" transform={`translate(${x}, 14)`}>
              <rect width={badgeW} height={44} rx={2} className="day-badge-bg" />
              {isOverall ? (
                <>
                  <text x={11} y={15} className="day-badge-eyebrow">VIEW · OVERALL</text>
                  <text x={11} y={28} className="day-badge-day">Event window aggregate</text>
                </>
              ) : (
                <>
                  <text x={11} y={15} className="day-badge-eyebrow">DAY IN VIEW</text>
                  <text x={11} y={28} className="day-badge-day">{fmtDay(selectedDay!)}, 2020</text>
                </>
              )}
            </g>
          );
        })()}
      </svg>

      <div className="legend">
        <div className="legend-row">
          <span className="legend-label">
            Monitor PM2.5 (µg/m³) — {isOverall ? 'event-window peak' : `${fmtDay(selectedDay!)} peak`}
          </span>
          {AQI_BUCKETS_FOR_LEGEND.map((b) => (
            <span key={b.label} className="legend-chip" style={{ background: b.color, borderColor: b.outline }}>
              {b.threshold === Infinity ? '250+' : `≤${b.threshold}`}
            </span>
          ))}
          {!isOverall && (
            <>
              <span
                className="legend-chip"
                style={{ background: '#d8d3c5', borderColor: '#a39d8c', color: '#5a564a', opacity: 0.85 }}
              >
                no reading
              </span>
            </>
          )}
        </div>
        {!isOverall && (
          <div className="legend-row">
            <span className="legend-label">Smoke density</span>
            {DENSITY_ORDER.slice().reverse().map((density) => (
              <span
                key={density}
                className="legend-chip density-chip"
                style={{
                  background: DENSITY_FILL[density],
                  borderColor: DENSITY_STROKE[density],
                  color: '#fff',
                }}
              >
                {density}
              </span>
            ))}
            <span className="legend-sep">·</span>
            <span className="legend-label">
              Fire detects: dark dots sized by FRP — {topFires.length.toLocaleString()}
              {dayFires.total > MAX_FIRES_RENDERED ? ` of ${dayFires.total.toLocaleString()}` : ''}
              {' '}on {fmtDay(selectedDay!)}
            </span>
          </div>
        )}
        {isOverall && (
          <div className="legend-row">
            <span className="legend-label">
              Fire detects: dark dots sized by FRP — top {topFires.length.toLocaleString()} of {dayFires.total.toLocaleString()} across the event window
            </span>
            <span className="legend-sep">·</span>
            <span className="legend-label legend-muted">
              Smoke density is per-day — pick a day above to view it
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
