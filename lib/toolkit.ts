/**
 * The 64-move toolkit.
 *
 * Every entry either opens a real Cygnus surface (`action`) or writes real,
 * working code, configuration or analysis into the project (`run`). Nothing
 * here pastes a wish into the composer: if a move has no action, it produces
 * a file you can open, run, or read.
 */

export type ToolAction =
  | "duplicate"
  | "palette"
  | "studio:snapshots"
  | "studio:design"
  | "studio:notes"
  | "studio:data"
  | "publish"
  | "export"
  | "settings"
  | "device"
  | "templates"
  | "console";

export type ProjectFile = { path: string; content: string };

export type ToolContext = {
  appName: string;
  files: Record<string, string>;
};

export type ToolOutcome = {
  report: string;
  write?: ProjectFile[];
  action?: ToolAction;
};

export type ToolkitEntry = {
  app: string;
  id: string;
  title: string;
  blurb: string;
  action?: ToolAction;
  run?: (ctx: ToolContext) => ToolOutcome;
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const HTML_EXT = ".html";

function pathsEnding(ctx: ToolContext, ext: string): string[] {
  return Object.keys(ctx.files)
    .filter((path) => path.toLowerCase().endsWith(ext))
    .sort();
}

function htmlPath(ctx: ToolContext): string | null {
  const pages = pathsEnding(ctx, HTML_EXT);
  if (pages.includes("index.html")) return "index.html";
  return pages[0] ?? null;
}

function needHtml(ctx: ToolContext): { path: string; html: string } {
  const path = htmlPath(ctx);
  if (!path) throw new Error("This project has no HTML page yet. Build one first, then run this move.");
  return { path, html: ctx.files[path] };
}

function cssText(ctx: ToolContext): string {
  return pathsEnding(ctx, ".css")
    .map((path) => ctx.files[path])
    .join("\n");
}

function jsText(ctx: ToolContext): string {
  return pathsEnding(ctx, ".js")
    .map((path) => ctx.files[path])
    .join("\n");
}

/** Text of a page with tags and scripts stripped, for word counts and headings. */
function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasRef(html: string, needle: string): boolean {
  return html.includes(needle);
}

function injectScript(html: string, src: string): string {
  if (hasRef(html, src)) return html;
  const tag = `<script src="./${src}" defer></script>`;
  if (html.includes("</body>")) return html.replace("</body>", `  ${tag}\n</body>`);
  return `${html}\n${tag}\n`;
}

function injectCss(html: string, href: string): string {
  if (hasRef(html, href)) return html;
  const tag = `<link rel="stylesheet" href="./${href}">`;
  if (html.includes("</head>")) return html.replace("</head>", `  ${tag}\n</head>`);
  return `${tag}\n${html}`;
}

function injectHead(html: string, tag: string, marker: string): string {
  if (hasRef(html, marker)) return html;
  if (html.includes("</head>")) return html.replace("</head>", `  ${tag}\n</head>`);
  return `${tag}\n${html}`;
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "app"
  );
}

function countWords(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  return words.length;
}

function bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function rel(v: number): string {
  return v.toFixed(1);
}

function group<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* shared generated modules                                            */
/* ------------------------------------------------------------------ */

const AUTH_MODULE = `// Cygnus auth: a local, client-only session.
const KEY = "cygnus.session";
const readers = [];

function safeGet() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.email !== "string") return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

function notify() {
  const session = safeGet();
  readers.forEach(function (fn) { fn(session); });
  document.dispatchEvent(new CustomEvent("auth:change", { detail: session }));
}

export function currentUser() { return safeGet(); }

export function onChange(fn) {
  readers.push(fn);
  fn(safeGet());
  return function () {
    const at = readers.indexOf(fn);
    if (at >= 0) readers.splice(at, 1);
  };
}

export function signIn(email, password) {
  const clean = String(email || "").trim().toLowerCase();
  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(clean)) throw new Error("Enter a valid email address.");
  if (String(password || "").length < 8) throw new Error("Use at least 8 characters.");
  window.localStorage.setItem(KEY, JSON.stringify({ email: clean, at: Date.now() }));
  notify();
  return safeGet();
}

export function signOut() {
  window.localStorage.removeItem(KEY);
  notify();
}

export const note = "Sessions are stored in this browser only. There is no server, so this is a demo gate, not real security.";
`;

const STORE_MODULE = `// Cygnus store: one safe wrapper around localStorage.
const PREFIX = "cygnus.";
const memory = {};

function backend() {
  try {
    window.localStorage.setItem(PREFIX + "probe", "1");
    window.localStorage.removeItem(PREFIX + "probe");
    return window.localStorage;
  } catch (_error) {
    return null;
  }
}

export function read(key, fallback) {
  const store = backend();
  try {
    const raw = store ? store.getItem(PREFIX + key) : memory[key];
    if (raw == null) return fallback;
    const value = JSON.parse(raw);
    return value == null ? fallback : value;
  } catch (_error) {
    return fallback;
  }
}

export function write(key, value) {
  const raw = JSON.stringify(value);
  const store = backend();
  try {
    if (store) store.setItem(PREFIX + key, raw);
    else memory[key] = raw;
  } catch (_error) {
    memory[key] = raw;
  }
  return value;
}

export function remove(key) {
  const store = backend();
  try {
    if (store) store.removeItem(PREFIX + key);
    memory[key] = undefined;
  } catch (_error) {
    memory[key] = undefined;
  }
}

export function list(prefix) {
  const store = backend();
  const keys = [];
  try {
    if (store) {
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i);
        if (key && key.indexOf(PREFIX + (prefix || "")) === 0) {
          keys.push(key.slice(PREFIX.length));
        }
      }
    } else {
      Object.keys(memory).forEach(function (key) {
        if (key.indexOf(prefix || "") === 0) keys.push(key);
      });
    }
  } catch (_error) {
    return [];
  }
  return keys.sort();
}

export function reset() {
  list("").forEach(remove);
}
`;

const ACTIVITY_MODULE = `// Cygnus activity log: the last 100 things that happened.
const KEY = "cygnus.activity";
const LIMIT = 100;

function safeList() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function save(entries) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, LIMIT)));
  } catch (_error) {
    /* storage is full or blocked; the in-memory list still works */
  }
  document.dispatchEvent(new CustomEvent("activity:change", { detail: entries }));
}

export function record(label, detail) {
  const entries = safeList();
  entries.unshift({ label: String(label || "action"), detail: detail ? String(detail) : "", at: new Date().toISOString() });
  save(entries);
  return entries;
}

export function entries() { return safeList(); }

export function clear() { save([]); }

export function render(target) {
  if (!target) return;
  const rows = safeList();
  target.innerHTML = rows.length
    ? rows.map(function (row) {
        return '<li><time datetime="' + row.at + '">' + new Date(row.at).toLocaleString() +
          "</time><span>" + row.label + (row.detail ? " · " + row.detail : "") + "</span></li>";
      }).join("")
    : "<li class='empty'>Nothing recorded yet.</li>";
}

document.addEventListener("click", function (event) {
  const el = event.target;
  if (!(el instanceof Element)) return;
  const button = el.closest("button, a");
  if (!button) return;
  record(button.textContent ? button.textContent.trim().slice(0, 40) : "control", button.getAttribute("href") || "");
}, true);
`;

const DEMO_MODULE = `// Cygnus demo data: fill the app with realistic rows, and reset it.
const KEY = "cygnus.demo";

export const seed = [
  { id: 1, name: "Ada Lovelace", status: "active", note: "First programmer", updated: "2026-01-04" },
  { id: 2, name: "Grace Hopper", status: "active", note: "Compiler pioneer", updated: "2026-01-08" },
  { id: 3, name: "Alan Turing", status: "paused", note: "Foundations of computing", updated: "2026-01-11" },
  { id: 4, name: "Katherine Johnson", status: "active", note: "Orbital mechanics", updated: "2026-01-15" },
  { id: 5, name: "Margaret Hamilton", status: "archived", note: "Apollo guidance", updated: "2026-01-19" }
];

export function load() {
  window.localStorage.setItem(KEY, JSON.stringify(seed));
  document.dispatchEvent(new CustomEvent("demo:load", { detail: seed }));
  return seed;
}

export function reset() {
  window.localStorage.removeItem(KEY);
  document.dispatchEvent(new CustomEvent("demo:reset", { detail: null }));
}

export function current() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_error) {
    return [];
  }
}
`;

const RULES_MODULE = `// Cygnus rules: every business rule in one named, testable place.
export const rules = {
  canCreate(state) {
    return !state.busy && String(state.title || "").trim().length >= 3;
  },
  canDelete(item) {
    return Boolean(item && !item.locked);
  },
  labelFor(status) {
    const map = { active: "Active", paused: "Paused", archived: "Archived" };
    return map[status] || "Unknown";
  },
  nextStatus(status) {
    const order = ["active", "paused", "archived"];
    const at = order.indexOf(status);
    return order[(at + 1) % order.length];
  }
};

export function apply(state) {
  return {
    ...state,
    createEnabled: rules.canCreate(state),
    items: (state.items || []).map(function (item) {
      return { ...item, statusLabel: rules.labelFor(item.status), deletable: rules.canDelete(item) };
    })
  };
}
`;

