import {
  HARDCODED_BASE_URL,
  HARDCODED_LABEL,
  HARDCODED_MODEL,
  isHardcodedProvider,
} from "./hardcodedShared";

export {
  HARDCODED_BASE_URL,
  HARDCODED_LABEL,
  HARDCODED_MODEL,
  isHardcodedProvider,
};

export type HardcodedMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

export type HardcodedToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type HardcodedTurn = {
  content: string;
  toolCalls: HardcodedToolCall[];
};

type ProjectFile = { path: string; size: number; content: string };

type Site = {
  title: string;
  tagline: string;
  eyebrow: string;
  accent: string;
  nav: Array<{ href: string; label: string }>;
  sections: string;
  appCss: string;
  appJs: string;
};

type AppKind =
  | "landing"
  | "portfolio"
  | "blog"
  | "dashboard"
  | "todo"
  | "notes"
  | "calculator"
  | "timer"
  | "quiz"
  | "expense"
  | "converter"
  | "password"
  | "ttt";

const KIND_LABEL: Record<AppKind, string> = {
  landing: "landing page",
  portfolio: "portfolio",
  blog: "blog",
  dashboard: "dashboard",
  todo: "task tracker",
  notes: "notes app",
  calculator: "calculator",
  timer: "focus timer",
  quiz: "quiz",
  expense: "expense tracker",
  converter: "unit converter",
  password: "password generator",
  ttt: "tic-tac-toe game",
};

