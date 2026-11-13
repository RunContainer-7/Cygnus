"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const RUNTIME_DIRS = ["workspaces", "artifacts"];
const FORBIDDEN_ENV = /^\.env(\.|$)/;

async function statOrNull(target) {
  try {
    return await fs.stat(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function findEnvFiles(directory) {
  const found = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findEnvFiles(full)));
    } else if (FORBIDDEN_ENV.test(entry.name) && entry.name !== ".env.example") {
      found.push(full);
    }
  }
  return found;
}

module.exports = async function afterPack(context) {
  const projectDir = context.packager?.projectDir ?? path.join(__dirname, "..");
  const source = path.join(projectDir, ".next", "standalone");
  const target = path.join(context.appOutDir, "resources", "app");

  if (!(await statOrNull(path.join(source, "server.js")))) {
    throw new Error(
      "Standalone server is missing. Run `npm run desktop:build` before packaging.",
    );
  }

  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.cp(source, target, { recursive: true, force: true });

  for (const name of RUNTIME_DIRS) {
    await fs.rm(path.join(target, name), { recursive: true, force: true });
  }

  const leaked = await findEnvFiles(target);
  if (leaked.length > 0) {
    throw new Error(
      `Refusing to package environment files: ${leaked
        .map((file) => path.relative(target, file))
        .join(", ")}`,
    );
  }

  const modules = await statOrNull(path.join(target, "node_modules", "next"));
  if (!modules) {
    throw new Error("Packaged server is missing node_modules/next.");
  }

  console.log(`[afterPack] Bundled server with dependencies at ${target}`);
};
