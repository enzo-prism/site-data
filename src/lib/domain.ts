import { isIP } from "node:net";
import punycode from "punycode/";

const hostnameRegex =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i;

const blockedHostnames = new Set(["localhost", "local", "internal"]);

export type NormalizeResult =
  | { ok: true; domain: string }
  | { ok: false; error: string };

export function normalizeDomain(input: string): NormalizeResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Please enter a URL or domain." };
  }

  let hostname: string;
  try {
    const withScheme = /^[a-z]+:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    hostname = new URL(withScheme).hostname;
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  let normalized = hostname.toLowerCase();
  normalized = normalized.replace(/^www\./, "");
  normalized = normalized.replace(/\.$/, "");

  if (!normalized) {
    return { ok: false, error: "Please enter a valid domain." };
  }

  if (blockedHostnames.has(normalized) || normalized.endsWith(".localhost")) {
    return { ok: false, error: "Localhost domains are not supported." };
  }

  if (isIP(normalized)) {
    return { ok: false, error: "IP addresses are not supported." };
  }

  const ascii = punycode.toASCII(normalized);
  if (!hostnameRegex.test(ascii) || !ascii.includes(".")) {
    return { ok: false, error: "Please enter a public domain name." };
  }

  return { ok: true, domain: ascii };
}