const KIND_TITLE: Record<AppKind, string> = {
  landing: "Northwind Studio",
  portfolio: "Alex Rivera",
  blog: "The Long Read",
  dashboard: "Pulse",
  todo: "Taskline",
  notes: "Field Notes",
  calculator: "Crunch",
  timer: "Focus Five",
  quiz: "Quizlight",
  expense: "Ledger",
  converter: "Switch",
  password: "Keymaker",
  ttt: "Three in a Row",
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

function pick<T>(items: T[], seed: string): T {
  return items[hash(seed) % items.length];
}

/* ------------------------------------------------------------------ */
/* Reading the system prompt's project state                           */
/* ------------------------------------------------------------------ */

function parseProject(system: string): ProjectFile[] {
  const headers = [...system.matchAll(/^--- (.+?) \((\d+) bytes\) ---$/gm)];
  const files: ProjectFile[] = [];
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    const path = header[1].trim();
    const size = Number(header[2]) || 0;
    const start = (header.index ?? 0) + header[0].length;
    const end = index + 1 < headers.length ? headers[index + 1].index ?? system.length : system.length;
    let raw = system.slice(start, end);
    const endMarker = `--- end ${path} ---`;
    const markerIndex = raw.indexOf(endMarker);
    if (markerIndex >= 0) raw = raw.slice(0, markerIndex);
    raw = raw.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    if (/^\[omitted/i.test(raw.trim())) raw = "";
    files.push({ path, size, content: raw });
  }
  return files;
}

function fileMap(files: ProjectFile[]): Map<string, string> {
  return new Map(files.map((file) => [file.path, file.content]));
}

/* ------------------------------------------------------------------ */
/* Intent detection                                                    */
/* ------------------------------------------------------------------ */

function detectKind(prompt: string): AppKind {
  const text = prompt.toLowerCase();
  if (/tic[\s-]?tac[\s-]?toe|noughts and crosses|three in a row/.test(text)) return "ttt";
  if (/\bquiz|trivia|flashcard/.test(text)) return "quiz";
  if (/password/.test(text)) return "password";
  if (/convert|converter|unit conversion/.test(text)) return "converter";
  if (/expense|budget|spending|money tracker/.test(text)) return "expense";
  if (/pomodoro|timer|stopwatch|countdown/.test(text)) return "timer";
  if (/calculator|calculate|arithmetic/.test(text)) return "calculator";
  if (/todo|task|checklist|habit|planner|grocer|chore/.test(text)) return "todo";
  if (/notes?|journal|scratchpad/.test(text)) return "notes";
  if (/dashboard|analytics|admin panel|metrics/.test(text)) return "dashboard";
  if (/blog|magazine|news site|articles/.test(text)) return "blog";
  if (/portfolio|resume|cv\b/.test(text)) return "portfolio";
  if (/\bgame\b|playable/.test(text)) return "ttt";
  return "landing";
}

function isNewBuildRequest(prompt: string): boolean {
  const strongAction = /\b(build|create|generate|design|develop|start|spin up)\b/i.test(prompt);
  const makeNew = /\bmake\s+(?:me\s+)?(?:a|an)\s+[\w\s-]*\b(app|application|site|website|webpage|page|landing|portfolio|dashboard|blog|game|tool|tracker|calculator|timer|quiz|store|shop|menu|platform|clone)\b/i.test(
    prompt,
  );
  const artifact =
    /\b(app|application|site|website|webpage|page|landing|portfolio|dashboard|blog|game|tool|tracker|calculator|timer|quiz|store|shop|menu|form|platform|clone)\b/i.test(
      prompt,
    );
  return (strongAction && artifact) || makeNew;
}

function isQuestion(prompt: string): boolean {
  return (
    /^(who|what|when|where|why|how|which|can|do|does|is|are|will|should|could|would|tell me)\b/i.test(
      prompt.trim(),
    ) || prompt.trim().endsWith("?")
  );
}

function extractSubject(prompt: string): string {
  const match = prompt.match(
    /\b(?:for|about|called|named|of)\s+(?:a|an|the|my|our)?\s*([a-z0-9][a-z0-9 '&-]{2,48})/i,
  );
  if (!match) return "";
  return titleCase(
    match[1]
      .replace(/\b(app|application|site|website|webpage|page|using|with|that|which|please)\b.*$/i, "")
      .replace(/[.,!?]+$/, "")
      .trim(),
  );
}

const BRANDS: Array<[RegExp, string]> = [
  [/coffee|espresso|cafe|roast/i, "Brew & Co."],
  [/bakery|bread|pastry|cake/i, "Crumb & Co."],
  [/gym|fitness|training|workout/i, "Iron & Air"],
  [/photo|photograph/i, "Northlight Photo"],
  [/restaurant|menu|food|kitchen/i, "Table Nine"],
  [/flower|florist/i, "Wildstem"],
  [/book|library|reading/i, "Marginalia"],
  [/travel|trip|tour/i, "Wayfarer"],
  [/consult|agency|studio/i, "Northwind Studio"],
  [/saas|startup|software/i, "Orbit"],
];

function brandFor(prompt: string, kind: AppKind): string {
  for (const [pattern, brand] of BRANDS) {
    if (pattern.test(prompt)) return brand;
  }
  return KIND_TITLE[kind];
}

const COLORS: Array<{ test: RegExp; hex: string; name: string }> = [
  { test: /\b(red|crimson|scarlet)\b/i, hex: "#c92f2f", name: "red" },
  { test: /\b(orange|amber)\b/i, hex: "#c2660f", name: "orange" },
  { test: /\b(yellow|gold)\b/i, hex: "#a97a05", name: "gold" },
  { test: /\b(green|emerald|mint|forest)\b/i, hex: "#0f7b5f", name: "green" },
  { test: /\b(teal|cyan|turquoise)\b/i, hex: "#0d7268", name: "teal" },
  { test: /\b(blue|navy|azure|cobalt)\b/i, hex: "#2563eb", name: "blue" },
  { test: /\b(purple|violet|indigo|lavender)\b/i, hex: "#6d28d9", name: "purple" },
  { test: /\b(pink|rose|magenta)\b/i, hex: "#be185d", name: "pink" },
  { test: /\b(black|charcoal|monochrome)\b/i, hex: "#18181b", name: "charcoal" },
];

function colorFor(prompt: string): { hex: string; name: string } | null {
  for (const color of COLORS) {
    if (color.test.test(prompt)) return { hex: color.hex, name: color.name };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Math                                                                */
/* ------------------------------------------------------------------ */

function evaluateExpression(raw: string): number | null {
  const cleaned = raw
    .replace(/[×x]/gi, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/,/g, "")
    .replace(/\^/g, "**");
  const tokens = cleaned.match(/\d+(?:\.\d+)?|\*\*|[+\-*/%()]|sqrt|sin|cos|tan|abs|round/gi);
  if (!tokens || tokens.length === 0) return null;
  let position = 0;

  const peek = (): string | undefined => tokens[position];

  const parseExpression = (): number => {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const operator = tokens[position];
      position += 1;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };

  const parseTerm = (): number => {
    let value = parseUnary();
    while (peek() === "*" || peek() === "/" || peek() === "%" || peek() === "**") {
      const operator = tokens[position];
      position += 1;
      const right = parseUnary();
      if (operator === "*") value *= right;
      else if (operator === "/") value /= right;
      else if (operator === "%") value %= right;
      else value **= right;
    }
    return value;
  };

  const parseUnary = (): number => {
    if (peek() === "-") {
      position += 1;
      return -parseUnary();
    }
    if (peek() === "+") {
      position += 1;
      return parseUnary();
    }
    return parseAtom();
  };

  const parseAtom = (): number => {
    const token = peek();
    if (!token) throw new Error("empty");
    if (token === "(") {
      position += 1;
      const value = parseExpression();
      if (peek() === ")") position += 1;
      return value;
    }
    if (/^(sqrt|sin|cos|tan|abs|round)$/i.test(token)) {
      position += 1;
      const argument = parseAtom();
      const name = token.toLowerCase();
      if (name === "sqrt") return Math.sqrt(argument);
      if (name === "sin") return Math.sin(argument);
      if (name === "cos") return Math.cos(argument);
      if (name === "tan") return Math.tan(argument);
      if (name === "abs") return Math.abs(argument);
      return Math.round(argument);
    }
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error("not a number");
    position += 1;
    return value;
  };

  try {
    const value = parseExpression();
    if (position !== tokens.length || !Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6)));
}

function mathAnswer(prompt: string): string | null {
  const percentOf = prompt.match(
    /(\d+(?:\.\d+)?)\s*%\s*(?:of|off)\s*(\d+(?:\.\d+)?)/i,
  );
  if (percentOf) {
    const percent = Number(percentOf[1]);
    const total = Number(percentOf[2]);
    return `${formatNumber((percent / 100) * total)}. That is ${percent}% of ${total}.`;
  }

  const percentChange = prompt.match(
    /(?:from|change from)\s*(\d+(?:\.\d+)?)\s*to\s*(\d+(?:\.\d+)?)/i,
  );
  if (percentChange && /percent|%/i.test(prompt)) {
    const from = Number(percentChange[1]);
    const to = Number(percentChange[2]);
    if (from !== 0) {
      const change = ((to - from) / from) * 100;
      return `${formatNumber(change)}%. The value went ${change >= 0 ? "up" : "down"} from ${from} to ${to}.`;
    }
  }

  const looksLikeMath =
    /^[\s\d.+\-*/%^()×÷,]+$/.test(prompt.trim()) ||
    /\b(calculate|compute|evaluate|what is|what's|how much is)\b/i.test(prompt);
  if (!looksLikeMath) return null;
  const expression = prompt.replace(
    /\b(calculate|compute|evaluate|what is|what's|how much is|please|the answer to)\b/gi,
    " ",
  );
  if (!/[+\-*/%^×÷]/.test(expression)) return null;
  const value = evaluateExpression(expression);
  if (value === null) return null;
  return `${formatNumber(value)}.`;
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

const UNIT_FACTORS: Record<string, { group: string; factor: number; label: string }> = {
  mm: { group: "length", factor: 0.001, label: "millimetres" },
  cm: { group: "length", factor: 0.01, label: "centimetres" },
  m: { group: "length", factor: 1, label: "metres" },
  km: { group: "length", factor: 1000, label: "kilometres" },
  in: { group: "length", factor: 0.0254, label: "inches" },
  ft: { group: "length", factor: 0.3048, label: "feet" },
  yd: { group: "length", factor: 0.9144, label: "yards" },
  mi: { group: "length", factor: 1609.344, label: "miles" },
  mg: { group: "mass", factor: 0.001, label: "milligrams" },
  g: { group: "mass", factor: 1, label: "grams" },
  kg: { group: "mass", factor: 1000, label: "kilograms" },
  oz: { group: "mass", factor: 28.3495, label: "ounces" },
  lb: { group: "mass", factor: 453.592, label: "pounds" },
  ml: { group: "volume", factor: 0.001, label: "millilitres" },
  l: { group: "volume", factor: 1, label: "litres" },
  cup: { group: "volume", factor: 0.2366, label: "cups" },
  pt: { group: "volume", factor: 0.4732, label: "pints" },
  qt: { group: "volume", factor: 0.9464, label: "quarts" },
  gal: { group: "volume", factor: 3.7854, label: "gallons" },
  s: { group: "time", factor: 1, label: "seconds" },
  min: { group: "time", factor: 60, label: "minutes" },
  h: { group: "time", factor: 3600, label: "hours" },
  day: { group: "time", factor: 86400, label: "days" },
  week: { group: "time", factor: 604800, label: "weeks" },
};

function normalizeUnit(value: string): string {
  const unit = value.toLowerCase().replace(/\.$/, "");
  if (/^(kilometres?|kilometers?)$/.test(unit)) return "km";
  if (/^(metres?|meters?)$/.test(unit)) return "m";
  if (/^(centimetres?|centimeters?)$/.test(unit)) return "cm";
  if (/^(millimetres?|millimeters?)$/.test(unit)) return "mm";
  if (/^(miles?)$/.test(unit)) return "mi";
  if (/^(feet|foot)$/.test(unit)) return "ft";
  if (/^(inches|inch)$/.test(unit)) return "in";
  if (/^(yards?)$/.test(unit)) return "yd";
  if (/^(kilograms?|kilos?)$/.test(unit)) return "kg";
  if (/^(grams?)$/.test(unit)) return "g";
  if (/^(milligrams?)$/.test(unit)) return "mg";
  if (/^(pounds?|lbs?)$/.test(unit)) return "lb";
  if (/^(ounces?)$/.test(unit)) return "oz";
  if (/^(litres?|liters?)$/.test(unit)) return "l";
  if (/^(millilitres?|milliliters?)$/.test(unit)) return "ml";
  if (/^(cups?)$/.test(unit)) return "cup";
  if (/^(pints?)$/.test(unit)) return "pt";
  if (/^(quarts?)$/.test(unit)) return "qt";
  if (/^(gallons?)$/.test(unit)) return "gal";
  if (/^(seconds?|secs?)$/.test(unit)) return "s";
  if (/^(minutes?|mins?)$/.test(unit)) return "min";
  if (/^(hours?|hrs?)$/.test(unit)) return "h";
  if (/^(days?)$/.test(unit)) return "day";
  if (/^(weeks?)$/.test(unit)) return "week";
  return unit;
}

function convertUnits(prompt: string): string | null {
  const match = prompt.match(
    /(-?\d+(?:\.\d+)?)\s*(?:degrees?\s*)?([a-z°]+)\s+(?:to|in|into|as)\s+(?:degrees?\s*)?([a-z°]+)/i,
  );
  if (!match) return null;
  const amount = Number(match[1]);
  const fromRaw = match[2].toLowerCase();
  const toRaw = match[3].toLowerCase();

  const temperature = (unit: string): "c" | "f" | "k" | null => {
    if (/^(c|celsius|centigrade|°c)$/.test(unit)) return "c";
    if (/^(f|fahrenheit|°f)$/.test(unit)) return "f";
    if (/^(k|kelvin|°k)$/.test(unit)) return "k";
    return null;
  };
  const fromTemp = temperature(fromRaw);
  const toTemp = temperature(toRaw);
  if (fromTemp && toTemp) {
    let celsius = amount;
    if (fromTemp === "f") celsius = ((amount - 32) * 5) / 9;
    if (fromTemp === "k") celsius = amount - 273.15;
    let result = celsius;
    let label = "°C";
    if (toTemp === "f") {
      result = (celsius * 9) / 5 + 32;
      label = "°F";
    } else if (toTemp === "k") {
      result = celsius + 273.15;
      label = "K";
    }
    return `${formatNumber(Number(result.toFixed(2)))} ${label}. (${formatNumber(amount)} ${fromTemp.toUpperCase()} converted.)`;
  }

  const from = normalizeUnit(fromRaw);
  const to = normalizeUnit(toRaw);
  const source = UNIT_FACTORS[from];
  const target = UNIT_FACTORS[to];
  if (!source || !target || source.group !== target.group) return null;
  const result = (amount * source.factor) / target.factor;
  return `${formatNumber(Number(result.toFixed(6)))} ${target.label}. (${formatNumber(
    amount,
  )} ${source.label} converted.)`;
}

/* ------------------------------------------------------------------ */
/* Project questions                                                   */
/* ------------------------------------------------------------------ */

function projectQuestion(prompt: string, files: ProjectFile[]): string | null {
  const text = prompt.toLowerCase();

  if (/\b(what|which) files|list (the )?files|show (me )?the files|project structure/.test(text)) {
    if (files.length === 0) return "The project is empty right now. Switch to Build mode and ask me for a site or app.";
    const listing = files
      .map((file) => `- \`${file.path}\` — ${file.size.toLocaleString()} bytes`)
      .join("\n");
    return `This project has ${files.length} file${files.length === 1 ? "" : "s"}:\n\n${listing}`;
  }

  if (/\b(summar|overview|what is this project|what does this project|describe the project)/.test(text)) {
    if (files.length === 0) return "The workspace is empty. There is nothing to summarize yet.";
    const html = files.find((file) => file.path === "index.html")?.content ?? "";
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
    const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
      .map((match) => match[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 6);
    const lines = files.reduce((total, file) => total + file.content.split(/\r?\n/).length, 0);
    const pieces = [
      title ? `It is “${title}”` : "It is a static web project",
      `${files.length} files and about ${lines.toLocaleString()} lines`,
    ];
    if (headings.length > 0) pieces.push(`main sections: ${headings.join(", ")}`);
    return `${pieces.join(". ")}.`;
  }

  const fileRead = prompt.match(
    /\b(?:what(?:'s| is) in|show me|read|open|display)\s+(?:the\s+)?(?:file\s+)?([\w./-]+\.[a-z0-9]+)/i,
  );
  if (fileRead) {
    const wanted = fileRead[1].replace(/^\.\//, "");
    const file = files.find((entry) => entry.path === wanted);
    if (!file) return `I do not see \`${wanted}\` in this project. Ask “what files” for the full list.`;
    const excerpt = file.content.trim();
    if (!excerpt) return `\`${file.path}\` is empty.`;
    return `\`${file.path}\` is ${file.size.toLocaleString()} bytes. Here is the start:\n\n\`\`\`\n${excerpt.slice(
      0,
      1200,
    )}${excerpt.length > 1200 ? "\n…" : ""}\n\`\`\``;
  }

  if (/\b(find|where is|search for|which file has)\b/.test(text)) {
    const query =
      prompt
        .match(/\b(?:find|where is|search for|which file has)\s+["“']?([^"”']{2,60})["”']?/i)?.[1]
        ?.trim() ?? "";
    if (query) {
      const hits: string[] = [];
      for (const file of files) {
        const fileLines = file.content.split(/\r?\n/);
        for (let index = 0; index < fileLines.length && hits.length < 8; index += 1) {
          if (fileLines[index].toLowerCase().includes(query.toLowerCase())) {
            hits.push(`\`${file.path}:${index + 1}\` — ${fileLines[index].trim().slice(0, 120)}`);
          }
        }
      }
      return hits.length > 0
        ? `Found ${hits.length} match${hits.length === 1 ? "" : "es"} for “${query}”:\n\n${hits.join("\n")}`
        : `No match for “${query}” in the project's files.`;
    }
  }

  if (/\bhow many lines\b/.test(text)) {
    if (files.length === 0) return "There are no files yet.";
    const lines = files.reduce((total, file) => total + file.content.split(/\r?\n/).length, 0);
    return `About ${lines.toLocaleString()} lines across ${files.length} files.`;
  }

  if (/\b(biggest|largest) file\b/.test(text)) {
    if (files.length === 0) return "There are no files yet.";
    const largest = [...files].sort((left, right) => right.size - left.size)[0];
    return `\`${largest.path}\` is the largest at ${largest.size.toLocaleString()} bytes.`;
  }

  if (/\b(what|which) (tech|technology|stack)|frameworks?\b/.test(text)) {
    const paths = files.map((file) => file.path.toLowerCase());
    const stack = ["HTML", "CSS", "vanilla JavaScript"];
    if (paths.some((path) => path.endsWith(".jsx") || path.endsWith(".tsx"))) stack.push("React");
    return `This project uses ${stack.join(", ")}. Cygnus builds static sites with no build step, so there is nothing to install.`;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Conversation rules                                                  */
/* ------------------------------------------------------------------ */

function identityAnswer(prompt: string): string {
  if (/\b(model|llm|weights|neural|transformer|gpt|claude)\b/i.test(prompt)) {
    return "There is no model here. Hard Coded Intelligence is a rule engine: pattern matching, small calculators, project readers and written app templates. No weights, no inference, no network call. That is why it starts instantly and works offline.";
  }
  if (/\b(ai|artificial|sentient|conscious|alive|feel)\b/i.test(prompt)) {
    return "I am not an AI model. I am a hand-written program wearing an AI-shaped interface. I can answer the things I was coded for and I will say so when a request falls outside that list.";
  }
  if (/\b(who|maker|made|company|built|created)\b/i.test(prompt)) {
    return "I am Hard Coded Intelligence, an experiment from Cygnus Labs. No company trained me: every reply comes from code written for this app.";
  }
  return "I am Hard Coded Intelligence — a deterministic Cygnus Labs assistant. No model, no network, no inference. Instant and offline, but only as smart as its rulebook.";
}

function capabilitiesAnswer(): string {
  return [
    "I can do a few things well, because they are written out rather than guessed:",
    "",
    "- Build complete static sites and small apps in Build mode: landing pages, portfolios, blogs, dashboards, task boards, notes, calculators, timers, quizzes, expense trackers, unit converters, password generators and tic-tac-toe.",
    "- Edit those projects: add pricing, FAQ, testimonials, gallery, stats or contact sections, change the accent colour, rename the site, make the hero taller or shorter, and switch the font.",
    "- Read this project: list files, summarize structure, show a file, search for text, count lines.",
    "- Do everyday desk work: arithmetic, percentages, unit and temperature conversion, word counts, text transforms, base64, passwords, random picks, dates and times.",
    "- Answer a small set of factual questions and give standard code snippets and Git commands.",
    "",
    "Ask me “what can you do” any time. If something is outside the rulebook I will tell you rather than invent an answer.",
  ].join("\n");
}

const JOKES = [
  "I tried to write a joke about recursion, but I had to write a joke about recursion first.",
  "There are two hard problems in computing: cache invalidation, naming things, and off-by-one errors.",
  "A hard-coded AI walks into a bar. It orders the same drink it ordered the last 4,096 times.",
  "My favourite kind of bug is the one that only happens in production, because it gives the whole team something to do.",
  "I would tell you a UDP joke, but you might not get it.",
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "I have a joke about CSS, but it is still loading.",
  "A SQL query walks into a bar, approaches two tables and asks: may I join you?",
];

function timeAnswer(prompt: string): string | null {
  const now = new Date();
  if (/\b(time|clock)\b/i.test(prompt)) {
    return `It is ${now.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })} on this computer.`;
  }
  if (/\b(date|today|day is it)\b/i.test(prompt)) {
    return `Today is ${now.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })}.`;
  }
  return null;
}

function textTools(prompt: string): string | null {
  const quoted = prompt.match(/["“']([^"”']{1,400})["”']/);
  const payload = quoted?.[1] ?? "";

  if (/\bhow many (words|characters|chars)\b/i.test(prompt)) {
    const subject = payload || prompt.replace(/.*?\b(?:in|of)\b/i, "").trim();
    const words = subject.split(/\s+/).filter(Boolean).length;
    return `${words} word${words === 1 ? "" : "s"}, ${subject.length} characters (${subject.replace(/\s/g, "").length} without spaces).`;
  }

  if (/\breverse\b/i.test(prompt) && payload) {
    return `Reversed: “${payload.split("").reverse().join("")}”`;
  }

  if (/\b(palindrome)\b/i.test(prompt) && payload) {
    const normalized = payload.toLowerCase().replace(/[^a-z0-9]/g, "");
    const reversed = normalized.split("").reverse().join("");
    return normalized === reversed
      ? `Yes — “${payload}” reads the same backwards once punctuation and spacing are ignored.`
      : `No — reversed and normalised, “${payload}” becomes “${reversed}”, which is different.`;
  }

  if (/\b(base64)\b/i.test(prompt) && payload) {
    if (/\bdecode\b/i.test(prompt)) {
      try {
        return `Decoded: “${Buffer.from(payload, "base64").toString("utf8")}”`;
      } catch {
        return "That did not decode as base64.";
      }
    }
    return `Base64: \`${Buffer.from(payload, "utf8").toString("base64")}\``;
  }

  if (/\b(uppercase|lowercase|title case|capitali[sz]e)\b/i.test(prompt) && payload) {
    if (/uppercase/i.test(prompt)) return payload.toUpperCase();
    if (/lowercase/i.test(prompt)) return payload.toLowerCase();
    return titleCase(payload.toLowerCase());
  }

  return null;
}

function passwordAnswer(prompt: string): string | null {
  if (!/\bpassword\b/i.test(prompt)) return null;
  const requested = Number(prompt.match(/\b(\d{1,3})\s*(?:character|char|letter)/i)?.[1] ?? 20);
  const length = Math.min(Math.max(requested || 20, 8), 64);
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+";
  const pool = lower + upper + digits + symbols;
  const chars = [lower, upper, digits, symbols].map(
    (set) => set[Math.floor(Math.random() * set.length)],
  );
  while (chars.length < length) {
    chars.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return `Here is a ${length}-character password:\n\n\`${chars.join("")}\`\n\nIt was generated locally with random characters. Store it in a password manager, not in a chat.`;
}

function randomAnswer(prompt: string): string | null {
  if (/\b(flip|toss)\b.*\bcoin\b/i.test(prompt) || /\bcoin\b.*\b(flip|toss)\b/i.test(prompt)) {
    return `The coin landed on **${Math.random() < 0.5 ? "heads" : "tails"}**.`;
  }
  if (/\b(roll|throw)\b.*\b(dice|die)\b/i.test(prompt) || /\b(dice|die)\b.*\b(roll|throw)\b/i.test(prompt)) {
    return `You rolled a **${1 + Math.floor(Math.random() * 6)}**.`;
  }
  const range = prompt.match(/\bbetween\s+(-?\d+)\s+and\s+(-?\d+)/i);
  if (range) {
    const low = Math.min(Number(range[1]), Number(range[2]));
    const high = Math.max(Number(range[1]), Number(range[2]));
    return `**${low + Math.floor(Math.random() * (high - low + 1))}** — a random whole number between ${low} and ${high}.`;
  }
  return null;
}

type Fact = { test: RegExp; answer: string };

const FACTS: Fact[] = [
  { test: /\bcapital of france\b/i, answer: "Paris is the capital of France." },
  { test: /\bcapital of japan\b/i, answer: "Tokyo is the capital of Japan." },
  { test: /\bcapital of australia\b/i, answer: "Canberra is the capital of Australia, not Sydney." },
  { test: /\blargest planet\b/i, answer: "Jupiter is the largest planet in our solar system." },
  { test: /\bspeed of light\b/i, answer: "Light travels at 299,792,458 metres per second in a vacuum — about 300,000 km/s." },
  { test: /\bboiling point of water\b/i, answer: "Water boils at 100 °C (212 °F) at standard sea-level pressure." },
  { test: /\bfreezing point of water\b/i, answer: "Water freezes at 0 °C (32 °F) at standard pressure." },
  { test: /\bhow many bones\b/i, answer: "An adult human skeleton has 206 bones. Babies are born with around 270, many of which fuse." },
  { test: /\blargest ocean\b/i, answer: "The Pacific Ocean is the largest and deepest ocean." },
  { test: /\bcurrency of japan\b/i, answer: "Japan uses the yen (JPY)." },
  { test: /\btallest mountain\b/i, answer: "Mount Everest is the highest mountain above sea level at 8,849 metres." },
  { test: /\bwho wrote (hamlet|romeo and juliet)\b/i, answer: "William Shakespeare wrote it." },
  { test: /\bhttp (404|500|301|403)\b/i, answer: "HTTP 404 means not found. 500 is a server error. 301 is a permanent redirect. 403 means forbidden." },
  { test: /\bcolour of the sky|color of the sky\b/i, answer: "The sky looks blue because air scatters short blue wavelengths of sunlight more than long red ones — Rayleigh scattering." },
  { test: /\bwhat is (http|https)\b/i, answer: "HTTP is the protocol browsers and servers use to exchange pages. HTTPS is the same protocol wrapped in TLS encryption." },
  { test: /\bwhat is (json|an api|dns|a cache|rest|graphql|big o|recursion|a closure)\b/i, answer: "" },
];

const CONCEPTS: Record<string, string> = {
  json: "JSON is a text format for structured data: objects, arrays, strings, numbers, booleans and null. It is the usual shape of an API response.",
  api: "An API is a defined interface two programs use to talk. A web API usually exposes URLs that accept a request and return JSON.",
  dns: "DNS turns a domain name like example.com into an IP address, using a hierarchy of name servers.",
  cache: "A cache stores a copy of something expensive so the next read is fast. The hard part is deciding when the copy is stale.",
  rest: "REST is a style for web APIs: resources have URLs, and HTTP verbs (GET, POST, PUT, DELETE) describe the action.",
  graphql: "GraphQL is an API query language where the client asks for exactly the fields it needs from one endpoint.",
  "big o": "Big O describes how an algorithm's cost grows with input size. O(1) is constant, O(n) linear, O(n²) quadratic, O(log n) logarithmic.",
  recursion: "Recursion is a function calling itself on a smaller version of the problem, with a base case that stops it.",
  closure: "A closure is a function that remembers variables from the scope where it was created, even after that scope has finished.",
};

function conceptAnswer(prompt: string): string | null {
  const match = prompt.match(/\bwhat is (?:a |an |the )?(json|api|dns|cache|rest|graphql|big o|recursion|closure)\b/i);
  if (match) return CONCEPTS[match[1].toLowerCase()] ?? null;
  return null;
}

type Snippet = { test: RegExp; title: string; code: string; note: string };

const SNIPPETS: Snippet[] = [
  {
    test: /\bcenter (a )?div\b/i,
    title: "Centre a box with CSS grid",
    code: `.parent {\n  display: grid;\n  place-items: center;\n  min-height: 100vh;\n}`,
    note: "Grid handles both axes in two lines. Flexbox with `align-items` and `justify-content` works too.",
  },
  {
    test: /\bdebounce\b/i,
    title: "Debounce a function",
    code: `function debounce(fn, wait = 250) {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), wait);\n  };\n}`,
    note: "Each call resets the timer; the function runs once the user stops calling it.",
  },
  {
    test: /\blocalstorage\b/i,
    title: "Save and load JSON with localStorage",
    code: `function save(key, value) {\n  localStorage.setItem(key, JSON.stringify(value));\n}\n\nfunction load(key, fallback) {\n  try {\n    return JSON.parse(localStorage.getItem(key)) ?? fallback;\n  } catch {\n    return fallback;\n  }\n}`,
    note: "Storage can throw in private modes, so wrap access in try/catch.",
  },
  {
    test: /\bemail (regex|regexp|validation)\b/i,
    title: "A practical email check",
    code: `const looksLikeEmail = (value) =>\n  /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value);`,
    note: "Do not try to validate every RFC edge case in the browser. Send a confirmation email for real verification.",
  },
  {
    test: /\bfetch (data|json|api)\b/i,
    title: "Fetch JSON with error handling",
    code: `async function getJSON(url) {\n  const response = await fetch(url);\n  if (!response.ok) {\n    throw new Error("Request failed: " + response.status);\n  }\n  return response.json();\n}`,
    note: "`fetch` only rejects on network failure; check `response.ok` for 4xx and 5xx.",
  },
  {
    test: /\bdark mode (css|toggle)\b/i,
    title: "Theme with a data attribute",
    code: `:root { --bg: #fff; --ink: #111; }\n[data-theme="dark"] { --bg: #111; --ink: #f5f5f5; }\nbody { background: var(--bg); color: var(--ink); }`,
    note: "Toggle `document.documentElement.dataset.theme` and store the choice in localStorage.",
  },
];

const GIT_COMMANDS: Array<{ test: RegExp; answer: string }> = [
  {
    test: /\bundo (the )?last commit\b|\buncommit\b/i,
    answer: "Keep the changes, drop the commit:\n\n```bash\ngit reset --soft HEAD~1\n```\n\nDiscard the changes too:\n\n```bash\ngit reset --hard HEAD~1\n```\n\nThe second one deletes work. Check `git status` first.",
  },
  {
    test: /\bnew branch\b|\bcreate (a )?branch\b/i,
    answer: "```bash\ngit switch -c feature/my-change\n```\n\nOn older Git, use `git checkout -b feature/my-change`.",
  },
  {
    test: /\bmerge (a )?branch\b/i,
    answer: "```bash\ngit switch main\ngit pull\ngit merge feature/my-change\n```\n\nResolve conflicts in the listed files, then `git add` them and `git commit`.",
  },
  {
    test: /\bstash\b/i,
    answer: "```bash\ngit stash push -m \"work in progress\"\ngit stash list\ngit stash pop\n```",
  },
  {
    test: /\b(change|edit) (the )?(last|previous) commit message\b/i,
    answer: "```bash\ngit commit --amend -m \"A better message\"\n```\n\nOnly amend commits that have not been pushed to a shared branch.",
  },
];

function knowledgeAnswer(prompt: string): string | null {
  for (const fact of FACTS) {
    if (fact.test.test(prompt) && fact.answer) return fact.answer;
  }
  const concept = conceptAnswer(prompt);
  if (concept) return concept;
  for (const snippet of SNIPPETS) {
    if (snippet.test.test(prompt)) {
      return `**${snippet.title}**\n\n\`\`\`\n${snippet.code}\n\`\`\`\n\n${snippet.note}`;
    }
  }
  for (const command of GIT_COMMANDS) {
    if (command.test.test(prompt)) return command.answer;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Page scaffold                                                       */
/* ------------------------------------------------------------------ */

const BASE_CSS = `:root {
  --bg: #f7f5f0;
  --surface: #ffffff;
  --ink: #14161a;
  --muted: #5c6470;
  --line: #e3ded4;
  --accent: #2563eb;
  --accent-ink: #ffffff;
  --accent-soft: color-mix(in srgb, var(--accent) 14%, transparent);
  --font-display: "Fraunces", Georgia, serif;
  --font-body: "Inter", system-ui, -apple-system, sans-serif;
  --radius: 18px;
  --shadow: 0 18px 50px rgba(20, 22, 26, 0.1);
  --hero-pad: clamp(64px, 9vw, 112px);
}

[data-theme="dark"] {
  --bg: #111318;
  --surface: #191c22;
  --ink: #f2f0ea;
  --muted: #a6adb8;
  --line: #2b303a;
  --accent-soft: color-mix(in srgb, var(--accent) 26%, transparent);
  --shadow: 0 18px 50px rgba(0, 0, 0, 0.42);
}

* { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

img, svg { display: block; max-width: 100%; }

a { color: inherit; }

h1, h2, h3 {
  font-family: var(--font-display);
  font-weight: 600;
  line-height: 1.08;
  letter-spacing: -0.02em;
  margin: 0 0 16px;
}

h1 { font-size: clamp(2.4rem, 6vw, 4.2rem); }
h2 { font-size: clamp(1.8rem, 4vw, 2.7rem); }
h3 { font-size: 1.2rem; }
p { margin: 0 0 16px; }

.wrap { width: min(1120px, 100%); margin: 0 auto; padding: 0 24px; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.nav {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 14px 24px;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  border-bottom: 1px solid var(--line);
  backdrop-filter: blur(14px);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  text-decoration: none;
  letter-spacing: -0.01em;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 15px;
}

.nav-links {
  display: flex;
  gap: 18px;
  margin-left: auto;
  font-size: 0.92rem;
}

.nav-links a { text-decoration: none; color: var(--muted); }
.nav-links a:hover { color: var(--ink); }

.theme-toggle {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink);
  border-radius: 999px;
  padding: 7px 13px;
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}

.theme-toggle:hover { border-color: var(--accent); }

.hero { padding: var(--hero-pad) 0; border-bottom: 1px solid var(--line); }

.hero-grid {
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 56px;
  align-items: center;
}

.eyebrow {
  display: inline-block;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 14px;
}

.lede { font-size: 1.12rem; color: var(--muted); max-width: 54ch; }

.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 26px; }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 20px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-ink);
  font: inherit;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  transition: transform 160ms ease, opacity 160ms ease;
}

.btn:hover { transform: translateY(-1px); opacity: 0.94; }
.btn.ghost { background: transparent; color: var(--ink); border-color: var(--line); }
.btn.small { padding: 8px 14px; font-size: 0.86rem; }

.ticks { list-style: none; margin: 26px 0 0; padding: 0; display: grid; gap: 8px; color: var(--muted); }
.ticks li::before { content: "✓"; color: var(--accent); font-weight: 700; margin-right: 8px; }

.hero-art {
  aspect-ratio: 1;
  border-radius: 30px;
  background: var(--accent-soft);
  border: 1px solid var(--line);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.section { padding: 76px 0; }
.section.alt { background: var(--surface); border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.section-head { max-width: 620px; margin-bottom: 34px; }

.grid { display: grid; gap: 18px; }
.grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }

.card {
  padding: 24px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.card p:last-child { margin-bottom: 0; }

.price { display: flex; flex-direction: column; gap: 14px; }
.price strong { font-family: var(--font-display); font-size: 2.2rem; line-height: 1; }
.price ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; color: var(--muted); }
.price li::before { content: "·"; color: var(--accent); font-weight: 700; margin-right: 8px; }

.panel {
  border: 1px solid var(--line);
  border-radius: 24px;
  background: var(--surface);
  box-shadow: var(--shadow);
  padding: clamp(20px, 4vw, 34px);
}

.form { display: grid; gap: 14px; max-width: 560px; }
.field { display: grid; gap: 6px; }
.field label { font-size: 0.82rem; font-weight: 600; color: var(--muted); }
.field input, .field textarea, .field select {
  width: 100%;
  padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
}
.field textarea { min-height: 120px; resize: vertical; }
.field input:focus, .field textarea:focus, .field select:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
  border-color: transparent;
}

.form-status { margin: 0; color: var(--accent); font-size: 0.9rem; min-height: 1.4em; }

.footer { padding: 34px 0; }
.footer-inner { display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; color: var(--muted); font-size: 0.88rem; }
.footer-inner p { margin: 0; }

.muted { color: var(--muted); }
.row-form { display: flex; gap: 10px; margin: 18px 0; }
.row-form input { flex: 1; min-width: 0; }

.todo-list, .note-list, .expense-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.todo-item, .note-item, .expense-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
}
.todo-item.done .todo-text { text-decoration: line-through; color: var(--muted); }
.todo-text, .note-text, .expense-name { flex: 1; overflow-wrap: anywhere; }
.todo-check { width: 18px; height: 18px; accent-color: var(--accent); }
.todo-delete, .note-delete, .expense-delete {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 5px 10px;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}
.todo-delete:hover, .note-delete:hover, .expense-delete:hover { color: var(--ink); border-color: var(--accent); }
.empty { color: var(--muted); font-size: 0.92rem; }

.calc { max-width: 420px; }
.calc-display {
  display: block;
  width: 100%;
  min-height: 86px;
  padding: 18px;
  margin-bottom: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 2rem;
  text-align: right;
  overflow-wrap: anywhere;
}
.calc-keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.calc-key {
  padding: 16px 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
  font-size: 1.05rem;
  cursor: pointer;
}
.calc-key:hover { border-color: var(--accent); background: var(--accent-soft); }
.calc-key.operator { color: var(--accent); font-weight: 700; }

.timer { text-align: center; max-width: 460px; margin: 0 auto; }
.timer-display { font-family: var(--font-display); font-size: clamp(3.6rem, 12vw, 6rem); line-height: 1; margin: 10px 0 26px; }
.timer-presets, .timer-actions { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
.timer-presets { margin-bottom: 14px; }
.timer-presets .btn { background: transparent; color: var(--ink); border-color: var(--line); }
.timer-presets .btn.active { background: var(--accent); color: var(--accent-ink); border-color: transparent; }

.quiz { max-width: 620px; margin: 0 auto; }
.quiz-options { display: grid; gap: 10px; margin: 18px 0; }
.quiz-option {
  text-align: left;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}
.quiz-option:hover { border-color: var(--accent); }
.quiz-option.correct { border-color: #0f7b5f; background: color-mix(in srgb, #0f7b5f 14%, transparent); }
.quiz-option.wrong { border-color: #b42318; background: color-mix(in srgb, #b42318 14%, transparent); }
.quiz-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

.chart { display: flex; align-items: flex-end; gap: 10px; height: 180px; margin-top: 20px; }
.chart-bar { flex: 1; border-radius: 8px 8px 3px 3px; background: var(--accent); opacity: 0.85; min-height: 6px; }
.chart-bar:nth-child(2n) { opacity: 0.55; }

.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.stat { padding: 18px; border: 1px solid var(--line); border-radius: 14px; background: var(--bg); }
.stat span { display: block; font-size: 0.78rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
.stat strong { display: block; font-family: var(--font-display); font-size: 1.9rem; line-height: 1.2; }

.table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 0.92rem; }
.table th, .table td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); }
.table th { color: var(--muted); font-weight: 600; }

.filter-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }
.filter-btn {
  border: 1px solid var(--line);
  background: transparent;
  color: var(--muted);
  border-radius: 999px;
  padding: 7px 14px;
  font: inherit;
  font-size: 0.84rem;
  cursor: pointer;
}
.filter-btn.active { background: var(--accent); border-color: transparent; color: var(--accent-ink); }

.work-card { border-radius: var(--radius); padding: 22px; min-height: 210px; display: flex; flex-direction: column; justify-content: flex-end; color: #fff; }
.work-card h3 { color: #fff; margin-bottom: 4px; }
.work-card p { margin: 0; opacity: 0.85; }
.c1 { background: linear-gradient(135deg, #0f766e, #134e4a); }
.c2 { background: linear-gradient(135deg, #b45309, #7c2d12); }
.c3 { background: linear-gradient(135deg, #6d28d9, #312e81); }
.c4 { background: linear-gradient(135deg, #be185d, #831843); }
.c5 { background: linear-gradient(135deg, #2563eb, #1e3a8a); }
.c6 { background: linear-gradient(135deg, #4d7c0f, #1a2e05); }

.chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 0; list-style: none; }
.chips li { padding: 6px 11px; border: 1px solid var(--line); border-radius: 999px; font-size: 0.82rem; color: var(--muted); }

.article-card { display: flex; flex-direction: column; gap: 8px; }
.article-card .tag { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--accent); font-weight: 700; }
.article-card a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 3px; }

.password-output {
  display: block;
  padding: 18px;
  border: 1px dashed var(--line);
  border-radius: 14px;
  background: var(--bg);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.15rem;
  overflow-wrap: anywhere;
  margin-bottom: 16px;
}
.pw-options { display: grid; gap: 8px; margin: 14px 0 20px; }
.pw-option { display: flex; align-items: center; gap: 9px; font-size: 0.92rem; color: var(--muted); }

.ttt-board { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; max-width: 330px; margin: 22px auto; }
.ttt-cell {
  aspect-ratio: 1;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--font-display);
  font-size: 2.4rem;
  cursor: pointer;
}
.ttt-cell:hover { border-color: var(--accent); }
.ttt-status { text-align: center; font-weight: 600; }

.result-line { font-family: var(--font-display); font-size: 1.7rem; margin: 16px 0 0; }

@media (max-width: 860px) {
  .hero-grid { grid-template-columns: 1fr; gap: 34px; }
  .hero-art { max-width: 360px; }
  .grid.three { grid-template-columns: 1fr; }
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .nav-links { display: none; }
}

@media (max-width: 520px) {
  .section { padding: 52px 0; }
  .grid.two { grid-template-columns: 1fr; }
  .stat-grid { grid-template-columns: 1fr; }
  .timer-actions .btn { flex: 1; }
}

@media (prefers-reduced-motion: reduce) {
  * { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
}
`;

const SHARED_JS = `(function () {
  "use strict";

  var root = document.documentElement;
  var stored = null;
  try { stored = localStorage.getItem("cygnus-theme"); } catch (error) {}
  if (stored === "dark" || stored === "light") root.setAttribute("data-theme", stored);

  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("cygnus-theme", next); } catch (error) {}
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  var contact = document.getElementById("contact-form");
  if (contact) {
    contact.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = document.getElementById("form-status");
      if (status) status.textContent = "Thanks — your message is noted. This static demo does not send it anywhere.";
      contact.reset();
    });
  }

  var newsletter = document.getElementById("newsletter-form");
  if (newsletter) {
    newsletter.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = document.getElementById("newsletter-status");
      if (status) status.textContent = "You are on the list. This static demo keeps the address in the page only.";
      newsletter.reset();
    });
  }
`;
const APP_JS_CLOSE = "})();\n";

function heroArt(): string {
  return `<svg viewBox="0 0 420 420" role="img" aria-label="Abstract geometric illustration" width="100%" height="100%">
  <defs>
    <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--accent)" stop-opacity="0.95" />
      <stop offset="1" stop-color="var(--accent)" stop-opacity="0.35" />
    </linearGradient>
  </defs>
  <circle cx="210" cy="210" r="150" fill="url(#g1)" />
  <circle cx="210" cy="210" r="108" fill="var(--surface)" opacity="0.92" />
  <path d="M120 260 L210 120 L300 260 Z" fill="var(--accent)" opacity="0.9" />
  <circle cx="210" cy="210" r="26" fill="var(--surface)" />
</svg>`;
}

function composeHtml(site: Site): string {
  const nav = site.nav
    .map((item) => `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`)
    .join("\n        ");
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(site.title)}</title>
  <meta name="description" content="${escapeHtml(site.tagline)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header class="nav">
    <a class="brand" href="#top"><span class="brand-mark">✦</span><span id="brand-name">${escapeHtml(
      site.title,
    )}</span></a>
    <nav class="nav-links" aria-label="Main navigation">
        ${nav}
    </nav>
    <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Toggle dark mode">Theme</button>
  </header>

  <main id="top">
${site.sections}
  </main>

  <footer class="footer">
    <div class="wrap footer-inner">
      <p>© <span id="year"></span> ${escapeHtml(site.title)}</p>
      <p>${escapeHtml(site.eyebrow)}</p>
    </div>
  </footer>

  <script src="./app.js" defer></script>
</body>
</html>`;
}

function contactSection(): string {
  return `    <!-- SECTION:contact -->
    <section class="section alt" id="contact">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">Contact</p>
          <h2>Say hello</h2>
          <p class="muted">Tell us what you are working on. This demo form validates and confirms in the page.</p>
        </div>
        <form class="panel form" id="contact-form">
          <div class="field"><label for="contact-name">Name</label><input id="contact-name" name="name" autocomplete="name" required /></div>
          <div class="field"><label for="contact-email">Email</label><input id="contact-email" name="email" type="email" autocomplete="email" required /></div>
          <div class="field"><label for="contact-message">Message</label><textarea id="contact-message" name="message" required></textarea></div>
          <button class="btn" type="submit">Send message</button>
          <p class="form-status" id="form-status" role="status"></p>
        </form>
      </div>
    </section>
    <!-- /SECTION -->`;
}

function landingSite(prompt: string): Site {
  const subject = extractSubject(prompt);
  const title = brandFor(prompt, "landing");
  const tagline = subject
    ? `${subject} with a clean, considered edge. Built to be understood in five seconds and used on the first click.`
    : "A small studio with a clear point of view. Designed slowly, shipped properly, and easy to talk to.";
  const sections = `    <section class="hero">
      <div class="wrap hero-grid">
        <div>
          <p class="eyebrow">${escapeHtml(subject || "Independent studio")}</p>
          <h1>${escapeHtml(subject ? `Everything ${subject} needs. Nothing it does not.` : "Good work, without the theatre.")}</h1>
          <p class="lede">${escapeHtml(tagline)}</p>
          <div class="hero-actions">
            <a class="btn" href="#pricing">See plans</a>
            <a class="btn ghost" href="#contact">Talk to us</a>
          </div>
          <ul class="ticks">
            <li>Clear pricing, no surprise line items</li>
            <li>Fast replies from the person doing the work</li>
            <li>Accessible, responsive by default</li>
          </ul>
        </div>
        <div class="hero-art">${heroArt()}</div>
      </div>
    </section>

    <!-- SECTION:features -->
    <section class="section" id="features">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">Why it works</p>
          <h2>Three things we refuse to compromise on</h2>
        </div>
        <div class="grid three">
          <article class="card"><h3>Thoughtful defaults</h3><p>Sensible structure, real copy and a palette that belongs to the subject — not a template with the name swapped.</p></article>
          <article class="card"><h3>Built to last</h3><p>Semantic HTML, plain CSS and JavaScript that works without a build step. Easy to read, easy to hand over.</p></article>
          <article class="card"><h3>Actually responsive</h3><p>Designed from 360px up. Keyboard focus, reduced motion and readable contrast are part of the first pass.</p></article>
        </div>
      </div>
    </section>
    <!-- /SECTION -->

    <!-- SECTION:pricing -->
    <section class="section alt" id="pricing">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">Pricing</p>
          <h2>Simple plans, plainly written</h2>
          <p class="muted">Every plan includes the same care. The difference is scope, not quality.</p>
        </div>
        <div class="grid three">
          <article class="card price"><h3>Starter</h3><strong>$0</strong><p class="muted">For trying the fit.</p><ul><li>One page</li><li>Two revisions</li><li>Email support</li></ul><a class="btn ghost small" href="#contact">Start free</a></article>
          <article class="card price"><h3>Studio</h3><strong>$48</strong><p class="muted">Per month, cancel anytime.</p><ul><li>Five pages</li><li>Unlimited revisions</li><li>Priority replies</li></ul><a class="btn small" href="#contact">Choose Studio</a></article>
          <article class="card price"><h3>Partner</h3><strong>Let's talk</strong><p class="muted">For ongoing work.</p><ul><li>Unlimited scope</li><li>Shared planning</li><li>Direct line</li></ul><a class="btn ghost small" href="#contact">Book a call</a></article>
        </div>
      </div>
    </section>
    <!-- /SECTION -->

${contactSection()}`;

  return {
    title,
    tagline,
    eyebrow: "Independent studio",
    accent: colorFor(prompt)?.hex ?? "#2563eb",
    nav: [
      { href: "#features", label: "Features" },
      { href: "#pricing", label: "Pricing" },
      { href: "#contact", label: "Contact" },
    ],
    sections,
    appCss: "",
    appJs: "",
  };
}

function portfolioSite(prompt: string): Site {
  const title = brandFor(prompt, "portfolio");
  const role = /\b(developer|engineer|designer|writer|photographer|illustrator)\b/i.exec(prompt)?.[1];
  return {
    title,
    tagline: "Selected work and a short introduction.",
    eyebrow: "Portfolio",
    accent: colorFor(prompt)?.hex ?? "#0f766e",
    nav: [
      { href: "#work", label: "Work" },
      { href: "#about", label: "About" },
      { href: "#contact", label: "Contact" },
    ],
    appCss: "",
    appJs: "",
    sections: `    <section class="hero">
      <div class="wrap hero-grid">
        <div>
          <p class="eyebrow">${escapeHtml(role ? titleCase(role) : "Design and code")}</p>
          <h1>${escapeHtml(title)}</h1>
          <p class="lede">I make small, useful digital things: interfaces with a point of view, sites that load fast and words that sound like a person wrote them.</p>
          <div class="hero-actions"><a class="btn" href="#work">See the work</a><a class="btn ghost" href="#contact">Get in touch</a></div>
        </div>
        <div class="hero-art">${heroArt()}</div>
      </div>
    </section>

    <!-- SECTION:work -->
    <section class="section" id="work">
      <div class="wrap">
        <div class="section-head"><p class="eyebrow">Selected work</p><h2>Six recent projects</h2></div>
        <div class="grid three">
          <article class="work-card c1"><h3>Harbour</h3><p>Booking flow for a coastal hotel</p></article>
          <article class="work-card c2"><h3>Crumb</h3><p>Brand and ordering site for a bakery</p></article>
          <article class="work-card c3"><h3>Orbit</h3><p>Dashboard for a small SaaS team</p></article>
          <article class="work-card c4"><h3>Stem</h3><p>Editorial site for a florist</p></article>
          <article class="work-card c5"><h3>Signal</h3><p>Research notes and a public archive</p></article>
          <article class="work-card c6"><h3>Field</h3><p>Portfolio for a landscape photographer</p></article>
        </div>
      </div>
    </section>
    <!-- /SECTION -->

    <!-- SECTION:about -->
    <section class="section alt" id="about">
      <div class="wrap grid two">
        <div><p class="eyebrow">About</p><h2>Slow enough to notice the details</h2><p class="muted">I work alone, on purpose. That means the person you brief is the person who does the work. Most projects run four to eight weeks.</p></div>
        <div class="panel"><ul class="chips"><li>Product design</li><li>Front-end</li><li>Typography</li><li>Design systems</li><li>Accessibility</li><li>Copywriting</li></ul><p class="muted" style="margin-top:18px">Available for select projects from next month.</p></div>
      </div>
    </section>
    <!-- /SECTION -->

${contactSection()}`,
  };
}

function blogSite(prompt: string): Site {
  const title = brandFor(prompt, "blog");
  return {
    title,
    tagline: "Essays about building software carefully.",
    eyebrow: "Journal",
    accent: colorFor(prompt)?.hex ?? "#b45309",
    nav: [
      { href: "#stories", label: "Stories" },
      { href: "#about", label: "About" },
      { href: "#newsletter", label: "Newsletter" },
    ],
    appCss: "",
    appJs: `  var filterButtons = document.querySelectorAll(".filter-btn");
  var cards = document.querySelectorAll(".article-card");
  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      filterButtons.forEach(function (item) { item.classList.remove("active"); });
      button.classList.add("active");
      var tag = button.getAttribute("data-tag");
      cards.forEach(function (card) {
        card.hidden = tag !== "all" && card.getAttribute("data-tag") !== tag;
      });
    });
  });
`,
    sections: `    <section class="hero">
      <div class="wrap">
        <p class="eyebrow">${escapeHtml("Notes from the workbench")}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="lede">Practical essays about interfaces, performance and the unglamorous parts of shipping software.</p>
      </div>
    </section>

    <!-- SECTION:stories -->
    <section class="section" id="stories">
      <div class="wrap">
        <div class="filter-row">
          <button type="button" class="filter-btn active" data-tag="all">All</button>
          <button type="button" class="filter-btn" data-tag="design">Design</button>
          <button type="button" class="filter-btn" data-tag="engineering">Engineering</button>
          <button type="button" class="filter-btn" data-tag="process">Process</button>
        </div>
        <div class="grid three">
          <article class="card article-card" data-tag="design"><span class="tag">Design</span><h3>The first screen is an argument</h3><p class="muted">What a hero section has to prove before anyone scrolls.</p><a href="#stories">Read the essay</a></article>
          <article class="card article-card" data-tag="engineering"><span class="tag">Engineering</span><h3>Ship less JavaScript</h3><p class="muted">A small page that does the job beats a framework that does everything.</p><a href="#stories">Read the essay</a></article>
          <article class="card article-card" data-tag="process"><span class="tag">Process</span><h3>Two revisions, not twenty</h3><p class="muted">How clear constraints make the work better and the week shorter.</p><a href="#stories">Read the essay</a></article>
        </div>
      </div>
    </section>
    <!-- /SECTION -->

    <!-- SECTION:about -->
    <section class="section alt" id="about">
      <div class="wrap grid two">
        <div><p class="eyebrow">About</p><h2>Written by one person</h2><p class="muted">No growth team, no content calendar. Just notes from projects that shipped and projects that taught me something.</p></div>
        <div class="card"><h3>What you will find</h3><p class="muted">Short reads on design decisions, front-end craft and the habits that keep small teams sane.</p></div>
      </div>
    </section>
    <!-- /SECTION -->

    <!-- SECTION:newsletter -->
    <section class="section" id="newsletter">
      <div class="wrap">
        <div class="section-head"><p class="eyebrow">Newsletter</p><h2>One useful letter a month</h2></div>
        <form class="panel form" id="newsletter-form">
          <div class="field"><label for="newsletter-email">Email</label><input id="newsletter-email" name="email" type="email" autocomplete="email" required placeholder="you@example.com" /></div>
          <button class="btn" type="submit">Subscribe</button>
          <p class="form-status" id="newsletter-status" role="status"></p>
        </form>
      </div>
    </section>
    <!-- /SECTION -->`,
  };
}

function dashboardSite(prompt: string): Site {
  const title = brandFor(prompt, "dashboard");
  return {
    title,
    tagline: "A calm overview of the numbers that matter.",
    eyebrow: "Operations",
    accent: colorFor(prompt)?.hex ?? "#2563eb",
    nav: [
      { href: "#overview", label: "Overview" },
      { href: "#activity", label: "Activity" },
    ],
    appCss: "",
    appJs: `  var ranges = {
    "7": [12, 18, 15, 24, 22, 29, 31],
    "30": [22, 26, 21, 30, 28, 35, 39],
    "90": [18, 24, 32, 29, 38, 42, 47]
  };
  var stats = {
    "7": ["18", "42h", "96%", "$2.4k"],
    "30": ["64", "180h", "97%", "$9.8k"],
    "90": ["171", "520h", "96%", "$28k"]
  };
  var chart = document.getElementById("chart");
  var values = document.querySelectorAll(".stat strong");
  var buttons = document.querySelectorAll(".range-btn");

  function render(range) {
    var data = ranges[range] || ranges["7"];
    var numbers = stats[range] || stats["7"];
    if (chart) {
      chart.innerHTML = "";
      data.forEach(function (value) {
        var bar = document.createElement("div");
        bar.className = "chart-bar";
        bar.style.height = String(value * 3) + "px";
        bar.setAttribute("aria-hidden", "true");
        chart.appendChild(bar);
      });
    }
    values.forEach(function (node, index) {
      node.textContent = numbers[index] || "";
    });
    buttons.forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-range") === range);
    });
  }

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      render(button.getAttribute("data-range") || "7");
    });
  });
  render("7");
`,
    sections: `    <section class="hero">
      <div class="wrap">
        <p class="eyebrow">Last updated just now</p>
        <h1>Everything at a glance.</h1>
        <p class="lede">A compact operations view: active work, response time, pass rate and monthly spend.</p>
      </div>
    </section>

    <!-- SECTION:overview -->
    <section class="section" id="overview">
      <div class="wrap">
        <div class="filter-row">
          <button type="button" class="range-btn filter-btn active" data-range="7">7 days</button>
          <button type="button" class="range-btn filter-btn" data-range="30">30 days</button>
          <button type="button" class="range-btn filter-btn" data-range="90">90 days</button>
        </div>
        <div class="stat-grid">
          <div class="stat"><span>Active projects</span><strong>18</strong></div>
          <div class="stat"><span>Time saved</span><strong>42h</strong></div>
          <div class="stat"><span>Pass rate</span><strong>96%</strong></div>
          <div class="stat"><span>Spend</span><strong>$2.4k</strong></div>
        </div>
        <div class="panel" style="margin-top:18px">
          <h2>Weekly throughput</h2>
          <div class="chart" id="chart"></div>
        </div>
      </div>
    </section>
    <!-- /SECTION -->

    <!-- SECTION:activity -->
    <section class="section alt" id="activity">
      <div class="wrap">
        <h2>Recent activity</h2>
        <table class="table">
          <thead><tr><th>Project</th><th>Owner</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>
            <tr><td>Harbour booking</td><td>Mina</td><td>In review</td><td>12 min ago</td></tr>
            <tr><td>Crumb ordering</td><td>Ali</td><td>Building</td><td>48 min ago</td></tr>
            <tr><td>Orbit dashboard</td><td>Jo</td><td>Shipped</td><td>Yesterday</td></tr>
            <tr><td>Stem editorial</td><td>Rae</td><td>Planning</td><td>2 days ago</td></tr>
          </tbody>
        </table>
      </div>
    </section>
    <!-- /SECTION -->`,
  };
}

function appShellSite(
  kind: AppKind,
  prompt: string,
  appHtml: string,
  appCss: string,
  appJs: string,
): Site {
  const title = brandFor(prompt, kind);
  const taglineMap: Record<AppKind, string> = {
    landing: "",
    portfolio: "",
    blog: "",
    dashboard: "",
    todo: "Capture the next thing, finish it, and keep the list honest.",
    notes: "A quiet place for the thought you do not want to lose.",
    calculator: "A keyboard-friendly calculator that shows its work.",
    timer: "A focus timer with short and long sessions.",
    quiz: "Five questions, immediate feedback, no pressure.",
    expense: "Track what you spend and see the total update as you go.",
    converter: "Length, mass, volume, time and temperature in one place.",
    password: "Generate a strong random password without sending it anywhere.",
    ttt: "A small, complete game. You are X; the computer is O.",
  };
  return {
    title,
    tagline: taglineMap[kind],
    eyebrow: "Built with Hard Coded Intelligence",
    accent: colorFor(prompt)?.hex ?? "#2563eb",
    nav: [{ href: "#app", label: "App" }],
    appCss,
    appJs,
    sections: `    <section class="hero">
      <div class="wrap">
        <p class="eyebrow">${escapeHtml(taglineMap[kind].split(".")[0])}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="lede">${escapeHtml(taglineMap[kind])}</p>
      </div>
    </section>

    <!-- SECTION:app -->
    <section class="section" id="app">
      <div class="wrap">
        <div class="panel">
${appHtml}
        </div>
      </div>
    </section>
    <!-- /SECTION -->`,
  };
}

function todoApp(): { html: string; css: string; js: string } {
  return {
    html: `          <div class="app-head" style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
            <div><h2 style="margin-bottom:4px">Today</h2><p class="muted" id="todo-count">0 open</p></div>
            <button type="button" class="btn ghost small" id="clear-done">Clear done</button>
          </div>
          <form id="todo-form" class="row-form">
            <label class="sr-only" for="todo-input">New task</label>
            <input id="todo-input" name="task" placeholder="Add a task…" autocomplete="off" />
            <button class="btn" type="submit">Add</button>
          </form>
          <p class="empty" id="todo-empty">Nothing here yet. Add the first task above.</p>
          <ul class="todo-list" id="todo-list"></ul>`,
    css: "",
    js: `  var form = document.getElementById("todo-form");
  var input = document.getElementById("todo-input");
  var list = document.getElementById("todo-list");
  var empty = document.getElementById("todo-empty");
  var count = document.getElementById("todo-count");
  var clear = document.getElementById("clear-done");
  var items = [];

  function load() {
    try { items = JSON.parse(localStorage.getItem("hc-todos") || "[]"); } catch (error) { items = []; }
    if (!Array.isArray(items)) items = [];
  }

  function save() {
    try { localStorage.setItem("hc-todos", JSON.stringify(items)); } catch (error) {}
  }

  function render() {
    list.innerHTML = "";
    var open = 0;
    items.forEach(function (item) {
      if (!item.done) open += 1;
      var row = document.createElement("li");
      row.className = "todo-item" + (item.done ? " done" : "");
      row.setAttribute("data-id", item.id);

      var check = document.createElement("input");
      check.type = "checkbox";
      check.className = "todo-check";
      check.checked = Boolean(item.done);
      check.setAttribute("aria-label", "Mark " + item.text + " done");

      var text = document.createElement("span");
      text.className = "todo-text";
      text.textContent = item.text;

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "todo-delete";
      remove.textContent = "Remove";

      row.appendChild(check);
      row.appendChild(text);
      row.appendChild(remove);
      list.appendChild(row);
    });
    if (empty) empty.hidden = items.length > 0;
    if (count) count.textContent = open + " open · " + items.length + " total";
  }

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: text, done: false });
      input.value = "";
      save();
      render();
      input.focus();
    });
  }

  if (list) {
    list.addEventListener("click", function (event) {
      var target = event.target;
      var row = target.closest(".todo-item");
      if (!row) return;
      var id = row.getAttribute("data-id");
      if (target.classList.contains("todo-delete")) {
        items = items.filter(function (item) { return item.id !== id; });
        save();
        render();
        return;
      }
      if (target.classList.contains("todo-check")) {
        items.forEach(function (item) { if (item.id === id) item.done = target.checked; });
        save();
        render();
      }
    });
  }

  if (clear) {
    clear.addEventListener("click", function () {
      items = items.filter(function (item) { return !item.done; });
      save();
      render();
    });
  }

  load();
  render();
`,
  };
}

function notesApp(): { html: string; css: string; js: string } {
  return {
    html: `          <h2 style="margin-bottom:4px">Scratchpad</h2>
          <p class="muted">Notes stay in this browser.</p>
          <form id="note-form" class="form">
            <div class="field"><label for="note-text">New note</label><textarea id="note-text" name="note" placeholder="Write it down…" required></textarea></div>
            <button class="btn" type="submit">Save note</button>
          </form>
          <p class="empty" id="note-empty" style="margin-top:18px">No notes yet.</p>
          <ul class="note-list" id="note-list" style="margin-top:18px"></ul>`,
    css: ".note-text { white-space: pre-wrap; }",
    js: `  var form = document.getElementById("note-form");
  var input = document.getElementById("note-text");
  var list = document.getElementById("note-list");
  var empty = document.getElementById("note-empty");
  var notes = [];

  function load() {
    try { notes = JSON.parse(localStorage.getItem("hc-notes") || "[]"); } catch (error) { notes = []; }
    if (!Array.isArray(notes)) notes = [];
  }

  function save() {
    try { localStorage.setItem("hc-notes", JSON.stringify(notes)); } catch (error) {}
  }

  function render() {
    list.innerHTML = "";
    notes.forEach(function (note) {
      var row = document.createElement("li");
      row.className = "note-item";
      row.setAttribute("data-id", note.id);
      var text = document.createElement("span");
      text.className = "note-text";
      text.textContent = note.text;
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "note-delete";
      remove.textContent = "Delete";
      row.appendChild(text);
      row.appendChild(remove);
      list.appendChild(row);
    });
    if (empty) empty.hidden = notes.length > 0;
  }

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      notes.unshift({ id: Date.now().toString(36), text: text });
      input.value = "";
      save();
      render();
    });
  }

  if (list) {
    list.addEventListener("click", function (event) {
      if (!event.target.classList.contains("note-delete")) return;
      var row = event.target.closest(".note-item");
      if (!row) return;
      var id = row.getAttribute("data-id");
      notes = notes.filter(function (note) { return note.id !== id; });
      save();
      render();
    });
  }

  load();
  render();