const CRUD_MODULE = `// Cygnus CRUD: one source of truth, confirmations before deletes.
const KEY = "cygnus.records";

function readAll() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveAll(rows) {
  window.localStorage.setItem(KEY, JSON.stringify(rows));
  document.dispatchEvent(new CustomEvent("crud:change", { detail: rows }));
  return rows;
}

export function list() { return readAll(); }

export function create(values) {
  const rows = readAll();
  const row = { ...values, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString() };
  return saveAll([row, ...rows]);
}

export function update(id, values) {
  return saveAll(readAll().map(function (row) { return row.id === id ? { ...row, ...values } : row; }));
}

export function remove(id, confirmed) {
  if (!confirmed) throw new Error("Confirm the delete first.");
  return saveAll(readAll().filter(function (row) { return row.id !== id; }));
}

export function reset() { return saveAll([]); }
`;

const AUTOMATION_MODULE = `// Cygnus automations: if this happens, do that. No backend needed.
const KEY = "cygnus.automations";

const TRIGGERS = ["item:add", "item:delete", "form:submit", "demo:load"];
const ACTIONS = ["toast", "record", "export"];

function readRules() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveRules(rules) {
  window.localStorage.setItem(KEY, JSON.stringify(rules));
  document.dispatchEvent(new CustomEvent("automations:change", { detail: rules }));
  return rules;
}

export function all() { return readRules(); }

export function add(trigger, action, value) {
  if (TRIGGERS.indexOf(trigger) < 0) throw new Error("Unknown trigger.");
  if (ACTIONS.indexOf(action) < 0) throw new Error("Unknown action.");
  const rules = readRules();
  rules.push({ id: Date.now().toString(36), trigger: trigger, action: action, value: String(value || ""), on: true });
  return saveRules(rules);
}

export function toggle(id) {
  return saveRules(readRules().map(function (rule) {
    return rule.id === id ? { ...rule, on: !rule.on } : rule;
  }));
}

export function remove(id) {
  return saveRules(readRules().filter(function (rule) { return rule.id !== id; }));
}

function toast(message) {
  const box = document.createElement("div");
  box.setAttribute("role", "status");
  box.textContent = message;
  box.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:10px;font:14px system-ui;z-index:9999";
  document.body.appendChild(box);
  setTimeout(function () { box.remove(); }, 2600);
}

export function fire(trigger, detail) {
  readRules().filter(function (rule) { return rule.on && rule.trigger === trigger; }).forEach(function (rule) {
    if (rule.action === "toast") toast(rule.value || trigger);
    if (rule.action === "record") {
      const rows = JSON.parse(window.localStorage.getItem("cygnus.automation.log") || "[]");
      rows.unshift({ trigger: trigger, at: new Date().toISOString(), detail: detail || null });
      window.localStorage.setItem("cygnus.automation.log", JSON.stringify(rows.slice(0, 50)));
    }
    if (rule.action === "export") {
      const blob = new Blob([JSON.stringify(detail || {}, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "automation-" + Date.now() + ".json";
      link.click();
      URL.revokeObjectURL(url);
    }
  });
}
`;

/* ------------------------------------------------------------------ */
/* the 64                                                              */
/* ------------------------------------------------------------------ */

