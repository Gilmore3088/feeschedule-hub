function firstMatch(output: string, pattern: RegExp): string | null {
  const match = output.match(pattern);
  return match?.[1] ?? null;
}

export function summarizeJobOutput(stdoutTail: string | null): string | null {
  if (!stdoutTail) return null;

  const raw = firstMatch(stdoutTail, /Tier 1 raw fees:\s*([\d,]+)/i);
  const verified = firstMatch(stdoutTail, /Tier 2 verified fees:\s*([\d,]+)/i);
  const published = firstMatch(stdoutTail, /Tier 3 published fees:\s*([\d,]+)/i);
  const awaiting = firstMatch(stdoutTail, /Awaiting Darwin classification:\s*([\d,]+)/i);
  if (raw || verified || published || awaiting) {
    return [
      raw ? `Raw ${raw}` : null,
      verified ? `Verified ${verified}` : null,
      published ? `Published ${published}` : null,
      awaiting ? `Awaiting Darwin ${awaiting}` : null,
    ].filter(Boolean).join(" / ");
  }

  const processed = firstMatch(stdoutTail, /['"]?processed['"]?:\s*(\d+)/i);
  if (processed) {
    const selected = firstMatch(stdoutTail, /['"]?selected['"]?:\s*(\d+)/i);
    const rescued = firstMatch(stdoutTail, /['"]?rescued['"]?:\s*(\d+)/i) ?? "0";
    const dead = firstMatch(stdoutTail, /['"]?dead['"]?:\s*(\d+)/i);
    const circuit = /['"]?circuit_tripped['"]?:\s*(true|True)/.test(stdoutTail);
    const haltReason = firstMatch(stdoutTail, /['"]?halt_reason['"]?:\s*['"]([^'"]+)['"]/i);
    return [
      selected ? `Selected ${selected}` : null,
      `attempted ${processed}`,
      `rescued ${rescued}`,
      dead ? `dead ${dead}` : null,
      circuit ? "circuit tripped" : null,
      haltReason ? `halt: ${haltReason}` : null,
    ].filter(Boolean).join(" / ");
  }

  const lines = stdoutTail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lastLine = lines[lines.length - 1];
  return lastLine ? lastLine.slice(0, 240) : null;
}
