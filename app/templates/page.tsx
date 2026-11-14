"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import TemplateCard from "@/components/TemplateCard";
import { TEMPLATE_CATEGORIES, TEMPLATES } from "@/lib/templates";

export default function TemplatesPage() {
  const router = useRouter();
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return TEMPLATES.filter((template) => {
      if (category !== "All" && template.category !== category) return false;
      if (!needle) return true;
      return `${template.title} ${template.blurb} ${template.category} ${template.prompt}`
        .toLowerCase()
        .includes(needle);
    });
  }, [category, query]);

  function useTemplate(prompt: string) {
    router.push(`/?prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <div className="page-scroll templates-page">
      <div className="page-frame">
        <header className="page-head">
          <span className="page-eyebrow">Templates</span>
          <div className="page-head-row">
            <div>
              <h1>A better starting point.</h1>
              <p>
                Pick a shape, then make it yours. Every template is just a prompt — nothing
                is locked down.
              </p>
            </div>
            <span className="page-count">
              {TEMPLATES.length} <span>starts</span>
            </span>
          </div>
        </header>

        <div className="template-toolbar">
          <label className="page-search">
            <Icon name="search" size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates"
              aria-label="Search templates"
              spellCheck={false}
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <Icon name="close" size={13} />
              </button>
            ) : null}
          </label>

          <div className="category-row" aria-label="Template categories">
            {TEMPLATE_CATEGORIES.map((item) => (
              <button
                key={item}
                type="button"
                className={category === item ? "active" : ""}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {filtered.length > 0 ? (
          <div className="templates-grid">
            {filtered.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                onUse={() => useTemplate(template.prompt)}
              />
            ))}
          </div>
        ) : (
          <div className="page-empty">
            <span className="page-empty-icon">
              <Icon name="templates" size={22} />
            </span>
            <strong>No templates match.</strong>
            <p>Try another category or a broader search.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("All");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
