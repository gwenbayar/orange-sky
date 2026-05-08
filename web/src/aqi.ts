// EPA PM2.5 → AQI category color (24-hr breakpoints). Government / report
// palette: muted versions of the standard AQI ramp so they don't fight the
// rest of the UI.

export const NAAQS_PM25_24H = 35.0;

export interface AqiBucket {
  label: string;
  color: string;        // muted fill
  outline: string;      // marker edge
  threshold: number;    // upper bound (inclusive)
}

const BUCKETS: AqiBucket[] = [
  { label: 'Good',                       color: '#9bbf86', outline: '#5e7c4d', threshold: 12.0 },
  { label: 'Moderate',                   color: '#d9c46a', outline: '#8a7a30', threshold: 35.4 },
  { label: 'Unhealthy for sensitive',    color: '#d49963', outline: '#8b572a', threshold: 55.4 },
  { label: 'Unhealthy',                  color: '#b85e5e', outline: '#7a1a1a', threshold: 150.4 },
  { label: 'Very unhealthy',             color: '#8b5e88', outline: '#56335c', threshold: 250.4 },
  { label: 'Hazardous',                  color: '#7a4848', outline: '#3a1f1f', threshold: Infinity },
];

export function aqiBucket(pm25: number): AqiBucket {
  return BUCKETS.find((b) => pm25 <= b.threshold) ?? BUCKETS[BUCKETS.length - 1];
}

export const AQI_BUCKETS_FOR_LEGEND = BUCKETS;