`,
  };
}

function calculatorApp(): { html: string; css: string; js: string } {
  const keys = [
    ["C", "calc-key clear"],
    ["⌫", "calc-key"],
    ["%", "calc-key operator"],
    ["÷", "calc-key operator"],
    ["7", "calc-key"],
    ["8", "calc-key"],
    ["9", "calc-key"],
    ["×", "calc-key operator"],
    ["4", "calc-key"],
    ["5", "calc-key"],
    ["6", "calc-key"],
    ["−", "calc-key operator"],
    ["1", "calc-key"],
    ["2", "calc-key"],
    ["3", "calc-key"],
    ["+", "calc-key operator"],
    ["0", "calc-key"],
    [".", "calc-key"],
    ["=", "calc-key operator"],
  ];
  const keyHtml = keys
    .map(
      ([label, className]) =>
        `<button type="button" class="${className}" data-key="${label}">${label}</button>`,
    )
    .join("\n            ");
  return {
    html: `          <div class="calc">
            <output class="calc-display" id="calc-display" aria-live="polite">0</output>
            <div class="calc-keys">
            ${keyHtml}
            </div>
          </div>`,
    css: "",
    js: `  var display = document.getElementById("calc-display");
  var expression = "";

  function update(value) {
    if (display) display.textContent = value || "0";
  }

  function compute(text) {
    var source = text.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\\s/g, "");
    var index = 0;

    function peek() { return source.charAt(index); }

    function parseExpression() {
      var value = parseTerm();
      while (peek() === "+" || peek() === "-") {
        var operator = source.charAt(index);
        index += 1;
        var right = parseTerm();
        value = operator === "+" ? value + right : value - right;
      }
      return value;
    }

    function parseTerm() {
      var value = parseFactor();
      while (peek() === "*" || peek() === "/") {
        var operator = source.charAt(index);
        index += 1;
        var right = parseFactor();
        value = operator === "*" ? value * right : value / right;
      }
      return value;
    }

    function parseFactor() {
      if (peek() === "-") { index += 1; return -parseFactor(); }
      if (peek() === "+") { index += 1; return parseFactor(); }
      var start = index;
      while (index < source.length && "0123456789.".indexOf(source.charAt(index)) >= 0) index += 1;
      if (start === index) throw new Error("Expected a number");
      var value = parseFloat(source.slice(start, index));
      while (peek() === "%") { index += 1; value = value / 100; }
      return value;
    }

    var result = parseExpression();
    if (index !== source.length || !isFinite(result)) throw new Error("Incomplete expression");
    return Math.round(result * 100000000) / 100000000;
  }

  document.querySelectorAll(".calc-key").forEach(function (button) {
    button.addEventListener("click", function () {
      var key = button.getAttribute("data-key") || "";
      if (key === "C") {
        expression = "";
        update("0");
        return;
      }
      if (key === "⌫") {
        expression = expression.slice(0, -1);
        update(expression);
        return;
      }
      if (key === "=") {
        try {
          expression = String(compute(expression));
          update(expression);
        } catch (error) {
          update("Error");
          expression = "";
        }
        return;
      }
      expression += key;
      update(expression);
    });
  });
