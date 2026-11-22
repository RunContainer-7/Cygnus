---
title: Previewing
description: The live preview, device sizes, the console, and how generated code is served.
---

## The preview panel

The right side of a workspace is a real browser frame pointed at your project. It reloads after each turn, so the thing you are looking at is always the files on disk.

The preview toolbar has:

- **Refresh** to reload without a new model turn.
- **Device sizes** to check desktop, tablet and phone layouts. The switcher hides itself when the panel is too narrow to be useful.
- **Publish**, **Export** and **Studio**.
- A **console** panel for runtime errors and logs.

## Files and routes

A project starts as `index.html`, `styles.css` and `app.js`. Cygnus serves the folder through its own preview route, so relative paths work the way they would on a static host. If you ask for extra pages, keep them as additional HTML files and link between them with relative URLs.

The app is static. There is no dev server, no bundler, and no server-side code in a generated project.

## Device testing

Use the device buttons to check:

- Text does not overflow at 390px wide.
- Navigation is reachable without hover.
- Tap targets are big enough.
- Tables and grids collapse instead of scrolling sideways.

Then resize the Cygnus window itself — the preview toolbar wraps at narrow widths so Publish and Export stay visible.

## The console

The console lists page errors, failed requests and `console.log` output from the generated app. It is the fastest way to see why a preview went blank. Copy the first error and give it back to the agent.

## Security boundary

> The preview iframe is same-origin with `allow-scripts`, so generated code can reach Cygnus's own APIs. Do not run untrusted prompts against a Cygnus server holding real secrets. A future hosting step is one sandbox per project; today, treat generated code as code you agreed to run.

## When the preview will not load

- **Blank page** — usually a JavaScript error. Check the console.
- **404 on an asset** — a path is absolute instead of relative, or the file was never written. Ask Cygnus to check the reference.
- **Old content** — press refresh; if it persists, confirm the file changed in the Files panel.
- **Preview fine, publish broken** — the zip only contains project files. A path that worked through the preview route but points outside the project will break on a static host.

More fixes are in [Troubleshooting](/troubleshooting).
