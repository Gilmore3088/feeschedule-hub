const NUMBER_FORMAT = new Intl.NumberFormat("en-US");
const MONEY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const ABSOLUTE_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Plain en-US number, e.g. formatNumber(1234.5) === "1,234.5". */
export function formatNumber(n: number): string {
  return NUMBER_FORMAT.format(n);
}

/** en-US currency, two decimals, e.g. formatMoney(5) === "$5.00". */
export function formatMoney(n: number): string {
  return MONEY_FORMAT.format(n);
}

/**
 * Absolute en-US date, e.g. formatDate("2026-08-12") === "Aug 12, 2026".
 * Formats in UTC so date-only ISO strings (which parse as UTC midnight)
 * render the intended calendar day regardless of server/client timezone.
 */
export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return ABSOLUTE_DATE_FORMAT.format(date);
}

export function formatAmount(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "-";
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return "-";
  if (value === 0) return "$0.00";
  // Fees under $1 are just cents; large amounts get thousands separators.
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatAssets(assets: number | null): string {
  if (!assets) return "N/A";
  if (assets >= 1_000_000_000) return `$${(assets / 1_000_000_000).toFixed(1)}T`;
  if (assets >= 1_000_000) return `$${(assets / 1_000_000).toFixed(1)}B`;
  if (assets >= 1_000) return `$${(assets / 1_000).toFixed(0)}M`;
  return `$${assets}K`;
}

export function formatCompactDollars(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) return "N/A";
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000_000) return `${sign}$${(abs / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function formatStoredPercent(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return "N/A";
  return `${value.toFixed(decimals)}%`;
}

export function timeAgo(dateString: string): string {
  if (!dateString) return "";
  const now = Date.now();
  const then = new Date(dateString).getTime();
  if (isNaN(then)) return "";
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

const FEE_AMOUNT_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Public fee amount: thousands separators, two decimals, ".00" dropped for whole dollars.
 * Returns null when the amount is missing or not finite so callers can choose a placeholder.
 */
export function formatFeeAmount(amount: number | string | null | undefined): string | null {
  if (amount === null || amount === undefined) return null;
  const value = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(value)) return null;
  const formatted = FEE_AMOUNT_FORMAT.format(value);
  return formatted.endsWith(".00") ? formatted.slice(0, -3) : formatted;
}
