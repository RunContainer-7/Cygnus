# Cygnus

Completely free AI App Builder / VibeCoder. Use a basic agent locally, bring your own key (BYOK), or run local models. No paywalls.

Cygnus turns a prompt into a real web app: files are written into a workspace on disk, the preview reloads after every turn, and the chat remembers the conversation. It is a small, hackable version of the Dyad / bolt.diy idea.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

No API key is required to try it: the **Offline demo** provider writes a sample project through the same file tools the model uses. Open **Settings** to connect a real model.

## Models

Cygnus talks to any OpenAI-compatible chat completions endpoint with tool calling. Presets cover:

| Provider | Base URL | Default model |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-4-5` |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter | `https://openrouter.ai/api/v1` | `anthropic/claude-sonnet-4.5` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-flash` |
| Together AI | `https://api.together.ai/v1` | `Qwen/Qwen3-Coder-480B-A35B-Instruct` |
| Cerebras | `https://api.cerebras.ai/v1` | `qwen-3.8-27b` |
| Respan Gateway | `http://127.0.0.1:8787/v1` | `cygnus-agent` |
| Ollama | `http://localhost:11434/v1` | `qwen2.5-coder:7b` |
| LM Studio | `http://localhost:1234/v1` | the loaded model |
| vLLM | `http://localhost:8000/v1` | the served model |
| llama.cpp / LocalAI | `http://localhost:8080/v1` | the served model |

### Your own model or endpoint

Pick **Custom endpoint**, then paste anything into the fields:

- The base URL (`https://my-host/v1`) or the full endpoint (`https://my-host/v1/chat/completions`).
- A bare host like `my-host/v1` — Cygnus adds `https://`, or `http://` for localhost/private IPs.
- Your API key, or leave it blank for an unauthenticated local server.

**Fetch models** calls the endpoint's `/models` route and fills a picker, which is the reliable way to get local model IDs right. Local presets try this automatically when the dialog opens.

Local setup quick reference:

```bash
ollama pull qwen2.5-coder:7b && ollama serve     # http://localhost:11434/v1
vllm serve Qwen/Qwen3-Coder-30B-A3B-Instruct      # http://localhost:8000/v1
llama-server -m model.gguf --port 8080 --api      # http://localhost:8080/v1
```

LM Studio: load a model, then start the Local Server on port 1234.

Keys live in the browser's `localStorage` and are sent per request through the local server to the provider. They are never written to the project or to disk.

### Routing through Respan Gateway

[Respan Gateway](https://github.com/respanai/respan-gateway?utm_source=freebuff&utm_medium=paid&utm_campaign=respan-gateway&bfcid=bfc_1.eyJpZCI6IjE2MmI5NTZlLTk3ZTUtNDhjOC04MDQ2LTQ0MjEyMDU4ZjAwZCIsImMiOiIyMDM2ODZkZS1mMzg0LTQ4NTQtYmViNC1hYzBiYWRmNmM1NTUiLCJrIjoiM2IxMGE4YmUtNzgyOS00MmJhLWFmNmEtYmI0YWUxZTRhY2Y4IiwiaWF0IjoxNzk0MzQ0MDcwfQ.aY1SvvwKPPL5DlIkHmoQb8pGmpm5shNsQai7mgPm8zE) is an open-source LLM gateway: one OpenAI-compatible endpoint in front of your own models, with routing, fallback and a request log. Cygnus ships a loopback config for it, so the chat can fall back from LM Studio to Ollama without editing Settings again.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --only-binary=:all: -r requirements.txt   # respan-gateway==0.3.0, Python 3.10+
```

```bash
npm run gateway:check     # validate gateway.toml, start nothing
npm run gateway           # serve http://127.0.0.1:8787
```

Then open **Settings → Respan Gateway** (base URL `http://127.0.0.1:8787/v1`, model `cygnus-agent`) and press **Apply**. **Fetch models** lists `cygnus-agent` along with every model the configured servers expose, so a real model ID works too. Start LM Studio's server or `ollama serve` first; the gateway answers `/healthz` either way. `http://127.0.0.1:8787/ui/` shows the request log.

`gateway.toml` routes the alias `cygnus-agent` to LM Studio and then Ollama, each tried once with fallback to the next. To add a cloud fallback, uncomment a provider, add it to the route's `to` list, and put its key in `.env` (gitignored — the gateway reads the nearest `.env`, Cygnus reads the same file). Keys stay out of this config: `key = "env:OPENAI_API_KEY"` is only a reference. The listener stays on loopback because a keyless gateway spends your provider keys for anyone who reaches it.

Checked with a local OpenAI-compatible fixture behind a gateway route: Cygnus's `/api/chat` streamed a `write_file` tool call, wrote `index.html`, then streamed the closing answer, and the gateway logged both turns of the agent loop as `200` for model `cygnus-agent`. A live provider request was **not** verified — the check used a fixture, not real Ollama, LM Studio or cloud credentials. Run it for real with the app as usual: `npm run dev`.

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
lib/tools.ts                 write_file, read_file, list_files, delete_file
lib/workspace.ts             per-project folder, path containment, chat persistence
gateway.toml                 Respan Gateway routes: cygnus-agent -> LM Studio, then Ollama
requirements.txt             pinned respan-gateway (python3 -m respan_gateway, loopback)
workspaces/<id>/             generated index.html, styles.css, app.js, meta.json, chat.json
```

Each project is a normal folder. Open it in any editor, or delete it to start over.

## Current scope and limits

- Generated apps are static: HTML, CSS and vanilla JavaScript. No npm install, frameworks or build step yet.
- The preview iframe is same-origin with `allow-scripts`, so generated code can reach the app's own APIs. Do not run untrusted prompts against a server holding real secrets; the next step for hosting is one sandbox (container or microVM) per project.
- The agent loop is capped at 10 tool rounds per message.
- Provider tool-calling quality varies. Local 7B models work for small edits; long multi-file sessions need a stronger model.

MIT licensed.
