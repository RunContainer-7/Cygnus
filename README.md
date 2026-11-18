# Cygnus

Completely free AI App Builder / VibeCoder. Start on a hosted open-weight model with no key, run a local model, or bring your own key (BYOK). No paywalls.

Cygnus turns a prompt into a real web app: files are written into a workspace on disk, the preview reloads after every turn, and the chat remembers the conversation. It is a small, hackable version of the Dyad / bolt.diy idea.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. It starts on **Nemotron 3.5 Lightning**, a hosted open-weight model that needs no key.

## Download for Windows

The latest published installer release is **[v0.1.7](https://github.com/RunContainer-7/Cygnus/releases/tag/v0.1.7)**.

- [Cygnus-Setup-0.1.7.exe](https://github.com/RunContainer-7/Cygnus/releases/download/v0.1.7/Cygnus-Setup-0.1.7.exe) — installer with Start Menu and desktop shortcuts.
- [Cygnus-Portable-0.1.7.exe](https://github.com/RunContainer-7/Cygnus/releases/download/v0.1.7/Cygnus-Portable-0.1.7.exe) — portable build that runs without installing.
- [SHA256SUMS.txt](https://github.com/RunContainer-7/Cygnus/releases/download/v0.1.7/SHA256SUMS.txt) — checksums for both downloads.

Installed v0.1.1 and later copies check GitHub Releases on launch and show an in-app update button; updates download and restart in place. Portable builds show a download link instead. The earlier v0.1.0 installers do not include the updater, so updating from v0.1.0 requires this one manual install.

Run the installer and choose a folder. Cygnus bundles its own local server, so Node.js, a terminal and a separate dev server are not required. Projects live in `%APPDATA%\Cygnus\workspaces`; uninstalling keeps them. The build is unsigned, so Windows SmartScreen may ask you to confirm before running it.

### Build it yourself

Build the desktop app with:

```bash
npm install
npm run dist
```

That produces the installers plus update metadata in `release/`:

- `Cygnus-Setup-0.1.7.exe` — a normal setup wizard with Start menu and desktop shortcuts.
- `Cygnus-Portable-0.1.7.exe` — runs without installing anything.
- `latest.yml` — the update feed consumed by installed copies.

Rebuild the installer after changes to package a new version.

No API key is required to try it. New installs start on the free **Nemotron 3.5 Lightning** model; the **Offline demo** is still available in Settings and writes a sample project without any model call. Choose free cloud or on-device open-source models from the composer picker, and open **Settings** for Ollama, LM Studio, or BYOK connections.

## Publishing

Open **Publish** in the preview toolbar.

- **Download .zip** always works: it packages the project's own files (never the chat history or project metadata) so you can host them anywhere.
- **Cloudflare Pages** publishes into your own free Cloudflare account. Create an API token with *Account → Cloudflare Pages → Edit*, connect it once, and Cygnus uploads directly to Cloudflare. You get a `name.pages.dev` address; no credit card is needed and static bandwidth is free. Republish after changes, or take the site offline from the same panel.

Cygnus never holds a shared hosting account, so your quota, address, and bill stay yours.

## Models

Cygnus has three lanes in the composer picker:

| Lane | Key | What it is |
| --- | --- | --- |
| **Open source** | None | Eighteen open-weight models run on this PC's CPU/GPU, plus seven free cloud models and the experimental Cygnus 0.5. On-device code and prompts stay local. |
| **Local** | None | Connect Ollama or LM Studio only. Uses the model already loaded there. Private, offline-capable. |
| **BYOK** | Your key | Paste one key; Cygnus detects the provider and picks a coding model. No model list to maintain. |

### Free cloud · no key

Hosted models run through [Kilo AI Gateway](https://ai-gateway.kilo.ai)'s anonymous free tier (about 200 requests/hour per IP). They are open-weight models, but the capacity is shared: if a model is busy, choose another hosted model, wait, or switch to Local/BYOK.

| Model | Tier | Notes |
| --- | --- | --- |
| LFM 3 1.7B | Low | Tiny and quick for small edits. |
| Nemotron 3.5 Lightning | Balanced | 30B agent; the default for multi-file builds. |
| North Mini Code | Balanced | Cohere's Apache-2.0 30B coding agent. Fast single-file edits. |
| Nemotron 3 Nano Omni 30B | Balanced | 30B open-weight reasoning model with a 256K context. |
| Nemotron 3 Ultra 550B | Max | Slower 550B reasoning model for long builds. |
| Nemotron 3.5 Super VL | Max | Multimodal 1M-context NVIDIA agent; slower. |
| ERNIE 5.5 Flash 280B | Max | 280B MoE with a 1M context; preview capacity. |

Hosted prompts may be logged by the upstream provider. Use **Open source → On this PC** for private code.

Claude and Grok are not in the no-key lane: the gateway requires a signed-in key for those routes. Claude works through **BYOK**; Grok works through **Custom endpoint** with an xAI key.

### Agent tools

Every tool-capable model gets the same tool set. The interface shows a compact activity line while a tool runs, then a result chip; the assistant's own reply stays separate from tool narration. The agent keeps iterating (up to 24 rounds per message). Cygnus 0.5 is the exception: it is an experimental chat-only model and does not call tools.

| Tool | What it does |
| --- | --- |
| `write_file`, `read_file`, `list_files`, `search_files`, `delete_file` | Inspect and edit the project. `search_files` finds text with line numbers. |
| `blueprint` | Creates or updates the visible task list, with one active task and ticked-off completed tasks. |
| `spawn_agents` | Brings in `web_researcher` (searches the web and reads pages), `expert` (diagnoses a stuck or looping agent), or `catalyst` (returns a fast, code-ready plan). |
| `nested_reasoning` | Adds a visible layer of reasoning inside reasoning. There is no fixed nesting limit in the transcript; each call is one tool round. |
| `test_app` | Checks index.html, local asset references, JS syntax, CSS blocks, placeholders, and the preview route. |
| `fetch_url` | Reads a specific public documentation page. Private and local addresses are blocked. |
| `user_ask` | Pauses the chat and asks one focused question. The same stream resumes automatically after the user answers. |

Web research sends the query to DuckDuckGo and reads the top public pages. Tool calls are shown as chips in the chat and in the Console panel.

### On-device open source · no key, no request limit

Pick one of these in **Open source → On this PC**. Cygnus installs a standalone Ollama runtime on first use (about 1.5 GB), then downloads the model. Everything runs on the local CPU/GPU; prompts and code never leave the machine. Speed depends on the hardware, and models that exceed the machine's RAM are disabled in the picker.

| Family | Model | Tag | Download | Minimum RAM |
| --- | --- | --- | --- | --- |
| Qwen | Qwen3 4B | `qwen3:4b` | 2.5 GB | 6 GB |
| Essential | Rnj-1 8B | `rnj-1:8b` | 5.1 GB | 7 GB |
| DeepSeek | DeepSeek R1 7B | `deepseek-r1:7b` | 4.7 GB | 7 GB |
| GLM | GLM 4.7 Flash | `glm-4.7-flash:q4_K_M` | 19 GB | 24 GB |
| MiMo | MiMo 2.6 9B | `mimo-v2.6:9b` | 6.6 GB | 10 GB |
| MiniMax | MiniMax M2.5 | `hf.co/unsloth/MiniMax-M2.5-GGUF:UD-Q4_K_XL` | 131 GB | 160 GB |
| Gemma | Gemma 4 E2B | `gemma4:e2b` | 4.6 GB | 6 GB |
| Phi | Phi-4 mini | `phi4-mini:3.8b` | 2.5 GB | 4 GB |
| Llama | Llama 3.1 8B | `llama3.1:8b` | 4.9 GB | 7 GB |
| OpenAI | GPT-OSS 20B | `gpt-oss:20b` | 14 GB | 16 GB |
| Kimi | Kimi Linear 48B | `hf.co/DhruvalLabs/Kimi-Linear-48B-A3B-Instruct-GGUF:Q4_K_M` | 27.7 GB | 32 GB |
| Solar | Solar 10.7B | `solar:10.7b` | 6.1 GB | 8 GB |
| Reflection | Beam 1.0 501B | `hf.co/unsloth/Beam-1.0-501B-A23B-GGUF:UD-Q2_K_XL` | ~150 GB | 192 GB |
| Muse | Muse Glimmer 30B | `muse-glimmer:latest` | 18 GB | 24 GB |
| Muse | Muse Spark Open | `hf.co/ggml-org/Muse-Spark-Open-816B-A42B-GGUF:Q2_K` | 304 GB | 384 GB |
| olmOCR | olmOCR 2 7B | `hf.co/lmstudio-community/olmOCR-2-7B-1025-GGUF:Q4_K_M` | 5.7 GB | 8 GB |
| Granite | Granite 4 Micro | `granite4:micro` | 2.1 GB | 4 GB |

Agent models are tool-capable. Solar 10.7B is the 2023 open-weight checkpoint: chat-only, 4K context, and no native tool calling. Upstage's tool-capable Solar Pro 3/4 are hosted API models, not this checkpoint. olmOCR is OCR-only, so both are listed but disabled for app builds. Models that exceed the machine's RAM are also disabled. Llama is open-weight under Meta's community license, not OSI-approved; Solar's instruct weights are non-commercial; Muse Spark uses the Muse Model License; RNJ-1, Muse Glimmer and Beam are Apache-2.0; the rest are Apache-2.0 or MIT. The engine and model store live in the app's user-data folder; delete a model to reclaim the disk space.

### Cygnus Labs · experimental

Cygnus 0.5 is a from-scratch model, not a downloaded checkpoint. It started from random weights and was trained on this machine with `training/cygnus05/train.py`: a 4-layer, 256-wide, word-level transformer with **5.29M parameters** and a 128-token context. Pretraining used TinyStories plus Shakespeare; a short SFT pass taught the `User:` / `Cygnus:` chat format.

Pick **Cygnus 0.5** under **Cygnus Labs** in the composer picker. It runs in the local server, streams from `public/cygnus05`, needs no key, and never leaves the machine. It is **chat only**: it cannot edit files, call tools, browse, or remember long conversations. It is slow on CPU and often wrong. It is marked **not recommended** and exists to make the from-scratch path visible and testable, not to build real apps.

To retrain it, put the corpora in `training/data` and run:

```bash
python training/cygnus05/train.py --steps 1400 --sft-steps 220
```

The script writes `public/cygnus05/config.json`, `vocab.json` and `model.bin`.

### BYOK and local endpoints

BYOK is one box in the composer picker: paste a key, and Cygnus calls the provider's `/models` route, identifies the provider, and selects a strong coding model. There is no preset model list to keep in sync.

| Key prefix | Provider | Example default |
| --- | --- | --- |
| `sk-ant-` | Anthropic | `claude-sonnet-4-5` |
| `sk-or-` | OpenRouter | `anthropic/claude-sonnet-4.5` |
| `gsk_` | Groq | `llama-3.3-70b-versatile` |
| `csk-` | Cerebras | `qwen-3.8-27b` |
| `AIza` | Google Gemini | `gemini-2.5-flash` |
| `sk-proj-` / `sk-` | OpenAI, DeepSeek, or Together | the provider's preferred model |
| 40+ hex characters | Together AI | `Qwen/Qwen3-Coder-480B-A35B-Instruct` |

Keys live in this browser's `localStorage` and are sent only to the detected provider. **Custom endpoint** accepts any OpenAI-compatible URL with tool calling.

| Local runtime | Base URL | Default model |
| --- | --- | --- |
| Ollama | `http://localhost:11434/v1` | `qwen3:4b` |
| LM Studio | `http://localhost:1234/v1` | the loaded model |

### Your own model or endpoint

Pick **Custom endpoint**, then paste anything into the fields:

- The base URL (`https://my-host/v1`) or the full endpoint (`https://my-host/v1/chat/completions`).
- A bare host like `my-host/v1` — Cygnus adds `https://`, or `http://` for localhost/private IPs.
- Your API key, or leave it blank for an unauthenticated local server.

**Fetch models** calls the endpoint's `/models` route and fills a picker, which is the reliable way to get local model IDs right. Local presets try this automatically when the dialog opens.

Local setup quick reference:

```bash
ollama pull qwen3:4b && ollama serve              # http://localhost:11434/v1
```

LM Studio: load a model, then start the Local Server on port 1234.

Keys live in the browser's `localStorage` and are sent per request through the local server to the provider. They are never written to the project or to disk.


## How it works

```
app/page.tsx                 landing page + constellation canvas
app/build/[id]/page.tsx      workspace shell
components/Builder.tsx       chat stream, preview, files, settings
app/api/chat/route.ts        agent loop (model turn → tools → next turn) over SSE
app/api/preview/[id]/...     serves the generated project to the iframe
lib/endpoints.ts             pasted-endpoint normalization + local host detection
app/api/models/route.ts      model discovery from any endpoint
lib/llm.ts                   OpenAI-compatible streaming + tool-call assembly
lib/tools.ts                 agent tools + dispatch (files, web, blueprint, sub-agents, test)
lib/subagents.ts             web researcher, expert, and catalyst sub-agents
lib/appTest.ts               static app checks + preview route smoke test
lib/workspace.ts             per-project folder, path containment, chat persistence
lib/localEngine.ts           managed Ollama install, model pulls, engine status
app/api/opensource/route.ts  on-device status + NDJSON download progress
lib/openSource.ts            fourteen on-device open-weight model catalog
lib/byok.ts                  key-prefix detection + provider /models probe
app/api/byok/route.ts        key -> provider/model detection
workspaces/<id>/             generated index.html, styles.css, app.js, meta.json, chat.json
```

Each project is a normal folder. Open it in any editor, or delete it to start over.

## Current scope and limits

- Generated apps are static: HTML, CSS and vanilla JavaScript. No npm install, frameworks or build step yet.
- The preview iframe is same-origin with `allow-scripts`, so generated code can reach the app's own APIs. Do not run untrusted prompts against a server holding real secrets; the next step for hosting is one sandbox (container or microVM) per project.
- The agent loop is capped at 24 tool rounds per message.
- Hosted models use shared free capacity (about 200 requests/hour per IP) and may be rate-limited or busy. They may log prompts upstream; Local keeps prompts on your machine.
- Provider tool-calling quality varies. Local 7B models work for small edits; long multi-file sessions need a stronger model.

MIT licensed.
