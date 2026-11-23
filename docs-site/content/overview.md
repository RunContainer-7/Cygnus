---
title: Overview
description: Cygnus is a free, local-first AI app builder. Describe an app and get real files on disk plus a live preview, on hosted, local, or bring-your-own-key models.
---

## What Cygnus is

Cygnus is a free AI app builder that runs on your computer. You describe an app in plain language, and an agent writes the actual files into a project folder: `index.html`, `styles.css`, `app.js`. The preview reloads after every turn, the chat remembers the conversation, and nothing is uploaded to a Cygnus account because there isn't one.

It is a small, hackable take on the Dyad / bolt.diy idea: open source, MIT licensed, and no paywall in front of the build button.

## How a build works

1. You describe what you want on the home screen.
2. Cygnus creates a project folder and starts an agent loop.
3. The agent calls tools such as `write_file`, `read_file` and `search_files` to change the project.
4. The preview iframe reloads and shows the result.
5. You reply with the next change, and the loop continues — up to 24 tool rounds per message.

Narration stays out of the way: one live status line, the tool log collapsed underneath as `Worked · N steps`, and the final reply as its own message.

## Three model lanes

| Lane | Key needed | What runs |
| --- | --- | --- |
| Open source | No | Seven free hosted open-weight models, or eighteen models downloaded to this PC |
| Local | No | Ollama or LM Studio, already running on your machine |
| BYOK | Your key | Paste one key and Cygnus detects the provider and a coding model |

New installs start on **Nemotron 3.5 Lightning**, a hosted open-weight model that needs no key. See [Models](/models) for the full picture.

## What it writes

Generated apps are static: HTML, CSS and vanilla JavaScript. There is no `npm install`, no framework and no build step for the app you generate. That keeps projects portable — every project is a normal folder you can open in any editor, zip, or host anywhere.

Cygnus itself is a Next.js app packaged with Electron. It bundles its own local server, so building apps does not require Node.js, a terminal, or a separate dev server.

## Where your work lives

Installed builds keep projects in `%APPDATA%\Cygnus\workspaces`. When you run Cygnus from source, they live in `workspaces/` inside the repository. Each project folder holds the generated files plus `meta.json` and `chat.json`; the chat history is never included in an export or a publish.

Extensions, checkpoints and other app state live in the Cygnus data folder, not in your project.

## Find and manage apps

The Apps panel lists every project, newest activity first. Each row shows its file count and whether it was created or edited and when. Use the pencil beside an app to rename it in place; the new name is saved to `meta.json` and survives restarts. Star an app to pin it under **Favorite apps**, and use the search box to filter a long list. There is no project limit — every folder in the workspace appears.

Long prompts grow the home and chat composers up to a few lines instead of scrolling inside a one-line box. Press Enter to send, or Shift+Enter for a new line.

Cygnus is MIT licensed. The source is on [GitHub](https://github.com/RunContainer-7/Cygnus).
