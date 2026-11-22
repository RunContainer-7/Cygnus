import { promises as fs } from "node:fs";
import path from "node:path";
import { appDataDir } from "./appData";

/**
 * Kilo AI Gateway's anonymous free tier allows 200 requests per hour per IP
 * address. Cygnus makes one gateway request per model round, so a build turn
 * spends several of them. There is no API to read the remaining quota, so the
 * app keeps its own ledger and uses the same ceiling. Other apps and devices on
 * the same public IP share the real limit; this meter can only be exact for
 * Cygnus on this computer.
 */
export const HOSTED_HOURLY_LIMIT = 200;

const WINDOW_MS = 60 * 60 * 1000;
const LEDGER_FILE = "hosted-usage.json";

export type HostedUsage = {
  limit: number;
  used: number;
  remaining: number;
  percent: number;
  windowStart: string;
  resetsAt: string;
  resetInSeconds: number;
  totalCalls: number;
};

type Ledger = {
  windowStart: string;
  calls: number;
  totalCalls: number;
};

function ledgerPath(): string {
  const override = process.env.CYGNUS_USAGE_FILE?.trim();
  return override ? path.resolve(override) : path.join(appDataDir(), LEDGER_FILE);
}

function windowStartFor(now: number): number {
  return Math.floor(now / WINDOW_MS) * WINDOW_MS;
}

function emptyLedger(now: number): Ledger {
  return {
    windowStart: new Date(windowStartFor(now)).toISOString(),
    calls: 0,
    totalCalls: 0,
  };
}

function parseLedger(raw: string, now: number): Ledger {
  const parsed = JSON.parse(raw) as Partial<Ledger>;
  const calls = typeof parsed.calls === "number" && parsed.calls > 0 ? parsed.calls : 0;
  const totalCalls =
    typeof parsed.totalCalls === "number" && parsed.totalCalls > 0 ? parsed.totalCalls : calls;
  const windowStart = typeof parsed.windowStart === "string" ? parsed.windowStart : "";
  return {
    windowStart: windowStart || new Date(windowStartFor(now)).toISOString(),
    calls,
    totalCalls,
  };
}

async function readLedger(now: number): Promise<Ledger> {
  try {
    const raw = await fs.readFile(ledgerPath(), "utf8");
    const ledger = parseLedger(raw, now);
    // A new UTC hour starts a new allowance. The lifetime total survives it.
    if (ledger.windowStart !== new Date(windowStartFor(now)).toISOString()) {
      return {
        windowStart: new Date(windowStartFor(now)).toISOString(),
        calls: 0,
        totalCalls: ledger.totalCalls,
      };
    }
    return ledger;
  } catch {
    return emptyLedger(now);
  }
}

function toUsage(ledger: Ledger, now: number): HostedUsage {
  const used = Math.min(ledger.calls, HOSTED_HOURLY_LIMIT);
  const resetsAt = windowStartFor(now) + WINDOW_MS;
  return {
    limit: HOSTED_HOURLY_LIMIT,
    used,
    remaining: Math.max(0, HOSTED_HOURLY_LIMIT - used),
    percent: Math.round((used / HOSTED_HOURLY_LIMIT) * 100),
    windowStart: ledger.windowStart,
    resetsAt: new Date(resetsAt).toISOString(),
    resetInSeconds: Math.max(0, Math.ceil((resetsAt - now) / 1000)),
    totalCalls: ledger.totalCalls,
  };
}

// Sub-agents and the main agent can finish calls at the same time; a single
// read-modify-write queue keeps every increment.
let writes: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = writes.then(task, task);
  writes = run.catch(() => undefined);
  return run;
}

export async function readHostedUsage(now = Date.now()): Promise<HostedUsage> {
  return toUsage(await readLedger(now), now);
}

/** Counts one successful request to the hosted gateway. */
export async function recordHostedCall(now = Date.now()): Promise<HostedUsage> {
  return serialize(async () => {
    const ledger = await readLedger(now);
    const next: Ledger = {
      windowStart: ledger.windowStart,
      calls: ledger.calls + 1,
      totalCalls: ledger.totalCalls + 1,
    };
    const file = ledgerPath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Rename keeps a polling read from catching a half-written ledger.
    const temp = `${file}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await fs.rename(temp, file);
    return toUsage(next, now);
  });
}

export function hostedBudgetMessage(usage: HostedUsage): string {
  const reset = new Date(usage.resetsAt);
  const time = reset.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const minutes = Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 60_000));
  return `The free hosted budget is used up for this hour (${usage.used} of ${usage.limit} model calls). It resets at ${time}, in ${minutes} minute${minutes === 1 ? "" : "s"}. Switch to Local or BYOK in the model picker, or wait for the reset.`;
}

/** Throws before a hosted request that the gateway would reject anyway. */
export async function assertHostedBudget(): Promise<HostedUsage> {
  const usage = await readHostedUsage();
  if (usage.remaining <= 0) throw new Error(hostedBudgetMessage(usage));
  return usage;
}
