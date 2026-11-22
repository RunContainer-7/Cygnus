import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "dist");
const port = Number(process.env.DOCS_PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

http
  .createServer((request, response) => {
    const url = new URL(request.url || "/", `http://localhost:${port}`);
    const relative = decodeURIComponent(url.pathname);
    let file = path.join(dist, relative);

    if (relative === "/" || !path.extname(relative)) file = path.join(dist, "index.html");

    if (!file.startsWith(dist) || !fs.existsSync(file)) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(file).pipe(response);
  })
  .listen(port, "127.0.0.1", () => {
    console.log(`Docs dev server: http://localhost:${port}`);
  });
