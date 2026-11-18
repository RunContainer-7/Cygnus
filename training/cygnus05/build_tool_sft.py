#!/usr/bin/env python3
"""Build the Cygnus 0.5.1 domain corpus additions and tool-use SFT pairs.

The tool pairs teach the *shape* of a Cygnus tool call, not a capability: a
five-million-parameter model cannot be trusted to edit files. Keeping the data
separate from the trainer makes it easy to inspect and extend.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "training" / "cygnus05" / "sft_tools.jsonl"

LANDING = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="stylesheet" href="./styles.css">
</head>
<body>
<header class="nav"><strong>{brand}</strong><a class="cta" href="#start">Get started</a></header>
<main>
<section class="hero">
<h1>{headline}</h1>
<p>{sub}</p>
<a class="button" href="#start">Start now</a>
</section>
</main>
<script src="./app.js" defer></script>
</body>
</html>"""

APPS = [
    {
        "prompt": "Build a landing page for a small coffee subscription.",
        "title": "North Roast",
        "brand": "North Roast",
        "headline": "Fresh coffee, one bag at a time.",
        "sub": "Two bags a month from small roasters, delivered on the first Monday.",
        "slug": "one landing page, a headline, a short benefit line, and one button",
    },
    {
        "prompt": "Make a landing page for a dog walking service.",
        "title": "Happy Paws",
        "brand": "Happy Paws",
        "headline": "Your dog gets a walk, rain or shine.",
        "sub": "Thirty or sixty minutes, tracked, with a photo at the end.",
        "slug": "a service page with a clear promise and one booking button",
    },
    {
        "prompt": "Create a one page site for a small design studio.",
        "title": "Field Studio",
        "brand": "Field Studio",
        "headline": "Interfaces that feel calm.",
        "sub": "We design and build small product sites for teams of two to twenty.",
        "slug": "a studio page with a headline and one contact action",
    },
    {
        "prompt": "Build a page for a local bakery.",
        "title": "Oven and Crumb",
        "brand": "Oven and Crumb",
        "headline": "Bread out of the oven at seven.",
        "sub": "Sourdough, rye, and one sweet thing a day. Open until sold out.",
        "slug": "a bakery page with opening hours and one order action",
    },
    {
        "prompt": "Make a landing page for a note taking app.",
        "title": "Margins",
        "brand": "Margins",
        "headline": "Notes that stay where you put them.",
        "sub": "Plain text, fast search, and folders you can actually find.",
        "slug": "a product page with a headline, three benefits, and a button",
    },
    {
        "prompt": "Build a simple site for a running club.",
        "title": "Slow Miles",
        "brand": "Slow Miles",
        "headline": "A running club for people who like to talk.",
        "sub": "Tuesday evenings, five kilometres, no pace requirement.",
        "slug": "a club page with the meeting time and one join button",
    },
]

STYLES = """:root{--bg:#0f1110;--fg:#ecece7;--muted:#9aa09a;--accent:#9fd8a6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,sans-serif;line-height:1.5}
.nav{display:flex;justify-content:space-between;align-items:center;padding:18px 24px}
.hero{max-width:640px;margin:0 auto;padding:96px 24px;text-align:left}
h1{font-size:clamp(2rem,5vw,3.5rem);line-height:1.1;margin:0 0 16px}
p{color:var(--muted);max-width:46ch}
.button{display:inline-block;margin-top:24px;padding:12px 18px;border-radius:10px;background:var(--accent);color:#0b0d0c;text-decoration:none}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}"""

SCRIPT = """const button = document.querySelector('.button');
if (button) {
  button.addEventListener('click', () => {
    button.textContent = 'You are on the list';
  });
}"""


