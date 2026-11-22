---
title: Troubleshooting
description: Fix the common failures: rate limits, unsigned installers, missing models, preview errors, and publish permissions.
---

## The model is busy or rate-limited

Hosted models share an anonymous free tier of roughly **200 requests per hour per IP address**. You may see a busy response even when you have not used your own quota.

Do one of these:

- Pick a different hosted model in the composer.
- Wait a few minutes.
- Switch to **Local** (Ollama / LM Studio) or an on-device model.

## Windows says the app is unsafe

The installer is unsigned, so SmartScreen warns on first run. Click **More info → Run anyway**. The source is public and MIT licensed.

This is a signing certificate cost, not a detection. If your organisation blocks unsigned binaries, build from source instead.

## A model is missing from the picker

- On-device models that need more RAM than the machine has are disabled.
- Chat-only and OCR-only models are listed but cannot run Build.
- On-device models need the managed runtime installed the first time (about 1.5 GB).

## Ollama or LM Studio is not detected

1. Confirm the server is running.
2. Ollama: `http://localhost:11434/v1`. LM Studio: start the Local Server on port `1234`.
3. Run `ollama pull qwen3:4b` so there is at least one model.
4. Rescan from **Plugins**, or paste the base URL into a Custom endpoint and use **Fetch models**.

A local server bound only to `127.0.0.1` is fine; Cygnus runs on the same machine.

## The preview is blank

Open the preview console and read the first error. Give it to the agent verbatim:

> The preview is blank. Console: `Uncaught ReferenceError: x is not defined`. Fix it.

Then ask for `test_app` and fix what it reports. More in [Debugging](/debugging).

## A build loops or keeps undoing itself

- Restore a checkpoint from **Studio → Checkpoints**.
- Ask for one small change, not the whole feature.
- Switch to a stronger model for that turn.
- Spawn the `expert` sub-agent: `Diagnose why this build is stuck.`

## Publish fails on Cloudflare

The token needs **Account → Cloudflare Pages → Edit**. A token with only account-read access will list projects and then fail to upload.

Check that:

- The token belongs to the account you meant to publish into.
- The project name is not already taken by an unrelated project.
- You are online — `.zip` export works offline, Cloudflare publishing does not.

## The zip is disabled

Publish's **Download .zip** is disabled for an empty project. Build something first.

## An update will not install

Installed builds check GitHub Releases on launch. If an update downloads but does not restart:

1. Quit Cygnus completely, including the tray icon.
2. Download the latest installer from [Releases](https://github.com/RunContainer-7/Cygnus/releases) and run it over the top.

Portable builds cannot update in place; download a fresh portable `.exe`.

## Where app data lives

Projects: `%APPDATA%\Cygnus\workspaces`. Extension install state and other app data live in the Cygnus data folder. Uninstalling keeps your projects.

## Still stuck

Open an issue on [GitHub](https://github.com/RunContainer-7/Cygnus/issues) with the exact error, the model you used, and whether it happens in a new project.
