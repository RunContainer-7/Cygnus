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
    doc.innerHTML = `
      <div class="doc-head">
        <span class="doc-eyebrow">${section ? section.title : page.section}</span>
        <h1>${page.title}</h1>
        ${page.description ? `<p class="doc-lede">${page.description}</p>` : ""}
      </div>
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