`,
  };
}

function timerApp(): { html: string; css: string; js: string } {
  return {
    html: `          <div class="timer">
            <p class="muted">Focus session</p>
            <p class="timer-display" id="timer-display">25:00</p>
            <div class="timer-presets">
              <button type="button" class="preset-btn btn small" data-minutes="5">5 min</button>
              <button type="button" class="preset-btn btn small" data-minutes="15">15 min</button>
              <button type="button" class="preset-btn btn small active" data-minutes="25">25 min</button>
            </div>
            <div class="timer-actions">
              <button type="button" class="btn" id="timer-start">Start</button>
              <button type="button" class="btn ghost" id="timer-pause">Pause</button>
              <button type="button" class="btn ghost" id="timer-reset">Reset</button>
            </div>
            <p class="muted" id="timer-note" style="margin-top:16px">Pick a length, then start. The timer runs in this tab.</p>
          </div>`,
    css: "",
    js: `  var display = document.getElementById("timer-display");
  var startButton = document.getElementById("timer-start");
  var pauseButton = document.getElementById("timer-pause");
  var resetButton = document.getElementById("timer-reset");
  var note = document.getElementById("timer-note");
  var presets = document.querySelectorAll(".preset-btn");
  var total = 25 * 60;
  var left = total;
  var running = false;
  var handle = null;

  function format(seconds) {
    var minutes = Math.floor(seconds / 60);
    var rest = seconds % 60;
    return String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
  }

  function paint() {
    if (display) display.textContent = format(Math.max(0, left));
  }

  function stop() {
    running = false;
    if (handle) clearInterval(handle);
    handle = null;
    if (startButton) startButton.textContent = "Start";
  }

  function tick() {
    left -= 1;
    paint();
    if (left <= 0) {
      stop();
      if (note) note.textContent = "Time is up. Take a short break.";
    }
  }

  if (startButton) {
    startButton.addEventListener("click", function () {
      if (running) return;
      if (left <= 0) left = total;
      running = true;
      startButton.textContent = "Running";
      if (note) note.textContent = "Stay with one thing until the timer stops.";
      handle = setInterval(tick, 1000);
    });
  }

  if (pauseButton) {
    pauseButton.addEventListener("click", function () {
      stop();
      if (note) note.textContent = "Paused at " + format(Math.max(0, left)) + ".";
    });
  }

  if (resetButton) {
    resetButton.addEventListener("click", function () {
      stop();
      left = total;
      paint();
      if (note) note.textContent = "Reset. Pick a length or start again.";
    });
  }

  presets.forEach(function (button) {
    button.addEventListener("click", function () {
      stop();
      total = Number(button.getAttribute("data-minutes") || "25") * 60;
      left = total;
      presets.forEach(function (item) { item.classList.remove("active"); });
      button.classList.add("active");
      paint();
      if (note) note.textContent = "Ready for a " + button.getAttribute("data-minutes") + " minute session.";
    });
  });

  paint();
