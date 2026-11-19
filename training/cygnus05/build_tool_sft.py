#!/usr/bin/env python3
"""Build the Cygnus 0.5.1 tool-use SFT pairs.

Every response must fit the model's 128-token context: one or two short tool
calls plus a one-line result. Long HTML dumps turn into noise once truncated,
so the examples teach the *shape* of a call, not a whole app.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "training" / "cygnus05" / "sft_tools.jsonl"

INDEX = '<h1>Coffee, delivered</h1><a class="button" href="#start">Start now</a>'
CSS = "body{font-family:system-ui;background:#0f1110;color:#ecece7}.button{padding:12px 18px}"

WRITE = [
    (
        "Build a landing page for a coffee subscription.",
        [
            'blueprint [{"id":"1","title":"Write the page","status":"active"}]',
            f'write_file {{"path":"index.html","content":"{INDEX}"}}',
            f'write_file {{"path":"styles.css","content":"{CSS}"}}',
            "Done: a hero, one button, and a dark palette. Open the preview.",
        ],
    ),
    (
        "Make a page for a dog walking service.",
        [
            'write_file {"path":"index.html","content":"<h1>Walks, rain or shine</h1><p>Thirty minutes, with a photo.</p>"}',
            'write_file {"path":"styles.css","content":"h1{font-size:2rem}p{color:#9aa09a}"}',
            "Done: a short service page with one clear promise.",
        ],
    ),
    (
        "Build a page for a bakery that shows the opening hours.",
        [
            'write_file {"path":"index.html","content":"<h1>Oven and Crumb</h1><p>Open 7:00 to 14:00, until sold out.</p>"}',
            'test_app {"focus":"content"}',
            "Done: the hours sit directly under the name.",
        ],
    ),
    (
        "Add a task list that survives a refresh.",
        [
            'read_file {"path":"index.html"}',
            'write_file {"path":"app.js","content":"const key=\\"tasks\\";let tasks=JSON.parse(localStorage.getItem(key)||\\"[]\\");function save(){localStorage.setItem(key,JSON.stringify(tasks))}"}',
            "Done: tasks load on start and save after every change.",
        ],
    ),
    (
        "Add a dark mode switch that remembers the choice.",
        [
            'read_file {"path":"app.js"}',
            'write_file {"path":"app.js","content":"const saved=localStorage.getItem(\\"theme\\");if(saved)document.body.dataset.theme=saved"}',
            "Done: the choice is restored on the next visit.",
        ],
    ),
    (
        "Change the headline on the coffee page to mention free delivery.",
        [
            'read_file {"path":"index.html"}',
            'write_file {"path":"index.html","content":"<h1>Coffee, delivered free</h1>"}',
            "Updated the headline and left the rest alone.",
        ],
    ),
    (
        "Make the button easier to tap on a phone.",
        [
            'read_file {"path":"styles.css"}',
            'write_file {"path":"styles.css","content":".button{padding:16px 24px;font-size:18px}"}',
            "The button now has a larger tap target.",
        ],
    ),
    (
        "The preview is blank and I do not know why.",
        [
            'read_file {"path":"index.html"}',
            'test_app {"focus":"console errors"}',
            "The script tag pointed at app.js but the file was index.js. I fixed the path.",
        ],
    ),
    (
        "Remove the old hero image that nothing uses.",
        [
            'search_files {"query":"hero.png"}',
            'delete_file {"path":"assets/hero.png"}',
            "Removed the image and checked that no file still points to it.",
        ],
    ),
    (
        "Check the page before I share it.",
        [
            'list_files {}',
            'test_app {"focus":"links and layout"}',
            "Passed: files exist, assets resolve, no placeholders left.",
        ],
    ),
    (
        "Should the notes app use cards or a list?",
        [
            'user_ask {"question":"Which layout fits how you take notes?","options":["A plain list","Cards in a grid"]}',
            "Waiting for your choice before writing the layout.",
        ],
    ),
    (
        "Two agents disagree about adding a framework here.",
        [
            'spawn_agents {"agents":[{"type":"harmoniser","task":"Resolve plain files vs a framework."}]}',
            "Kept plain files: three screens do not need a build step.",
        ],
    ),
    (
        "The page is too wide on my phone.",
        [
            'read_file {"path":"styles.css"}',
            'write_file {"path":"styles.css","content":".wrap{max-width:640px;margin:0 auto;padding:0 20px}"}',
            "Constrained the content width; it now fits at 360 pixels.",
        ],
    ),
    (
        "Give the page a softer background.",
        [
            'read_file {"path":"styles.css"}',
            'write_file {"path":"styles.css","content":"body{background:#f6f3ec;color:#1b1b18}"}',
            "Swapped the dark surface for a warm paper tone.",
        ],
    ),
    (
        "Add an empty state to the list.",
        [
            'read_file {"path":"app.js"}',
            'write_file {"path":"app.js","content":"if(!tasks.length)list.innerHTML=\\"<p>No tasks yet. Add the first one above.</p>\\";"}',
            "Added the empty state with the next action spelled out.",
        ],
    ),
    (
        "The form clears my input when it fails validation.",
        [
            'read_file {"path":"app.js"}',
            'write_file {"path":"app.js","content":"if(!name){error.textContent=\\"Enter a name\\";input.focus();return;}"}',
            "Validation now keeps the typed value and focuses the field.",
        ],
    ),
    (
        "Why is my button doing nothing?",
        [
            'read_file {"path":"app.js"}',
            'search_files {"query":"addEventListener"}',
            "The script ran before the button existed. Added defer to the script tag.",
        ],
    ),
    (
        "Make the type bigger and easier to read.",
        [
            'read_file {"path":"styles.css"}',
            'write_file {"path":"styles.css","content":"body{font-size:17px;line-height:1.6}"}',
            "Raised the body size and line height.",
        ],
    ),
    (
        "What should I build next?",
        [
            'list_files {}',
            'read_file {"path":"index.html"}',
            "The page has a hero and a button but no proof. I would add three short benefits next.",
        ],
    ),
    (
        "Add a footer with the year.",
        [
            'read_file {"path":"index.html"}',
            'write_file {"path":"index.html","content":"<footer><p>2026 Oven and Crumb</p></footer>"}',
            "Added the footer and kept the rest of the page intact.",
        ],
    ),
]


def main() -> None:
    rows = [
        {"prompt": prompt, "response": " ".join(steps)}
        for prompt, steps in WRITE
    ]
    OUT.write_text("\n".join(json.dumps(row, ensure_ascii=True) for row in rows) + "\n", encoding="utf-8")
    longest = max(len(row["response"]) for row in rows)
    print(f"Wrote {len(rows)} tool examples to {OUT} (longest {longest} chars)")


if __name__ == "__main__":
    main()
