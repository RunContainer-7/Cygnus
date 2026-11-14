export type TemplateTone = "ink" | "mint" | "sand" | "rose" | "sky" | "lilac";

export type AppTemplate = {
  id: string;
  title: string;
  blurb: string;
  prompt: string;
  category: string;
  tone: TemplateTone;
  glyph: string;
  featured?: boolean;
};

export const TEMPLATES: AppTemplate[] = [
  {
    id: "coffee-landing",
    title: "Coffee subscription",
    blurb: "Hero, roast picker, pricing and a warm editorial feel.",
    prompt:
      "A landing page for a coffee subscription with a hero, three roast tiers, pricing and a signup section",
    category: "Marketing",
    tone: "sand",
    glyph: "◇",
    featured: true,
  },
  {
    id: "kanban-board",
    title: "Kanban board",
    blurb: "Drag-ready columns with local persistence and quick-add cards.",
    prompt:
      "A kanban task board with todo, doing and done columns, quick-add cards and localStorage persistence",
    category: "Productivity",
    tone: "mint",
    glyph: "▦",
    featured: true,
  },
  {
    id: "finance-dashboard",
    title: "Finance dashboard",
    blurb: "Cash flow, budgets and transactions in one calm view.",
    prompt:
      "A personal finance dashboard with a cash-flow chart, monthly budget and a filterable transaction list",
    category: "Finance",
    tone: "sky",
    glyph: "◔",
    featured: true,
  },
  {
    id: "portfolio",
    title: "Personal portfolio",
    blurb: "Selected work, a short story and a clear contact path.",
    prompt:
      "A minimal personal portfolio for a product designer with selected work, an about section and contact links",
    category: "Personal",
    tone: "ink",
    glyph: "◫",
  },
  {
    id: "habit-tracker",
    title: "Habit tracker",
    blurb: "A weekly grid, streaks and a reason to keep showing up.",
    prompt:
      "A habit tracker with a weekly completion grid, streaks, editable habits and localStorage persistence",
    category: "Productivity",
    tone: "rose",
    glyph: "◎",
  },
  {
    id: "recipe-box",
    title: "Recipe box",
    blurb: "Searchable recipes with tags, servings and cook mode.",
    prompt:
      "A recipe collection with search, category filters, ingredient lists and a step-by-step cook mode",
    category: "Lifestyle",
    tone: "sand",
    glyph: "◒",
  },
  {
    id: "saas-overview",
    title: "SaaS overview",
    blurb: "MRR, activation, churn and recent account activity.",
    prompt:
      "A SaaS analytics dashboard with MRR, activation and churn metrics, a growth chart and recent account activity",
    category: "Business",
    tone: "lilac",
    glyph: "◈",
  },
  {
    id: "event-page",
    title: "Event page",
    blurb: "A one-page launch for a meetup, workshop or conference.",
    prompt:
      "A one-page event site for a design meetup with schedule, speakers, venue details and an RSVP form",
    category: "Marketing",
    tone: "rose",
    glyph: "◇",
  },
  {
    id: "reading-list",
    title: "Reading list",
    blurb: "Books, status and notes that stay in the browser.",
    prompt:
      "A personal reading list with want-to-read, reading and finished shelves, notes and localStorage persistence",
    category: "Personal",
    tone: "mint",
    glyph: "☰",
  },
];

export const TEMPLATE_CATEGORIES = [
  "All",
  ...Array.from(new Set(TEMPLATES.map((template) => template.category))),
];
