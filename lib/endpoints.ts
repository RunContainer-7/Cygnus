const LOCAL_HOST =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.\d{1,3}\.|192\.168\.\d{1,3}\.|172\.(1[6-9]|2\d|3[01])\.)/i;

/**
 * Accepts whatever people paste:
 *   https://api.example.com/v1
 *   https://api.example.com/v1/chat/completions
 *   api.example.com/v1
 *   localhost:11434/v1
 */
export function normalizeBaseUrl(input: string): string {
  let value = (input ?? "").trim();
  if (!value) return "";
  if (value === "demo") return value;

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    value = `${LOCAL_HOST.test(value) ? "http" : "https"}://${value}`;
  }

  value = value.replace(/\/+$/, "");
  value = value.replace(/\/chat\/completions$/i, "");
  return value;
}

export function isLocalEndpoint(baseUrl: string): boolean {
  if (!baseUrl) return false;
  try {
    const url = new URL(normalizeBaseUrl(baseUrl));
    return LOCAL_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

export function endpointHost(baseUrl: string): string {
  try {
    return new URL(normalizeBaseUrl(baseUrl)).host;
  } catch {
    return "custom endpoint";
  }
}
