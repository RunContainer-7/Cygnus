---
title: FAQ
description: Short answers about cost, keys, privacy, platforms and what Cygnus can build.
---

## Is Cygnus really free?

Yes. Cygnus is MIT licensed and there is no paywall. The default model runs on a shared free hosted tier, on-device models are free after the download, and BYOK only costs whatever your provider charges.

## Do I need an API key?

No. New installs start on **Nemotron 3.5 Lightning**, a hosted open-weight model with no key. On-device and local models need no key either.

A key is only needed for BYOK, or for Claude and Grok, which are not in the no-key lane.

## Do I need Node.js?

Not for the installed desktop app. Cygnus bundles its own local server. You need Node only if you run the source with `npm run dev`.

## Does it work offline?

Yes, once a model is available locally. On-device models and Ollama/LM Studio run entirely on your machine, and editing, previewing and exporting a project need no network.

Hosted models and Cloudflare publishing need a connection.

## Where are my projects stored?

In `%APPDATA%\Cygnus\workspaces` for installed builds, or `workspaces/` when running from source. Each project is a normal folder. See [Projects & files](/file-layout).

## Does Cygnus upload my code?

Not to a Cygnus server — there is no account and no project sync. Prompts and file contents go to whichever model provider you selected. Hosted free models may log prompts upstream; on-device and local models do not send them anywhere.

## Can I sell or deploy what I build?

Yes. The output is plain HTML, CSS and JavaScript that you own, and the MIT license places no restriction on your apps. Check the licence of any font, image or library the agent includes.

## Which platforms are supported?

Published installers are Windows builds (installer and portable). The source is a Next.js app and runs wherever Node runs, but the packaged desktop targets in this repository are Windows.

## Can I use Claude, GPT or Gemini?

Yes, through **BYOK**: paste the provider key and Cygnus detects it. Claude in particular requires BYOK. Any OpenAI-compatible endpoint works too, including a self-hosted gateway.

## Why is a model greyed out?

It needs more RAM than the machine has, or it cannot call tools, so it cannot run Plan or Build. Chat-only models still work in Chat mode.

## What do Chat, Plan and Build mean?

- **Chat** talks it through and changes nothing.
- **Plan** reads the project and lays out steps, with no edits.
- **Build** writes files, tests and iterates.

## Can generated apps use a database or logins?

Not directly. Generated apps are static, so there is no server to keep a secret or run a query. Client-side storage works; real auth needs a backend you host separately.

## Is there a usage limit?

Hosted free models share about 200 requests per hour per IP. On-device and local models have no request limit; they are bounded by your hardware.

## Can two people use it together?

Not in one session. There are no accounts or shared workspaces. You can hand off a project folder or zip.

## How do I update?

Installed builds check GitHub Releases on launch and offer an in-app update. Portable builds show a download link. You can always install the latest release over the top.