`,
  };
}

function quizApp(): { html: string; css: string; js: string } {
  return {
    html: `          <div class="quiz">
            <p class="muted" id="quiz-progress">Question 1 of 5</p>
            <h2 id="quiz-question">Ready?</h2>
            <div class="quiz-options" id="quiz-options"></div>
            <div class="quiz-foot">
              <span id="quiz-score">Score 0</span>
              <button type="button" class="btn" id="quiz-next" disabled>Next</button>
            </div>
          </div>`,
    css: "",
    js: `  var questions = [
    { q: "Which language runs in the browser?", options: ["JavaScript", "Python", "Rust", "SQL"], correct: 0 },
    { q: "What does CSS control?", options: ["Data storage", "Presentation", "Networking", "Compilation"], correct: 1 },
    { q: "Which HTTP status means not found?", options: ["200", "301", "404", "500"], correct: 2 },
    { q: "What does HTML stand for?", options: ["HyperText Markup Language", "High Text Machine Learning", "Home Tool Markup Logic", "Hyperlink Text Media Layer"], correct: 0 },
    { q: "Which Git command creates a branch?", options: ["git merge", "git switch -c", "git clone", "git status"], correct: 1 }
  ];
  var index = 0;
  var score = 0;
  var locked = false;
  var questionNode = document.getElementById("quiz-question");
  var optionsNode = document.getElementById("quiz-options");
  var progressNode = document.getElementById("quiz-progress");
  var scoreNode = document.getElementById("quiz-score");
  var nextButton = document.getElementById("quiz-next");

  function show() {
    locked = false;
    if (nextButton) {
      nextButton.disabled = true;
      nextButton.textContent = "Next";
    }
    if (!questionNode || !optionsNode) return;
    var item = questions[index];
    questionNode.textContent = item.q;
    if (progressNode) progressNode.textContent = "Question " + (index + 1) + " of " + questions.length;
    optionsNode.innerHTML = "";
    item.options.forEach(function (label, optionIndex) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "quiz-option";
      button.textContent = label;
      button.addEventListener("click", function () {
        if (locked) return;
        locked = true;
        var buttons = optionsNode.querySelectorAll(".quiz-option");
        buttons.forEach(function (node, nodeIndex) {
          if (nodeIndex === item.correct) node.classList.add("correct");
          if (nodeIndex === optionIndex && optionIndex !== item.correct) node.classList.add("wrong");
        });
        if (optionIndex === item.correct) score += 1;
        if (scoreNode) scoreNode.textContent = "Score " + score;
        if (nextButton) nextButton.disabled = false;
      });
      optionsNode.appendChild(button);
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", function () {
      index += 1;
      if (index >= questions.length) {
        if (questionNode) questionNode.textContent = "You scored " + score + " out of " + questions.length + ".";
        if (optionsNode) optionsNode.innerHTML = "";
        if (progressNode) progressNode.textContent = "Finished";
        nextButton.textContent = "Play again";
        nextButton.disabled = false;
        index = 0;
        score = 0;
        locked = true;
        return;
      }
      show();
    });
  }

  show();