export const TOOLKIT: ToolkitEntry[] = [
  {
    app: "Replit",
    id: "remix",
    title: "Remix this project",
    blurb: "Fork the workspace into a fresh copy you can change freely.",
    action: "duplicate",
  },
  {
    app: "Base44",
    id: "auth-module",
    title: "Local sign-in module",
    blurb: "A working session module with validation, sign-out and a change event.",
    run: () => ({
      write: [{ path: "auth.js", content: AUTH_MODULE }],
      report: "Wrote auth.js: signIn, signOut, currentUser, onChange, with validation and a demo-only warning.",
    }),
  },
  {
    app: "Lovable",
    id: "css-tidy",
    title: "Tidy the stylesheet",
    blurb: "Collapse duplicate rules and repeated declarations, then report the savings.",
    run: (ctx) => {
      const paths = pathsEnding(ctx, ".css");
      if (!paths.length) throw new Error("No CSS file to tidy yet.");
      const out: ProjectFile[] = [];
      let saved = 0;
      let removed = 0;
      for (const path of paths) {
        const before = bytes(ctx.files[path]);
        const seen = new Set<string>();
        const blocks: string[] = [];
        const rules = ctx.files[path].match(/[^{}]+\{[^{}]*\}/g) ?? [];
        for (const rule of rules) {
          const key = rule.replace(/\s+/g, " ").trim();
          if (seen.has(key)) {
            removed += 1;
            continue;
          }
          seen.add(key);
          const open = key.indexOf("{");
          const selector = key.slice(0, open).trim();
          const body = key.slice(open + 1, key.lastIndexOf("}"));
          const declSeen = new Set<string>();
          const kept: string[] = [];
          for (const decl of body.split(";")) {
            const clean = decl.trim();
            if (!clean) continue;
            const prop = clean.slice(0, clean.indexOf(":")).trim().toLowerCase();
            if (!prop || declSeen.has(prop)) {
              removed += 1;
              continue;
            }
            declSeen.add(prop);
            kept.push(clean);
          }
          blocks.push(`${selector} { ${kept.join("; ")} }`);
        }
        const next = blocks.join("\n") + "\n";
        saved += before - bytes(next);
        out.push({ path, content: next });
      }
      return {
        write: out,
        report: paths.length === 1
          ? `Tidied ${paths[0]}: removed ${removed} duplicate rule/declaration and saved ${saved} bytes.`
          : `Tidied ${paths.length} stylesheets: removed ${removed} duplicates and saved ${saved} bytes.`,
      };
    },
  },
  {
    app: "Figma",
    id: "tokens",
    title: "Extract design tokens",
    blurb: "Pull every color and font in use into one palette.",
    action: "studio:design",
  },
  {
    app: "Appy Pie",
    id: "templates",
    title: "Start from a template",
    blurb: "Browse ready-made app shapes instead of a blank page.",
    action: "templates",
  },
  {
    app: "ReTool",
    id: "csv-table",
    title: "Data table page",
    blurb: "Turn data.csv into a sortable, searchable HTML table.",
    run: (ctx) => {
      const raw = ctx.files["data.csv"];
      if (!raw) throw new Error("Add data.csv in Studio → Data first.");
      const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const split = (line: string) => line.split(",").map((cell) => cell.replace(/^"|"$/g, "").trim());
      const header = split(lines[0]);
      const rows = lines.slice(1).map(split);
      const body = rows
        .map((row) => `<tr>${header.map((_, cell) => `<td>${escapeHtml(row[cell] ?? "")}</td>`).join("")}</tr>`)
        .join("\n");
      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(ctx.appName)} · Table</title>
<style>
body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#f6f5f2;color:#151515;padding:32px}
h1{font-size:22px;margin:0 0 4px}
p.lede{margin:0 0 20px;color:#666;font-size:13px}
input{width:min(360px,100%);padding:10px 12px;border:1px solid #d8d5cf;border-radius:8px;font:inherit;background:#fff}
table{width:100%;border-collapse:collapse;margin-top:16px;background:#fff;border-radius:10px;overflow:hidden}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid #ece9e3;white-space:nowrap}
th{background:#efece6;font-size:12px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
tbody tr:hover{background:#faf9f6}
td.empty{color:#888;text-align:center;padding:32px}
</style>
</head>
<body>
<h1>${escapeHtml(ctx.appName)}</h1>
<p class="lede">${rows.length} rows · click a column heading to sort</p>
<input id="q" type="search" placeholder="Search rows" aria-label="Search rows">
<table>
<thead><tr>${header.map((cell) => `<th scope="col">${escapeHtml(cell)}</th>`).join("")}</tr></thead>
<tbody id="rows">
${body}
</tbody>
</table>
<script>
const query = document.getElementById("q");
const tbody = document.getElementById("rows");
const base = Array.from(tbody.rows);
query.addEventListener("input", function () {
  const term = query.value.toLowerCase();
  base.forEach(function (row) {
    row.hidden = term.length > 0 && row.textContent.toLowerCase().indexOf(term) < 0;
  });
});
document.querySelectorAll("th").forEach(function (th, index) {
  let asc = true;
  th.addEventListener("click", function () {
    const rows = Array.from(tbody.rows).sort(function (a, b) {
      const left = a.cells[index].textContent.trim();
      const right = b.cells[index].textContent.trim();
      const numeric = parseFloat(left) - parseFloat(right);
      const result = !isNaN(numeric) ? numeric : left.localeCompare(right);
      return asc ? result : -result;
    });
    asc = !asc;
    rows.forEach(function (row) { tbody.appendChild(row); });
  });
});
</script>
</body>
</html>
`;
      return {
        write: [{ path: "data-table.html", content: html }],
        report: `Wrote data-table.html with ${rows.length} rows and ${header.length} columns, plus search and click-to-sort.`,
      };
    },
  },
  {
    app: "Bolt.new",
    id: "export",
    title: "Download the source",
    blurb: "Take the whole project out as a zip, ready for any host.",
    action: "export",
  },
  {
    app: "Emergent",
    id: "health",
    title: "Project health report",
    blurb: "Score the project on size, metadata, a11y and mobile readiness.",
    run: (ctx) => {
      const pages = pathsEnding(ctx, HTML_EXT);
      const html = pages.map((path) => ctx.files[path]).join("\n");
      const total = Object.values(ctx.files).reduce((sum, text) => sum + bytes(text), 0);
      const checks: Array<[string, boolean, string]> = [
        ["Has an HTML page", pages.length > 0, "index.html is the entry point"],
        ["Declares lang", /<html[^>]+lang=/i.test(html), "helps screen readers and translation"],
        ["Has a viewport tag", /name=["']viewport["']/i.test(html), "required for mobile"],
        ["Has a meta description", /name=["']description["']/i.test(html), "shows in search results"],
        ["Has a page title", /<title>[^<]+<\/title>/i.test(html), "used in tabs and shares"],
        ["Every image has alt", !/<img(?![^>]*\balt=)[^>]*>/i.test(html), "describes images to assistive tech"],
        ["No inline event handlers", !/\son(click|change|input)=["']/i.test(html), "keeps markup and behaviour apart"],
        ["Styles live in CSS", pathsEnding(ctx, ".css").length > 0, "so the design can be changed in one place"],
        ["Scripts are deferred", !/<script(?![^>]*\bdefer\b)(?![^>]*\bsrc=)[^>]*>[\s\S]{40,}<\/script>/i.test(html), "does not block first paint"],
        ["Under 300 KB of source", total < 300 * 1024, "cheap to load anywhere"],
      ];
      const passed = checks.filter((check) => check[1]).length;
      const score = Math.round((passed / checks.length) * 100);
      const lines = checks.map((check) => `- ${check[1] ? "PASS" : "FIX "} · ${check[0]} — ${check[2]}`);
      const report = `# Health check\n\n**Score ${score}/100** · ${passed}/${checks.length} checks passed · ${(total / 1024).toFixed(0)} KB of source\n\n${lines.join("\n")}\n`;
      return {
        write: [{ path: "health.md", content: report }],
        report: `Health score ${score}/100 (${passed}/${checks.length}). Wrote health.md with every check and its fix.`,
      };
    },
  },
  {
    app: "Freebuff",
    id: "status-line",
    title: "Live status line",
    blurb: "A one-line checkpoint bar with the details collapsed underneath.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const module = `// Cygnus status line: one live line, details folded away.
let bar = null;
let detail = null;
let timer = 0;

function ensure() {
  if (bar) return bar;
  bar = document.createElement("div");
  bar.setAttribute("role", "status");
  bar.setAttribute("aria-live", "polite");
  bar.style.cssText = "position:fixed;left:16px;right:16px;bottom:16px;display:flex;gap:10px;align-items:center;justify-content:space-between;background:#111;color:#f5f5f5;padding:10px 14px;border-radius:12px;font:13px/1.4 system-ui;box-shadow:0 8px 30px rgba(0,0,0,.25);z-index:9998";
  detail = document.createElement("details");
  detail.innerHTML = "<summary style='cursor:pointer'>Details</summary><div style='max-height:30vh;overflow:auto;margin-top:6px;opacity:.75'></div>";
  const label = document.createElement("span");
  label.dataset.role = "label";
  label.style.flex = "1";
  bar.append(label, detail);
  document.body.appendChild(bar);
  return bar;
}

export function start(message) {
  ensure();
  const label = bar.querySelector("[data-role=label]");
  label.textContent = message;
  bar.hidden = false;
  clearInterval(timer);
  const began = Date.now();
  timer = setInterval(function () {
    label.textContent = message + " · " + Math.round((Date.now() - began) / 1000) + "s";
  }, 1000);
}

export function step(line) {
  ensure();
  bar.querySelector("[data-role=label]").textContent = line;
  const log = detail.querySelector("div");
  const row = document.createElement("div");
  row.textContent = line;
  log.prepend(row);
}

export function stop(message) {
  clearInterval(timer);
  if (!bar) return;
  if (message) bar.querySelector("[data-role=label]").textContent = message;
  setTimeout(function () { if (bar) bar.hidden = true; }, 4000);
}
`;
      return {
        write: [
          { path: "status-line.js", content: module },
          { path: page.path, content: injectScript(page.html, "status-line.js") },
        ],
        report: "Wrote status-line.js (start/step/stop) and linked it into the page. It shows one live line with a collapsible log.",
      };
    },
  },
  {
    app: "Dyad",
    id: "local-store",
    title: "Safe local storage",
    blurb: "One guarded store instead of scattered localStorage calls.",
    run: () => ({
      write: [{ path: "store.js", content: STORE_MODULE }],
      report: "Wrote store.js with read/write/remove/list/reset, JSON guards, and an in-memory fallback when storage is blocked.",
    }),
  },
  {
    app: "VS Code",
    id: "palette",
    title: "Command palette",
    blurb: "Jump to any panel or action with Ctrl/Cmd+K.",
    action: "palette",
  },
  {
    app: "Render",
    id: "publish",
    title: "Deploy and read the log",
    blurb: "Publish the app and keep the deployment steps visible.",
    action: "publish",
  },
  {
    app: "Hostinger Horizons",
    id: "publish-horizons",
    title: "Publish to the web",
    blurb: "Connect free hosting and get a public link in one pass.",
    action: "publish",
  },
  {
    app: "Factory",
    id: "audit-all",
    title: "Full audit",
    blurb: "Run every check at once and write one report.",
    run: (ctx) => {
      const pages = pathsEnding(ctx, HTML_EXT);
      const html = pages.map((path) => ctx.files[path]).join("\n");
      const ids = (html.match(/\sid=["']([^"']+)["']/g) ?? []).map((m) => m.replace(/.*=["']([^"']+)["'].*/, "$1"));
      const dup = [...group(ids, (id) => id)].filter(([, list]) => list.length > 1).map(([id]) => id);
      const links = (html.match(/href=["']#([^"']+)["']/g) ?? []).map((m) => m.replace(/href=["']#([^"']+)["']/, "$1"));
      const dangling = [...new Set(links.filter((id) => id && !ids.includes(id)))];
      const images = (html.match(/<img[^>]*>/gi) ?? []).filter((tag) => !/\balt=/.test(tag)).length;
      const inline = (html.match(/\s(onclick|onchange|oninput)=/gi) ?? []).length;
      const external = (html.match(/(https?:)?\/\/(?!www\.w3\.org)[^"'\s>]+/g) ?? []).length;
      const sections: Array<[string, string]> = [
        ["Pages", pages.length ? pages.join(", ") : "none"],
        ["Files", String(Object.keys(ctx.files).length)],
        ["Duplicate ids", dup.length ? dup.join(", ") : "none"],
        ["Dangling anchors", dangling.length ? dangling.join(", ") : "none"],
        ["Images without alt", String(images)],
        ["Inline handlers", String(inline)],
        ["External URLs", String(external)],
      ];
      const report = `# Audit\n\n${sections.map(([label, value]) => `- **${label}**: ${value}`).join("\n")}\n`;
      const issues = dup.length + dangling.length + images + inline;
      return {
        write: [{ path: "audit.md", content: report }],
        report: issues === 0
          ? `Audit clean across ${pages.length} page(s) and ${Object.keys(ctx.files).length} files. Wrote audit.md.`
          : `Audit found ${issues} issue${issues === 1 ? "" : "s"} (duplicate ids, dead anchors, missing alt text, inline handlers). Wrote audit.md.`,
      };
    },
  },
  {
    app: "Devin",
    id: "activity-log",
    title: "Activity log",
    blurb: "Record the last 100 actions with timestamps, and clear them.",
    run: (ctx) => {
      const page = needHtml(ctx);
      return {
        write: [
          { path: "activity-log.js", content: ACTIVITY_MODULE },
          { path: page.path, content: injectScript(page.html, "activity-log.js") },
        ],
        report: "Wrote activity-log.js (record/entries/clear/render) and linked it. It captures clicks automatically and keeps 100 entries.",
      };
    },
  },
  {
    app: "Runable",
    id: "demo-data",
    title: "Demo and reset",
    blurb: "Load realistic seed rows, then clear them again.",
    run: (ctx) => {
      const page = needHtml(ctx);
      return {
        write: [
          { path: "demo-data.js", content: DEMO_MODULE },
          { path: page.path, content: injectScript(page.html, "demo-data.js") },
        ],
        report: "Wrote demo-data.js with load/reset/current and five seed rows. Fire `demo:load` on a button to try it.",
      };
    },
  },
  {
    app: "Rocket AI",
    id: "readme",
    title: "Write the README",
    blurb: "A real README generated from the project's own structure.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const text = pageText(page.html);
      const headings = (page.html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi) ?? [])
        .map((tag) => tag.replace(/<[^>]+>/g, "").trim())
        .filter(Boolean);
      const files = Object.keys(ctx.files).sort();
      const body = `# ${ctx.appName}

${headings[0] ?? "A small static web app."}

## What it does

${text.split(/(?<=\.)\s+/).slice(0, 3).join(" ")}${text.length > 400 ? "…" : ""}

## Files

${files.map((path) => `- \`${path}\` — ${ctx.files[path].split("\n").length} lines`).join("\n")}

## Run it

Open \`${page.path}\` in a browser. There is no build step and no server.

## Deploy it

Upload this folder to any static host. Keep \`${page.path}\` at the root.
`;
      return {
        write: [{ path: "README.md", content: body }],
        report: `Wrote README.md from ${files.length} files and ${headings.length} heading(s).`,
      };
    },
  },
  {
    app: "Runner",
    id: "task-queue",
    title: "Task queue",
    blurb: "Queued, running, done and failed states that survive reload.",
    run: () => {
      const module = `// Cygnus task queue: queued → running → done | failed.
const KEY = "cygnus.queue";

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function save(tasks) {
  window.localStorage.setItem(KEY, JSON.stringify(tasks));
  document.dispatchEvent(new CustomEvent("queue:change", { detail: tasks }));
  return tasks;
}

export function all() { return read(); }

export function add(label) {
  const task = { id: Date.now().toString(36), label: String(label || "Task").slice(0, 80), status: "queued", tries: 0 };
  return save([...read(), task]);
}

export function startTask(id) {
  return save(read().map(function (task) { return task.id === id ? { ...task, status: "running" } : task; }));
}

export function finish(id, ok) {
  return save(read().map(function (task) {
    return task.id === id ? { ...task, status: ok ? "done" : "failed", tries: task.tries + 1 } : task;
  }));
}

export function retry(id) {
  return save(read().map(function (task) {
    return task.id === id && task.status === "failed" ? { ...task, status: "queued" } : task;
  }));
}

export function clearDone() {
  return save(read().filter(function (task) { return task.status !== "done"; }));
}

export function counts() {
  return read().reduce(function (acc, task) { acc[task.status] = (acc[task.status] || 0) + 1; return acc; }, {});
}
`;
      return {
        write: [{ path: "task-queue.js", content: module }],
        report: "Wrote task-queue.js: add, startTask, finish, retry, clearDone, counts. State persists in localStorage.",
      };
    },
  },
  {
    app: "Cursor",
    id: "dependency-map",
    title: "Dependency map",
    blurb: "Which file references which, so a change lands everywhere it must.",
    run: (ctx) => {
      const rows: string[] = [];
      for (const path of Object.keys(ctx.files).sort()) {
        const text = ctx.files[path];
        const refs = new Set<string>();
        for (const match of text.matchAll(/(?:src|href)=["']\.?\/?([^"':]+\.(?:css|js|png|jpg|svg|webp|json))["']/gi)) {
          refs.add(match[1]);
        }
        for (const match of text.matchAll(/from\s+["']\.\/([^"']+)["']/g)) refs.add(match[1]);
        rows.push(`| \`${path}\` | ${refs.size ? [...refs].map((ref) => `\`${ref}\``).join(", ") : "—"} | ${text.split("\n").length} |`);
      }
      const orphans = Object.keys(ctx.files).filter((path) => {
        if (path === "index.html" || /\.(md|txt|yml|yaml|json)$/i.test(path)) return false;
        return !Object.entries(ctx.files).some(([other, text]) => other !== path && text.includes(path));
      });
      const body = `# Dependency map\n\n| File | References | Lines |\n| --- | --- | --- |\n${rows.join("\n")}\n\n## Unreferenced\n\n${orphans.length ? orphans.map((path) => `- \`${path}\``).join("\n") : "Every page asset is linked."}\n`;
      return {
        write: [{ path: "dependencies.md", content: body }],
        report: `Mapped ${Object.keys(ctx.files).length} files. ${orphans.length ? `${orphans.length} file(s) are never referenced.` : "No orphan files."} Wrote dependencies.md.`,
      };
    },
  },
  {
    app: "OpenCode",
    id: "shortcuts",
    title: "Keyboard shortcuts",
    blurb: "Bind the main actions, with a '?' sheet listing them.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const module = `// Cygnus shortcuts: every command reachable from the keyboard.
const commands = new Map();

export function bind(key, name, run) {
  commands.set(key.toLowerCase(), { name: name, run: run });
}

export function list() {
  return Array.from(commands.entries()).map(function (entry) { return { key: entry[0], name: entry[1].name }; });
}

function sheet() {
  let box = document.getElementById("cygnus-shortcuts");
  if (box) { box.remove(); return; }
  box = document.createElement("div");
  box.id = "cygnus-shortcuts";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "Keyboard shortcuts");
  box.style.cssText = "position:fixed;inset:0;display:grid;place-items:center;background:rgba(10,10,10,.55);z-index:9999";
  const card = document.createElement("div");
  card.style.cssText = "background:#fff;color:#111;border-radius:14px;padding:22px 26px;font:14px/1.7 system-ui;min-width:280px";
  card.innerHTML = "<h2 style='margin:0 0 10px;font-size:16px'>Keyboard shortcuts</h2>" +
    Array.from(commands.entries()).map(function (entry) {
      return "<div style='display:flex;justify-content:space-between;gap:24px'><span>" + entry[1].name +
        "</span><kbd style='font:inherit;opacity:.6'>" + entry[0] + "</kbd></div>";
    }).join("") + "<p style='opacity:.5;margin:14px 0 0;font-size:12px'>Press Esc to close</p>";
  box.appendChild(card);
  box.addEventListener("click", function (event) { if (event.target === box) box.remove(); });
  document.body.appendChild(box);
}

document.addEventListener("keydown", function (event) {
  const tag = event.target instanceof Element ? event.target.tagName : "";
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  if (event.key === "?" && !typing) { event.preventDefault(); sheet(); return; }
  if (event.key === "Escape") { const box = document.getElementById("cygnus-shortcuts"); if (box) box.remove(); }
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
  const found = commands.get(event.key.toLowerCase());
  if (!found) return;
  event.preventDefault();
  found.run();
});

export const note = "Press ? anywhere to see this list.";
`;
      return {
        write: [
          { path: "shortcuts.js", content: module },
          { path: page.path, content: injectScript(page.html, "shortcuts.js") },
        ],
        report: "Wrote shortcuts.js with bind/list and a '?' shortcut sheet, and linked it. Press ? to check.",
      };
    },
  },
  {
    app: "LM Studio",
    id: "settings",
    title: "Choose a local model",
    blurb: "Run an open model on this PC with no key and no upload.",
    action: "settings",
  },
  {
    app: "Github",
    id: "github",
    title: "Push to a repository",
    blurb: "Send the project to a real repo with one commit.",
    action: "settings",
  },
  {
    app: "Gitlab",
    id: "gitlab-ci",
    title: "Pages pipeline",
    blurb: "A working CI file that publishes the folder to GitLab Pages.",
    run: () => ({
      write: [
        {
          path: ".gitlab-ci.yml",
          content: `pages:
  stage: deploy
  script:
    - mkdir -p public
    - cp -r ./* public/ 2>/dev/null || true
    - rm -f public/.gitlab-ci.yml
  artifacts:
    paths:
      - public
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
`,
        },
      ],
      report: "Wrote .gitlab-ci.yml. Push it, then turn on Settings → Pages in GitLab; the site publishes from the public/ artifact.",
    }),
  },
  {
    app: "Manus",
    id: "plan",
    title: "Plan from the code",
    blurb: "A checklist built from every TODO and unfinished control.",
    run: (ctx) => {
      const todos: string[] = [];
      for (const [path, text] of Object.entries(ctx.files)) {
        text.split("\n").forEach((line, index) => {
          if (/TODO|FIXME|HACK/i.test(line)) todos.push(`- [ ] \`${path}:${index + 1}\` ${line.trim().slice(0, 110)}`);
        });
      }
      const html = pathsEnding(ctx, HTML_EXT).map((path) => ctx.files[path]).join("\n");
      const dead = (html.match(/href=["']#["']/gi) ?? []).length;
      const body = `# Plan\n\n${todos.length ? `## Unfinished code\n\n${todos.join("\n")}\n\n` : ""}${dead ? `## Dead links\n\n- [ ] ${dead} link(s) point at \`#\`\n\n` : ""}## Next\n\n- [ ] Open every page at 360px wide\n- [ ] Tab through the whole app\n- [ ] Run the audit move\n`;
      return {
        write: [{ path: "PLAN.md", content: body }],
        report: `Wrote PLAN.md with ${todos.length} TODO item(s) and ${dead} dead link(s).`,
      };
    },
  },
  {
    app: "Wix",
    id: "reorder",
    title: "Drag to rearrange",
    blurb: "Reorder page sections by dragging, with a saved order.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const module = `// Cygnus reorder: drag sections, save the order, reset it.
const KEY = "cygnus.section-order";

function sections() {
  const main = document.querySelector("main") || document.body;
  return Array.from(main.children).filter(function (el) { return el.tagName === "SECTION" || el.tagName === "DIV"; });
}

function apply(order) {
  const main = document.querySelector("main") || document.body;
  if (!order || !order.length) return;
  order.forEach(function (id) {
    const el = main.querySelector('[data-section="' + id + '"]');
    if (el) main.appendChild(el);
  });
}

function save() {
  const ids = sections().map(function (el) { return el.dataset.section; }).filter(Boolean);
  window.localStorage.setItem(KEY, JSON.stringify(ids));
}

export function enable() {
  let dragged = null;
  sections().forEach(function (el, index) {
    if (!el.dataset.section) el.dataset.section = "section-" + index;
    el.draggable = true;
    el.style.cursor = "grab";
    el.addEventListener("dragstart", function () { dragged = el; el.style.opacity = ".5"; });
    el.addEventListener("dragend", function () { el.style.opacity = "1"; save(); });
    el.addEventListener("dragover", function (event) { event.preventDefault(); });
    el.addEventListener("drop", function (event) {
      event.preventDefault();
      if (!dragged || dragged === el) return;
      const box = el.getBoundingClientRect();
      const after = event.clientY > box.top + box.height / 2;
      el.parentNode.insertBefore(dragged, after ? el.nextSibling : el);
    });
  });
}

export function resetOrder() {
  window.localStorage.removeItem(KEY);
  window.location.reload();
}

export function restore() {
  try { apply(JSON.parse(window.localStorage.getItem(KEY) || "[]")); } catch (_error) { /* ignore */ }
}

