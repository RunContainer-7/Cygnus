---
title: Extensions
description: Installable build rules that make every Cygnus project more accessible, faster, better-looking and easier to ship.
---

## What an extension is

An extension is a **prompt-only build rule pack**. Installing one does not download or execute third-party code. It saves an id locally and adds a set of rules to the builder's system prompt, so the agent applies them on every subsequent build turn.

That trade is deliberate: nothing third-party runs on your machine, and you can read every rule in the catalogue before installing it.

## Browsing and installing

Open **Extensions** in the left rail, next to Plugins.

- Search by name or description.
- Filter by category, or switch to **Installed**.
- Each card lists exactly what it adds.
- **Install** saves the id locally; **Remove** deletes it.

Installed state lives in Cygnus's data folder, survives restarts, and is injected at request time — so removing an extension takes effect on the next message, not the next install.

## The catalogue

Ten add-ons across five categories:

| Extension | Category | What it enforces |
| --- | --- | --- |
| Accessibility Audit | Quality | WCAG 2.2 AA: landmarks, focus, contrast, labels, live regions |
| Form Guard | Quality | Inline validation, linked errors, drafts, honest success states |
| SEO & Social Cards | Growth | Titles, descriptions, canonical, Open Graph, JSON-LD without invented facts |
| Launch Page | Growth | A conversion structure with specific copy and working CTAs |
| Motion Polish | Design | One motion system with shared tokens and reduced-motion support |
| Design Tokens | Design | A single token layer with light/dark palettes that switch live |
| PWA & Offline | Performance | Manifest, icons, service worker and a real offline fallback |
| Performance Budget | Performance | No frameworks, sized media, deferred scripts, measured budget |
| Chart Kit | Data | Library-free SVG charts with accessible tables and honest labels |
| Print & Export | Data | Print stylesheet plus working CSV, JSON and clipboard export |

## How to use them well

- Install two or three that match the project. Ten at once makes every turn heavier and the prompt noisier.
- For an accessibility pass on an existing project, install **Accessibility Audit** and ask: `Apply the installed accessibility rules to every page.`
- Extensions change defaults for new work. They do not rewrite files until you ask for a build turn.
- Removing an extension does not undo code it already produced.

## What extensions cannot do

- They do not add new model providers or tools.
- They do not run in the browser or on your machine as code.
- They cannot override project-specific instructions you give in chat.

## Difference from Plugins

**Plugins** connect local model servers: Ollama and LM Studio. **Extensions** change how the agent builds. They sit next to each other in the rail because they are both things you add to Cygnus, but they do completely different jobs.
