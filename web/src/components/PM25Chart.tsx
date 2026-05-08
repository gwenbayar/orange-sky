import {
  CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement,
  PointElement, Title, Tooltip, TimeScale,
  type TooltipItem,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Line } from 'react-chartjs-2';
import type { MonitorSummary, MonitorTSPoint } from '../types';
import { NAAQS_PM25_24H } from '../aqi';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, TimeScale);

interface Props {
  monitor: MonitorSummary | null;
  series: MonitorTSPoint[] | null;
  loading: boolean;
}

export function PM25Chart({ monitor, series, loading }: Props) {
  if (!monitor) {
    return (
      <div className="ts-card">
        <div className="card-title">PM2.5 over time</div>
        <div className="empty-state">Select a monitor on the map to see its hourly PM2.5.</div>
      </div>
    );
  }

  if (loading || !series) {
    return (
      <div className="ts-card">
        <div className="card-title">{monitor.name} ({monitor.state})</div>
        <div className="empty-state">Loading…</div>
      </div>
    );
  }

  const data = {
    datasets: [
      {
        label: 'PM2.5',
        data: series.map((p) => ({ x: p.ts, y: p.pm25 })),
        borderColor: '#7a1a1a',
        backgroundColor: 'rgba(122,26,26,0.10)',
        fill: true,
        pointRadius: 0,
        borderWidth: 1.4,
        tension: 0.15,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'line'>) => `${(ctx.parsed.y ?? 0).toFixed(1)} µg/m³`,
        },
      },
    },
    scales: {
      x: { type: 'time' as const, time: { tooltipFormat: 'MMM d, HH:mm' }, grid: { display: false } },
      y: {
        title: { display: true, text: 'µg/m³' },
        grid: { color: '#eee' },
      },
    },
  };

  return (
    <div className="ts-card">
      <div className="card-title">
        {monitor.name} ({monitor.state}) — peak {monitor.summary.peak.toFixed(1)} µg/m³
      </div>
      <div className="chart-wrap">
        <Line data={data} options={options} />
        {/* horizontal NAAQS reference line via plugin would be more correct; instead we mark it in the title */}
      </div>
      <div className="ts-footnote">
        NAAQS 24-hr PM2.5 standard: {NAAQS_PM25_24H} µg/m³ ·
        {' '}{monitor.summary.hours_exceeded_naaqs} hours over the standard during the event window
      </div>
    </div>
  );
}