restore();
enable();
`;
      return {
        write: [
          { path: "reorder.js", content: module },
          { path: page.path, content: injectScript(page.html, "reorder.js") },
        ],
        report: "Wrote reorder.js: drag any <section> in <main>, the order persists, and resetOrder() clears it.",
      };
    },
  },
  {
    app: "Anything.com",
    id: "spec",
    title: "App spec",
    blurb: "Write down what the app actually is, derived from its own markup.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const text = pageText(page.html);
      const headings = (page.html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi) ?? [])
        .map((tag) => tag.replace(/<[^>]+>/g, "").trim())
        .filter(Boolean);
      const controls = (page.html.match(/<(button|input|select|textarea|a)\b[^>]*>/gi) ?? []).length;
      const body = `# Spec

## Purpose

${text.split(/(?<=\.)\s+/)[0] ?? ctx.appName}

## Screens

${headings.length ? headings.map((h) => `- ${h}`).join("\n") : "- index"}

## Interaction points

${controls} controls on \`${page.path}\`.

## Data

${ctx.files["data.csv"] ? "A `data.csv` file is loaded by the app." : "No stored data file."}

## Constraints

Static HTML, CSS and JS with no build step, so it can be hosted anywhere.
`;
      return {
        write: [{ path: "SPEC.md", content: body }],
        report: `Wrote SPEC.md with ${headings.length} screen heading(s) and ${controls} interaction points.`,
      };
    },
  },
  {
    app: "Bolt.diy",
    id: "selfhost",
    title: "Self-hosting notes",
    blurb: "Exact steps to run this yourself and host it anywhere.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const body = `# Self-hosting ${ctx.appName}

## Run it locally

Open \`${page.path}\` directly in a browser. There is no build step, no install, and no server.

If a browser blocks \`file://\` features, serve the folder instead:

\`\`\`sh
npx serve .
\`\`\`

## Host it

Upload the whole folder to any static host. \`${page.path}\` must stay at the root, and every asset path must stay relative.

## What must travel together

${Object.keys(ctx.files).sort().map((path) => `- \`${path}\``).join("\n")}

