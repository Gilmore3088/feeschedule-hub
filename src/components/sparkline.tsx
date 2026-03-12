export function Sparkline({
  data,
  width = 64,
  height = 24,
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
  const padX = 2;
  const padY = 3;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - padX * 2) + padX;
    const y =
      height - padY - ((v - min) / range) * (height - padY * 2);
    return { x, y };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  // Area fill path
  const areaD = `${pathD} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`;

  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const lastPt = points[points.length - 1];
  const trending = last >= prev;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`spark-fill-${color.replace(/[^a-z0-9]/gi, "")}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={areaD}
        fill={`url(#spark-fill-${color.replace(/[^a-z0-9]/gi, "")})`}
      />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.6}
      />
      <circle
        cx={lastPt.x}
        cy={lastPt.y}
        r="2"
        fill={trending ? "rgb(16 185 129)" : "rgb(239 68 68)"}
      />
    </svg>
  );
}
