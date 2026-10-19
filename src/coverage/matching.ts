import { resolve } from "node:path";

export function normalizePath(path: string): string {
  let text = decodeURIComponent(path).replace(/\\/g, "/");
  if (text.startsWith("file:")) {
    text = text.slice(5);
  }
  while (text.startsWith("./")) {
    text = text.slice(2);
  }
  while (text.includes("//")) {
    text = text.replace("//", "/");
  }
  text = text.replace(/\/\.\//g, "/");
  if (text.startsWith("/./")) {
    text = text.slice(2);
  }
  return text;
}

function segments(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean);
}

export function suffixMatch(path: string, suffix: string): boolean {
  const pathParts = segments(path);
  const suffixParts = segments(suffix);
  if (suffixParts.length === 0 || suffixParts.length > pathParts.length) {
    return false;
  }
  return pathParts.slice(-suffixParts.length).join("/") === suffixParts.join("/");
}

function keyItems(keys: string[]): Array<[string, string]> {
  return keys.map((key) => [key, normalizePath(key)]);
}

function exactKey(
  items: Array<[string, string]>,
  candidates: string[],
): string | undefined {
  for (const candidate of candidates) {
    for (const [original, norm] of items) {
      if (norm === candidate) {
        return original;
      }
    }
  }
  return undefined;
}

function nonemptyParts(
  candidates: string[],
): Array<[string, string[]]> {
  const found: Array<[string, string[]]> = [];
  for (const candidate of candidates) {
    const parts = segments(candidate);
    if (parts.length > 0) {
      found.push([candidate, parts]);
    }
  }
  return found;
}

function keyHasSuffix(keyParts: string[], parts: string[]): boolean {
  if (keyParts.length < parts.length) {
    return false;
  }
  return keyParts.slice(-parts.length).join("/") === parts.join("/");
}

function longerSourceOwns(
  keyParts: string[],
  sourceLen: number,
  sourceParts: Array<[...string[]]>,
): boolean {
  for (const other of sourceParts) {
    if (other.length <= sourceLen) {
      continue;
    }
    if (
      other.length <= keyParts.length &&
      keyParts.slice(-other.length).join("/") === other.join("/")
    ) {
      return true;
    }
  }
  return false;
}

function forwardMatches(
  items: Array<[string, string]>,
  partsOf: Array<[string, string[]]>,
  sourceParts: Array<[...string[]]>,
): string[] {
  const forward: Array<[number, string]> = [];
  for (const [, parts] of partsOf) {
    for (const [original, norm] of items) {
      const keyParts = segments(norm);
      if (!keyHasSuffix(keyParts, parts)) {
        continue;
      }
      if (longerSourceOwns(keyParts, parts.length, sourceParts)) {
        continue;
      }
      forward.push([keyParts.length - parts.length, original]);
    }
  }
  if (forward.length === 0) {
    return [];
  }
  const smallest = Math.min(...forward.map(([extra]) => extra));
  const keys = forward
    .filter(([extra]) => extra === smallest)
    .map(([, key]) => key);
  return [...new Set(keys)];
}

function keyIsProperSuffix(parts: string[], keyParts: string[]): boolean {
  if (keyParts.length === 0 || keyParts.length >= parts.length) {
    return false;
  }
  return parts.slice(-keyParts.length).join("/") === keyParts.join("/");
}

function anotherSourceEndsWith(
  keyParts: string[],
  sourceParts: Array<[...string[]]>,
  own: Set<string>,
): boolean {
  const keyStr = keyParts.join("/");
  for (const other of sourceParts) {
    const otherStr = other.join("/");
    if (own.has(otherStr) || other.length < keyParts.length) {
      continue;
    }
    if (other.slice(-keyParts.length).join("/") === keyStr) {
      return true;
    }
  }
  return false;
}

function reverseKey(
  items: Array<[string, string]>,
  partsOf: Array<[string, string[]]>,
  sourceParts: Array<[...string[]]>,
): string | undefined {
  const own = new Set(partsOf.map(([, parts]) => parts.join("/")));
  const reverse: string[] = [];
  for (const [, parts] of partsOf) {
    for (const [original, norm] of items) {
      const keyParts = segments(norm);
      if (!keyIsProperSuffix(parts, keyParts)) {
        continue;
      }
      if (anotherSourceEndsWith(keyParts, sourceParts, own)) {
        continue;
      }
      reverse.push(original);
    }
  }
  const unique = [...new Set(reverse)];
  if (unique.length === 1) {
    return unique[0];
  }
  return undefined;
}

export function candidatesForSource(sourcePath: string): string[] {
  const relative = normalizePath(sourcePath);
  let absolute = relative;
  try {
    absolute = normalizePath(resolve(sourcePath));
  } catch {
    // keep relative
  }
  const noSrc = relative.replace(/^src\//, "");
  const absoluteNoSrc = absolute.replace(/\/src\//, "/");
  const values = [relative, absolute, noSrc, absoluteNoSrc];
  const found: string[] = [];
  for (const value of values) {
    if (value && !found.includes(value)) {
      found.push(value);
    }
  }
  return found;
}

export function selectLcovKey(
  keys: string[],
  sourcePath: string,
  sourceParts: Array<[...string[]]>,
): string | undefined {
  const items = keyItems(keys);
  const candidates = candidatesForSource(sourcePath);
  const exact = exactKey(items, candidates);
  if (exact !== undefined) {
    return exact;
  }
  const partsOf = nonemptyParts(candidates);
  const forward = forwardMatches(items, partsOf, sourceParts);
  if (forward.length === 1) {
    return forward[0];
  }
  if (forward.length > 1) {
    return undefined;
  }
  return reverseKey(items, partsOf, sourceParts);
}
