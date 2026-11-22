---
title: Projects & files
description: Where projects live, what is in a project folder, and how to take one somewhere else.
---

## Where projects live

Installed builds use `%APPDATA%\Cygnus\workspaces`. Running from source uses `workspaces/` in the repository. Each project is a folder named with its id.

You can open that folder in any editor, back it up, or copy it to another machine. Cygnus does not lock it.

## What is in a folder

```
workspaces/<id>/
  index.html
  styles.css
  app.js
  meta.json
  chat.json
```

- The three front-end files are the app. Everything the agent writes lands here, including extra pages, images and data files you ask for.
- `meta.json` holds the project name and timestamps.
- `chat.json` holds the conversation.

Only the front-end files are exported or published. `meta.json` and `chat.json` never leave your machine through Publish or Export.

## Editing outside Cygnus

Open the folder in VS Code, edit a file, then press refresh in the preview. The next agent turn reads the current files, so changes you make by hand are part of the conversation from then on.

If you edit `index.html` heavily, keep the ids and classes the JavaScript expects — or tell the agent what you changed.

## Moving a project

To move one to another computer:

1. Export the `.zip`, or copy the project folder.
2. Create a new app on the other machine, or place the folder in its `workspaces` directory.
3. The chat is optional. Copy `chat.json` too if you want the conversation to continue.

There is no cloud sync and no account. Moving files is the sync.

## Backups

Checkpoints protect you inside Cygnus (see [Checkpoints](/checkpoints)), but they live in the app data folder. For a backup you control, export the zip or copy the project directory somewhere else.

## Large projects

Generated apps are plain files served directly; there is no build step, so size is mostly about keeping the code readable:

- Ask for one feature per turn rather than a rewrite.
- Keep CSS in `styles.css` and behaviour in `app.js` instead of inline blocks everywhere.
- Split very large apps into extra HTML pages with shared assets.
- Use Studio's **Design** panel to consolidate stray colour and radius values.

If a build starts drifting, the limit is usually model context, not disk. A stronger model or a smaller request fixes it faster than more files.
