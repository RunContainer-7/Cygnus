import vm from "node:vm";
import { listFiles, readFileSafe } from "./workspace";

export type AppTestResult = {
  ok: boolean;
  summary: string;
  report: string;
  checks: number;
  issues: number;
};

function checkJavaScript(code: string, filename: string): string | null {
  if (/^\s*(?:import|export)\b/m.test(code)) {
    return null;
  }
  try {
    new vm.Script(code, { filename });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "JavaScript did not parse.";
  }
}

function checkCss(code: string): string | null {
  let depth = 0;
  let quote: string | null = null;
  let comment = false;

  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];
    const next = code[index + 1];

    if (comment) {
      if (char === "*" && next === "/") {
        comment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "/" && next === "*") {
      comment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth < 0) return "CSS has a closing brace without an opening brace.";
  }

  if (depth !== 0) return `CSS has ${depth} unclosed block${depth === 1 ? "" : "s"}.`;
  return null;
}

function resolveReference(fromFile: string, reference: string): string | null {
  const value = reference.trim();
  if (!value) return null;
  if (
    value.startsWith("#") ||
    value.startsWith("//") ||
    /^(?:https?:|data:|mailto:|tel:|javascript:|blob:)/i.test(value)
  ) {
    return null;
  }

  const withoutQuery = value.split(/[?#]/)[0];
  if (!withoutQuery) return null;

  const parts = withoutQuery.startsWith("/")
    ? []
    : fromFile.includes("/")
      ? fromFile.slice(0, fromFile.lastIndexOf("/")).split("/")
      : [];

  for (const part of withoutQuery.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join("/") || null;
}

function collectReferences(code: string, pattern: RegExp, fromFile: string): string[] {
  const references: string[] = [];
  for (const match of code.matchAll(pattern)) {
    const reference = resolveReference(fromFile, match[1] ?? "");
    if (reference) references.push(reference);
  }
  return references;
}

export async function testProject(projectId: string, origin?: string): Promise<AppTestResult> {
  const files = await listFiles(projectId);
  const paths = new Set(files.map((file) => file.path));
  const checks: string[] = [];
  const issues: string[] = [];
  const notes: string[] = [];

  const pass = (message: string) => checks.push(`PASS ${message}`);
  const fail = (message: string) => {
    checks.push(`FAIL ${message}`);
    issues.push(message);
  };
  const note = (message: string) => notes.push(`NOTE ${message}`);

  if (files.length === 0) {
    return {
      ok: false,
      summary: "App test found 1 issue",
      report: "FAIL The project is empty. Write index.html before testing.",
      checks: 0,
      issues: 1,
    };
  }

  if (paths.has("index.html")) pass("index.html exists");
  else fail("index.html is missing");

  let html = "";
  if (paths.has("index.html")) {
    html = await readFileSafe(projectId, "index.html").catch(() => "");
    if (/<!doctype html>/i.test(html)) pass("index.html has a doctype");
    else fail("index.html has no <!doctype html>");
    if (/<html[\s>]/i.test(html)) pass("index.html has an <html> element");
    else fail("index.html has no <html> element");
    if (/<title>\s*[^<\s][\s\S]*?<\/title>/i.test(html)) pass("index.html has a title");
    else fail("index.html has no non-empty <title>");

    const references = collectReferences(
      html,
      /<(?:script|link|img|source|video|audio)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi,
      "index.html",
    );
    let missingReferences = 0;
    for (const reference of references) {
      if (!paths.has(reference)) {
        missingReferences += 1;
        fail(`index.html references missing file ${reference}`);
      }
    }
    if (references.length > 0 && missingReferences === 0) {
      pass(`${references.length} local asset reference${references.length === 1 ? "" : "s"} resolve`);
    }
  }

  let jsChecks = 0;
  for (const file of files) {
    if (!/\.(?:js|mjs|cjs)$/i.test(file.path)) continue;
    const code = await readFileSafe(projectId, file.path).catch(() => "");
    const error = checkJavaScript(code, file.path);
    if (error) fail(`${file.path} does not parse: ${error}`);
    else {
      jsChecks += 1;
      pass(`${file.path} parses`);
    }

    const references = collectReferences(
      code,
      /\b(?:import|fetch|new\s+Worker)\s*\(?\s*["']([^"']+)["']/gi,
      file.path,
    ).filter((reference) => /\.(?:js|mjs|cjs)$/i.test(reference));
    for (const reference of references) {
      if (!paths.has(reference)) fail(`${file.path} imports missing file ${reference}`);
    }
  }

  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  for (let index = 0; index < inlineScripts.length; index += 1) {
    const code = inlineScripts[index][1] ?? "";
    if (!code.trim()) continue;
    const error = checkJavaScript(code, `index.html inline script ${index + 1}`);
    if (error) fail(`Inline script ${index + 1} does not parse: ${error}`);
    else {
      jsChecks += 1;
      pass(`inline script ${index + 1} parses`);
    }
  }

  for (const file of files) {
    if (!/\.css$/i.test(file.path)) continue;
    const code = await readFileSafe(projectId, file.path).catch(() => "");
    const error = checkCss(code);
    if (error) fail(`${file.path} is malformed: ${error}`);
    else pass(`${file.path} has balanced CSS blocks`);

    const references = collectReferences(
      code,
      /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
      file.path,
    );
    for (const reference of references) {
      if (!paths.has(reference)) fail(`${file.path} references missing asset ${reference}`);
    }
  }

  const combined = [
    html,
    ...(await Promise.all(
      files
        .filter((file) => /\.(?:css|js|html?)$/i.test(file.path))
        .map((file) => readFileSafe(projectId, file.path).catch(() => "")),
    )),
  ].join("\n");

  if (/lorem ipsum/i.test(combined)) fail("Placeholder lorem ipsum text is still present");
  else pass("No lorem ipsum placeholders");
  if (/\bTODO\b/.test(combined)) fail("A TODO is still present");
  else pass("No TODO markers");

  if (origin) {
    const base = origin.replace(/\/$/, "");
    const response = await fetch(`${base}/api/preview/${projectId}/index.html`, {
      headers: { Accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);

    if (!response) {
      note("The preview route could not be reached from the server; skipped the HTTP smoke test.");
    } else if (!response.ok) {
      fail(`Preview route returned HTTP ${response.status}`);
    } else {
      const body = await response.text().catch(() => "");
      const type = response.headers.get("content-type") ?? "";
      if (/text\/html/i.test(type) && /<html[\s>]/i.test(body)) {
        pass("preview route serves index.html");
      } else {
        fail("Preview route responded, but not with an HTML document");
      }
    }
  } else {
    note("No request origin was available; skipped the preview HTTP smoke test.");
  }

  if (jsChecks > 0) note(`${jsChecks} script${jsChecks === 1 ? "" : "s"} compiled successfully`);

  const report = [...checks, ...notes].join("\n");
  return {
    ok: issues.length === 0,
    summary:
      issues.length === 0
        ? `App test passed · ${checks.length} checks`
        : `App test found ${issues.length} issue${issues.length === 1 ? "" : "s"}`,
    report,
    checks: checks.length,
    issues: issues.length,
  };
}
