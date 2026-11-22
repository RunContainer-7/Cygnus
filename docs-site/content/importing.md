---
title: Importing a repo
description: Connect GitHub with your own token, import a repository as a project, edit it with the agent, and push the commit back.
---

## Connect GitHub

Cygnus talks to GitHub directly with a token you create. No Cygnus or Freebuff account is involved, and the token is sent only to `api.github.com`.

1. In GitHub, open **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Create a token with **Contents** and **Metadata** read/write access.
3. In Cygnus, open **Settings → GitHub**.
4. Paste the token and click **Connect GitHub**.

The token is saved in the Cygnus data folder on this computer. Use **Disconnect** to remove it.

## Import a repository

After connecting, the panel lists your repositories, with a filter box. Pick one and import it.

Cygnus copies the repository's files into a new project folder and opens the workspace. From there it behaves like any other project: the preview reloads, the agent reads and writes files, checkpoints work, and the chat is separate from the repository.

## Edit, then push back

The agent edits the imported files. When you are happy with the result, push the commit back to GitHub from the same integration.

- A push sends the project's current files.
- The chat history and project metadata are not part of the repository.
- Pull requests, branches and merges are not managed in Cygnus; use GitHub for anything beyond the default branch.

## Importing without GitHub

Any folder of static files can be made a project by copying it into `workspaces/<id>/` and adding the `meta.json` Cygnus expects. For a one-off, exporting and re-importing through GitHub is simpler.

## Limits

- Repositories are imported as static sites. A Next.js app's `node_modules`, build step and server routes will not run inside the preview.
- Large repositories with big binary assets make the preview and the agent slower.
- Private repositories work, as long as the token can read them.
