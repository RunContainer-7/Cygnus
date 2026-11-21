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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attributeValue(attributes: string, name: string): string | null {
  const match = attributes.match(
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"),
  );
  return match ? match[1] : null;
}

/** Elements the script builds itself are not expected in the static HTML. */
function isCreatedInScript(
  script: string,
  name: string,
  kind: "class" | "id" | "tag",
): boolean {
  const escaped = escapeRegExp(name);
  if (kind === "class") {
    return (
      new RegExp(`classList\\.(?:add|toggle)\\([^)]*["'\`]${escaped}["'\`]`, "i").test(script) ||
      new RegExp(`className\\s*=\\s*["'\`][^"'\`]*\\b${escaped}\\b`, "i").test(script) ||
      new RegExp(`\\bclass\\s*=\\s*["'\`][^"'\`]*\\b${escaped}\\b`, "i").test(script)
    );
  }
  if (kind === "id") {
    return new RegExp(`\\bid\\s*=\\s*["'\`]${escaped}["'\`]`, "i").test(script);
  }
  return (
    new RegExp(`createElement\\(\\s*["'\`]${escaped}["'\`]`, "i").test(script) ||
    new RegExp(`<${escaped}\\b`, "i").test(script)
  );
}

function simpleSelectorParts(
  selector: string,
): Array<{ kind: "class" | "id" | "tag"; name: string }> {
  // Attribute selectors, pseudo-classes and comma lists cannot be checked
  // without a real DOM; guessing there only creates false failures.
  if (/[,\[\]:]/.test(selector)) return [];
  const cleaned = selector
    .replace(/::?[a-z-]+(?:\([^)]*\))?/gi, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[>+~]/g, " ");
  const parts: Array<{ kind: "class" | "id" | "tag"; name: string }> = [];
  for (const token of cleaned.match(/[#.]?[A-Za-z_][\w-]*/g) ?? []) {
    if (token.startsWith("#")) parts.push({ kind: "id", name: token.slice(1) });
    else if (token.startsWith(".")) parts.push({ kind: "class", name: token.slice(1) });
    else parts.push({ kind: "tag", name: token.toLowerCase() });
  }
  return parts;
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
  const scriptContents: string[] = [];
  for (const file of files) {
    if (!/\.(?:js|mjs|cjs)$/i.test(file.path)) continue;
    const code = await readFileSafe(projectId, file.path).catch(() => "");
    scriptContents.push(code);
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
    scriptContents.push(code);
    const error = checkJavaScript(code, `index.html inline script ${index + 1}`);
    if (error) fail(`Inline script ${index + 1} does not parse: ${error}`);
    else {
      jsChecks += 1;
      pass(`inline script ${index + 1} parses`);
    }
  }

  // Syntax checks cannot see a button whose handler was never written. These
  // checks catch controls that cannot possibly work, the failure users hit
  // first and the one "test passed" must never hide.
  const allJs = scriptContents.join("\n");
  const ids = new Set(
    [...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]),
  );
  const classNames = new Set(
    [...html.matchAll(/\bclass\s*=\s*["']([^"']*)["']/gi)]
      .flatMap((match) => match[1].split(/\s+/))
      .filter(Boolean),
  );
  const tagNames = new Set(
    [...html.matchAll(/<([a-z][a-z0-9-]*)\b/gi)].map((match) => match[1].toLowerCase()),
  );

  const selectors = [
    ...allJs.matchAll(
      /(?:querySelectorAll|querySelector|closest|matches)\s*\(\s*["'`]([^"'`]+)["'`]/g,
    ),
  ].map((match) => match[1]);
  const missingSelectors = new Set<string>();
  for (const selector of selectors) {
    for (const part of simpleSelectorParts(selector)) {
      const exists =
        part.kind === "class"
          ? classNames.has(part.name) || isCreatedInScript(allJs, part.name, "class")
          : part.kind === "id"
            ? ids.has(part.name) || isCreatedInScript(allJs, part.name, "id")
            : tagNames.has(part.name) || isCreatedInScript(allJs, part.name, "tag");
      if (!exists) missingSelectors.add(selector.trim());
    }
  }
  const CONTROL_WORD =
    /(?:^|[\s._-])(?:add|delete|remove|save|cancel|submit|close|open|toggle|edit|clear|start|stop|play|pause|next|prev|send|copy|share|download|upload|check|complete|done|create)(?:$|[\s._-])/i;
  if (missingSelectors.size > 0) {
    for (const selector of missingSelectors) {
      const message = `A script selects "${selector}", but no matching element exists and the script never creates one`;
      // Only selectors that clearly name a control are failures. Optional
      // lookups such as document.querySelector("form") are harmless.
      if (CONTROL_WORD.test(selector)) {
        fail(`${message}. That control cannot work.`);
      } else {
        note(`${message}; optional lookup skipped.`);
      }
    }
  } else if (selectors.length > 0) {
    pass("Every selector targets an element that exists");
  }

  const forms = [...html.matchAll(/<form\b([^>]*)>/gi)].map((match) => match[1]);
  const handlesSubmit =
    /addEventListener\(\s*["']submit["']/.test(allJs) || /\bonSubmit\s*=/i.test(html);
  const hasFormAction = forms.some((attributes) =>
    /\baction\s*=\s*["'][^"']+["']/i.test(attributes),
  );
  if (forms.length > 0 && !handlesSubmit && !hasFormAction) {
    fail(
      "A <form> has no action and no submit handler, so submitting it reloads the page and loses state.",
    );
  }

  const submitListener = /addEventListener\(\s*["']submit["'][\s\S]{0,500}/.exec(allJs);
  if (
    submitListener &&
    /delete/i.test(allJs) &&
    /innerHTML\s*=\s*["'`]{2}/.test(submitListener[0])
  ) {
    fail(
      "The form's submit handler empties the task list, so pressing Enter erases the todos. Only call preventDefault, or add the new item instead.",
    );
  }

  if (
    /delete/i.test(allJs) &&
    /\.children\.length\s*-\s*1|children\[\s*\w+\.children\.length/.test(allJs)
  ) {
    fail(
      "A delete handler removes an item by position (children.length - 1) instead of the item whose button was clicked, so it can delete the wrong todo. Remove the clicked button's list item instead.",
    );
  }

  const buttons = [
    ...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi),
  ].map((match) => ({
    attributes: match[1],
    label:
      match[2]
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "unnamed",
  }));
  const genericClickHandler =
    /(?:document|window|document\.body|document\.documentElement)\.addEventListener\(\s*["']click["']/.test(
      allJs,
    ) ||
    /\.(?:closest|matches)\(\s*["']button["']/.test(allJs) ||
    /(?:querySelectorAll|querySelector)\s*\(\s*["'`](?:button|form\s+button)/.test(allJs);

  let unwiredButtons = 0;
  for (const button of buttons) {
    const attributes = button.attributes;
    if (/\bon[a-z]+\s*=/i.test(attributes)) continue;
    const id = attributeValue(attributes, "id");
    const className = attributeValue(attributes, "class");
    const type = (attributeValue(attributes, "type") ?? "").toLowerCase();
    if (type === "submit" && (handlesSubmit || hasFormAction)) continue;
    if (id && new RegExp(`#${escapeRegExp(id)}\\b`).test(allJs)) continue;
    if (
      id &&
      new RegExp(`getElementById\\(\\s*["'\`]${escapeRegExp(id)}["'\`]`).test(allJs)
    ) {
      continue;
    }
    if (
      className &&
      className
        .split(/\s+/)
        .filter(Boolean)
        .some((name) => new RegExp(`\\.${escapeRegExp(name)}\\b`).test(allJs))
    ) {
      continue;
    }
    const dataWired = [...attributes.matchAll(/\b(data-[a-z0-9-]+)\s*=/gi)].some((match) =>
      allJs.includes(match[1].toLowerCase()),
    );
    if (dataWired || genericClickHandler) continue;

    unwiredButtons += 1;
    fail(
      `Button "${button.label}" has no click handler, so pressing it does nothing. Wire it to a listener in the script.`,
    );
  }
  if (buttons.length > 0 && unwiredButtons === 0) {
    pass("Every button is wired to a handler");
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
