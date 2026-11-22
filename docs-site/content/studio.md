---
title: Studio
description: Five local project tools — checkpoints, design tokens, private notes, CSV data, and 64 moves.
---

## Opening Studio

Click **Studio** in the workspace toolbar. Everything inside is local to the project; nothing is sent to a model unless you explicitly ask for it.

## Checkpoints

Snapshot the project files outside the project folder and restore them later. Build turns save one automatically and the last 20 are kept. See [Checkpoints](/checkpoints).

## Design

Design collects every colour, font stack, radius and CSS custom property in the project, with counts, and gives you a ready `:root` block to copy.

It is a read-only view of what the CSS already says, which makes it easy to spot:

- Three near-identical greys that should be one token.
- A radius used eleven times and a stray `7px`.
- A font family declared twice with different fallbacks.

Paste the generated block back into the stylesheet when you want to consolidate.

## Notes

Notes is a private brief that lives beside the project. It is never published and never included in an export.

Use it for the things you keep re-explaining to the agent: audience, tone, banned words, the real business rules. You can paste from it into the chat when a turn needs the context.

## Data

Data takes pasted CSV, previews the rows, and saves them as `data.csv` in the project.

One button also asks the model to build a searchable table from that data. That is the quickest path from a spreadsheet export to a working, filterable page — useful for catalogues, directories and simple dashboards.

## Moves

Moves is 64 real features, one borrowed from each product on a list:

- **24 open a Cygnus surface**: remix, publish, export, snapshots, design tokens, notes, data, device preview, palette, console, settings, templates.
- **40 generate working code, config or an audit** straight into the project.

Examples of what the code moves write:

- Behaviour: `auth.js`, `store.js`, `crud.js`, `rules.js`, `automations.js`, `task-queue.js`, `activity-log.js`.
- Interface: `status-line.js`, `shortcuts.js`, `onboarding.js`, `readonly.js`, `reorder.js`, `views.js`, `summary.js`, `mobile.css`, `scale.css`, `states.css`, `themes.css` + `themes.js`, `data-table.html`.
- Infrastructure: `vercel.json`, `.gitlab-ci.yml`, `context.json`.
- Reports: `health.md`, `audit.md`, `CHECKS.md`, `PERFORMANCE.md`, `ACCESSIBILITY.md`, `SCREENS.md`, `dependencies.md`, `TODO.md`, `PLAN.md`, `SPEC.md`, `SELFHOST.md`, `README.md`, `FREE-TIER.md`, `STRUCTURE.md`.

A move never types a request into the composer. It either opens the relevant Cygnus panel or writes the files itself, so the result is visible and editable.

## Command palette

Press **Ctrl/Cmd + K** (or click **⌘K**) for the palette: panels, modes, publish, zip export, checkpoints, notes, data, moves, and a project duplicate that forks the files as a remix without copying the chat.