## What it does not need

No database, no API key, no environment variable, no container.
`;
      return {
        write: [{ path: "SELFHOST.md", content: body }],
        report: "Wrote SELFHOST.md with local-run, hosting, and the exact file list.",
      };
    },
  },
  {
    app: "Netlify",
    id: "export-netlify",
    title: "Netlify drop",
    blurb: "Export a folder you can drag straight into Netlify Drop.",
    action: "export",
  },
  {
    app: "Vercel",
    id: "vercel",
    title: "Vercel-ready export",
    blurb: "Add a config and list every absolute path that would break.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const broken: string[] = [];
      for (const [path, text] of Object.entries(ctx.files)) {
        if (!/\.(html|css|js)$/i.test(path)) continue;
        for (const match of text.matchAll(/(?:src|href)=["']\/(?!\/)([^"']+)["']/g)) {
          broken.push(`${path} → /${match[1]}`);
        }
      }
      const config = `{
  "cleanUrls": true,
  "trailingSlash": false,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [{ "key": "X-Content-Type-Options", "value": "nosniff" }]
    }
  ]
}
`;
      return {
        write: [
          { path: "vercel.json", content: config },
          {
            path: "DEPLOY-VERCEL.md",
            content: `# Deploy to Vercel\n\nRun \`vercel\` in this folder, or drag it into the dashboard.\n\nOutput directory: \`.\` · Framework: Other · Build command: none\n\n## Absolute paths to fix\n\n${broken.length ? broken.map((line) => `- ${line}`).join("\n") : "None. Every asset uses a relative path."}\n`,
          },
        ],
        report: broken.length
          ? `Wrote vercel.json and DEPLOY-VERCEL.md. Found ${broken.length} absolute path(s) that break on a static host.`
          : `Wrote vercel.json and DEPLOY-VERCEL.md. Every asset path is relative and deploy-ready.`,
      };
    },
  },
  {
    app: "V0",
    id: "themes",
    title: "Three design variants",
    blurb: "Three ready palettes you can switch between at runtime.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const css = `/* Cygnus themes: three directions, same content. */
:root {
  --theme-bg: #f6f5f2;
  --theme-fg: #15140f;
  --theme-accent: #b3481d;
  --theme-muted: #6f6a5f;
  --theme-card: #ffffff;
}
:root[data-theme="dense"] {
  --theme-bg: #0f1214;
  --theme-fg: #eef2f4;
  --theme-accent: #4ec9a0;
  --theme-muted: #93a1a8;
  --theme-card: #171c1f;
}
:root[data-theme="playful"] {
  --theme-bg: #fff6e9;
  --theme-fg: #241a12;
  --theme-accent: #e0489b;
  --theme-muted: #7a6a58;
  --theme-card: #ffffff;
}
body { background: var(--theme-bg); color: var(--theme-fg); }
.cygnus-themes { display: flex; gap: 6px; position: fixed; right: 14px; bottom: 14px; z-index: 9997; }
.cygnus-themes button { font: 12px system-ui; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--theme-muted); background: var(--theme-card); color: var(--theme-fg); cursor: pointer; }
`;
      const module = `// Cycle between the three palettes.
const KEY = "cygnus.theme";
const names = ["editorial", "dense", "playful"];

export function use(name) {
  document.documentElement.dataset.theme = name;
  window.localStorage.setItem(KEY, name);
}

const bar = document.createElement("div");
bar.className = "cygnus-themes";
names.forEach(function (name) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = name;
  button.addEventListener("click", function () { use(name); });
  bar.appendChild(button);
});
document.body.appendChild(bar);

try {
  const saved = window.localStorage.getItem(KEY);
  if (saved) document.documentElement.dataset.theme = saved;
} catch (_error) { /* ignore */ }
`;
      let html = injectCss(page.html, "themes.css");
      html = injectScript(html, "themes.js");
      return {
        write: [
          { path: "themes.css", content: css },
          { path: "themes.js", content: module },
          { path: page.path, content: html },
        ],
        report: "Wrote themes.css and themes.js with editorial, dense and playful palettes, a switcher, and a saved choice.",
      };
    },
  },
  {
    app: "Vibecode",
    id: "device",
    title: "Phone preview",
    blurb: "Check the layout at a real phone width before shipping.",
    action: "device",
  },
  {
    app: "Onspace",
    id: "data-layer",
    title: "Typed data layer",
    blurb: "One module for load, save, list, add, update, remove, reset.",
    run: () => ({
      write: [{ path: "data.js", content: STORE_MODULE }],
      report: "Wrote data.js with read/write/remove/list/reset and a safe fallback when localStorage is blocked.",
    }),
  },
  {
    app: "Sintra AI",
    id: "summary-panel",
    title: "Summary panel",
    blurb: "A collapsible panel that summarises the page in plain language.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const text = pageText(page.html);
      const words = countWords(text);
      const module = `// Cygnus summary panel: what this page contains, in plain words.
