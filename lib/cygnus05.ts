import { readFile } from "node:fs/promises";
import path from "node:path";

type TensorMeta = {
  name: string;
  shape: number[];
  offset: number;
  bytes: number;
};

type CygnusConfig = {
  d_model: number;
  n_layer: number;
  n_head: number;
  ffn: number;
  context: number;
  vocab_size: number;
  tensors: TensorMeta[];
};

type Tensor = {
  data: Float32Array;
  shape: number[];
};

type LayerCache = {
  k: Float32Array;
  v: Float32Array;
};

export type CygnusChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type CygnusGenerateOptions = {
  maxTokens?: number;
  temperature?: number;
  topK?: number;
  repetitionPenalty?: number;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
};

const BOS = "<bos>";
const EOS = "<eos>";
const PAD = "<pad>";
const UNK = "<unk>";
const SPECIALS = new Set([BOS, EOS, PAD, UNK]);

const TOKEN_RE = /\n| +|[A-Za-z]+(?:'[A-Za-z]+)?|[0-9]+|[^\sA-Za-z0-9]/g;

export function normalizeCygnusText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[^\x00-\x7F]/g, " ")
    .replace(/ +/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function tokenizeCygnus(text: string): string[] {
  return normalizeCygnusText(text).match(TOKEN_RE) ?? [];
}

function modelDirectory(): string {
  const root = process.env.CYGNUS_APP_ROOT || process.cwd();
  return path.join(root, "public", "cygnus05");
}

class Cygnus05Model {
  private readonly config: CygnusConfig;
  private readonly vocab: string[];
  private readonly stoi: Map<string, number>;
  private readonly tensors: Map<string, Tensor>;

  private readonly d: number;
  private readonly ffn: number;
  private readonly heads: number;
  private readonly headDim: number;
  private readonly context: number;
  private readonly scale: number;

  private readonly x: Float32Array;
  private readonly norm: Float32Array;
  private readonly qkv: Float32Array;
  private readonly attention: Float32Array;
  private readonly projected: Float32Array;
  private readonly hidden: Float32Array;
  private readonly logits: Float32Array;
  private readonly scores: Float32Array;
  private readonly sampled: Float32Array;
  private readonly order: number[];

  private constructor(config: CygnusConfig, vocab: string[], weights: Float32Array) {
    this.config = config;
    this.vocab = vocab;
    this.stoi = new Map(vocab.map((token, index) => [token, index]));
    this.tensors = new Map();
    for (const meta of config.tensors) {
      const start = meta.offset / 4;
      const length = meta.bytes / 4;
      this.tensors.set(meta.name, {
        data: weights.subarray(start, start + length),
        shape: meta.shape,
      });
    }

    this.d = config.d_model;
    this.ffn = config.ffn;
    this.heads = config.n_head;
    this.headDim = this.d / this.heads;
    this.context = config.context;
    this.scale = 1 / Math.sqrt(this.headDim);

    this.x = new Float32Array(this.d);
    this.norm = new Float32Array(Math.max(this.d, this.ffn));
    this.qkv = new Float32Array(this.d * 3);
    this.attention = new Float32Array(this.d);
    this.projected = new Float32Array(Math.max(this.d, this.ffn));
    this.hidden = new Float32Array(this.ffn);
    this.logits = new Float32Array(config.vocab_size);
    this.scores = new Float32Array(this.context);
    this.sampled = new Float32Array(config.vocab_size);
    this.order = Array.from({ length: config.vocab_size }, (_, index) => index);
  }

  static async load(): Promise<Cygnus05Model> {
    const directory = modelDirectory();
    let config: CygnusConfig;
    let vocab: string[];
    let weights: Float32Array;
    try {
      const [configText, vocabText, weightBuffer] = await Promise.all([
        readFile(path.join(directory, "config.json"), "utf8"),
        readFile(path.join(directory, "vocab.json"), "utf8"),
        readFile(path.join(directory, "model.bin")),
      ]);
      config = JSON.parse(configText) as CygnusConfig;
      const parsed = JSON.parse(vocabText) as unknown;
      if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
        throw new Error("The vocabulary file is malformed.");
      }
      vocab = parsed as string[];
      const buffer = weightBuffer.buffer.slice(
        weightBuffer.byteOffset,
        weightBuffer.byteOffset + weightBuffer.byteLength,
      );
      weights = new Float32Array(buffer);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      throw new Error(
        `Cygnus 0.5 Tiny weights are missing or unreadable (${detail}). Reinstall Cygnus or retrain the model.`,
      );
    }

    if (!config || !Array.isArray(config.tensors) || !Array.isArray(vocab)) {
      throw new Error("Cygnus 0.5 Tiny has no valid model manifest.");
    }
    if (vocab.length !== config.vocab_size) {
      throw new Error("Cygnus 0.5 Tiny vocabulary does not match its config.");
    }
    return new Cygnus05Model(config, vocab, weights);
  }

  private tensor(name: string): Float32Array {
    const tensor = this.tensors.get(name);
    if (!tensor) throw new Error(`Cygnus 0.5 Tiny is missing tensor ${name}.`);
    return tensor.data;
  }

  private embed(token: number, position: number): void {
    const tokEmb = this.tensor("tok_emb");
    const posEmb = this.tensor("pos_emb");
    const d = this.d;
    const tokenBase = token * d;
    const positionBase = position * d;
    for (let index = 0; index < d; index += 1) {
      this.x[index] = tokEmb[tokenBase + index] + posEmb[positionBase + index];
    }
  }

  private layerNorm(input: Float32Array, weightName: string, biasName: string): void {
    const weight = this.tensor(weightName);
    const bias = this.tensor(biasName);
    const d = this.d;
    let mean = 0;
    for (let index = 0; index < d; index += 1) mean += input[index];
    mean /= d;
    let variance = 0;
    for (let index = 0; index < d; index += 1) {
      const delta = input[index] - mean;
      variance += delta * delta;
    }
    const inverse = 1 / Math.sqrt(variance / d + 1e-5);
    for (let index = 0; index < d; index += 1) {
      this.norm[index] = (input[index] - mean) * inverse * weight[index] + bias[index];
    }
  }

  private linear(
    input: Float32Array,
    weightName: string,
    biasName: string,
    output: Float32Array,
    outSize: number,
    inSize: number,
  ): void {
    const weight = this.tensor(weightName);
    const bias = this.tensor(biasName);
    for (let out = 0; out < outSize; out += 1) {
      const row = out * inSize;
      let sum = bias[out];
      for (let index = 0; index < inSize; index += 1) {
        sum += weight[row + index] * input[index];
      }
      output[out] = sum;
    }
  }

  private gelu(values: Float32Array, length: number): void {
    const root = Math.sqrt(2 / Math.PI);
    for (let index = 0; index < length; index += 1) {
      const value = values[index];
      values[index] =
        0.5 * value * (1 + Math.tanh(root * (value + 0.044715 * value * value * value)));
    }
  }

  private forward(token: number, position: number, caches: LayerCache[], needLogits: boolean): void {
    const d = this.d;
    const heads = this.heads;
    const headDim = this.headDim;
    const context = this.context;
    this.embed(token, position);

    for (let layer = 0; layer < this.config.n_layer; layer += 1) {
      const prefix = `layer${layer}.`;
      const cache = caches[layer];
      this.layerNorm(this.x, `${prefix}ln1_g`, `${prefix}ln1_b`);
      this.linear(this.norm, `${prefix}wqkv`, `${prefix}bqkv`, this.qkv, d * 3, d);

      const keyBase = position * d;
      for (let index = 0; index < d; index += 1) {
        cache.k[keyBase + index] = this.qkv[d + index];
        cache.v[keyBase + index] = this.qkv[d * 2 + index];
      }

      for (let head = 0; head < heads; head += 1) {
        const headBase = head * headDim;
        for (let at = 0; at <= position; at += 1) {
          const cacheBase = at * d + headBase;
          let score = 0;
          for (let index = 0; index < headDim; index += 1) {
            score += this.qkv[headBase + index] * cache.k[cacheBase + index];
          }
          this.scores[at] = score * this.scale;
        }

        let max = -Infinity;
        for (let at = 0; at <= position; at += 1) {
          if (this.scores[at] > max) max = this.scores[at];
        }
        let total = 0;
        for (let at = 0; at <= position; at += 1) {
          const value = Math.exp(this.scores[at] - max);
          this.scores[at] = value;
          total += value;
        }
        const inverse = 1 / total;
        for (let at = 0; at <= position; at += 1) this.scores[at] *= inverse;

        for (let index = 0; index < headDim; index += 1) {
          let sum = 0;
          for (let at = 0; at <= position; at += 1) {
            sum += this.scores[at] * cache.v[at * d + headBase + index];
          }
          this.attention[headBase + index] = sum;
        }
      }

      this.linear(this.attention, `${prefix}wo`, `${prefix}bo`, this.projected, d, d);
      for (let index = 0; index < d; index += 1) this.x[index] += this.projected[index];

      this.layerNorm(this.x, `${prefix}ln2_g`, `${prefix}ln2_b`);
      this.linear(this.norm, `${prefix}w1`, `${prefix}b1`, this.hidden, this.ffn, d);
      this.gelu(this.hidden, this.ffn);
      this.linear(this.hidden, `${prefix}w2`, `${prefix}b2`, this.projected, d, this.ffn);
      for (let index = 0; index < d; index += 1) this.x[index] += this.projected[index];
    }

    if (!needLogits) return;

    this.layerNorm(this.x, "lnf_g", "lnf_b");
    const tokEmb = this.tensor("tok_emb");
    const vocabSize = this.config.vocab_size;
    for (let tokenIndex = 0; tokenIndex < vocabSize; tokenIndex += 1) {
      const row = tokenIndex * d;
      let sum = 0;
      for (let index = 0; index < d; index += 1) {
        sum += tokEmb[row + index] * this.norm[index];
      }
      this.logits[tokenIndex] = sum;
    }
  }

  private sample(
    recent: number[],
    temperature: number,
    topK: number,
    repetitionPenalty: number,
  ): number {
    const vocabSize = this.config.vocab_size;
    for (let index = 0; index < vocabSize; index += 1) {
      this.sampled[index] = this.logits[index] / temperature;
    }

    const seen = new Set<number>();
    for (let index = Math.max(0, recent.length - 24); index < recent.length; index += 1) {
      const token = recent[index];
      if (seen.has(token)) continue;
      seen.add(token);
      const value = this.sampled[token];
      this.sampled[token] = value > 0 ? value / repetitionPenalty : value * repetitionPenalty;
    }

    this.order.sort((left, right) => this.sampled[right] - this.sampled[left]);
    const limit = Math.max(1, Math.min(topK, vocabSize));
    let max = this.sampled[this.order[0]];
    let total = 0;
    for (let index = 0; index < limit; index += 1) {
      const token = this.order[index];
      const value = Math.exp(this.sampled[token] - max);
      this.sampled[token] = value;
      total += value;
    }

    let pick = Math.random() * total;
    for (let index = 0; index < limit; index += 1) {
      const token = this.order[index];
      pick -= this.sampled[token];
      if (pick <= 0) return token;
    }
    return this.order[0];
  }

  async generate(prompt: string, options: CygnusGenerateOptions = {}): Promise<string> {
    const maxTokens = Math.max(1, Math.min(options.maxTokens ?? 72, 160));
    const temperature = Math.max(0.1, Math.min(options.temperature ?? 0.85, 1.5));
    const topK = Math.max(1, Math.min(options.topK ?? 40, this.config.vocab_size));
    const repetitionPenalty = Math.max(1, Math.min(options.repetitionPenalty ?? 1.12, 2));

    const promptTokens = tokenizeCygnus(prompt);
    const ids: number[] = [this.stoi.get(BOS) ?? 0];
    const unknown = this.stoi.get(UNK) ?? 0;
    for (const token of promptTokens) ids.push(this.stoi.get(token) ?? unknown);
    // Keep room for at least a short reply even when the chat prefix is long.
    const input = ids.slice(-(this.context - 24));

    const caches: LayerCache[] = Array.from({ length: this.config.n_layer }, () => ({
      k: new Float32Array(this.context * this.d),
      v: new Float32Array(this.context * this.d),
    }));

    let position = 0;
    for (; position < input.length; position += 1) {
      this.forward(input[position], position, caches, position === input.length - 1);
    }
    position = input.length - 1;

    const recent = input.slice(-24);
    let next = this.sample(recent, temperature, topK, repetitionPenalty);
    let output = "";

    for (let step = 0; step < maxTokens; step += 1) {
      if (options.signal?.aborted) break;
      if (next === (this.stoi.get(EOS) ?? -1)) break;
      const token = this.vocab[next] ?? "";
      if (!SPECIALS.has(token)) {
        const tentative = output + token;
        if (tentative.includes("\nUser:") || tentative.includes("\nCygnus:")) break;
        output = tentative;
        options.onToken?.(token);
      }
      recent.push(next);
      if (position + 1 >= this.context) break;
      position += 1;
      this.forward(next, position, caches, true);
      next = this.sample(recent, temperature, topK, repetitionPenalty);
      // Let the HTTP stream flush instead of blocking the event loop for the
      // whole generation. This also makes Stop responsive between tokens.
      if (step % 4 === 3) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    return output;
  }
}

let cached: Promise<Cygnus05Model> | null = null;

export function loadCygnus05(): Promise<Cygnus05Model> {
  if (!cached) {
    cached = Cygnus05Model.load().catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

export function buildCygnusPrompt(turns: CygnusChatTurn[]): string {
  const lines: string[] = [];
  for (const turn of turns.slice(-4)) {
    const content = turn.content.trim().replace(/\s+/g, " ").slice(0, 400);
    if (!content) continue;
    lines.push(`${turn.role === "user" ? "User" : "Cygnus"}: ${content}`);
  }
  lines.push("Cygnus:");
  return lines.join("\n");
}

export function cleanCygnusOutput(text: string): string {
  let value = text
    .replace(/<\|?[^>]*?\|?>/g, "")
    .replace(/<(?:pad|bos|eos|unk)>/gi, "")
    .replace(/\r/g, "")
    .trim();
  const cut = value.search(/\nUser:|\nCygnus:/);
  if (cut >= 0) value = value.slice(0, cut).trim();
  if (/^Cygnus:\s*/i.test(value)) value = value.replace(/^Cygnus:\s*/i, "").trim();
  return value;
}

export async function streamCygnusChat(options: {
  turns: CygnusChatTurn[];
  signal?: AbortSignal;
  onText?: (delta: string) => void;
  maxTokens?: number;
}): Promise<{ text: string; raw: string }> {
  const model = await loadCygnus05();
  const prompt = buildCygnusPrompt(options.turns);
  let raw = "";
  let started = false;
  await model.generate(prompt, {
    maxTokens: options.maxTokens ?? 64,
    // Greedy decoding (temperature 0.02, top-k 3) makes a small model lock onto
    // one phrase and repeat it. A moderate sample plus a repetition penalty is
    // far more readable at this size.
    temperature: 0.8,
    topK: 40,
    repetitionPenalty: 1.12,
    signal: options.signal,
    onToken: (token) => {
      raw += token;
      if (!started) {
        if (!token.trim()) return;
        started = true;
      }
      options.onText?.(token);
    },
  });
  return { text: cleanCygnusOutput(raw), raw };
}