`,
  };
}

function expenseApp(): { html: string; css: string; js: string } {
  return {
    html: `          <h2 style="margin-bottom:4px">Spending</h2>
          <p class="muted">Everything stays in this browser.</p>
          <form id="expense-form" class="form" style="max-width:none;margin-top:16px">
            <div class="grid two">
              <div class="field"><label for="expense-name">What</label><input id="expense-name" name="name" placeholder="Coffee" required /></div>
              <div class="field"><label for="expense-amount">Amount</label><input id="expense-amount" name="amount" type="number" min="0" step="0.01" placeholder="4.50" required /></div>
            </div>
            <div class="field"><label for="expense-category">Category</label><select id="expense-category" name="category"><option>Food</option><option>Travel</option><option>Home</option><option>Fun</option></select></div>
            <button class="btn" type="submit">Add expense</button>
          </form>
          <p class="result-line" id="expense-total">$0.00</p>
          <p class="empty" id="expense-empty">No expenses yet.</p>
          <ul class="expense-list" id="expense-list" style="margin-top:16px"></ul>`,
    css: ".expense-meta { color: var(--muted); font-size: 0.82rem; }",
    js: `  var form = document.getElementById("expense-form");
  var nameInput = document.getElementById("expense-name");
  var amountInput = document.getElementById("expense-amount");
  var categoryInput = document.getElementById("expense-category");
  var list = document.getElementById("expense-list");
  var totalNode = document.getElementById("expense-total");
  var empty = document.getElementById("expense-empty");
  var expenses = [];

  function load() {
    try { expenses = JSON.parse(localStorage.getItem("hc-expenses") || "[]"); } catch (error) { expenses = []; }
    if (!Array.isArray(expenses)) expenses = [];
  }

  function save() {
    try { localStorage.setItem("hc-expenses", JSON.stringify(expenses)); } catch (error) {}
  }

  function render() {
    list.innerHTML = "";
    var total = 0;
    expenses.forEach(function (item) {
      total += Number(item.amount) || 0;
      var row = document.createElement("li");
      row.className = "expense-item";
      row.setAttribute("data-id", item.id);
      var name = document.createElement("span");
      name.className = "expense-name";
      name.textContent = item.name;
      var meta = document.createElement("span");
      meta.className = "expense-meta";
      meta.textContent = item.category + " · $" + Number(item.amount).toFixed(2);
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "expense-delete";
      remove.textContent = "Delete";
      row.appendChild(name);
      row.appendChild(meta);
      row.appendChild(remove);
      list.appendChild(row);
    });
    if (totalNode) totalNode.textContent = "$" + total.toFixed(2);
    if (empty) empty.hidden = expenses.length > 0;
  }

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var amount = Number(amountInput.value);
      if (!nameInput.value.trim() || !isFinite(amount) || amount <= 0) return;
      expenses.unshift({
        id: Date.now().toString(36),
        name: nameInput.value.trim(),
        amount: amount,
        category: categoryInput.value
      });
      nameInput.value = "";
      amountInput.value = "";
      save();
      render();
    });
  }

  if (list) {
    list.addEventListener("click", function (event) {
      if (!event.target.classList.contains("expense-delete")) return;
      var row = event.target.closest(".expense-item");
      if (!row) return;
      var id = row.getAttribute("data-id");
      expenses = expenses.filter(function (item) { return item.id !== id; });
      save();
      render();
    });
  }

  load();
  render();
`,
  };
}

function converterApp(): { html: string; css: string; js: string } {
  const units = [
    ["km", "Kilometres"],
    ["mi", "Miles"],
    ["m", "Metres"],
    ["ft", "Feet"],
    ["cm", "Centimetres"],
    ["in", "Inches"],
    ["kg", "Kilograms"],
    ["lb", "Pounds"],
    ["g", "Grams"],
    ["oz", "Ounces"],
    ["l", "Litres"],
    ["gal", "Gallons"],
    ["ml", "Millilitres"],
    ["cup", "Cups"],
    ["h", "Hours"],
    ["min", "Minutes"],
    ["day", "Days"],
    ["s", "Seconds"],
    ["c", "Celsius"],
    ["f", "Fahrenheit"],
    ["k", "Kelvin"],
  ];
  const options = units
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
  return {
    html: `          <h2 style="margin-bottom:4px">Convert anything ordinary</h2>
          <p class="muted">Length, mass, volume, time and temperature.</p>
          <form id="convert-form" class="form" style="max-width:none;margin-top:16px">
            <div class="field"><label for="convert-value">Value</label><input id="convert-value" name="value" type="number" step="any" value="1" required /></div>
            <div class="grid two">
              <div class="field"><label for="convert-from">From</label><select id="convert-from" name="from">${options}</select></div>
              <div class="field"><label for="convert-to">To</label><select id="convert-to" name="to">${options}</select></div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button class="btn" type="submit">Convert</button>
              <button class="btn ghost" type="button" id="convert-swap">Swap</button>
            </div>
          </form>
          <p class="result-line" id="convert-result">1 kilometre = 0.621371 miles</p>`,
    css: "",
    js: `  var factors = {
    mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, mi: 1609.344,
    mg: 0.001, g: 1, kg: 1000, oz: 28.3495, lb: 453.592,
    ml: 0.001, l: 1, cup: 0.2366, gal: 3.7854,
    s: 1, min: 60, h: 3600, day: 86400
  };
  var groups = {
    mm: "length", cm: "length", m: "length", km: "length", in: "length", ft: "length", mi: "length",
    mg: "mass", g: "mass", kg: "mass", oz: "mass", lb: "mass",
    ml: "volume", l: "volume", cup: "volume", gal: "volume",
    s: "time", min: "time", h: "time", day: "time",
    c: "temp", f: "temp", k: "temp"
  };
  var form = document.getElementById("convert-form");
  var valueInput = document.getElementById("convert-value");
  var fromInput = document.getElementById("convert-from");
  var toInput = document.getElementById("convert-to");
  var resultNode = document.getElementById("convert-result");
  var swap = document.getElementById("convert-swap");

  function convert(amount, from, to) {
    if (groups[from] === "temp" || groups[to] === "temp") {
      if (groups[from] !== "temp" || groups[to] !== "temp") return null;
      var celsius = amount;
      if (from === "f") celsius = (amount - 32) * 5 / 9;
      if (from === "k") celsius = amount - 273.15;
      if (to === "c") return celsius;
      if (to === "f") return celsius * 9 / 5 + 32;
      return celsius + 273.15;
    }
    if (groups[from] !== groups[to]) return null;
    return amount * factors[from] / factors[to];
  }

  function run() {
    var amount = Number(valueInput.value);
    var from = fromInput.value;
    var to = toInput.value;
    if (!isFinite(amount)) return;
    var result = convert(amount, from, to);
    if (result === null) {
      if (resultNode) resultNode.textContent = "Those units measure different things.";
      return;
    }
    var rounded = Math.round(result * 1000000) / 1000000;
    if (resultNode) resultNode.textContent = amount + " " + from + " = " + rounded + " " + to;
  }

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      run();
    });
  }

  if (swap) {
    swap.addEventListener("click", function () {
      var from = fromInput.value;
      fromInput.value = toInput.value;
      toInput.value = from;
      run();
    });
  }

  run();
`,
  };
}

function passwordApp(): { html: string; css: string; js: string } {
  return {
    html: `          <h2 style="margin-bottom:4px">Make a strong password</h2>
          <p class="muted">Generated in this tab. Nothing is sent anywhere.</p>
          <output class="password-output" id="password-output"></output>
          <div class="field"><label for="password-length">Length: <span id="password-length-label">20</span></label><input id="password-length" type="range" min="8" max="48" value="20" /></div>
          <div class="pw-options">
            <label class="pw-option"><input type="checkbox" class="pw-option-box" data-set="upper" checked /> Uppercase letters</label>
            <label class="pw-option"><input type="checkbox" class="pw-option-box" data-set="digits" checked /> Numbers</label>
            <label class="pw-option"><input type="checkbox" class="pw-option-box" data-set="symbols" checked /> Symbols</label>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button type="button" class="btn" id="password-generate">Generate</button>
            <button type="button" class="btn ghost" id="password-copy">Copy</button>
          </div>
          <p class="form-status" id="password-status" role="status"></p>`,
    css: "",
    js: `  var output = document.getElementById("password-output");
  var lengthInput = document.getElementById("password-length");
  var lengthLabel = document.getElementById("password-length-label");
  var generate = document.getElementById("password-generate");
  var copy = document.getElementById("password-copy");
  var status = document.getElementById("password-status");
  var options = document.querySelectorAll(".pw-option-box");

  function build() {
    var lower = "abcdefghijkmnopqrstuvwxyz";
    var upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    var digits = "23456789";
    var symbols = "!@#$%^&*-_=+";
    var pool = lower;
    options.forEach(function (box) {
      if (!box.checked) return;
      if (box.getAttribute("data-set") === "upper") pool += upper;
      if (box.getAttribute("data-set") === "digits") pool += digits;
      if (box.getAttribute("data-set") === "symbols") pool += symbols;
    });
    var length = Number(lengthInput.value) || 20;
    var chars = [];
    for (var index = 0; index < length; index += 1) {
      chars.push(pool.charAt(Math.floor(Math.random() * pool.length)));
    }
    if (output) output.textContent = chars.join("");
    if (lengthLabel) lengthLabel.textContent = String(length);
    if (status) status.textContent = "New password ready. Store it in a password manager.";
  }

  if (generate) generate.addEventListener("click", build);
  if (lengthInput) lengthInput.addEventListener("input", build);
  options.forEach(function (box) { box.addEventListener("change", build); });

  if (copy) {
    copy.addEventListener("click", function () {
      var text = output ? output.textContent || "" : "";
      if (!text) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          if (status) status.textContent = "Copied to the clipboard.";
        }).catch(function () {
          if (status) status.textContent = "Copy was blocked. Select the password and copy it manually.";
        });
      } else if (status) {
        status.textContent = "Copy is unavailable here. Select the password and copy it manually.";
      }
    });
  }

  build();
