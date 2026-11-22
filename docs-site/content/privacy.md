---
title: Privacy
description: What stays on your machine, what goes to a model provider, and what is never collected.
---

## Local by default

Cygnus has no account system and no project sync. Your projects, chat history, notes, checkpoints and extension settings live on your computer.

Nothing in the app uploads a project to a Cygnus server, because there is no Cygnus server holding your work.

## What leaves the machine

Only what your chosen model needs:

- **Hosted free models** receive your prompt and the file contents the agent reads. The upstream provider may log them.
- **BYOK providers** receive the same, under their own privacy terms.
- **On-device models and Local runtimes** receive nothing over the network. Prompts stay on the computer.
- **Web research** sends the search query to DuckDuckGo and reads public pages through the agent's fetch tool.

If a prompt must stay private, use an on-device model or a local endpoint. There is no setting that makes a hosted model private.

## Keys and credentials

BYOK keys are stored in the browser's `localStorage` and sent only to the provider they belong to. They are not written into the project, an export, or a published site.

Cloudflare API tokens are stored locally and used only for Pages uploads.

## What is never included in an export

- The conversation (`chat.json`).
- Project metadata (`meta.json`).
- Studio notes.
- API keys and tokens.

An exported zip contains the generated app files only.

## Extensions and plugins

Extensions are prompt-only rule packs. Installing one does not download or run third-party code; it stores an id locally and adds rules to the builder prompt. Plugins connect to local model servers you already run.

## Generated apps and the preview

> The preview is same-origin with `allow-scripts`, so generated code can call Cygnus's own local APIs. Run prompts you trust. Do not point Cygnus at a server that holds real secrets and then build from untrusted instructions.

A published static site has no access to your Cygnus install; it is just files on a host.

## Deleting data

Delete a project folder to remove that project and its chat. Uninstalling Cygnus keeps your projects by design; remove `%APPDATA%\Cygnus` if you want everything gone. Downloaded on-device models can be deleted from the model picker to reclaim disk space.

## Questions

Open an issue on [GitHub](https://github.com/RunContainer-7/Cygnus/issues). Do not paste API keys or private project content into an issue.
