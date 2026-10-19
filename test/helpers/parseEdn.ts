import { parseEDNString } from "edn-data";

type EdnKeyword = { key: string };
type EdnMapNode = { map: Array<[EdnKeyword | string, unknown]> };

function isEdnMap(value: unknown): value is EdnMapNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "map" in value &&
    Array.isArray((value as EdnMapNode).map)
  );
}

function keywordKey(value: EdnKeyword | string): string {
  if (typeof value === "string") {
    return value;
  }
  return value.key;
}

function ednValueToJs(value: unknown): unknown {
  if (isEdnMap(value)) {
    const out: Record<string, unknown> = {};
    for (const [rawKey, entryValue] of value.map) {
      const key = keywordKey(rawKey).replace(/^:/, "");
      out[key] = ednValueToJs(entryValue);
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((item) => ednValueToJs(item));
  }
  return value;
}

export function parseEdnDocument(text: string): Record<string, unknown> {
  const parsed = parseEDNString(text);
  const js = ednValueToJs(parsed);
  if (typeof js === "object" && js !== null && !Array.isArray(js)) {
    return js as Record<string, unknown>;
  }
  return {};
}