export function summarize() {
  const main = document.querySelector("main") || document.body;
  const text = (main.innerText || "").replace(/\\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  const controls = main.querySelectorAll("button, a, input, select, textarea").length;
  const headings = Array.from(main.querySelectorAll("h1, h2")).map(function (h) { return h.textContent.trim(); }).filter(Boolean);
  return {
    words: words,
    controls: controls,
    headings: headings,
    line: words === 0
      ? "This page has no visible text yet."
      : "This page runs " + words + " words across " + headings.length + " section(s) with " + controls + " interactive controls."
  };
}

export function mount() {
  const panel = document.createElement("aside");
  panel.style.cssText = "position:fixed;right:14px;top:14px;max-width:280px;background:#fff;color:#111;border:1px solid #e4e1da;border-radius:12px;padding:12px 14px;font:13px/1.5 system-ui;box-shadow:0 6px 24px rgba(0,0,0,.08);z-index:9996";
  panel.innerHTML = "<details open><summary style='cursor:pointer;font-weight:600'>Summary</summary><p data-role='line' style='margin:8px 0 0;opacity:.75'></p></details>";
  panel.querySelector("[data-role=line]").textContent = summarize().line;
  document.body.appendChild(panel);
  return panel;
}
`;
      return {
        write: [
          { path: "summary.js", content: module },
          { path: page.path, content: injectScript(page.html, "summary.js") },
        ],
        report: `Wrote summary.js (summarize/mount). This page is ${words} words, so the panel has something real to describe.`,
      };
    },
  },
  {
    app: "Ninox",
    id: "views",
    title: "Table and card views",
    blurb: "The same records as a table or as cards, with the choice saved.",
    run: () => {
      const module = `// Cygnus views: one dataset, two layouts.
const KEY = "cygnus.view";

export function render(container, rows, columns) {
  if (!container) return;
  const view = window.localStorage.getItem(KEY) || "table";
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;gap:6px;margin-bottom:10px";
  ["table", "cards"].forEach(function (name) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.setAttribute("aria-pressed", String(view === name));
    button.addEventListener("click", function () {
      window.localStorage.setItem(KEY, name);
      render(container, rows, columns);
    });
    bar.appendChild(button);
  });
  container.replaceChildren(bar);
  if (view === "cards") {
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(200px,1fr))";
    rows.forEach(function (row) {
      const card = document.createElement("article");
      card.style.cssText = "border:1px solid #e4e1da;border-radius:10px;padding:12px;background:#fff";
      card.innerHTML = columns.map(function (column) {
        return "<div><strong style='font-size:11px;opacity:.5;text-transform:uppercase'>" + column +
          "</strong><div>" + (row[column] == null ? "" : String(row[column])) + "</div></div>";
      }).join("");
      grid.appendChild(card);
    });
    container.appendChild(grid);
    return;
  }
  const table = document.createElement("table");
  table.style.cssText = "width:100%;border-collapse:collapse";
  table.innerHTML = "<thead><tr>" + columns.map(function (column) { return "<th>" + column + "</th>"; }).join("") +
    "</tr></thead><tbody>" + rows.map(function (row) {
      return "<tr>" + columns.map(function (column) { return "<td>" + (row[column] == null ? "" : String(row[column])) + "</td>"; }).join("") + "</tr>";
    }).join("") + "</tbody>";
  container.appendChild(table);
}
`;
      return {
        write: [{ path: "views.js", content: module }],
        report: "Wrote views.js: render(container, rows, columns) draws a table or cards, and remembers which you picked.",
      };
    },
  },
  {
    app: "Google AI Studio",
    id: "studio-notes",
    title: "System instructions",
    blurb: "Keep a reusable brief and spec with the project.",
    action: "studio:notes",
  },
  {
    app: "Xcode",
    id: "device-frames",
    title: "Device frames",
    blurb: "Preview desktop, tablet, and phone without leaving the builder.",
    action: "device",
  },
  {
    app: "QuantumByte",
    id: "perf",
    title: "Performance budget",
    blurb: "Measure every file and flag what blows a 200 KB budget.",
    run: (ctx) => {
      const rows = Object.keys(ctx.files)
        .sort()
        .map((path) => ({ path, size: bytes(ctx.files[path]) }));
      const total = rows.reduce((sum, row) => sum + row.size, 0);
      const heavy = rows.filter((row) => row.size > 40 * 1024);
      const body = `# Performance budget\n\nBudget: **200 KB**. Current: **${(total / 1024).toFixed(1)} KB** — ${total < 200 * 1024 ? "within budget" : "over budget"}.\n\n| File | KB |\n| --- | --- |\n${rows.map((row) => `| \`${row.path}\` | ${(row.size / 1024).toFixed(1)} |`).join("\n")}\n\n## Largest\n\n${heavy.length ? heavy.map((row) => `- \`${row.path}\` — ${(row.size / 1024).toFixed(1)} KB`).join("\n") : "No single file is over 40 KB."}\n`;
      return {
        write: [{ path: "PERFORMANCE.md", content: body }],
        report: `Total ${(total / 1024).toFixed(1)} KB against a 200 KB budget. ${heavy.length} file(s) over 40 KB. Wrote PERFORMANCE.md.`,
      };
    },
  },
  {
    app: "Softr",
    id: "studio-data",
    title: "Import a CSV",
    blurb: "Paste spreadsheet rows and get a working data view.",
    action: "studio:data",
  },
  {
    app: "Mendix",
    id: "model",
    title: "Model the flow",
    blurb: "Write the entities, states, and rules before the screens.",
    action: "studio:notes",
  },
  {
    app: "Fly.io",
    id: "publish-fly",
    title: "Ship a static bundle",
    blurb: "Publish the same files anywhere, with no server to maintain.",
    action: "publish",
  },
  {
    app: "Mocha AI",
    id: "checks",
    title: "Run the checks",
    blurb: "Static tests for broken links, missing files and dead controls.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const html = ctx.files[page.path];
      const files = new Set(Object.keys(ctx.files));
      const assets: string[] = [];
      for (const match of html.matchAll(/(?:src|href)=["']\.?\/?([^"':#?]+)["']/g)) {
        if (/^(https?:|mailto:|data:)/.test(match[1])) continue;
        assets.push(match[1]);
      }
      const missing = assets.filter((asset) => !files.has(asset) && !files.has(asset.replace(/^\.\//, "")));
      const emptyButtons = (html.match(/<button[^>]*>\s*<\/button>/gi) ?? []).length;
      const deadLinks = (html.match(/href=["']#["']/gi) ?? []).length;
      const emptyScripts = pathsEnding(ctx, ".js").filter((path) => ctx.files[path].trim().length < 40);
      const failures = missing.length + emptyButtons + deadLinks + emptyScripts.length;
      const body = `# Checks\n\n${failures === 0 ? "All checks passed." : `${failures} failure(s).`}\n\n## Missing assets\n\n${missing.length ? missing.map((asset) => `- ${asset}`).join("\n") : "None."}\n\n## Markup\n\n- Empty buttons: ${emptyButtons}\n- Dead \`#\` links: ${deadLinks}\n\n## Scripts\n\n${emptyScripts.length ? emptyScripts.map((path) => `- \`${path}\` is nearly empty`).join("\n") : "All scripts have content."}\n`;
      return {
        write: [{ path: "CHECKS.md", content: body }],
        report: failures === 0 ? "All checks passed. Wrote CHECKS.md." : `${failures} failure(s): ${missing.length} missing asset(s), ${emptyButtons} empty button(s), ${deadLinks} dead link(s). Wrote CHECKS.md.`,
      };
    },
  },
  {
    app: "Glide",
    id: "studio-data-glide",
    title: "Spreadsheet to app",
    blurb: "Turn pasted rows into searchable, editable cards.",
    action: "studio:data",
  },
  {
    app: "Bubble AI",
    id: "rules-module",
    title: "Rules, not spaghetti",
    blurb: "Every business rule in one named, testable module.",
    run: () => ({
      write: [{ path: "rules.js", content: RULES_MODULE }],
      report: "Wrote rules.js with pure functions (canCreate, canDelete, labelFor, nextStatus) and an apply() helper.",
    }),
  },
  {
    app: "Adalo",
    id: "mobile-css",
    title: "Native-feeling mobile",
    blurb: "Bottom nav, 44px targets, safe areas, no horizontal scroll.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const css = `/* Cygnus mobile: safe areas, big targets, no sideways scroll. */
:root { --safe-bottom: env(safe-area-inset-bottom, 0px); }
html, body { max-width: 100%; overflow-x: hidden; }
body { -webkit-text-size-adjust: 100%; }
button, a, input, select, textarea, [role="button"] {
  min-height: 44px;
  min-width: 44px;
}
.cygnus-bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-around;
  gap: 4px;
  padding: 8px 8px calc(8px + var(--safe-bottom));
  background: color-mix(in srgb, currentColor 6%, transparent);
  backdrop-filter: blur(12px);
  z-index: 9000;
}
.cygnus-bottom-nav a, .cygnus-bottom-nav button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 11px;
  text-decoration: none;
  border: 0;
  background: none;
  color: inherit;
}
@media (min-width: 720px) { .cygnus-bottom-nav { display: none; } }
main { padding-bottom: calc(76px + var(--safe-bottom)); }
`;
      const module = `// Bottom navigation, built from the page's own top-level links.
const links = Array.from(document.querySelectorAll("nav a")).slice(0, 4);
if (links.length) {
  const bar = document.createElement("nav");
  bar.className = "cygnus-bottom-nav";
  bar.setAttribute("aria-label", "Primary");
  links.forEach(function (link) {
    const item = document.createElement("a");
    item.href = link.getAttribute("href") || "#";
    item.textContent = link.textContent.trim() || "Home";
    bar.appendChild(item);
  });
  document.body.appendChild(bar);
}
`;
      let html = injectCss(page.html, "mobile.css");
      html = injectScript(html, "mobile.js");
      return {
        write: [
          { path: "mobile.css", content: css },
          { path: "mobile.js", content: module },
          { path: page.path, content: html },
        ],
        report: "Wrote mobile.css (44px targets, safe areas, no horizontal scroll) and mobile.js, which builds a bottom nav from the page's links.",
      };
    },
  },
  {
    app: "Aider",
    id: "snapshots",
    title: "Restore a checkpoint",
    blurb: "Go back to the project exactly as it was before a risky change.",
    action: "studio:snapshots",
  },
  {
    app: "Kilo code",
    id: "model-routing",
    title: "Pick the right model",
    blurb: "Route small edits to a fast model and hard builds to a strong one.",
    action: "settings",
  },
  {
    app: "Kiro",
    id: "spec-driven",
    title: "Spec-driven build",
    blurb: "Agree on the spec, then implement against it.",
    action: "studio:notes",
  },
  {
    app: "Appifex",
    id: "screens",
    title: "Screen inventory",
    blurb: "List every page, its job, and its primary action.",
    run: (ctx) => {
      const pages = pathsEnding(ctx, HTML_EXT);
      if (!pages.length) throw new Error("No pages to inventory yet.");
      const rows = pages.map((path) => {
        const html = ctx.files[path];
        const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? path;
        const headings = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "")
          .replace(/<[^>]+>/g, "")
          .trim();
        const buttons = (html.match(/<button[^>]*>([\s\S]*?)<\/button>/gi) ?? [])
          .map((tag) => tag.replace(/<[^>]+>/g, "").trim())
          .filter(Boolean);
        return `| \`${path}\` | ${escapeHtml(title)} | ${escapeHtml(headings || "—")} | ${buttons[0] ?? "—"} |`;
      });
      const body = `# Screens\n\n| Page | Title | Headline | Primary action |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`;
      return {
        write: [{ path: "SCREENS.md", content: body }],
        report: `Inventoried ${pages.length} page(s) with their title, headline and primary action.`,
      };
    },
  },
  {
    app: "Avyrix AI",
    id: "a11y",
    title: "Accessibility pass",
    blurb: "Fix lang, alt text and unlabelled controls, then report the rest.",
    run: (ctx) => {
      const page = needHtml(ctx);
      let html = page.html;
      const fixed: string[] = [];
      if (!/<html[^>]+lang=/i.test(html)) {
        html = html.replace(/<html\b/i, `<html lang="en"`);
        fixed.push("added lang=\"en\"");
      }
      if (!/name=["']viewport["']/i.test(html)) {
        html = injectHead(html, `<meta name="viewport" content="width=device-width, initial-scale=1">`, "viewport");
        fixed.push("added a viewport meta tag");
      }
      html = html.replace(/<img(?![^>]*\balt=)([^>]*)>/gi, "<img alt=\"\"$1>");
      html = html.replace(/<button(?![^>]*\btype=)([^>]*)>/gi, "<button type=\"button\"$1>");
      const unlabelled = (html.match(/<input(?![^>]*\b(aria-label|id)=)[^>]*>/gi) ?? []).length;
      const css = pathsEnding(ctx, ".css").map((path) => ctx.files[path]).join("\n");
      const hasFocus = /:focus-visible/.test(css);
      const body = `# Accessibility\n\n## Fixed automatically\n\n${fixed.length ? fixed.map((item) => `- ${item}`).join("\n") : "- Nothing needed changing"}\n- Images without alt now have \`alt=""\`\n- Buttons without a type now have \`type="button"\`\n\n## Still to do\n\n- Inputs without a label or aria-label: ${unlabelled}\n- Visible focus styles: ${hasFocus ? "present" : "missing — add a :focus-visible rule"}\n- Check text contrast at 4.5:1\n- Check the tab order end to end\n`;
      return {
        write: [
          { path: page.path, content: html },
          { path: "ACCESSIBILITY.md", content: body },
        ],
        report: `Fixed ${fixed.length} issue(s) directly in ${page.path}. ${unlabelled} input(s) still need labels; details in ACCESSIBILITY.md.`,
      };
    },
  },
  {
    app: "Snapp AI",
    id: "scale",
    title: "One spacing scale",
    blurb: "A 4px spacing and type scale as CSS variables.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const css = `/* Cygnus scale: one 4px rhythm, one type scale. */
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 20px;
  --text-xl: 26px;
  --text-2xl: 34px;
  --leading-tight: 1.2;
  --leading-normal: 1.6;
}
`;
      return {
        write: [
          { path: "scale.css", content: css },
          { path: page.path, content: injectCss(page.html, "scale.css") },
        ],
        report: "Wrote scale.css with a 4px spacing scale and a six-step type scale, and linked it.",
      };
    },
  },
  {
    app: "Vulk",
    id: "states",
    title: "Empty, full, broken",
    blurb: "Styles and helpers for the three states most apps forget.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const css = `/* Cygnus states: empty, full and broken. */
.state-empty, .state-error {
  display: grid;
  place-items: center;
  gap: 8px;
  padding: 40px 20px;
  text-align: center;
  border: 1px dashed color-mix(in srgb, currentColor 25%, transparent);
  border-radius: 12px;
}
.state-empty p, .state-error p { margin: 0; opacity: .7; max-width: 42ch; }
.state-error { border-color: #d9534f; }
.state-error strong { color: #d9534f; }
.is-busy { opacity: .6; pointer-events: none; }
`;
      const module = `// Render the empty and broken states without a blank screen.
export function emptyState(target, message, actionLabel, onAction) {
  if (!target) return;
  target.innerHTML = "";
  const box = document.createElement("div");
  box.className = "state-empty";
  box.innerHTML = "<strong>Nothing here yet</strong><p></p>";
  box.querySelector("p").textContent = message;
  if (actionLabel && onAction) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = actionLabel;
    button.addEventListener("click", onAction);
    box.appendChild(button);
  }
  target.appendChild(box);
}

export function errorState(target, message, onRetry) {
  if (!target) return;
  target.innerHTML = "";
  const box = document.createElement("div");
  box.className = "state-error";
  box.setAttribute("role", "alert");
  box.innerHTML = "<strong>Something broke</strong><p></p>";
  box.querySelector("p").textContent = message;
  if (onRetry) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Try again";
    button.addEventListener("click", onRetry);
    box.appendChild(button);
  }
  target.appendChild(box);
}

export function safeParse(raw, fallback) {
  try {
    const value = JSON.parse(raw);
    return value == null ? fallback : value;
  } catch (_error) {
    return fallback;
  }
}
`;
      let html = injectCss(page.html, "states.css");
      html = injectScript(html, "states.js");
      return {
        write: [
          { path: "states.css", content: css },
          { path: "states.js", content: module },
          { path: page.path, content: html },
        ],
        report: "Wrote states.css and states.js with emptyState, errorState and safeParse, and linked both.",
      };
    },
  },
  {
    app: "Totalum",
    id: "crud",
    title: "CRUD in one place",
    blurb: "Create, read, update and delete with a delete confirmation.",
    run: () => ({
      write: [{ path: "crud.js", content: CRUD_MODULE }],
      report: "Wrote crud.js: list, create, update, remove (requires confirmation), reset, plus a change event.",
    }),
  },
  {
    app: "FlutterFlow",
    id: "export-flutterflow",
    title: "Export the source",
    blurb: "Leave with files you can host or hand to another tool.",
    action: "export",
  },
  {
    app: "AppMare",
    id: "onboarding",
    title: "First-run onboarding",
    blurb: "A three-step intro that can be skipped and is remembered.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const module = `// Cygnus onboarding: three steps, skippable, remembered.
const KEY = "cygnus.onboarded";
const steps = [
  { title: "What this is", body: "A small app that runs entirely in your browser." },
  { title: "The main action", body: "Use the primary button to do the one thing this app is for." },
  { title: "Where data lives", body: "Everything is saved in this browser. Nothing is uploaded." }
];

export function show(force) {
  let seen = false;
  try { seen = window.localStorage.getItem(KEY) === "1"; } catch (_error) { seen = false; }
  if (seen && !force) return;
  let index = 0;
  const box = document.createElement("div");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.style.cssText = "position:fixed;inset:0;display:grid;place-items:center;background:rgba(10,10,10,.55);z-index:9999";
  const card = document.createElement("div");
  card.style.cssText = "background:#fff;color:#111;border-radius:16px;padding:24px 26px;max-width:380px;font:14px/1.6 system-ui";
  function draw() {
    const step = steps[index];
    card.innerHTML = "<p style='margin:0;font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.5'>Step " +
      (index + 1) + " of " + steps.length + "</p><h2 style='margin:6px 0 8px;font-size:18px'></h2><p data-role='body' style='margin:0 0 18px;opacity:.75'></p>";
    card.querySelector("h2").textContent = step.title;
    card.querySelector("[data-role=body]").textContent = step.body;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;justify-content:flex-end";
    const skip = document.createElement("button");
    skip.type = "button";
    skip.textContent = "Skip";
    skip.addEventListener("click", done);
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = index === steps.length - 1 ? "Start" : "Next";
    next.addEventListener("click", function () {
      if (index === steps.length - 1) { done(); return; }
      index += 1;
      draw();
    });
    row.append(skip, next);
    card.appendChild(row);
  }
  function done() {
    try { window.localStorage.setItem(KEY, "1"); } catch (_error) { /* ignore */ }
    box.remove();
  }
  draw();
  box.appendChild(card);
  document.body.appendChild(box);
}

show(false);
`;
      return {
        write: [
          { path: "onboarding.js", content: module },
          { path: page.path, content: injectScript(page.html, "onboarding.js") },
        ],
        report: "Wrote onboarding.js: a three-step dialog shown once, skippable, with the choice saved.",
      };
    },
  },
  {
    app: "Codex",
    id: "todos",
    title: "Open work list",
    blurb: "Every TODO, FIXME and empty handler, with file and line.",
    run: (ctx) => {
      const found: string[] = [];
      for (const [path, text] of Object.entries(ctx.files)) {
        text.split("\n").forEach((line, index) => {
          if (/TODO|FIXME|HACK|XXX/.test(line)) {
            found.push(`- [ ] \`${path}:${index + 1}\` — ${line.trim().slice(0, 120)}`);
          }
        });
      }
      const emptyHandlers = Object.entries(ctx.files)
        .filter(([path]) => path.endsWith(".js"))
        .flatMap(([path, text]) =>
          (text.match(/function\s+\w+\s*\([^)]*\)\s*\{\s*\}/g) ?? []).map((hit) => `- \`${path}\` — empty ${hit.slice(0, 40)}`),
        );
      const body = `# Open work\n\n${found.length ? found.join("\n") : "No TODO markers."}\n\n## Empty functions\n\n${emptyHandlers.length ? emptyHandlers.join("\n") : "None."}\n`;
      return {
        write: [{ path: "TODO.md", content: body }],
        report: `${found.length} TODO marker(s) and ${emptyHandlers.length} empty function(s). Wrote TODO.md.`,
      };
    },
  },
  {
    app: "FreeMilk",
    id: "no-paid",
    title: "No paid services",
    blurb: "Find every external call, key or CDN that would cost money.",
    run: (ctx) => {
      const hits: Array<{ path: string; url: string }> = [];
      for (const [path, text] of Object.entries(ctx.files)) {
        if (!/\.(html|css|js|json)$/i.test(path)) continue;
        for (const match of text.matchAll(/https?:\/\/[^\s"'<>)]+/g)) {
          const url = match[0].replace(/[.,;]+$/, "");
          if (/localhost|127\.0\.0\.1|w3\.org|schema\.org|example\.com/.test(url)) continue;
          hits.push({ path, url });
        }
      }
      const keys = Object.keys(ctx.files).filter((path) => /\.env|secrets?\./i.test(path));
      const unique = [...new Map(hits.map((hit) => [hit.url, hit])).values()];
      const body = `# Free-tier check\n\n## External references\n\n${unique.length ? unique.map((hit) => `- ${hit.url} (in \`${hit.path}\`)`).join("\n") : "None. The app makes no external requests."}\n\n## Secret files\n\n${keys.length ? keys.map((path) => `- \`${path}\``).join("\n") : "None."}\n\n## Verdict\n\n${unique.length === 0 && keys.length === 0 ? "This app needs no paid service, key or server." : "Review the list above. Anything paid should be replaced with a local fallback."}\n`;
      return {
        write: [{ path: "FREE-TIER.md", content: body }],
        report: unique.length === 0 && keys.length === 0
          ? "No external references and no secret files. This app runs free and offline."
          : `${unique.length} external reference(s) and ${keys.length} secret file(s). Wrote FREE-TIER.md.`,
      };
    },
  },
  {
    app: "Blanks",
    id: "skeleton",
    title: "Minimal skeleton",
    blurb: "A real, working three-file page when there is nothing yet.",
    run: (ctx) => {
      if (htmlPath(ctx)) throw new Error("This project already has a page. Blanks only fills an empty project.");
      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(ctx.appName)}</title>
<link rel="stylesheet" href="./styles.css">
</head>
<body>
<main>
  <h1>${escapeHtml(ctx.appName)}</h1>
  <p>Start with one honest thing this app does.</p>
  <button id="run" type="button">Do the thing</button>
  <p id="out" role="status" aria-live="polite"></p>
</main>
<script src="./app.js" defer></script>
</body>
</html>
`;
      const css = `:root { color-scheme: light dark; }
body { margin: 0; font: 16px/1.6 system-ui, sans-serif; }
main { max-width: 42rem; margin: 0 auto; padding: 48px 24px; }
h1 { font-size: 2rem; margin: 0 0 8px; }
button { font: inherit; padding: 10px 16px; border-radius: 8px; border: 1px solid currentColor; background: none; cursor: pointer; }
button:focus-visible { outline: 3px solid; outline-offset: 2px; }
`;
      const js = `const button = document.getElementById("run");
const out = document.getElementById("out");
let count = 0;
button.addEventListener("click", function () {
  count += 1;
  out.textContent = count === 1 ? "It works. That is the whole app." : "Clicked " + count + " times.";
});
`;
      return {
        write: [
          { path: "index.html", content: html },
          { path: "styles.css", content: css },
          { path: "app.js", content: js },
        ],
        report: "Created index.html, styles.css and app.js: a working page with one real interaction.",
      };
    },
  },
  {
    app: "AppForge",
    id: "three-file",
    title: "Three-file check",
    blurb: "Verify the page is exactly index.html, styles.css and app.js.",
    run: (ctx) => {
      const wanted = ["index.html", "styles.css", "app.js"];
      const files = Object.keys(ctx.files);
      const missing = wanted.filter((name) => !files.includes(name));
      const extra = files.filter((name) => !wanted.includes(name));
      const body = `# Three-file build\n\n## Expected\n\n${wanted.map((name) => `- \`${name}\` ${files.includes(name) ? "✓" : "missing"}`).join("\n")}\n\n## Extra files\n\n${extra.length ? extra.map((name) => `- \`${name}\``).join("\n") : "None."}\n`;
      return {
        write: [{ path: "STRUCTURE.md", content: body }],
        report: missing.length
          ? `Missing ${missing.join(", ")}. ${extra.length} extra file(s). Wrote STRUCTURE.md.`
          : `The three core files are all present. ${extra.length} extra file(s) listed in STRUCTURE.md.`,
      };
    },
  },
  {
    app: "Windsurf",
    id: "context",
    title: "Context map",
    blurb: "A machine-readable list of every file, its size and its role.",
    run: (ctx) => {
      const entries = Object.keys(ctx.files).sort().map((path) => {
        const text = ctx.files[path];
        const role = /\.html$/i.test(path)
          ? "markup"
          : /\.css$/i.test(path)
            ? "styles"
            : /\.js$/i.test(path)
              ? "behaviour"
              : /\.(json|csv)$/i.test(path)
                ? "data"
                : /\.md$/i.test(path)
                  ? "docs"
                  : "asset";
        return { path, role, lines: text.split("\n").length, bytes: bytes(text) };
      });
      const summary = group(entries, (entry) => entry.role);
      const body = JSON.stringify({ app: ctx.appName, files: entries, byRole: Object.fromEntries([...summary].map(([role, list]) => [role, list.length])) }, null, 2);
      return {
        write: [{ path: "context.json", content: body + "\n" }],
        report: `Wrote context.json for ${entries.length} files across ${summary.size} roles.`,
      };
    },
  },
  {
    app: "Warp",
    id: "console",
    title: "Console output",
    blurb: "Group runtime output into readable, copyable blocks.",
    action: "console",
  },
  {
    app: "Zed",
    id: "readonly",
    title: "Read-only view",
    blurb: "Hide editing controls when the URL has ?view=1.",
    run: (ctx) => {
      const page = needHtml(ctx);
      const module = `// Cygnus read-only: ?view=1 hides editing controls.
const params = new URLSearchParams(window.location.search);
if (params.get("view") === "1") {
  document.documentElement.dataset.view = "readonly";
  const style = document.createElement("style");
  style.textContent = "[data-edit], .edit-only, .admin-only, [contenteditable='true'] { display: none !important; } [contenteditable='true'] { pointer-events: none; }";
  document.head.appendChild(style);
  document.querySelectorAll("[contenteditable='true']").forEach(function (el) { el.setAttribute("contenteditable", "false"); });
  document.querySelectorAll("form").forEach(function (form) {
    form.addEventListener("submit", function (event) { event.preventDefault(); });
  });
  document.title = document.title + " · view";
}
`;
      return {
        write: [
          { path: "readonly.js", content: module },
          { path: page.path, content: injectScript(page.html, "readonly.js") },
        ],
        report: "Wrote readonly.js and linked it. Open the page with ?view=1 to hide editing controls.",
      };
    },
  },
  {
    app: "Notion",
    id: "notes",
    title: "Project notes",
    blurb: "A private brief and changelog kept beside the app.",
    action: "studio:notes",
  },
  {
    app: "n8n",
    id: "automations",
    title: "Automation rules",
    blurb: "If this happens, do that — with toggles, no backend.",
    run: () => ({
      write: [{ path: "automations.js", content: AUTOMATION_MODULE }],
      report: "Wrote automations.js: add, toggle, remove and fire rules with toast, record and export actions.",
    }),
  },
  {
    app: "Cline",
    id: "checkpoints",
    title: "Checkpoints and rollback",
    blurb: "Snapshot before a risky change and restore in one click.",
    action: "studio:snapshots",
  },
];

export function findTool(id: string): ToolkitEntry | undefined {
  return TOOLKIT.find((entry) => entry.id === id);
}

export function toolMeta() {
  return TOOLKIT.map(({ app, id, title, blurb, action }) => ({
    app,
    id,
    title,
    blurb,
    action,
    real: Boolean(action || entryHasRun(id)),
  }));
}

function entryHasRun(id: string): boolean {
  return Boolean(TOOLKIT.find((entry) => entry.id === id)?.run);
}

export function slugFor(value: string): string {
  return slug(value);
}

export function relativeReport(value: number): string {
  return rel(value);
}

export function wordsIn(html: string): number {
  return countWords(pageText(html));
}

export function cssFiles(ctx: ToolContext): string[] {
  return pathsEnding(ctx, ".css");
}

export function jsFiles(ctx: ToolContext): string[] {
  return pathsEnding(ctx, ".js");
}

export function htmlFiles(ctx: ToolContext): string[] {
  return pathsEnding(ctx, HTML_EXT);
}

export function cssSource(ctx: ToolContext): string {
  return cssText(ctx);
}

export function jsSource(ctx: ToolContext): string {
  return jsText(ctx);
}
