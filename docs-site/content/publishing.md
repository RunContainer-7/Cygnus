---
title: Publishing
description: Export a .zip, or publish straight to Cloudflare Pages from inside Cygnus.
---

## Two ways to ship

Open **Publish** in the preview toolbar. Both options are in the same panel.

## Download .zip

This always works, offline, with no account.

- It packages the project's own files — `index.html`, `styles.css`, `app.js` and anything else the agent wrote.
- It never includes the chat history or project metadata.
- Cygnus disables the button for an empty project, so you cannot download a broken archive.

Drop the zip on any static host — Netlify, Vercel, GitHub Pages, S3, a Raspberry Pi — or unzip it and open `index.html`.

## Cloudflare Pages

Cygnus publishes into **your own** free Cloudflare account. There is no shared Cygnus hosting account, so your quota, address and bill stay yours.

1. In the Cloudflare dashboard, go to **My Profile → API Tokens**.
2. Create a token with **Account → Cloudflare Pages → Edit**.
3. In Cygnus, open **Publish**, choose Cloudflare Pages and paste the token once.
4. Give the project a name and publish.

You get a `name.pages.dev` address. Static bandwidth is free and no credit card is required.

Republish from the same panel after changes. You can also take the site offline there.

> The token is stored locally and used only for Pages uploads. It is never written into the generated project, so a published site cannot leak it.

## What gets published

Only the files in the project folder. Notes from Studio are private and are never published or included in an export, and neither is the conversation.

## Caching and updates

Cloudflare Pages serves a new deployment immediately at the same `pages.dev` address. If your browser still shows an old version, hard-refresh once; edge caching settles within a minute.

## Custom domains

Add a custom domain in the Cloudflare Pages project settings after the first publish. Cygnus does not manage DNS, but it does not need to: the site is a normal Pages project from that point on.
