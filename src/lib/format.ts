export function formatAmount(amount: number | null): string {
  if (amount === null) return "-";
  if (amount === 0) return "$0.00";
  // Removed: was treating $0.35 as "35.0%" -- fees under $1 are just cents
  return `$${amount.toFixed(2)}`;
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
