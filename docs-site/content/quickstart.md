---
title: Quickstart
description: Install Cygnus, build your first app, and put it online — in about five minutes.
---

## Install

Open [Download](/download) and pick the Windows installer or the portable `.exe`. The installer is the normal choice; the portable build runs without installing.

The build is unsigned, so Windows SmartScreen will warn you the first time. Click **More info**, then **Run anyway**. Cygnus is open source, so you can inspect exactly what runs.

> Installed v0.1.1 and later check GitHub Releases on launch and offer an in-app update. Portable builds show a download link instead.

## Build your first app

1. Open Cygnus. The composer starts on **Nemotron 3.5 Lightning** — a hosted open-weight model with no key required.
2. Set the mode button beside the composer to **Build**. Chat is the default, and Chat only discusses the app; it does not write files.
3. Type what you want, for example `A landing page for a coffee subscription`.
4. Press **Enter**. Shift+Enter adds a new line.
5. Watch the agent write files. The preview reloads when it finishes.
6. Reply with a change, such as `Make the hero taller and add a pricing section`.

Every reply is a new turn in the same conversation. Cygnus can inspect the files it wrote, so you do not need to paste code back in.

## Know the three panels

- **Chat** is on the left. This is where you describe changes.
- **Preview** is on the right, with device sizes and a refresh control.
- **Files** shows the project's real contents if you want to read or check something.

The workspace toolbar also holds **Publish**, **Export** and **Studio**. Studio is where checkpoints, design tokens, notes, data and moves live.

Your apps are in the panel on the left, sorted by recent activity. Each row shows its file count and when it was created or last edited. Click the pencil to rename a project in place; star one to pin it under **Favorite apps**.

## Save a checkpoint

Build turns save a checkpoint automatically, and the last 20 are kept. To snapshot on demand, open **Studio → Checkpoints** and create one. Restoring copies the saved files back into the project, so a bad turn is never permanent.

## Publish or export

Open **Publish** in the preview toolbar:

- **Download .zip** always works and packages only the project's files.
- **Cloudflare Pages** uploads straight to your own free Cloudflare account and gives you a `name.pages.dev` address.

Full steps are in [Publishing](/publishing).

## If something looks wrong

- Model busy or rate-limited? Pick another hosted model, or switch to a local or on-device model.
- Preview blank? Ask Cygnus to fix the console error, or read [Debugging](/debugging).
- No key required: hosted models use a shared free tier of roughly 200 requests per hour per IP address.
