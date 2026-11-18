type PendingAsk = {
  finish: (answer: string) => void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort?: () => void;
};

const store = globalThis as unknown as {
  __cygnusPendingAsks?: Map<string, PendingAsk>;
};

function pending(): Map<string, PendingAsk> {
  store.__cygnusPendingAsks ??= new Map();
  return store.__cygnusPendingAsks;
}

export function openAsk(signal?: AbortSignal): { id: string; promise: Promise<string> } {
  const id = globalThis.crypto.randomUUID();
  let entry: PendingAsk;

  const promise = new Promise<string>((resolve) => {
    let settled = false;
    const finish = (answer: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(entry.timer);
      if (entry.signal && entry.onAbort) {
        entry.signal.removeEventListener("abort", entry.onAbort);
      }
      pending().delete(id);
      resolve(answer);
    };

    const timer = setTimeout(() => {
      finish("The user did not answer in time.");
    }, 4 * 60 * 1000);
    const onAbort = () => finish("The user cancelled the question.");
    entry = { finish, timer, signal, onAbort };
    pending().set(id, entry);

    if (signal?.aborted) {
      finish("The user cancelled the question.");
    } else {
      signal?.addEventListener("abort", onAbort, { once: true });
    }
  });

  return { id, promise };
}

export function answerAsk(id: string, answer: string): boolean {
  const entry = pending().get(id);
  if (!entry) return false;
  entry.finish(answer);
  return true;
}
