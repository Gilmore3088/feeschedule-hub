export function Sparkline({
  data,
  width = 64,
  height = 20,
  color = "currentColor",
  className = "",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 1;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const dotX =
    ((data.length - 1) / (data.length - 1)) * (width - padding * 2) + padding;
  const dotY =
    height - padding - ((last - min) / range) * (height - padding * 2);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.5}
      />
      <circle
        cx={dotX}
        cy={dotY}
        r="2"
        fill={last >= prev ? "rgb(16 185 129)" : "rgb(239 68 68)"}
      />
    </svg>
  );
}
