import { useState } from 'react';
import type { EventManifest } from '../types';

interface Props {
  event: EventManifest;
}

export function AboutPanel({ event }: Props) {
  const [open, setOpen] = useState(true);

  return (
    <section className="about" aria-label="About this snapshot">
      <button
        type="button"
        className="about-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="about-eyebrow">Reading guide</span>
        <span className="about-toggle-title">About this snapshot</span>
        <span className="about-toggle-chevron" aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="about-body">
          <p className="about-lede">
            A near-real-time decision-support snapshot for an air-quality analyst
            tracking the <strong>2020 Labor Day Fires</strong> over the Pacific
            Northwest — <span className="about-numeric">{event.window.start} → {event.window.end}</span>.
            One question, four panels: <em>where is smoke right now, which monitors
            are breaching NAAQS, and how does it track against the source fires?</em>
          </p>

          <div className="about-grid">
            <div className="about-col">
              <div className="about-section-title">Map · two views</div>
              <p>
                The strip above the map flips the dashboard between two
                views. <strong>Overall</strong> answers <em>"where did
                things ever get bad during the event?"</em> — fires show
                the top 4,000 by FRP across the full window, and monitors
                color by their event-window peak PM2.5. Smoke is a daily
                field, so it's hidden in this view.
              </p>
              <p>
                Picking a specific day flips to a <strong>single-day
                snapshot</strong> — fires, smoke, and monitor color all
                filter to that day. Bar height on the day pills is that
                day's smoke polygon count, so spikes mark the worst smoke
                days.
              </p>
              <p>
                <strong>Fire detects</strong> are black dots sized by
                radiative power (FRP). <strong>Smoke</strong> is daily HMS
                density (Heavy / Medium / Light), clipped to the event
                states' silhouettes. <strong>Monitor sites</strong> are
                circles colored by AQI category — click any monitor to
                drill into its hourly trace. Faint gray monitors mean no
                reading on the selected day.
              </p>
            </div>

            <div className="about-col">
              <div className="about-section-title">KPI rail</div>
              <p>
                Four headline numbers for the event window: peak hourly PM2.5
                across all monitors, the count exceeding the
                <span className="about-numeric"> 35 µg/m³</span> 24-hour NAAQS
                standard, FIRMS active fire detects after filtering, and total
                NOAA HMS smoke polygons across all event days.
              </p>
              <div className="about-section-title">Time series</div>
              <p>
                Hourly PM2.5 for the selected monitor. The footnote reports
                hours over the NAAQS standard during the event window.
              </p>
              <div className="about-section-title">Historic strip</div>
              <p>
                PNW yearly fire counts from USFS FPA FOD (1992–2015) — a
                long-run baseline so the event can be read against context.
              </p>
            </div>

            <div className="about-col">
              <div className="about-section-title">Data sources</div>
              <ul className="about-list">
                <li><strong>NASA FIRMS</strong> — VIIRS / MODIS active fire detects (FRP ≥ 20 MW, low-confidence dropped)</li>
                <li><strong>NOAA HMS</strong> — daily smoke plume KMLs, density parsed from styleUrl + description</li>
                <li><strong>AirNow</strong> — hourly PM2.5 by monitor (<code>HourlyAQObs</code> archive)</li>
                <li><strong>USFS FPA FOD</strong> — historic fire occurrences 1992–2015 (SQLite)</li>
                <li><strong>us-atlas</strong> — TopoJSON state outlines</li>
              </ul>
              <div className="about-section-title">Event scope</div>
              <p>
                bbox <span className="about-numeric">{event.bbox.join(', ')}</span> ·
                states {event.states.join(' / ')} · built
                <span className="about-numeric"> {event.built_at.slice(0, 10)}</span>
              </p>
            </div>

            <div className="about-col">
              <div className="about-section-title">Caveats</div>
              <ul className="about-list">
                <li>
                  This is a <strong>snapshot</strong> — the data is fixed to
                  the event window, not live. The pipeline can rebuild against
                  archived sources to refresh.
                </li>
                <li>
                  HMS smoke is a daily plume estimate, not a continuous field.
                  Density reads as Light / Medium / Heavy bands, not µg/m³.
                </li>
                <li>
                  Fire detects are filtered (FRP ≥ 20 MW, low-confidence
                  dropped) and capped at the top
                  <span className="about-numeric"> 4,000</span> by FRP for SVG
                  performance.
                </li>
                <li>
                  Smoke polygons that don't intersect the event bbox are
                  dropped at parse time; the rendered layer is further clipped
                  to the event states' silhouettes.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
