---
title: Plugins
description: Connect Ollama or LM Studio. Cygnus scans localhost, lists the models that are loaded, and uses one with a click.
---

## What "Plugins" means here

Cygnus's Plugins page is the local-runtime shelf. It does not install browser extensions or download arbitrary code. It finds model servers already running on your machine and turns them into model choices.

The two supported runtimes are **Ollama** and **LM Studio**, both OpenAI-compatible.

## Connect a runtime

1. Start the server.
   - Ollama: `ollama serve`, then `ollama pull qwen3:4b`.
   - LM Studio: load a model, then start the Local Server on port `1234`.
2. Open **Plugins**. Cygnus scans `localhost` on load.
3. The card shows **Detected** and lists up to four loaded models.
4. Click **Use model**. Cygnus switches the composer to that runtime and returns you to the home screen.

If nothing is detected, press **Scan again**. Nothing about the scan leaves your machine.

## Ports and URLs

| Runtime | Base URL |
| --- | --- |
| Ollama | `http://localhost:11434/v1` |
| LM Studio | `http://localhost:1234/v1` |

If you run a server on a different port, use **Settings → Custom endpoint** and paste the base URL, then **Fetch models**. That path also works for vLLM, llama.cpp, LocalAI and anything else that speaks the OpenAI API.

## Picking a model

- Small models (3B–8B) are good for single-file edits and quick copy changes.
- Multi-file builds and long sessions want a larger model.
- Tool calling is what makes Build mode work. A chat-only model can still be used in Chat mode.
- Every request goes to your machine; no key is involved.

See [Models](/models) for the full set of lanes, or [Troubleshooting](/troubleshooting#ollama-or-lm-studio-is-not-detected) if detection fails.

## After connecting

The composer's model button now shows the runtime name. Switch back at any time from the same picker; Cygnus remembers the last choice. Keys are not required and are not stored for local endpoints.
