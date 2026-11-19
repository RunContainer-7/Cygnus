import os from "node:os";
import path from "node:path";

/** Per-user Cygnus data that should never end up inside a project or a zip. */
export function appDataDir(): string {
  const workspace = process.env.CYGNUS_WORKSPACE_DIR;
  if (workspace) return path.dirname(workspace);
  return path.join(os.homedir(), ".cygnus");
}
