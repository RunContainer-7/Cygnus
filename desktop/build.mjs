import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { build } from "esbuild";

const root = process.cwd();
const nextDir = path.join(root, ".next");
const standalone = path.join(nextDir, "standalone");

function runNextBuild() {
  const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
  const result = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CYGNUS_STANDALONE: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`next build failed with exit code ${result.status ?? "unknown"}.`);
  }
}

async function copyIfPresent(source, target) {
  try {
    await stat(source);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  await cp(source, target, { recursive: true, force: true });
  return true;
}

async function findEnvFiles(directory) {
  const found = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findEnvFiles(full)));
    } else if (/^\.env(\.|$)/.test(entry.name) && entry.name !== ".env.example") {
      found.push(full);
    }
  }
  return found;
}

async function bundleMain() {
  const outfile = path.join(root, "desktop", "main.bundle.cjs");
  await build({
    entryPoints: [path.join(root, "desktop", "main.cjs")],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: false,
    logLevel: "silent",
  });
  const info = await stat(outfile);
  console.log(`\nDesktop main bundle ready: desktop/main.bundle.cjs (${Math.round(info.size / 1024)} KB)`);
}

async function stage() {
  try {
    await stat(path.join(standalone, "server.js"));
  } catch {
    throw new Error(
      "Standalone output is missing. Ensure next.config.ts enables output: 'standalone'.",
    );
  }

  await mkdir(path.join(standalone, ".next"), { recursive: true });
  await rm(path.join(standalone, ".next", "static"), { recursive: true, force: true });
  const staticCopied = await copyIfPresent(
    path.join(nextDir, "static"),
    path.join(standalone, ".next", "static"),
  );
  if (!staticCopied) throw new Error("Next static assets were not produced.");

  const publicCopied = await copyIfPresent(
    path.join(root, "public"),
    path.join(standalone, "public"),
  );

  // Next traces dynamic fs reads and can copy local projects or test output
  // into the bundle. Runtime data must never be shipped to another machine.
  for (const name of ["workspaces", "artifacts"]) {
    await rm(path.join(standalone, name), { recursive: true, force: true });
  }

  const leaked = await findEnvFiles(standalone);
  if (leaked.length > 0) {
    throw new Error(
      `Refusing to package environment files: ${leaked
        .map((file) => path.relative(root, file))
        .join(", ")}`,
    );
  }

  console.log(
    `\nDesktop bundle ready: .next/standalone (static assets${publicCopied ? ", public" : ""}, no local projects)`,
  );
}

try {
  runNextBuild();
  await stage();
  await bundleMain();
} catch (error) {
  console.error(`\nDesktop build failed: ${error.message}`);
  process.exit(1);
}
