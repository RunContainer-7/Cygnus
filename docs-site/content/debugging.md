---
title: Debugging
description: Fix a broken build with the console, the files, test_app, and checkpoints.
---

## Start with the real error

A blank preview is almost never a model problem — it is a JavaScript error. Open the console in the preview panel and read the first red line. That message is the most useful thing you can give the agent.

> The preview is blank. The console says `Uncaught TypeError: Cannot read properties of null (reading 'addEventListener')`. Find the element that is missing and fix it.

## Ask for the built-in checks

`test_app` runs static checks over the project:

- `index.html` exists and parses.
- Local asset references point at files that exist.
- JavaScript files parse.
- CSS blocks are balanced.
- Obvious placeholder text is flagged.
- The preview route answers.

Ask: `Run test_app and fix everything it reports.` It catches the boring breakages before you go looking for subtle ones.

## Read the files

The **Files** panel shows exactly what was written. Common causes:

| Symptom | Usual cause |
| --- | --- |
| Styles do nothing | The class name in HTML does not match the CSS, or the stylesheet link is wrong |
| Button does nothing | The script runs before the element exists, or the id changed |
| Images missing | A path that only works on your machine, or a remote URL that blocks hotlinking |
| Works in preview, broken on publish | An absolute path, or a file outside the project folder |

## Go one step at a time

If a fix makes things worse, undo it before trying the next idea. Change one thing, check the preview, then continue. Three speculative fixes at once make the fourth error impossible to attribute.

## Use checkpoints as an undo button

Build turns save a checkpoint automatically and the last 20 are kept. Open **Studio → Checkpoints** and restore an earlier one to get back to a state that worked. See [Checkpoints](/checkpoints).

## Change the model for one turn

Small local models are good at single-file edits and can struggle with a long multi-file session. If the agent keeps making the same mistake:

- Switch to a stronger hosted model for that turn.
- Or spawn the `expert` sub-agent: `Spawn the expert and diagnose this loop.`

## Ask one focused question

`user_ask` lets the agent pause and ask you something instead of guessing. If you are going back and forth about a requirement, answer it in one sentence and let the build continue.

## Last resort

Start a fresh project with a clearer prompt, and copy over the files you want to keep. A clean folder with a precise brief beats an hour of patching a confused one.
