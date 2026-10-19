import type { Entry } from "../model.js";

function formatMetric(value: number | null): string {
  if (value === null) {
    return "N/A";
  }
  let text = value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  if (!text.includes(".")) {
    text += ".0";
  }
  return text;
}

export function formatReport(entries: readonly Entry[]): string {
  const lines: string[] = ["CRAP Report", ""];
  const header = [
    "Namespace".padEnd(28),
    "Name".padEnd(24),
    "CC".padStart(4),
    "Cov%".padStart(8),
    "CRAP".padStart(8),
  ].join(" ");
  lines.push(header);
  lines.push("-".repeat(header.length));
  for (const entry of entries) {
    lines.push(
      [
        entry.namespace.padEnd(28).slice(0, 28),
        entry.name.padEnd(24).slice(0, 24),
        String(entry.complexity).padStart(4),
        formatMetric(entry.coverage).padStart(8),
        formatMetric(entry.crap).padStart(8),
      ].join(" "),
    );
  }
  lines.push("");
  return lines.join("\n");
}
