import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const contentDir = path.join(here, "content");
const siteDir = path.join(here, "site");
const distDir = path.join(here, "dist");

const SECTIONS = [
  { title: "Overview", pages: ["overview"] },
  { title: "Getting started", pages: ["download", "quickstart", "models", "publishing"] },
  {
    title: "Guides",
    pages: [
      "prompting",
      "previewing",
      "debugging",
      "checkpoints",
      "studio",
      "templates",
      "plugins",
      "extensions",
      "importing",
    ],
  },
  { title: "Advanced", pages: ["agent-tools", "file-layout"] },
  { title: "Help", pages: ["troubleshooting", "shortcuts", "faq"] },
  { title: "Policies", pages: ["privacy"] },
];

const VERSION = readVersion();
const DOWNLOADS = readDownloads(VERSION);

function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(here, "..", "package.json"), "utf8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Download cards are generated from the version and the release folder, so the
 * docs always offer the build that matches the version they show. Missing
 * files simply drop the size and checksum instead of breaking the build.
 */
function readDownloads(version) {
  const repo = "https://github.com/RunContainer-7/Cygnus";
  const tag = `v${version}`;
  const releaseDir = path.join(here, "..", "release");
  let sums = "";
  try {
    sums = fs.readFileSync(path.join(releaseDir, "SHA256SUMS.txt"), "utf8");
  } catch {
    sums = "";
  }

  const entry = (kind) => {
    const file = `Cygnus-${kind}-${version}.exe`;
    let bytes = null;
    try {
      bytes = fs.statSync(path.join(releaseDir, file)).size;
    } catch {
      bytes = null;
    }
    const line = sums.split("\n").find((row) => row.includes(file));
    const sha256 = line ? line.trim().split(/\s+/)[0] : "";
    return {
      file,
      bytes,
      sha256,
      url: `${repo}/releases/download/${tag}/${file}`,
    };
  };

  return {
    version,
    tag,
    repo,
    releaseUrl: `${repo}/releases/tag/${tag}`,
    setup: entry("Setup"),
    portable: entry("Portable"),
  };
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function inline(text) {
  const code = [];
  let out = text.replace(/`([^`]+)`/g, (_match, value) => {
    code.push(`<code>${escapeHtml(value)}</code>`);
    return `\u0000${code.length - 1}\u0000`;
  });
  out = escapeHtml(out);
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (_match, label, href) => {
    return `<a href="${href}" target="_blank" rel="noreferrer">${label}</a>`;
  });
  out = out.replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, (_match, label, href) => {
    return `<a href="${href}">${label}</a>`;
  });
  out = out.replace(/\u0000(\d+)\u0000/g, (_match, index) => code[Number(index)]);
  return out;
}

/**
 * Minimal Markdown: headings, paragraphs, lists, fenced code, callouts and
 * inline code/bold/links. Enough for the docs and no dependencies.
 */
function renderMarkdown(source) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  const headings = [];
  let paragraph = [];
  let list = null;
  let fence = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    html.push(`<${list.type}>${list.items.map((item) => `<li>${inline(item)}</li>`).join("")}</${list.type}>`);
    list = null;
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence) {
      if (line.trim().startsWith("```")) {
        const language = fence.language ? ` class="language-${escapeHtml(fence.language)}"` : "";
        html.push(`<pre><code${language}>${escapeHtml(fence.lines.join("\n"))}</code></pre>`);
        fence = null;
      } else {
        fence.lines.push(line);
      }
      continue;
    }

    const fenceStart = line.match(/^```(\w*)\s*$/);
    if (fenceStart) {
      flushAll();
      fence = { language: fenceStart[1], lines: [] };
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    if (/^\s*\|/.test(line) && isTableDivider(lines[index + 1])) {
      flushAll();
      const header = splitRow(line);
      const rows = [];
      let cursor = index + 2;
      while (cursor < lines.length && /^\s*\|/.test(lines[cursor])) {
        rows.push(splitRow(lines[cursor]));
        cursor += 1;
      }
      html.push(
        `<div class="table-wrap"><table><thead><tr>${header
          .map((cell) => `<th>${inline(cell)}</th>`)
          .join("")}</tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table></div>`,
      );
      index = cursor - 1;
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugify(text);
      if (level === 2) headings.push({ id, text });
      html.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushAll();
      html.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    const ordered = line.match(/^\d+\.\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      const type = bullet ? "ul" : "ol";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push((bullet || ordered)[1]);
      continue;
    }

    paragraph.push(line.trim());
  }

  if (fence) {
    html.push(`<pre><code>${escapeHtml(fence.lines.join("\n"))}</code></pre>`);
  }
  flushAll();
  return { html: html.join("\n"), headings };
}

function parseFrontMatter(raw) {
  const normalised = raw.replace(/\r\n/g, "\n");
  if (!normalised.startsWith("---\n")) return { meta: {}, body: normalised };
  const end = normalised.indexOf("\n---", 4);
  if (end === -1) return { meta: {}, body: normalised };
  const meta = {};
  for (const line of normalised.slice(4, end).split("\n")) {
    const match = line.match(/^([a-zA-Z]+):\s*(.*)$/);
    if (match) meta[match[1]] = match[2].trim();
  }
  return { meta, body: normalised.slice(end + 4).replace(/^\n+/, "") };
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line) {
  return typeof line === "string" && line.includes("-") && /^\s*\|?[\s:|-]+\|?\s*$/.test(line);
}

function plainText(html) {
  return html
    .replace(/<pre>[\s\S]*?<\/pre>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const files = fs.existsSync(contentDir)
  ? fs.readdirSync(contentDir).filter((name) => name.endsWith(".md"))
  : [];

const pages = {};
for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  const { meta, body } = parseFrontMatter(fs.readFileSync(path.join(contentDir, file), "utf8"));
  const rendered = renderMarkdown(body);
  pages[slug] = {
    slug,
    title: meta.title || slug,
    description: meta.description || "",
    section: meta.section || "",
    html: rendered.html,
    headings: rendered.headings,
    text: plainText(rendered.html).toLowerCase(),
  };
}

const listed = new Set(SECTIONS.flatMap((section) => section.pages));
const unlisted = Object.keys(pages).filter((slug) => !listed.has(slug));
if (unlisted.length) {
  throw new Error(`Add these pages to SECTIONS in build.mjs: ${unlisted.join(", ")}`);
}
for (const section of SECTIONS) {
  for (const slug of section.pages) {
    if (!pages[slug]) throw new Error(`Missing content file for "${slug}"`);
    pages[slug].section = section.title;
  }
}

const payload = {
  version: VERSION,
  downloads: DOWNLOADS,
  sections: SECTIONS.map((section) => ({
    title: section.title,
    pages: section.pages,
  })),
  pages,
};

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });
for (const entry of fs.readdirSync(siteDir)) {
  fs.cpSync(path.join(siteDir, entry), path.join(distDir, entry), { recursive: true });
}
fs.writeFileSync(path.join(distDir, "content.json"), JSON.stringify(payload));

const words = Object.values(pages).reduce((total, page) => total + page.text.split(/\s+/).length, 0);
console.log(
  `Built ${files.length} pages (${words} words) for v${VERSION} into docs-site/dist`,
);
