import type { Entry } from "../model.js";

function ednString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function ednNumber(value: number): string {
  let text = value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  if (!text.includes(".")) {
    text += ".0";
  }
  return text;
}

function ednValue(value: number | null): string {
  if (value === null) {
    return "nil";
  }
  return ednNumber(value);
}

export function renderEdn(entries: readonly Entry[]): string {
  const rows = entries.map(
    (entry) =>
      "  {" +
      `:name ${ednString(entry.name)}, ` +
      `:namespace ${ednString(entry.namespace)}, ` +
      `:complexity ${entry.complexity}, ` +
      `:coverage ${ednValue(entry.coverage)}, ` +
      `:crap ${ednValue(entry.crap)}` +
      "}",
  );
  const body = rows.join("\n");
  if (body) {
    return `{:entries [\n${body}\n]}\n`;
  }
  return "{:entries []}\n";
}
