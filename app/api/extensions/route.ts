import { NextRequest } from "next/server";
import { EXTENSIONS } from "@/lib/extensions";
import {
  readInstalledExtensions,
  setExtensionInstalled,
} from "@/lib/extensionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const installed = await readInstalledExtensions();
  return Response.json({ extensions: EXTENSIONS, installed });
}

export async function POST(request: NextRequest) {
  let body: { id?: unknown; installed?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; installed?: unknown };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!EXTENSIONS.some((extension) => extension.id === id)) {
    return Response.json({ error: "Unknown extension." }, { status: 404 });
  }
  if (typeof body.installed !== "boolean") {
    return Response.json({ error: "installed must be true or false." }, { status: 400 });
  }

  try {
    const installed = await setExtensionInstalled(id, body.installed);
    return Response.json({ installed });
  } catch {
    return Response.json(
      { error: "Could not save that extension on this computer." },
      { status: 500 },
    );
  }
}
