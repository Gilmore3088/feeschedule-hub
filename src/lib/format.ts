export function formatAmount(amount: number | null): string {
  if (amount === null) return "-";
  if (amount === 0) return "$0.00";
  if (amount < 1 && amount > 0) return `${(amount * 100).toFixed(1)}%`;
  return `$${amount.toFixed(2)}`;
}

export function formatAssets(assets: number | null): string {
  if (!assets) return "N/A";
  if (assets > 1_000_000) return `$${(assets / 1_000_000).toFixed(1)}B`;
  if (assets > 1_000) return `$${(assets / 1_000).toFixed(0)}M`;
  return `$${assets}K`;
}