`,
  };
}

function tttApp(): { html: string; css: string; js: string } {
  return {
    html: `          <h2 style="text-align:center;margin-bottom:4px">Three in a row</h2>
          <p class="ttt-status" id="ttt-status">Your move. You are X.</p>
          <div class="ttt-board" id="ttt-board"></div>
          <div style="text-align:center"><button type="button" class="btn ghost" id="ttt-reset">New game</button></div>`,
    css: "",
    js: `  var board = document.getElementById("ttt-board");
  var status = document.getElementById("ttt-status");
  var reset = document.getElementById("ttt-reset");
  var cells = [];
  var state = ["", "", "", "", "", "", "", "", ""];
  var turn = "X";
  var over = false;
  var lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  function winner() {
    for (var index = 0; index < lines.length; index += 1) {
      var line = lines[index];
      if (state[line[0]] && state[line[0]] === state[line[1]] && state[line[0]] === state[line[2]]) return state[line[0]];
    }
    return state.indexOf("") === -1 ? "draw" : "";
  }

  function paint() {
    cells.forEach(function (cell, index) {
      cell.textContent = state[index];
      cell.disabled = Boolean(state[index]) || over;
    });
    var result = winner();
    if (!status) return;
    if (result === "draw") status.textContent = "A draw. Nobody blinked.";
    else if (result) status.textContent = result + " wins. Nice line.";
    else status.textContent = turn === "X" ? "Your move. You are X." : "Computer thinking…";
  }

  function finish(result) {
    over = true;
    paint();
    if (status) status.textContent = result === "draw" ? "A draw. Nobody blinked." : result + " wins. Nice line.";
  }

  function computer() {
    if (over) return;
    var open = [];
    state.forEach(function (value, index) { if (!value) open.push(index); });
    if (open.length === 0) { finish(winner() || "draw"); return; }
    var choice = -1;
    for (var index = 0; index < lines.length && choice < 0; index += 1) {
      var line = lines[index];
      var marks = line.filter(function (position) { return state[position] === "O"; });
      var empties = line.filter(function (position) { return !state[position]; });
      if (marks.length === 2 && empties.length === 1) choice = empties[0];
    }
    for (var block = 0; block < lines.length && choice < 0; block += 1) {
      var threat = lines[block];
      var xMarks = threat.filter(function (position) { return state[position] === "X"; });
      var gaps = threat.filter(function (position) { return !state[position]; });
      if (xMarks.length === 2 && gaps.length === 1) choice = gaps[0];
    }
    if (choice < 0 && !state[4]) choice = 4;
    if (choice < 0) choice = open[Math.floor(Math.random() * open.length)];
    state[choice] = "O";
    turn = "X";
    var result = winner();
    if (result) finish(result);
    else paint();
  }

  function play(index) {
    if (over || state[index] || turn !== "X") return;
    state[index] = "X";
    turn = "O";
    var result = winner();
    if (result) { finish(result); return; }
    paint();
    setTimeout(computer, 320);
  }

  function build() {
    if (!board) return;
    board.innerHTML = "";
    cells = [];
    state = ["", "", "", "", "", "", "", "", ""];
    turn = "X";
    over = false;
    for (var index = 0; index < 9; index += 1) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "ttt-cell";
      cell.setAttribute("aria-label", "Cell " + (index + 1));
      (function (position) {
        cell.addEventListener("click", function () { play(position); });
      })(index);
      board.appendChild(cell);
      cells.push(cell);
    }
    paint();
  }

  if (reset) reset.addEventListener("click", build);
  build();
