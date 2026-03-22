export interface ChartData {
  name: string;
  value: number;
  label: string;
}

/**
 * Parse markdown tables from text and extract chartable data.
 * Returns chart data if a table has a string column + numeric column.
 */
export function extractChartData(markdown: string): ChartData[] | null {
  const tableMatch = markdown.match(
    /(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/
  );
  if (!tableMatch) return null;

  const headerLine = tableMatch[1];
  const bodyLines = tableMatch[3].trim().split("\n");

  const headers = headerLine
    .split("|")
    .filter(Boolean)
    .map((h) => h.trim());

  if (headers.length < 2) return null;

  const rows = bodyLines.map((line) =>
    line
      .split("|")
      .filter(Boolean)
      .map((c) => c.trim())
  );

  let labelColIdx = -1;
  let valueColIdx = -1;

  for (let col = 0; col < headers.length; col++) {
    const allNumeric = rows.every((row) => {
      const cell = row[col] || "";
      const cleaned = cell.replace(/[$,%]/g, "").trim();
      return !isNaN(parseFloat(cleaned)) && cleaned !== "";
    });

    if (!allNumeric && labelColIdx === -1) {
      labelColIdx = col;
    }
    if (allNumeric && valueColIdx === -1 && labelColIdx !== -1) {
      valueColIdx = col;
    }
  }

  if (labelColIdx === -1) labelColIdx = 0;
  if (valueColIdx === -1) return null;
  if (rows.length < 2 || rows.length > 30) return null;

  const data: ChartData[] = rows.map((row) => {
    const rawValue = (row[valueColIdx] || "").replace(/[$,%]/g, "").trim();
    return {
      name: (row[labelColIdx] || "").replace(/\*\*/g, "").substring(0, 25),
      value: parseFloat(rawValue) || 0,
      label: row[valueColIdx] || "",
    };
  });

  return data.filter((d) => d.value > 0);
}
