---
title: Prompting
description: How to ask Cygnus for an app so the agent builds the right thing the first time — and how to iterate without fighting it.
---

## Pick the right mode

The mode button beside the composer controls what a turn is allowed to do:

| Mode | What happens |
| --- | --- |
| **Chat** | Talks it through. No tool calls, no file changes. The default. |
| **Plan** | Reads the project and lays out steps. No writes. |
| **Build** | Writes files, runs checks and iterates. |

Switch to **Build** before asking for an app. You can change modes at any time; the choice is remembered for the next turn.

## Describe the outcome, not the code

You do not need to name files or write HTML. Say what the app should do and who it is for:

> A shift planner for a small cafe. Staff enter their availability, the manager drags shifts into a week grid, and everything saves locally.

That gives the agent enough to choose a layout, a data shape and a storage approach. A prompt like "make a website" gives it nothing to check itself against.

## One app per project

Each project is one folder with one conversation. Starting a second, unrelated idea in the same project usually produces a confusing mix of files. Create a new app instead.

## Iterate in small steps

Short, specific follow-ups work better than one giant prompt:

1. `Add a pricing section with three tiers.`
2. `Make the middle tier highlighted and taller.`
3. `Add a monthly/yearly toggle that changes the prices.`

Each turn is checked against the live preview, so a mistake is easy to spot and easy to undo.

## Be concrete about constraints

The agent cannot guess taste or business rules. Useful details:

- Colours, fonts and mood, or a reference site.
- Exact copy, prices and labels.
- What should persist after a reload.
- What must work on a phone.
- Whether the app must stay static (it does — there is no backend).

## Use the blueprint for multi-part work

For anything with several stages, ask for a plan first: `Blueprint this as a task list, then build it.` Cygnus keeps one active task and ticks off completed ones, which makes long builds easier to follow.

## Correct with evidence

When something is wrong, paste the actual error or describe exactly what you see:

> The preview is blank and the console says `Uncaught ReferenceError: saveNote is not defined`. Fix it.

That is far more effective than "it doesn't work". See [Debugging](/debugging).

## Do not paste secrets

Generated apps are static and their code is public the moment you publish. Never put API keys, tokens or passwords in a prompt, and do not expect Cygnus to hide them — there is no server-side secret store for generated projects.

## When the agent loops

If it repeats the same edit or keeps re-reading the same file:

- Ask it to `test_app` and fix what the checks report.
- Switch to a stronger model for that turn.
- Restore a checkpoint and rephrase the request.
- Ask for one small change instead of the whole feature.

The `expert` sub-agent exists for exactly this: `Spawn the expert and diagnose why this build is stuck.`