`,
  };
}

function siteFor(prompt: string, kind: AppKind): Site {
  if (kind === "landing") return landingSite(prompt);
  if (kind === "portfolio") return portfolioSite(prompt);
  if (kind === "blog") return blogSite(prompt);
  if (kind === "dashboard") return dashboardSite(prompt);
  if (kind === "todo") {
    const app = todoApp();
    return appShellSite(kind, prompt, app.html, app.css, app.js);
  }
  if (kind === "notes") {
    const app = notesApp();
    return appShellSite(kind, prompt, app.html, app.css, app.js);
  }
  if (kind === "calculator") {
    const app = calculatorApp();
    return appShellSite(kind, prompt, app.html, app.css, app.js);
  }
  if (kind === "timer") {
    const app = timerApp();
    return appShellSite(kind, prompt, app.html, app.css, app.js);
  }
  if (kind === "quiz") {
    const app = quizApp();
    return appShellSite(kind, prompt, app.html, app.css, app.js);
  }
  if (kind === "expense") {
    const app = expenseApp();
    return appShellSite(kind, prompt, app.html, app.css, app.js);
  }
  if (kind === "converter") {
    const app = converterApp();
    return appShellSite(kind, prompt, app.html, app.css, app.js);
  }
  if (kind === "password") {
    const app = passwordApp();
    return appShellSite(kind, prompt, app.html, app.css, app.js);
  }
  const app = tttApp();
  return appShellSite(kind, prompt, app.html, app.css, app.js);
}

function filesFor(site: Site): Array<{ path: string; content: string }> {
  return [
    { path: "index.html", content: composeHtml(site) },
    {
      path: "styles.css",
      content: `${BASE_CSS}\n${site.appCss}\n`,
    },
    {
      path: "app.js",
      content: `${SHARED_JS}\n${site.appJs}${APP_JS_CLOSE}`,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Editing an existing project                                         */
/* ------------------------------------------------------------------ */

function sectionBlock(name: string, heading: string, subject: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const intro = `A ${name} section for ${subject || "the project"}.`;
  if (slug.includes("pricing")) {
    return `    <!-- SECTION:pricing -->
    <section class="section alt" id="pricing">
      <div class="wrap">
        <div class="section-head"><p class="eyebrow">Pricing</p><h2>${escapeHtml(heading)}</h2><p class="muted">${escapeHtml(intro)}</p></div>
        <div class="grid three">
          <article class="card price"><h3>Starter</h3><strong>$0</strong><p class="muted">Try the basics.</p><ul><li>One project</li><li>Community support</li></ul><a class="btn ghost small" href="#contact">Start free</a></article>
          <article class="card price"><h3>Studio</h3><strong>$24</strong><p class="muted">For regular work.</p><ul><li>Unlimited projects</li><li>Priority replies</li></ul><a class="btn small" href="#contact">Choose Studio</a></article>
          <article class="card price"><h3>Partner</h3><strong>Custom</strong><p class="muted">For ongoing help.</p><ul><li>Shared planning</li><li>Direct line</li></ul><a class="btn ghost small" href="#contact">Talk to us</a></article>
        </div>
      </div>
    </section>
    <!-- /SECTION -->`;
  }
  if (slug.includes("faq") || slug.includes("question")) {
    return `    <!-- SECTION:faq -->
    <section class="section${slug.includes("faq") ? " alt" : ""}" id="faq">
      <div class="wrap">
        <div class="section-head"><p class="eyebrow">FAQ</p><h2>${escapeHtml(heading)}</h2></div>
        <div class="grid two">
          <details class="card"><summary>How long does it take?</summary><p class="muted">Most small sites come together in a day or two of focused work.</p></details>
          <details class="card"><summary>Can I change it later?</summary><p class="muted">Yes. The files are plain HTML, CSS and JavaScript, so any editor works.</p></details>
          <details class="card"><summary>Does it work on phones?</summary><p class="muted">Yes. The layout is responsive from 360px upward.</p></details>
          <details class="card"><summary>Where is the data kept?</summary><p class="muted">This demo keeps everything in the browser's local storage.</p></details>
        </div>
      </div>
    </section>
    <!-- /SECTION -->`;
  }
  if (slug.includes("testimon")) {
    return `    <!-- SECTION:testimonials -->
    <section class="section" id="testimonials">
      <div class="wrap">
        <div class="section-head"><p class="eyebrow">Kind words</p><h2>${escapeHtml(heading)}</h2></div>
        <div class="grid three">
          <blockquote class="card"><p>“Fast, clear, and no drama. Exactly what we needed.”</p><p class="muted">— Mina, Harbour</p></blockquote>
          <blockquote class="card"><p>“The site sounds like us, which is rarer than it should be.”</p><p class="muted">— Ali, Crumb</p></blockquote>
          <blockquote class="card"><p>“Shipped on time and still easy to edit months later.”</p><p class="muted">— Jo, Orbit</p></blockquote>
        </div>
      </div>
    </section>
    <!-- /SECTION -->`;
  }
  if (slug.includes("gallery") || slug.includes("work")) {
    return `    <!-- SECTION:gallery -->
    <section class="section alt" id="gallery">
      <div class="wrap">
        <div class="section-head"><p class="eyebrow">Gallery</p><h2>${escapeHtml(heading)}</h2></div>
        <div class="grid three">
          <div class="work-card c1"><h3>Harbour</h3><p>Hospitality</p></div>
          <div class="work-card c2"><h3>Crumb</h3><p>Food and drink</p></div>
          <div class="work-card c3"><h3>Orbit</h3><p>Software</p></div>
          <div class="work-card c4"><h3>Stem</h3><p>Editorial</p></div>
          <div class="work-card c5"><h3>Signal</h3><p>Research</p></div>
          <div class="work-card c6"><h3>Field</h3><p>Photography</p></div>
        </div>
      </div>
    </section>
    <!-- /SECTION -->`;
  }
  if (slug.includes("stat")) {
    return `    <!-- SECTION:stats -->
    <section class="section alt" id="stats">
      <div class="wrap">
        <div class="section-head"><p class="eyebrow">By the numbers</p><h2>${escapeHtml(heading)}</h2></div>
        <div class="stat-grid">
          <div class="stat"><span>Projects</span><strong>24</strong></div>
          <div class="stat"><span>Years</span><strong>8</strong></div>
          <div class="stat"><span>Repeat clients</span><strong>92%</strong></div>
          <div class="stat"><span>Response time</span><strong>&lt; 1 day</strong></div>
        </div>
      </div>
    </section>
    <!-- /SECTION -->`;
  }
  if (slug.includes("contact")) return contactSection();
  if (slug === "about") {
    return `    <!-- SECTION:about -->
    <section class="section" id="about">
      <div class="wrap grid two">
        <div><p class="eyebrow">About</p><h2>${escapeHtml(heading)}</h2><p class="muted">${escapeHtml(intro)}</p></div>
        <div class="card"><h3>How we work</h3><p class="muted">Small steps, visible progress, and plain language at every stage.</p></div>
      </div>
    </section>
    <!-- /SECTION -->`;
  }
  return `    <!-- SECTION:${slug || "features"} -->
    <section class="section" id="${slug || "features"}">
      <div class="wrap">
        <div class="section-head"><p class="eyebrow">${escapeHtml(titleCase(name))}</p><h2>${escapeHtml(heading)}</h2><p class="muted">${escapeHtml(intro)}</p></div>
        <div class="grid three">
          <article class="card"><h3>Clear by default</h3><p>Every label says what it does and every action has a visible result.</p></article>
          <article class="card"><h3>Small on purpose</h3><p>No unnecessary libraries, no hidden build step, no surprise bundle.</p></article>
          <article class="card"><h3>Easy to extend</h3><p>The markup is readable, the styles are named, and the script is one file.</p></article>
        </div>
      </div>
    </section>
    <!-- /SECTION -->`;
}

type EditResult = {
  replies: string;
  writes: Array<{ path: string; content: string }>;
};

function applyEdit(prompt: string, files: ProjectFile[]): EditResult | null {
  const map = fileMap(files);
  const html = map.get("index.html");
  if (!html) return null;
  let css = map.get("styles.css") ?? "";
  const changes: string[] = [];

  if (/\b(rename|call it|name it|change the name|change the title)\b/i.test(prompt)) {
    const match = prompt.match(
      /\b(?:rename(?: it| the (?:site|app|project))?(?: to)?|call it|name it|change the name to|change the title to)\s+["“']?([A-Za-z0-9][A-Za-z0-9 '&.-]{1,50})["”']?/i,
    );
    if (match) {
      const next = match[1].replace(/[.!?]+$/, "").trim();
      const title = titleCase(next);
      const updated = html
        .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
        .replace(/(<span id="brand-name">)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(title)}$2`);
      changes.push(`renamed the site to “${title}”`);
      return {
        replies: `Renamed the site to “${title}”. The tab title and the header brand both use it.`,
        writes: [{ path: "index.html", content: updated }],
      };
    }
  }

  if (/\b(dark mode|light mode|theme toggle|toggle theme)\b/i.test(prompt)) {
    if (html.includes('id="theme-toggle"')) {
      return {
        replies:
          "This project already has a light/dark toggle in the header: the Theme button stores the choice in localStorage. Press it in the preview to switch.",
        writes: [],
      };
    }
  }

  const taller = /\b(taller|bigger|more space|more padding)\b/i.test(prompt) && /\bhero\b/i.test(prompt);
  const shorter = /\b(shorter|smaller|less space|less padding)\b/i.test(prompt) && /\bhero\b/i.test(prompt);
  if (taller || shorter) {
    const next = taller ? "clamp(104px, 15vw, 176px)" : "clamp(36px, 5vw, 64px)";
    if (/--hero-pad:\s*[^;]+;/.test(css)) {
      css = css.replace(/--hero-pad:\s*[^;]+;/, `--hero-pad: ${next};`);
    } else {
      css += `\n.hero { padding: ${next} 0; }\n`;
    }
    changes.push(`made the hero ${taller ? "taller" : "shorter"}`);
    return {
      replies: `Made the hero ${taller ? "taller" : "shorter"} by changing the shared spacing variable. The rest of the layout keeps its rhythm.`,
      writes: [{ path: "styles.css", content: css }],
    };
  }

  if (/\b(font|typeface|typography)\b/i.test(prompt) && /\b(change|make|use|switch|set)\b/i.test(prompt)) {
    const stack = /\bmono/.test(prompt)
      ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
      : /\bserif\b/.test(prompt)
        ? '"Fraunces", Georgia, serif'
        : /\b(sans|grotesk|modern)\b/.test(prompt)
          ? '"Inter", system-ui, sans-serif'
          : null;
    if (stack) {
      if (/--font-display:\s*[^;]+;/.test(css)) {
        css = css.replace(/--font-display:\s*[^;]+;/, `--font-display: ${stack};`);
      } else {
        css += `\nh1, h2, h3 { font-family: ${stack}; }\n`;
      }
      return {
        replies: "Switched the display typeface. Body text stays on the readable sans stack.",
        writes: [{ path: "styles.css", content: css }],
      };
    }
  }

  const color = colorFor(prompt);
  if (color && /\b(color|colour|accent|palette|theme)\b/i.test(prompt)) {
    if (/--accent:\s*[^;]+;/.test(css)) {
      css = css.replace(/--accent:\s*[^;]+;/, `--accent: ${color.hex};`);
      css = css.replace(
        /--accent-ink:\s*[^;]+;/,
        `--accent-ink: ${color.name === "gold" ? "#14161a" : "#ffffff"};`,
      );
    } else {
      css += `\n:root { --accent: ${color.hex}; --accent-ink: #ffffff; }\n`;
    }
    return {
      replies: `Changed the accent colour to ${color.name}. Buttons, links, focus rings and small highlights all read the same variable.`,
      writes: [{ path: "styles.css", content: css }],
    };
  }

  const removeMatch = prompt.match(
    /\b(?:remove|delete|drop)\s+(?:the\s+)?([a-z][a-z -]{2,30}?)\s+section\b/i,
  );
  if (removeMatch) {
    const name = removeMatch[1].trim().toLowerCase();
    const slug = name.replace(/[^a-z0-9]+/g, "-");
    const pattern = new RegExp(
      `\\n?\\s*<!-- SECTION:${slug} -->[\\s\\S]*?<!-- /SECTION -->\\n?`,
      "i",
    );
    if (pattern.test(html)) {
      return {
        replies: `Removed the ${name} section and its markup. Nothing else moved.`,
        writes: [{ path: "index.html", content: html.replace(pattern, "\n") }],
      };
    }
    return {
      replies: `I could not find a marked “${name}” section in this project. Sections I add are wrapped in markers, so I can remove those reliably; an older section has to be edited in a real model.`,
      writes: [],
    };
  }

  const addMatch = prompt.match(
    /\b(?:add|include|insert)\s+(?:a|an|the)?\s*([a-z][a-z -]{2,30}?)\s+section\b/i,
  );
  const namedSection = /\b(pricing|faq|testimonials?|gallery|stats|contact|about|features?|team|services?)\b/i.exec(
    prompt,
  )?.[1];
  if (addMatch || (namedSection && /\badd\b/i.test(prompt))) {
    const rawName = (addMatch?.[1] ?? namedSection ?? "features").trim();
    const name = rawName.toLowerCase();
    const heading = name.includes("pricing")
      ? "Plans that match the work"
      : name.includes("faq")
        ? "Questions people actually ask"
        : name.includes("testimon")
          ? "What clients say"
          : name.includes("gallery") || name.includes("work")
            ? "A few recent pieces"
            : name.includes("stat")
              ? "The short version"
              : name.includes("contact")
                ? "Say hello"
                : name.includes("about")
                  ? "The story so far"
                  : name.includes("team")
                    ? "The people behind it"
                    : name.includes("service")
                      ? "What we do"
                      : titleCase(name);
    const subject = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? "";
    const block = sectionBlock(name, heading, subject);
    if (html.includes(`<!-- SECTION:${name.replace(/[^a-z0-9]+/g, "-")} -->`)) {
      return {
        replies: `The ${name} section is already on the page. I left it alone rather than duplicating it.`,
        writes: [],
      };
    }
    const updated = html.includes("</main>")
      ? html.replace("</main>", `${block}\n  </main>`)
      : html.replace("</body>", `${block}\n</body>`);
    return {
      replies: `Added a ${name} section to the page, using the existing card and spacing styles so it fits the rest of the design.`,
      writes: [{ path: "index.html", content: updated }],
    };
  }

  if (/\b(responsive|mobile|phone)\b/i.test(prompt) && /\b(make|more|better|fix)\b/i.test(prompt)) {
    if (/@media\s*\(max-width:\s*520px\)/.test(css)) {
      return {
        replies:
          "It is already responsive: there are breakpoints at 860px and 520px, the hero collapses to one column, and grids become single-column on phones. Resize the preview to check.",
        writes: [],
      };
    }
    css += `\n@media (max-width: 520px) {\n  h1 { font-size: 2.2rem; }\n  .grid, .grid.two, .grid.three { grid-template-columns: 1fr; }\n  .section { padding: 48px 0; }\n}\n`;
    return {
      replies: "Added a phone breakpoint: single-column grids, smaller headings and tighter section spacing below 520px.",
      writes: [{ path: "styles.css", content: css }],
    };
  }

  if (/\b(remove|delete)\b.*\b(button|link)\b/i.test(prompt)) {
    return {
      replies:
        "I can remove whole marked sections reliably, but not an individual button or link: I would be guessing which handler belongs to it. Ask for the section by name, or switch to a real model for surgical edits.",
      writes: [],
    };
  }

  // A broad but safe edit: append a short update section rather than silently
  // rewriting a project the user already likes.
  if (/\b(add|include|append)\b/i.test(prompt) && /\b(content|text|copy|paragraph|note)\b/i.test(prompt)) {
    const subject = extractSubject(prompt) || "an update";
    const block = sectionBlock("update", titleCase(subject), "");
    return {
      replies: "Added a short update section at the end of the page, keeping the existing visual language.",
      writes: [
        {
          path: "index.html",
          content: html.replace("</main>", `${block}\n  </main>`),
        },
      ],
    };
  }

  return {
    replies: [
      `I can edit this project, but this request is outside my written rules. I am a hard-coded assistant, not a model, so I would rather say that than pretend to understand.`,
      "",
      "In Build mode I can: add a pricing, FAQ, testimonials, gallery, stats, contact or about section; remove a section I added; change the accent colour; rename the site; make the hero taller or shorter; switch the font; add a phone breakpoint. Ask for one of those, or switch to a real model for anything more open-ended.",
      changes.length > 0 ? `This turn did: ${changes.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    writes: [],
  };
}

/* ------------------------------------------------------------------ */
/* Main turn                                                           */
/* ------------------------------------------------------------------ */

function toolCall(name: string, args: Record<string, unknown>, index: number): HardcodedToolCall {
  return {
    id: `hc_${Date.now()}_${index}`,
    name,
    arguments: JSON.stringify(args),
  };
}

function streamText(text: string, onText?: (delta: string) => void): void {
  if (!onText || !text) return;
  const parts = text.match(/\S+\s*/g) ?? [text];
  for (const part of parts) onText(part);
}

function summaryFor(
  kind: AppKind,
  files: Array<{ path: string; content: string }>,
  edited: boolean,
): string {
  const name = KIND_LABEL[kind];
  if (edited) {
    return `Updated the project (${files.map((file) => file.path).join(", ")}). Reload the preview to see it.`;
  }
  const extras: Record<AppKind, string> = {
    landing:
      "It has a hero, feature cards, pricing and a contact form, plus a working light/dark toggle and a phone layout.",
    portfolio: "It has a work grid, an about section and a contact form, with the same theme toggle and responsive layout.",
    blog: "It has filterable article cards and a newsletter form, all in plain HTML, CSS and JavaScript.",
    dashboard: "It has four stat cards, a range switcher that redraws the bar chart, and an activity table.",
    todo: "Tasks are added, checked off, deleted and cleared, and everything is saved to localStorage.",
    notes: "Notes are saved to localStorage, newest first, and each one can be deleted.",
    calculator: "The keypad works with +, −, ×, ÷, %, clear and backspace, and it parses the expression itself.",
    timer: "It has 5, 15 and 25 minute presets, start, pause and reset, and it counts down in the tab.",
    quiz: "Five questions, immediate right/wrong feedback, a running score and a restart at the end.",
    expense: "Expenses are added with a category, the total updates, and rows persist in localStorage.",
    converter: "It converts length, mass, volume, time and temperature, with a swap button.",
    password: "Length and character sets are adjustable, and the copy button uses the clipboard API.",
    ttt: "You play X against a simple blocking computer, with a win check and a new-game button.",
  };
  return `Built a complete ${name}: \`index.html\`, \`styles.css\` and \`app.js\`. ${extras[kind]} Everything runs locally with no dependencies.`;
}

export function hardcodedTurn(options: {
  messages: HardcodedMessage[];
  toolNames: string[];
  onText?: (delta: string) => void;
}): HardcodedTurn {
  const { messages, toolNames, onText } = options;
  const system = messages.find((message) => message.role === "system")?.content ?? "";
  const project = parseProject(system);
  const tools = new Set(toolNames);
  const canWrite = tools.has("write_file");
  const canPlan = tools.has("blueprint");

  let lastUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") {
      lastUserIndex = index;
      break;
    }
  }
  const userText = (messages[lastUserIndex]?.content ?? "").trim();
  const after = messages.slice(lastUserIndex + 1);
  const toolMessages = after.filter((message) => message.role === "tool");
  const mode = /MODE:\s*CHAT/i.test(system) ? "chat" : /MODE:\s*PLAN/i.test(system) ? "plan" : "build";

  const finish = (text: string, calls: HardcodedToolCall[] = []): HardcodedTurn => {
    streamText(text, onText);
    return { content: text, toolCalls: calls };
  };

  if (!userText) {
    return finish(
      "I am Hard Coded Intelligence. Ask me for a site or app in Build mode, a question I might know, or “what can you do”.",
    );
  }

  /* Tool results already came back: close the turn. */
  if (toolMessages.length > 0) {
    const wrote = toolMessages.filter((message) => /^Wrote \d+ bytes to /m.test(message.content ?? ""));
    if (wrote.length > 0) {
      const kind = detectKind(userText);
      const names = wrote
        .map((message) => (message.content ?? "").match(/^Wrote \d+ bytes to (.+)\.$/m)?.[1] ?? "")
        .filter(Boolean);
      return finish(
        summaryFor(
          kind,
          names.map((path) => ({ path, content: "" })),
          !isNewBuildRequest(userText) && project.length > 0,
        ),
      );
    }
    if (/App test|PASS |FAIL /.test(toolMessages.map((message) => message.content ?? "").join("\n"))) {
      return finish(
        "The app check ran. If it reported failures, they are listed above; I fix the templates I write, but I cannot diagnose arbitrary code the way a model can.",
      );
    }
    if (mode === "plan") {
      const kind = detectKind(userText);
      return finish(
        [
          `Plan for the ${KIND_LABEL[kind]}:`,
          "",
          "1. Read the current files and keep anything the user liked.",
          "2. Replace index.html with semantic sections: header, hero, main content, footer.",
          "3. Put the visual system in styles.css: colour variables, a type scale, responsive breakpoints.",
          "4. Put behaviour in app.js with small functions and localStorage where state must persist.",
          "5. Run the app test, then fix every failure before calling it done.",
          "",
          "Switch to Build mode and I will write it, or hand this plan to a real model for a more ambitious version.",
        ].join("\n"),
      );
    }
    return finish("Done. Reload the preview to see the result.");
  }

  const lower = userText.toLowerCase();

  /* Pure conversation, regardless of mode. */
  if (/^(hi|hello|hey|yo|hiya|good (morning|afternoon|evening))\b/i.test(userText)) {
    return finish(
      pick(
        [
          "Hello. I am Hard Coded Intelligence — instant, offline, and honest about being a rulebook. Ask for a site in Build mode, or ask what I can do.",
          "Hi. I run on patterns rather than weights, so I am quick and a little literal. What are we making?",
          "Hey. Tell me what to build, or ask me a question from the list I actually know.",
        ],
        userText,
      ),
    );
  }

  if (/\b(thanks|thank you|cheers|nice work|well done)\b/i.test(userText) && userText.length < 80) {
    return finish(
      pick(
        [
          "You are welcome. Tell me what to change next and I will keep it concrete.",
          "Glad it helped. The preview is live; ask for the next change whenever you are ready.",
        ],
        userText,
      ),
    );
  }

  if (/^(bye|goodbye|see you|later|good night)\b/i.test(userText)) {
    return finish("See you. The project stays saved on this computer.");
  }

  if (/\b(who are you|what are you|what model|which model|who made you|who built you|are you (an? )?(ai|model|real|sentient|conscious|alive)|do you (have|feel) (feelings|emotions))\b/i.test(userText)) {
    return finish(identityAnswer(userText));
  }

  if (/\b(what can you do|help|capabilities|commands|what do you know|how do you work|how does this work)\b/i.test(userText) && userText.length < 120) {
    return finish(capabilitiesAnswer());
  }

  if (/\b(tell me a joke|make me laugh|say something funny|a joke)\b/i.test(userText)) {
    return finish(pick(JOKES, userText));
  }

  const projectAnswer = projectQuestion(userText, project);
  if (projectAnswer) return finish(projectAnswer);

  const time = timeAnswer(userText);
  if (time && isQuestion(userText)) return finish(time);

  const textResult = textTools(userText);
  if (textResult) return finish(textResult);

  const password = passwordAnswer(userText);
  if (password && /\b(generate|create|make|give me|suggest)\b/i.test(userText)) return finish(password);

  const random = randomAnswer(userText);
  if (random) return finish(random);

  const conversion = convertUnits(userText);
  if (conversion) return finish(conversion);

  const math = mathAnswer(userText);
  if (math) return finish(math);

  const knowledge = knowledgeAnswer(userText);
  if (knowledge) return finish(knowledge);

  if (mode === "chat") {
    if (isNewBuildRequest(userText)) {
      return finish(
        "That needs files, and Chat mode does not write any. Switch the mode button beside the composer to **Build**, then send it again and I will write the project.",
      );
    }
    return finish(
      [
        "That is outside my rulebook. I am Hard Coded Intelligence: pattern matching and written answers, not a language model, so I will not invent a reply.",
        "",
        "Try “what can you do”, ask for a build in Build mode, or switch to a hosted or on-device model for open-ended conversation.",
      ].join("\n"),
    );
  }

  if (mode === "plan") {
    const kind = detectKind(userText);
    const tasks = [
      { id: "inspect", title: "Inspect the current project", status: "active" },
      { id: "structure", title: "Write the page structure", status: "pending" },
      { id: "style", title: "Build the visual system", status: "pending" },
      { id: "behaviour", title: "Add the interactions", status: "pending" },
      { id: "test", title: "Run the app test", status: "pending" },
    ];
    const calls = canPlan ? [toolCall("blueprint", { tasks }, 0)] : [];
    return finish(
      `I would build this as a ${KIND_LABEL[kind]}: one page, a shared stylesheet and one script, then test it. The task list is open above.\n\n`,
      calls,
    );
  }

  const kind = detectKind(userText);
  const fresh = isNewBuildRequest(userText) || project.length === 0;

  if (!fresh) {
    const edit = applyEdit(userText, project);
    if (edit) {
      if (edit.writes.length === 0) return finish(edit.replies);
      const calls = edit.writes.map((file, index) =>
        toolCall("write_file", { path: file.path, content: file.content }, index),
      );
      return finish(`${edit.replies}\n\n`, calls);
    }
  }

  if (!canWrite) {
    return finish(
      "Build mode is off, so I cannot write files. Switch the mode button beside the composer to **Build** and send that again.",
    );
  }

  const site = siteFor(userText, kind);
  const files = filesFor(site);
  const tasks = [
    { id: "plan", title: `Plan the ${KIND_LABEL[kind]}`, status: "done" },
    { id: "html", title: "Write index.html", status: "active" },
    { id: "css", title: "Write styles.css", status: "pending" },
    { id: "js", title: "Write app.js", status: "pending" },
    { id: "test", title: "Run the app test", status: "pending" },
  ];
  const calls: HardcodedToolCall[] = [];
  if (canPlan) calls.push(toolCall("blueprint", { tasks }, calls.length));
  for (const file of files) {
    calls.push(
      toolCall("write_file", { path: file.path, content: file.content }, calls.length),
    );
  }

  const intro = `Building a ${KIND_LABEL[kind]} called ${site.title}. It will be three plain files — markup, styles and behaviour — with no dependencies.\n\n`;
  return finish(intro, calls);
}
