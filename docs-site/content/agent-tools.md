---
title: Agent tools
description: What the agent can do in a turn: read and write files, plan, test, research, and ask you a question.
---

## The loop

Every tool-capable model gets the same tool set. A turn is: model decides a tool call → Cygnus runs it → the result goes back → the model continues. The loop is capped at **24 tool rounds per message**, which keeps a runaway agent from spending forever.

Narration never piles up: one live line shows the current checkpoint, the tool log collapses underneath as `Worked · N steps`, and the closing reply is its own message.

## File tools

| Tool | What it does |
| --- | --- |
| `write_file` | Create or replace a file in the project |
| `read_file` | Read a file, optionally a line range |
| `list_files` | List the project tree |
| `search_files` | Find text with line numbers |
| `delete_file` | Remove a file |

Paths are contained to the project folder. The agent cannot read or write elsewhere on your machine through these tools.

## Planning

`blueprint` creates or updates a visible task list with exactly one active task and ticked-off completed items. Ask for it on any build with several stages. It is also the easiest way to see what the agent thinks it is doing.

`nested_reasoning` adds a visible layer of reasoning inside reasoning. Each call costs one tool round, so it is used when a problem is genuinely tangled rather than on every turn.

## Testing

`test_app` runs static checks over the project: `index.html` exists and parses, local asset references resolve, JavaScript parses, CSS blocks balance, placeholders are flagged, and the preview route answers. It does not run a browser, so it catches broken structure, not visual taste.

## Research

`fetch_url` reads a specific public documentation page. Private and local addresses are blocked, so the agent cannot use it to probe your network.

`spawn_agents` brings in one of three helpers:

- `web_researcher` — searches the web and reads the top public pages.
- `expert` — diagnoses a stuck or looping agent.
- `catalyst` — returns a fast, code-ready plan.

Web research sends the query to DuckDuckGo and reads public pages. Do not ask it to research anything confidential.

## Asking you

`user_ask` pauses the chat and asks one focused question. The same stream resumes automatically when you answer, so the build does not restart. It is better than the agent guessing at a requirement it cannot infer.

## What the tools cannot do

- No shell, no package installs, no network access from generated apps.
- No edits outside the project folder.
- No server-side code in generated projects.
- No reading your chat history into the project.

Generated apps stay static: HTML, CSS and vanilla JavaScript. If a build needs a backend, it needs a different tool.
