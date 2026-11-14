export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function titleFromPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(
      /^(please\s+)?(can you\s+)?(make|build|create|design|generate|write)\s+(me\s+)?(an?\s+|the\s+)?/i,
      "",
    )
    .replace(/[.!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").slice(0, 4).join(" ");
  const title = (words || "Aurora").slice(0, 28);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

export function headlineFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Your next idea, live in a browser.";
  const sentence = cleaned.length > 88 ? `${cleaned.slice(0, 85)}…` : cleaned;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

export function hueFromPrompt(prompt: string): number {
  let hash = 0;
  for (let index = 0; index < prompt.length; index += 1) {
    hash = (hash * 31 + prompt.charCodeAt(index)) % 360;
  }
  return 185 + (hash % 145);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
