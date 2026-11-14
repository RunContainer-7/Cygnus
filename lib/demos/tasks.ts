import { escapeHtml, hueFromPrompt, titleFromPrompt } from "./shared";

export function buildTasksDemo(prompt: string) {
  const brand = escapeHtml(titleFromPrompt(prompt).slice(0, 30));
  const hue = hueFromPrompt(prompt);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${brand}</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main class="app">
    <header>
      <span class="dot"></span>
      <h1>${brand}</h1>
      <p class="sub">Offline demo — add a provider to build your real idea.</p>
    </header>
    <form id="form">
      <input id="input" placeholder="Add a task…" autocomplete="off" aria-label="New task" />
      <button type="submit">Add</button>
    </form>
    <div class="filters">
      <button type="button" data-filter="all" class="active">All</button>
      <button type="button" data-filter="active">Active</button>
      <button type="button" data-filter="done">Done</button>
    </div>
    <ul id="list"></ul>
    <p class="empty" id="empty">Nothing here yet — add your first task.</p>
    <footer>
      <span id="count">0 tasks left</span>
      <button type="button" id="clear">Clear done</button>
    </footer>
  </main>
  <script src="./app.js" defer></script>
</body>
</html>
`;

  const css = `:root {
  --hue: ${hue};
  --bg: #07090f;
  --fg: #edf1ff;
  --muted: #99a3c2;
  --line: rgba(255, 255, 255, 0.09);
  --accent: hsl(var(--hue) 92% 68%);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  padding: 48px 18px;
  display: grid;
  place-items: center;
  color: var(--fg);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  background:
    radial-gradient(800px 420px at 25% -10%, hsl(var(--hue) 90% 55% / 0.24), transparent 65%),
    var(--bg);
}
.app {
  width: min(560px, 100%);
  padding: 26px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
}
header { position: relative; }
.dot {
  display: inline-block; width: 9px; height: 9px; border-radius: 50%;
  background: var(--accent); box-shadow: 0 0 18px var(--accent);
}
h1 { margin: 8px 0 6px; font-size: 26px; letter-spacing: -0.03em; }
.sub { margin: 0 0 22px; color: var(--muted); font-size: 13px; }
form { display: flex; gap: 8px; }
input {
  flex: 1; min-width: 0; padding: 11px 13px;
  border: 1px solid var(--line); border-radius: 10px;
  background: rgba(0, 0, 0, 0.25); color: var(--fg);
  font: inherit; font-size: 14px; outline: none;
}
input:focus { border-color: var(--accent); }
form button {
  padding: 0 16px; border: 0; border-radius: 10px;
  background: var(--accent); color: #080a12;
  font: inherit; font-size: 14px; font-weight: 650; cursor: pointer;
}
.filters { display: flex; gap: 6px; margin: 16px 0 10px; }
.filters button {
  padding: 5px 10px; border: 1px solid transparent; border-radius: 999px;
  background: transparent; color: var(--muted);
  font: inherit; font-size: 12px; cursor: pointer;
}
.filters button.active { border-color: var(--line); background: rgba(255, 255, 255, 0.06); color: var(--fg); }
ul { display: flex; flex-direction: column; gap: 8px; max-height: 45vh; margin: 0; padding: 0; overflow: auto; list-style: none; }
.task {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}
.check {
  width: 20px; height: 20px; flex: none; padding: 0;
  border: 1px solid var(--line); border-radius: 50%;
  background: transparent; color: #080a12;
  font-size: 12px; line-height: 1; cursor: pointer;
}
.done .check { background: var(--accent); border-color: var(--accent); }
.label { flex: 1; font-size: 14px; overflow-wrap: anywhere; }
.done .label { color: var(--muted); text-decoration: line-through; }
.remove {
  padding: 2px 6px; border: 0; background: transparent;
  color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer;
}
.remove:hover { color: var(--fg); }
.empty { padding: 18px 0; color: var(--muted); font-size: 13px; text-align: center; }
footer { display: flex; align-items: center; justify-content: space-between; margin-top: 16px; color: var(--muted); font-size: 12px; }
#clear { border: 0; background: transparent; color: var(--muted); font: inherit; cursor: pointer; }
#clear:hover { color: var(--fg); }
`;

  const js = `(function () {
  var KEY = "cygnus-demo-tasks";
  var tasks = [];
  try { tasks = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (error) { tasks = []; }
  if (!Array.isArray(tasks)) tasks = [];

  var form = document.getElementById("form");
  var input = document.getElementById("input");
  var list = document.getElementById("list");
  var empty = document.getElementById("empty");
  var count = document.getElementById("count");
  var clear = document.getElementById("clear");
  var filterButtons = Array.prototype.slice.call(document.querySelectorAll("[data-filter]"));
  var filter = "all";

  function save() { try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch (error) {} }

  function render() {
    list.textContent = "";
    var visible = tasks.filter(function (task) {
      if (filter === "active") return !task.done;
      if (filter === "done") return task.done;
      return true;
    });
    visible.forEach(function (task) {
      var li = document.createElement("li");
      li.className = "task" + (task.done ? " done" : "");
      var check = document.createElement("button");
      check.className = "check";
      check.type = "button";
      check.setAttribute("aria-label", task.done ? "Mark as active" : "Mark as done");
      check.textContent = task.done ? "✓" : "";
      check.addEventListener("click", function () { task.done = !task.done; save(); render(); });
      var label = document.createElement("span");
      label.className = "label";
      label.textContent = task.text;
      var remove = document.createElement("button");
      remove.className = "remove";
      remove.type = "button";
      remove.setAttribute("aria-label", "Delete task");
      remove.textContent = "×";
      remove.addEventListener("click", function () {
        tasks = tasks.filter(function (t) { return t.id !== task.id; });
        save(); render();
      });
      li.appendChild(check); li.appendChild(label); li.appendChild(remove);
      list.appendChild(li);
    });
    empty.hidden = visible.length > 0;
    var left = tasks.filter(function (task) { return !task.done; }).length;
    count.textContent = left + (left === 1 ? " task left" : " tasks left");
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    tasks.push({ id: Date.now().toString(36), text: text, done: false });
    input.value = "";
    save(); render();
  });

  filterButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      filter = button.getAttribute("data-filter");
      filterButtons.forEach(function (item) { item.classList.toggle("active", item === button); });
      render();
    });
  });

  clear.addEventListener("click", function () {
    tasks = tasks.filter(function (task) { return !task.done; });
    save(); render();
  });

  render();
})();
`;

  return {
    files: [
      { path: "index.html", content: html },
      { path: "styles.css", content: css },
      { path: "app.js", content: js },
    ],
  };
}