def pairs() -> list[dict[str, str]]:
    out: list[dict[str, str]] = []

    for app in APPS:
        html = LANDING.format(**app)
        out.append(
            {
                "prompt": app["prompt"],
                "response": (
                    'blueprint [{"id":"1","title":"Plan the page","status":"done"},'
                    '{"id":"2","title":"Write the files","status":"done"}] '
                    f'write_file {{"path":"index.html","content":"{html}"}} '
                    f'write_file {{"path":"styles.css","content":"{STYLES}"}} '
                    f'write_file {{"path":"app.js","content":"{SCRIPT}"}} '
                    f"Done: {app['slug']}. Open the preview to try the button."
                ),
            }
        )

    edits = [
        (
            "Change the headline on the coffee page to mention free delivery.",
            'read_file {"path":"index.html"}',
            'write_file {"path":"index.html","content":"<h1>Fresh coffee, free delivery.</h1>"}',
            "Updated the headline and left the rest of the page alone.",
        ),
        (
            "Make the button on the bakery page larger and easier to tap.",
            'read_file {"path":"styles.css"}',
            'write_file {"path":"styles.css","content":".button{padding:16px 24px;font-size:18px}"}',
            "The button now has a larger tap target.",
        ),
        (
            "The running club page has no meeting time.",
            'search_files {"query":"Tuesday"}',
            'write_file {"path":"index.html","content":"<p>Tuesday evenings, 18:30, five kilometres.</p>"}',
            "Added the meeting time under the headline.",
        ),
        (
            "Remove the old hero image file that nothing uses.",
            'search_files {"query":"hero.png"}',
            'delete_file {"path":"assets/hero.png"}',
            "Removed the unused image and checked that no file still points to it.",
        ),
        (
            "Check the studio page before I share it.",
            'list_files {}',
            'test_app {"focus":"links and layout"}',
            "The page passed the checks: index.html exists, assets resolve, and no placeholders remain.",
        ),
        (
            "Should the note app use cards or a list?",
            "user_ask {\"question\":\"Which layout fits how you take notes?\",\"options\":[\"A plain list\",\"Cards in a grid\"]}",
            "Waiting for your choice before writing the layout.",
        ),
        (
            "The preview is blank and I do not know why.",
            'read_file {"path":"index.html"}',
            'test_app {"focus":"console errors"}',
            "The script tag pointed at app.js but the file was named index.js. I fixed the path.",
        ),
        (
            "Add a dark mode switch that remembers the choice.",
            'read_file {"path":"app.js"}',
            'write_file {"path":"app.js","content":"const saved=localStorage.getItem(\\"theme\\");if(saved)document.body.dataset.theme=saved;document.querySelector(\\"#theme\\")?.addEventListener(\\"click\\",()=>{const next=document.body.dataset.theme===\\"dark\\"?\\"light\\":\\"dark\\";document.body.dataset.theme=next;localStorage.setItem(\\"theme\\",next)})"}',
            "Added the switch, saved the choice, and restored it on load.",
        ),
        (
            "Add a task list that survives a refresh.",
            'read_file {"path":"index.html"}',
            'write_file {"path":"app.js","content":"const KEY=\\"tasks\\";let tasks=JSON.parse(localStorage.getItem(KEY)||\\"[]\\");function save(){localStorage.setItem(KEY,JSON.stringify(tasks))}"}',
            "Tasks now load from localStorage on start and save after every change.",
        ),
        (
            "Two agents disagree about using a framework here.",
            'spawn_agents {"agents":[{"type":"harmoniser","task":"Cygnus wants plain files, the catalyst wants a framework. Resolve it."}]}',
            "The harmoniser kept plain files: the app is three screens and a build step adds risk without saving work.",
        ),
    ]

    for row in edits:
        prompt, *steps = row
        out.append({"prompt": prompt, "response": " ".join(steps)})

    return out


def main() -> None:
    rows = pairs()
    OUT.write_text("\n".join(json.dumps(row, ensure_ascii=True) for row in rows) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} tool examples to {OUT}")


if __name__ == "__main__":
    main()
