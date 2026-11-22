---
title: Models
description: Hosted open-weight models need no key. On-device models stay private. Local runtimes and your own API keys work too.
---

## The three lanes

The composer picker groups models by what they need:

| Lane | Key | Where it runs |
| --- | --- | --- |
| **Open source** | None | Free hosted models, or models downloaded to this PC |
| **Local** | None | Ollama or LM Studio on this machine |
| **BYOK** | Your key | Any supported provider, or a custom OpenAI-compatible endpoint |

New installs begin on **Nemotron 3.5 Lightning**, a 30B agent that needs no key.

## Free hosted models

These run through [Kilo AI Gateway](https://ai-gateway.kilo.ai)'s anonymous free tier: about **200 requests per hour per IP address**. The capacity is shared, so a model can be busy. When that happens, choose another hosted model, wait, or switch to Local.

| Model | Tier | Good for |
| --- | --- | --- |
| LFM 3 1.7B | Low | Tiny, quick edits |
| Nemotron 3.5 Lightning | Balanced | Default; multi-file builds |
| North Mini Code | Balanced | Fast single-file edits |
| Nemotron 3 Nano Omni 30B | Balanced | Reasoning with a 256K context |
| Nemotron 3 Ultra 550B | Max | Long builds; slower |
| Nemotron 3.5 Super VL | Max | Multimodal, 1M context; slower |
| ERNIE 5.5 Flash 280B | Max | 280B MoE with a 1M context; preview capacity |

### The hourly budget

Cygnus meters hosted calls against Kilo's free-tier limit: **200 requests per hour per IP address**. The counter sits in the top bar while a hosted model is selected; click it to see the reset time.

- **One call is one request to the gateway.** A Chat message is usually one call. A build spends one call per tool round — typically three to eight for a small app, up to 24 for a long one.
- **The meter is local.** Kilo exposes no remaining-quota endpoint, so Cygnus counts its own successful calls. Other apps and devices on the same public IP share the real allowance.
- **At 200, Cygnus stops before the gateway does** and tells you when the hour resets. Switch to Local or BYOK to keep working; those lanes have no hourly limit.

Hosted prompts may be logged by the upstream provider. For private code, use an on-device model.

Claude and Grok are not in the no-key lane. Claude works through BYOK; Grok works through a custom endpoint with an xAI key.

## On this PC

Pick a model under **Open source → On this PC**. Cygnus installs a standalone Ollama runtime the first time (about 1.5 GB), then downloads the model. Everything runs on your CPU or GPU; prompts and code never leave the machine.

- Models that need more RAM than the machine has are disabled in the picker.
- Speed depends entirely on your hardware.
- Delete a downloaded model from the same picker to reclaim the disk space.
- Some models are chat-only or OCR-only, and those are listed but disabled for app builds.

**Cygnus 0.5** is the dedicated local chat model: a 0.5B instruct model that needs no key and keeps every prompt on the computer. It cannot build apps; the agent models do that.

## Local runtimes

Already running Ollama or LM Studio? Choose **Local** and connect the endpoint you have.

| Runtime | Base URL | Default model |
| --- | --- | --- |
| Ollama | `http://localhost:11434/v1` | `qwen3:4b` |
| LM Studio | `http://localhost:1234/v1` | whatever is loaded |

```bash
ollama pull qwen3:4b && ollama serve
```

For LM Studio, load a model and start the Local Server on port 1234.

## BYOK

BYOK is one box: paste a key and Cygnus calls the provider's `/models` route, identifies the provider and picks a strong coding model. There is no preset list to keep in sync.

| Key prefix | Provider |
| --- | --- |
| `sk-ant-` | Anthropic |
| `sk-or-` | OpenRouter |
| `gsk_` | Groq |
| `csk-` | Cerebras |
| `AIza` | Google Gemini |
| `sk-proj-` / `sk-` | OpenAI, DeepSeek or Together |
| 40+ hex characters | Together AI |

Keys are stored in this browser's `localStorage` and sent only to the detected provider. They are never written into the project or to disk.

## Custom endpoints

Choose **Custom endpoint** and paste anything:

- A base URL such as `https://my-host/v1`, or the full `/chat/completions` endpoint.
- A bare host — Cygnus adds `https://`, or `http://` for localhost and private addresses.
- A key, or nothing for an unauthenticated local server.

**Fetch models** calls the endpoint's `/models` route and fills a picker. That is the reliable way to get local model IDs exactly right; local presets try it automatically when the dialog opens.

> Provider tool-calling quality varies. Small 7B models handle small edits well; long multi-file sessions need a stronger model.
