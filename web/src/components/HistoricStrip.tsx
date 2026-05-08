import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip, type TooltipItem } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import type { YearlyAggregate } from '../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

interface Props {
  yearly: YearlyAggregate[];
}

export function HistoricStrip({ yearly }: Props) {
  const data = {
    labels: yearly.map((y) => y.year),
    datasets: [
      {
        label: 'PNW fires',
        data: yearly.map((y) => y.fires),
        backgroundColor: '#7a8290',
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const acres = yearly[ctx.dataIndex].acres;
            const fires = ctx.parsed.y ?? 0;
            return `${fires.toLocaleString()} fires · ${acres.toLocaleString()} acres`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: '#eee' }, ticks: { precision: 0 } },
    },
  };

  return (
    <div className="historic-card">
      <div className="card-title">Historic context — PNW fires per year (FPA FOD, 1992–2015)</div>
      <div className="strip-wrap">
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}
