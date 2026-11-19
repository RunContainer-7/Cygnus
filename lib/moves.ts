export type MoveAction =
  | "duplicate"
  | "palette"
  | "studio:snapshots"
  | "studio:design"
  | "studio:notes"
  | "studio:data"
  | "publish"
  | "export"
  | "settings"
  | "device"
  | "templates"
  | "console";

export type Move = {
  app: string;
  title: string;
  blurb: string;
  prompt: string;
  action?: MoveAction;
};

/**
 * One borrowed move per product: the thing that product is genuinely known
 * for, translated into something this local, static-app builder can do.
 * Recipes with an `action` open a real Cygnus surface; the rest become a
 * concrete request in the composer.
 */
export const MOVES: Move[] = [
  {
    app: "Replit",
    title: "Remix this project",
    blurb: "Fork the whole workspace into a fresh copy you can change freely.",
    prompt: "",
    action: "duplicate",
  },
  {
    app: "Base44",
    title: "Add a sign-in screen",
    blurb: "A polished client-side account screen with a saved session.",
    prompt:
      "Add a sign-in and sign-up screen with email and password fields, validation, and a session saved in localStorage. Show the signed-in name in a small account menu with a sign-out action. Keep it client-side only and say so on the screen.",
  },
  {
    app: "Loveable",
    title: "One-pass polish",
    blurb: "A focused visual pass that keeps every working feature intact.",
    prompt:
      "Do a polish pass only. Improve spacing, type hierarchy, color contrast, hover and focus states, and mobile layout. Do not add or remove features, and keep all existing behavior working.",
  },
  {
    app: "Figma",
    title: "Extract design tokens",
    blurb: "Pull every color and font in the project into one reusable palette.",
    prompt: "",
    action: "studio:design",
  },
  {
    app: "Appy Pie",
    title: "Start from a template",
    blurb: "Browse ready-made app shapes instead of a blank page.",
    prompt: "",
    action: "templates",
  },
  {
    app: "ReTool",
    title: "Build an admin table",
    blurb: "A dense, filterable data table with inline editing.",
    prompt:
      "Add an admin table for the app's main records with search, sortable columns, add and delete actions, and a saved JSON backup in localStorage. Include an empty state and a confirm step before deleting.",
  },
  {
    app: "Bolt.new",
    title: "Download the source",
    blurb: "Take the whole project out as a zip, ready for any host.",
    prompt: "",
    action: "export",
  },
  {
    app: "Emergent",
    title: "Run an agent swarm",
    blurb: "Bring in specialists to plan, design, and test one build.",
    prompt:
      "Plan this build with a web researcher for current facts, an expert for the architecture, and a catalyst for a tight execution plan. Then implement the best plan and test the result. Keep the tasks small and specific.",
  },
  {
    app: "Freebuff",
    title: "One-line live narration",
    blurb: "A single checkpoint line while work runs, with the log collapsed.",
    prompt:
      "Add a compact status line to this app that updates while a long task is running. Keep one line only, put the detailed log behind a collapsible 'Details' control, and stop the line when the task finishes.",
  },
  {
    app: "Dyad",
    title: "Make it local-first",
    blurb: "Everything works offline and the data never leaves the browser.",
    prompt:
      "Make this app fully local-first. Persist all user data in localStorage with a safe read/write wrapper, handle missing or broken JSON, show a clear empty state on first load, and add an export/import JSON backup.",
  },
  {
    app: "VS Code",
    title: "Command palette",
    blurb: "Jump to any panel or action with Ctrl/Cmd+K.",
    prompt: "",
    action: "palette",
  },
  {
    app: "Render",
    title: "Deploy and read the log",
    blurb: "Publish the app and keep the deployment steps visible.",
    prompt: "",
    action: "publish",
  },
  {
    app: "Hostinger Horizons",
    title: "Publish to the web",
    blurb: "Connect free hosting and get a public link in one pass.",
    prompt: "",
    action: "publish",
  },
  {
    app: "Factory",
    title: "Parallel droids",
    blurb: "Split independent chores across agents and wait for all of them.",
    prompt:
      "Split this work across three agents: one for content and copy, one for layout and CSS, one for interaction and accessibility. Give each a narrow task, then merge the results and test the whole app.",
  },
  {
    app: "Devin",
    title: "Session replay",
    blurb: "A readable record of what happened, in order, with timestamps.",
    prompt:
      "Add an activity log to this app that records each important action with a time, a short label, and the affected item. Keep the last 100 entries in localStorage and add a clear-log button.",
  },
  {
    app: "Runable",
    title: "Demo mode",
    blurb: "A one-click runnable example so nobody starts at zero.",
    prompt:
      "Add a 'Load demo' button that fills the app with realistic sample data, and a 'Reset' button that clears it. Make the demo work without any network request.",
  },
  {
    app: "Rocket AI",
    title: "Idea to scaffold",
    blurb: "Turn one sentence into a complete first screen.",
    prompt:
      "Turn this one-sentence idea into a complete first version: choose the audience, the single core action, the screens needed, and the copy. Build the whole first version now, not a plan.",
  },
  {
    app: "Runner",
    title: "Task queue",
    blurb: "Queue chores and show what is running, done, or failed.",
    prompt:
      "Add a task queue to this app with queued, running, done, and failed states. Let the user add a task, retry a failed one, and clear completed ones. Persist the queue in localStorage.",
  },
  {
    app: "Cursor",
    title: "Multi-file edit",
    blurb: "Change the markup, styles, and script together in one pass.",
    prompt:
      "Make one coordinated change across every file it touches: update the markup, the styles, and the behavior together. Read each file first, then write complete files, and run a test at the end.",
  },
  {
    app: "OpenCode",
    title: "Keyboard-first app",
    blurb: "Every primary action has a shortcut and a visible hint.",
    prompt:
      "Make this app keyboard-first. Add shortcuts for the main actions, a '?' shortcut sheet, visible focus rings, and a jump-to-search field. Every mouse action must also be reachable from the keyboard.",
  },
  {
    app: "LM Studio",
    title: "Choose a local model",
    blurb: "Run an open model on this PC with no key and no upload.",
    prompt: "",
    action: "settings",
  },
  {
    app: "Github",
    title: "Push to a repository",
    blurb: "Send the project to a real repo with one commit.",
    prompt: "",
    action: "settings",
  },
  {
    app: "Gitlab",
    title: "Pages pipeline",
    blurb: "A CI file that publishes the static folder to GitLab Pages.",
    prompt:
      "Add a .gitlab-ci.yml that publishes this static site to GitLab Pages, plus a short README section explaining the one setting the user must turn on. Do not change the app itself.",
  },
  {
    app: "Manus",
    title: "Plan, then execute",
    blurb: "A visible checklist that stays accurate while work happens.",
    prompt:
      "Plan this task as a short checklist first, keep exactly one item active while you work, mark each item done as you finish it, and end with a summary of what changed.",
  },
  {
    app: "Wix",
    title: "Drag to rearrange",
    blurb: "Reorder the page's sections by dragging, with a saved order.",
    prompt:
      "Make the main page sections draggable to reorder. Show a clear drag handle and drop indicator, save the order in localStorage, and add a reset-order button. Keep it usable with the keyboard too.",
  },
  {
    app: "Anything.com",
    title: "Anything prompt",
    blurb: "One plain sentence becomes a complete app.",
    prompt:
      "Build the smallest complete app that matches this idea. Pick sensible defaults, write real copy, and make every control work. Do not ask follow-up questions.",
  },
  {
    app: "Bolt.diy",
    title: "Self-host notes",
    blurb: "A short deploy page for people who want to run it themselves.",
    prompt:
      "Add a README section that explains how to run this static app locally and host it on any static host. Include the exact folder to upload and the files that must stay together.",
  },
  {
    app: "Netlify",
    title: "Netlify drop",
    blurb: "Export a folder you can drag straight into Netlify Drop.",
    prompt: "",
    action: "export",
  },
  {
    app: "Vercel",
    title: "Vercel-ready export",
    blurb: "A clean static bundle with relative paths and no build step.",
    prompt:
      "Check that every asset path is relative, there is no build step, and index.html is the entry point. Fix anything that would break a static host, then leave the project ready to upload.",
  },
  {
    app: "V0",
    title: "Three variants",
    blurb: "Same content, three distinct design directions to choose from.",
    prompt:
      "Build three distinct visual directions for the main screen: one editorial, one dense and utilitarian, one playful. Use the same content in each, then keep the strongest one and explain the choice in one sentence.",
  },
  {
    app: "Vibecode",
    title: "Phone preview",
    blurb: "Check the layout at a real phone width before shipping.",
    prompt: "",
    action: "device",
  },
  {
    app: "Onspace",
    title: "Local data layer",
    blurb: "A tiny typed store instead of scattered localStorage calls.",
    prompt:
      "Replace scattered localStorage calls with one small data module: load, save, list, add, update, remove, and reset. Guard against broken JSON and keep the rest of the app unchanged.",
  },
  {
    app: "Sintra AI",
    title: "Add an AI teammate",
    blurb: "A helper panel with a clear role, not a generic chatbot.",
    prompt:
      "Add a small AI helper panel to this app with one narrow job: it summarizes the current data in plain language and suggests the next action. Make the panel collapsible and keep it out of the way.",
  },
  {
    app: "Ninox",
    title: "Table and board views",
    blurb: "See the same records as a table or as cards.",
    prompt:
      "Add a view switch that shows the same records as a table and as cards. Both views must edit the same data, share filters, and persist the chosen view in localStorage.",
  },
  {
    app: "Google AI Studio",
    title: "System instructions",
    blurb: "Keep a reusable brief and spec with the project.",
    prompt: "",
    action: "studio:notes",
  },
  {
    app: "Xcode",
    title: "Device frames",
    blurb: "Preview desktop, tablet, and phone without leaving the builder.",
    prompt: "",
    action: "device",
  },
  {
    app: "QuantumByte",
    title: "Performance budget",
    blurb: "Keep the page under a small, explicit size budget.",
    prompt:
      "Audit this app for weight: inline small icons, remove unused CSS, avoid libraries, and defer scripts. Report the before and after file sizes and keep the page under 200 KB total.",
  },
  {
    app: "Softr",
    title: "Import a CSV",
    blurb: "Paste spreadsheet rows and get a working data view.",
    prompt: "",
    action: "studio:data",
  },
  {
    app: "Mendix",
    title: "Model the flow",
    blurb: "Write the entities, states, and rules before the screens.",
    prompt: "",
    action: "studio:notes",
  },
  {
    app: "Fly.io",
    title: "Ship a static bundle",
    blurb: "Publish the same files anywhere, with no server to maintain.",
    prompt: "",
    action: "publish",
  },
  {
    app: "Mocha AI",
    title: "Test the app",
    blurb: "Run the built-in checks and fix every reported failure.",
    prompt:
      "Run test_app now. Read every failure, fix the cause, and run it again until it passes. Then click through the main action and report what you checked.",
  },
  {
    app: "Glide",
    title: "Spreadsheet to app",
    blurb: "Turn pasted rows into searchable, editable cards.",
    prompt: "",
    action: "studio:data",
  },
  {
    app: "Bubble AI",
    title: "Rules, not spaghetti",
    blurb: "Centralize the app's logic in one readable place.",
    prompt:
      "Pull the app's business rules into one small, named module with plain functions. Call it from the UI, keep the behavior identical, and add comments only where the rule is not obvious.",
  },
  {
    app: "Adalo",
    title: "Native-feeling mobile",
    blurb: "Bottom navigation, large tap targets, and safe-area spacing.",
    prompt:
      "Make the app feel native on a phone: bottom navigation, 44px tap targets, safe-area padding, no horizontal scroll, and a layout that works at 360px wide.",
  },
  {
    app: "Aider",
    title: "Restore a checkpoint",
    blurb: "Go back to the project exactly as it was before a risky change.",
    prompt: "",
    action: "studio:snapshots",
  },
  {
    app: "Kilo code",
    title: "Pick the right model",
    blurb: "Route small edits to a fast model and hard builds to a strong one.",
    prompt: "",
    action: "settings",
  },
  {
    app: "Kiro",
    title: "Spec-driven build",
    blurb: "Agree on the spec, then implement against it.",
    prompt: "",
    action: "studio:notes",
  },
  {
    app: "Appifex",
    title: "Screen inventory",
    blurb: "List every screen, its job, and its one primary action.",
    prompt:
      "List every screen this app needs, the job of each screen, and the single primary action on each. Then build any missing screens and connect the navigation.",
  },
  {
    app: "Avyrix AI",
    title: "Accessibility pass",
    blurb: "Labels, focus order, contrast, and reduced motion.",
    prompt:
      "Do an accessibility pass: semantic landmarks, labels on every control, a logical focus order, visible focus states, 4.5:1 text contrast, alt text, and prefers-reduced-motion support. Fix every issue you find.",
  },
  {
    app: "Snapp AI",
    title: "Snap to a grid",
    blurb: "One spacing and type scale used everywhere.",
    prompt:
      "Replace ad-hoc spacing and font sizes with one 4px spacing scale and one type scale. Use CSS custom properties and keep the visual result close to what it is now.",
  },
  {
    app: "Vulk",
    title: "Empty, full, broken",
    blurb: "Handle the three states most apps forget.",
    prompt:
      "Make every list and form handle three states: empty, full, and broken saved data. Write a useful empty state, keep long lists usable, and recover from malformed JSON without a blank screen.",
  },
  {
    app: "Totalum",
    title: "CRUD in one place",
    blurb: "Create, read, update, and delete without duplicated code.",
    prompt:
      "Add complete create, read, update, and delete flows for the main record. Keep one source of truth, confirm destructive actions, and show a clear success message after each change.",
  },
  {
    app: "FlutterFlow",
    title: "Export the source",
    blurb: "Leave with files you can host or hand to another tool.",
    prompt: "",
    action: "export",
  },
  {
    app: "AppMare",
    title: "Onboarding",
    blurb: "A short first-run explanation that can be dismissed.",
    prompt:
      "Add a three-step first-run onboarding card that explains what the app does, the main action, and where data is saved. Let the user skip it, and remember the choice in localStorage.",
  },
  {
    app: "Codex",
    title: "Parallel tasks",
    blurb: "Split independent fixes and merge the results.",
    prompt:
      "Find three independent improvements in this project, fix them one at a time without breaking the others, and test after each change. Report each fix in one line.",
  },
  {
    app: "FreeMilk",
    title: "Free-tier friendly",
    blurb: "No paid API, no server, no hidden key.",
    prompt:
      "Make sure this app needs no paid service: no API key, no server, no external database. Replace anything that requires one with a working local alternative and note the limit in one sentence.",
  },
  {
    app: "Blanks",
    title: "Start from nothing",
    blurb: "A clean, minimal skeleton with real content.",
    prompt:
      "Build the smallest honest version of this app: one page, three files, real copy, and one working interaction. No placeholder sections and no dead controls.",
  },
  {
    app: "AppForge",
    title: "Three-file build",
    blurb: "index.html, styles.css, app.js — nothing extra.",
    prompt:
      "Consolidate this project into index.html, styles.css, and app.js. Keep every feature working, use relative paths, and remove files that are no longer needed.",
  },
  {
    app: "Windsurf",
    title: "Context bar",
    blurb: "Show which files the current change depends on.",
    prompt:
      "Add a small context bar to this app's dev notes that lists the files involved in the current change and why. Keep it out of the user-facing UI.",
  },
  {
    app: "Warp",
    title: "Block output",
    blurb: "Group console output into readable, copyable blocks.",
    prompt: "",
    action: "console",
  },
  {
    app: "Zed",
    title: "Share a read-only view",
    blurb: "A clean, linkable read-only mode for showing work.",
    prompt:
      "Add a read-only mode that hides editing controls when the URL contains ?view=1, so the app can be shown without accidental changes. Keep navigation and filters working.",
  },
  {
    app: "Notion",
    title: "Project notes",
    blurb: "A private brief and changelog kept beside the app.",
    prompt: "",
    action: "studio:notes",
  },
  {
    app: "n8n",
    title: "Automation rules",
    blurb: "If this happens, do that — without a backend.",
    prompt:
      "Add a simple automation builder: choose a trigger from the app's own events, add one condition, and pick an action such as showing a toast, adding a record, or exporting JSON. Save rules in localStorage and list them with on/off switches.",
  },
  {
    app: "Cline",
    title: "Checkpoints and rollback",
    blurb: "Snapshot before a risky change and restore in one click.",
    prompt: "",
    action: "studio:snapshots",
  },
];
