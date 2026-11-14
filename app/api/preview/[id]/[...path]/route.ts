import fs from "node:fs/promises";
import path from "node:path";
import { isValidProjectId, projectDir } from "@/lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
};

const EMPTY_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>No preview yet</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: grid; place-items: center; text-align: center; padding: 24px;
    background: radial-gradient(700px 400px at 50% 0%, #16203c, #05060d 70%);
    color: #e7ecff; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  .mark { width: 46px; height: 46px; margin: 0 auto 18px; opacity: .8; }
  h1 { margin: 0 0 8px; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; }
  p { margin: 0; max-width: 320px; color: #93a0c4; font-size: 13.5px; line-height: 1.6; }
</style>
</head>
<body>
  <div>
    <svg class="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <g stroke="#a9c2ff" stroke-width="1.1" opacity=".55">
        <path d="M16 5 11 16l5 5 5-5Z" /><path d="M11 16 5 20M21 16l6 4M16 21v6" />
      </g>
      <g fill="#dce6ff">
        <circle cx="16" cy="5" r="2" /><circle cx="11" cy="16" r="1.3" />
        <circle cx="21" cy="16" r="1.3" /><circle cx="16" cy="27" r="1.2" />
      </g>
    </svg>
    <h1>Nothing here yet</h1>
    <p>Ask Cygnus to build something and the preview will appear here.</p>
  </div>
</body>
</html>`;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; path?: string[] }> },
) {
  const { id, path: segments } = await params;
  if (!isValidProjectId(id)) {
    return new Response("Not found", { status: 404 });
  }

  const root = projectDir(id);
  const relative = (segments ?? []).join("/") || "index.html";
  const cleaned = relative.replace(/^\/+/, "");
  const absolute = path.resolve(root, cleaned);

  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    return new Response("Not found", { status: 404 });
  }

  let target = absolute;
  try {
    const stat = await fs.stat(/* turbopackIgnore: true */ target);
    if (stat.isDirectory()) target = path.join(target, "index.html");
    const buffer = await fs.readFile(/* turbopackIgnore: true */ target);
    const type = MIME[path.extname(target).toLowerCase()] ?? "application/octet-stream";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    if (cleaned === "index.html" || cleaned === "") {
      return new Response(EMPTY_PAGE, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
    return new Response("Not found", { status: 404 });
  }
}
