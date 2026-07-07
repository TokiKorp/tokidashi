interface Props {
  label: string;
  value: number; // 0–100
  tone: 'satiety' | 'vitality' | 'mood';
}

export function Gauge({ label, value, tone }: Props) {
  const v = Math.round(value);
  return (
    <div className={`gauge gauge-${tone} ${v < 25 ? 'gauge-low' : ''}`}>
      <span className="gauge-label">{label}</span>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${v}%` }} />
      </div>
      <span className="gauge-value">{v}</span>
    </div>
  );
}
