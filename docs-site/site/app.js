(() => {
  "use strict";

  const state = { data: null, activeIndex: 0, results: [] };
  const $ = (selector) => document.querySelector(selector);

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const pathFor = (slug) => (slug === "overview" ? "/" : `/${slug}`);

  function currentSlug() {
    const raw = decodeURIComponent(window.location.pathname).replace(/\/+$/, "");
    if (!raw) return "overview";
    return raw.slice(1);
  }

  function flatPages() {
    if (!state.data) return [];
    return state.data.sections.flatMap((section) =>
      section.pages.map((slug) => state.data.pages[slug]).filter(Boolean),
    );
  }

  function buildSidebar() {
    const nav = $("#sidebar-nav");
    const slug = currentSlug();
    nav.innerHTML = state.data.sections
      .map((section) => {
        const links = section.pages
          .map((pageSlug) => {
            const page = state.data.pages[pageSlug];
            if (!page) return "";
            const active = pageSlug === slug ? " active" : "";
            return `<a class="nav-link${active}" href="${pathFor(pageSlug)}" data-link>${page.title}</a>`;
          })
          .join("");
        return `<div class="nav-group"><span class="nav-title">${section.title}</span>${links}</div>`;
      })
      .join("");
  }

  function buildToc(page) {
    const toc = $("#toc");
    if (!page.headings.length) {
      toc.innerHTML = "";
      return;
    }
    toc.innerHTML = `<span class="toc-title">On this page</span>${page.headings
      .map((heading) => `<a class="toc-link" href="#${heading.id}">${heading.text}</a>`)
      .join("")}`;
  }

  function formatBytes(bytes) {
    if (!bytes) return "";
    const mb = bytes / 1_000_000;
    return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)} MB`;
  }

  function downloadMeta(entry) {
    return [formatBytes(entry.bytes), "Windows x64"].filter(Boolean).join(" · ");
  }

  function homePanels() {
    const downloads = state.data.downloads;
    if (!downloads) return "";
    const button = (entry, label, primary) => {
      if (!entry) return "";
      const size = formatBytes(entry.bytes);
      return `<a class="download-button${primary ? " primary" : ""}" href="${escapeText(entry.url)}" target="_blank" rel="noreferrer">
        <span>${label}</span>${size ? `<small>${size}</small>` : ""}
      </a>`;
    };
    const panels = [
      {
        href: "/quickstart",
        kicker: "Getting started",
        title: "Build your first app",
        text: "Install, describe what you want, and get real files plus a live preview in about five minutes.",
      },
      {
        href: "/models",
        kicker: "Models",
        title: "Pick a brain",
        text: "Free hosted models need no key. On-device, Ollama, LM Studio and BYOK are one click away.",
      },
      {
        href: "/publishing",
        kicker: "Publishing",
        title: "Put it online",
        text: "Download a .zip or ship straight to Cloudflare Pages on your own free account.",
      },
      {
        href: "/agent-tools",
        kicker: "Under the hood",
        title: "See the tools",
        text: "write_file, read_file, search_files and the 24-round agent loop behind every build.",
      },
    ];
    return `<section class="download-hero home-hero">
      <span class="download-kicker">Windows · v${downloads.version} · MIT</span>
      <h2>Get Cygnus</h2>
      <p>Describe an app, then watch an agent write real HTML, CSS and JavaScript into a folder on this PC. No account, no npm install, no build step.</p>
      <div class="download-actions">
        ${button(downloads.setup, "Download installer", true)}
        ${button(downloads.portable, "Portable .exe", false)}
      </div>
      <p class="download-foot"><a href="/download" data-link>Install details</a><span>Windows 10/11 · x64</span></p>
    </section>
    <section class="panel-grid">
      ${panels
        .map(
          (panel) => `<a class="panel-card" href="${panel.href}" data-link>
        <span class="panel-kicker">${panel.kicker}</span>
        <span class="panel-title">${panel.title}</span>
        <span class="panel-text">${panel.text}</span>
        <span class="panel-arrow" aria-hidden="true">→</span>
      </a>`,
        )
        .join("")}
    </section>`;
  }

  function downloadPanels() {
    const downloads = state.data.downloads;
    if (!downloads) return "";
    const card = (entry, options) => {
      if (!entry) return "";
      return `<article class="download-card${options.primary ? " featured" : ""}">
        ${options.tag ? `<span class="download-tag">${options.tag}</span>` : ""}
        <h3>${options.title}</h3>
        <p class="download-file">${escapeText(entry.file)}</p>
        <p class="download-meta">${downloadMeta(entry)}</p>
        <a class="download-button${options.primary ? " primary" : ""}" href="${escapeText(entry.url)}" target="_blank" rel="noreferrer">${options.label}</a>
        <p class="download-note">${options.note}</p>
        ${
          entry.sha256
            ? `<details class="checksum"><summary>SHA-256</summary><code>${escapeText(entry.sha256)}</code></details>`
            : ""
        }
      </article>`;
    };
    return `<section class="download-hero">
      <span class="download-kicker">Latest release · v${downloads.version}</span>
      <h2>Download Cygnus</h2>
      <p>Grab the installer for a normal Windows install, or run the portable build from a single file. These links always match the version in the header.</p>
      <p class="download-foot"><a href="${escapeText(downloads.releaseUrl)}" target="_blank" rel="noreferrer">Release notes</a><span>·</span><a href="${escapeText(downloads.repo)}/releases" target="_blank" rel="noreferrer">All releases</a><span>·</span><a href="${escapeText(downloads.repo)}" target="_blank" rel="noreferrer">Source (MIT)</a></p>
    </section>
    <section class="download-grid">
      ${card(downloads.setup, {
        title: "Windows installer",
        tag: "Recommended",
        label: "Download installer",
        note: "Installs for your user, adds a Start-menu shortcut, and checks for updates on launch.",
        primary: true,
      })}
      ${card(downloads.portable, {
        title: "Portable",
        tag: "No install",
        label: "Download portable .exe",
        note: "Runs without installing. Keep the file anywhere; download a new one for updates.",
      })}
    </section>`;
  }

  function pager(page) {
    const pages = flatPages();
    const index = pages.findIndex((item) => item.slug === page.slug);
    const previous = pages[index - 1];
    const next = pages[index + 1];
    const cell = (target, direction) => {
      if (!target) return `<span class="pager-empty"></span>`;
      return `<a class="pager-link ${direction}" href="${pathFor(target.slug)}" data-link>
        <span class="pager-label">${direction === "prev" ? "Previous" : "Next"}</span>
        <span class="pager-title">${target.title}</span>
      </a>`;
    };
    return `<div class="pager">${cell(previous, "prev")}${cell(next, "next")}</div>`;
  }

  function renderPage() {
    const slug = currentSlug();
    const page = state.data.pages[slug];
    const doc = $("#doc");

    if (!page) {
      doc.innerHTML = `<div class="not-found">
        <span class="doc-eyebrow">404</span>
        <h1>That page moved off the map</h1>
        <p>The docs page “${escapeText(slug)}” does not exist. Start from the overview instead.</p>
        <a class="not-found-link" href="/" data-link>Back to the overview</a>
      </div>`;
      document.title = "Page not found · Cygnus docs";
      buildSidebar();
      $("#toc").innerHTML = "";
      window.scrollTo(0, 0);
      return;
    }

    const section = state.data.sections.find((item) => item.pages.includes(page.slug));
    const panels = page.slug === "overview" ? homePanels() : page.slug === "download" ? downloadPanels() : "";
    doc.innerHTML = `
      <div class="doc-head">
        <span class="doc-eyebrow">${section ? section.title : page.section}</span>
        <h1>${page.title}</h1>
        ${page.description ? `<p class="doc-lede">${page.description}</p>` : ""}
      </div>
      ${panels}
      <div class="doc-body">${page.html}</div>
      ${pager(page)}
    `;

    document.title = `${page.title} · Cygnus docs`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.setAttribute("content", page.description || page.title);
    $("#edit-link").href = `https://github.com/RunContainer-7/Cygnus/blob/main/docs-site/content/${page.slug}.md`;

    buildSidebar();
    buildToc(page);
    watchHeadings();
    window.scrollTo(0, 0);
    closeNav();
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"]/g, (character) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character];
    });
  }

  function navigate(path, push = true) {
    if (push) window.history.pushState({}, "", path);
    renderPage();
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-link]");
    if (!link) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.getAttribute("href"));
  });

  window.addEventListener("popstate", renderPage);

  // ---------- mobile navigation ----------

  function openNav() {
    $("#sidebar").classList.add("open");
    $("#scrim").hidden = false;
    $("#nav-toggle").setAttribute("aria-expanded", "true");
  }

  function closeNav() {
    $("#sidebar").classList.remove("open");
    $("#scrim").hidden = true;
    $("#nav-toggle").setAttribute("aria-expanded", "false");
  }

  $("#nav-toggle").addEventListener("click", () => {
    if ($("#sidebar").classList.contains("open")) closeNav();
    else openNav();
  });
  $("#scrim").addEventListener("click", closeNav);

  // ---------- search ----------

  const modal = $("#search-modal");
  const input = $("#search-input");
  const resultsBox = $("#search-results");

  function score(page, query) {
    let total = 0;
    if (page.title.toLowerCase().includes(query)) total += 8;
    if (page.description.toLowerCase().includes(query)) total += 3;
    for (const heading of page.headings) {
      if (heading.text.toLowerCase().includes(query)) total += 4;
    }
    if (page.text.includes(query)) total += 2;
    return total;
  }

  function snippet(page, query) {
    const index = page.text.indexOf(query);
    if (index === -1) return page.description || "";
    const start = Math.max(0, index - 60);
    const text = page.text.slice(start, start + 150).trim();
    return `${start > 0 ? "…" : ""}${text}${start + 150 < page.text.length ? "…" : ""}`;
  }

  function runSearch() {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      const featured = flatPages().slice(0, 6);
      state.results = featured;
      state.activeIndex = 0;
      resultsBox.innerHTML = `<span class="search-group">Popular pages</span>${featured
        .map((page, index) => resultRow(page, "", index))
        .join("")}`;
      return;
    }

    state.results = flatPages()
      .map((page) => ({ page, points: score(page, query) }))
      .filter((entry) => entry.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, 8)
      .map((entry) => entry.page);
    state.activeIndex = 0;

    if (!state.results.length) {
      resultsBox.innerHTML = `<div class="search-empty">No pages match “${escapeText(input.value)}”.</div>`;
      return;
    }

    resultsBox.innerHTML = state.results
      .map((page, index) => resultRow(page, snippet(page, query), index))
      .join("");
  }

  function resultRow(page, text, index) {
    const section = state.data.sections.find((item) => item.pages.includes(page.slug));
    return `<button class="search-result${index === state.activeIndex ? " active" : ""}" type="button" data-slug="${page.slug}">
      <span class="search-result-head">
        <span class="search-result-title">${page.title}</span>
        <span class="search-result-section">${section ? section.title : ""}</span>
      </span>
      ${text ? `<span class="search-result-text">${escapeText(text)}</span>` : ""}
    </button>`;
  }

  function highlight() {
    resultsBox.querySelectorAll(".search-result").forEach((row, index) => {
      row.classList.toggle("active", index === state.activeIndex);
    });
  }

  function openSearch() {
    modal.hidden = false;
    document.body.classList.add("searching");
    input.value = "";
    runSearch();
    window.setTimeout(() => input.focus(), 20);
  }

  function closeSearch() {
    modal.hidden = true;
    document.body.classList.remove("searching");
  }

  $("#search-trigger").addEventListener("click", openSearch);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeSearch();
  });

  input.addEventListener("input", runSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSearch();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.activeIndex = Math.min(state.activeIndex + 1, state.results.length - 1);
      highlight();
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      state.activeIndex = Math.max(state.activeIndex - 1, 0);
      highlight();
    }
    if (event.key === "Enter") {
      const page = state.results[state.activeIndex];
      if (!page) return;
      closeSearch();
      navigate(pathFor(page.slug));
    }
  });

  resultsBox.addEventListener("click", (event) => {
    const row = event.target.closest("[data-slug]");
    if (!row) return;
    closeSearch();
    navigate(pathFor(row.getAttribute("data-slug")));
  });

  document.addEventListener("keydown", (event) => {
    const modifier = isMac ? event.metaKey : event.ctrlKey;
    if (modifier && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (modal.hidden) openSearch();
      else closeSearch();
    }
    if (event.key === "Escape" && !modal.hidden) closeSearch();
  });

  // ---------- toc highlight ----------

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        document.querySelectorAll(".toc-link").forEach((link) => {
          link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`);
        });
      }
    },
    { rootMargin: "-80px 0px -70% 0px" },
  );

  function watchHeadings() {
    observer.disconnect();
    document.querySelectorAll(".doc-body h2[id]").forEach((heading) => observer.observe(heading));
  }

  // ---------- boot ----------

  fetch("/content.json")
    .then((response) => {
      if (!response.ok) throw new Error("Could not load the docs index.");
      return response.json();
    })
    .then((data) => {
      state.data = data;
      $("#doc-version").textContent = `v${data.version}`;
      $("#search-hint").textContent = isMac ? "⌘K" : "Ctrl K";
      renderPage();
      watchHeadings();
    })
    .catch(() => {
      $("#doc").innerHTML = `<div class="not-found">
        <h1>Docs are not available</h1>
        <p>The page index failed to load. Reload the page, or read the docs in the repository.</p>
      </div>`;
    });

})();
