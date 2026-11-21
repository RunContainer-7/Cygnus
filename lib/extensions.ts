export const EXTENSION_CATEGORIES = [
  "Quality",
  "Design",
  "Growth",
  "Performance",
  "Data",
] as const;

export type ExtensionCategory = (typeof EXTENSION_CATEGORIES)[number];

/** A prompt-only build add-on. Nothing third-party runs on the user's machine. */
export type BuildExtension = {
  id: string;
  name: string;
  version: string;
  category: ExtensionCategory;
  mark: string;
  blurb: string;
  adds: string[];
  prompt: string;
};

export type InstalledExtensionPrompt = {
  name: string;
  version: string;
  prompt: string;
};

export const EXTENSIONS: BuildExtension[] = [
  {
    id: "accessibility-audit",
    name: "Accessibility Audit",
    version: "1.0.0",
    category: "Quality",
    mark: "Aa",
    blurb: "Keyboard, contrast, landmarks and screen-reader fixes on every page.",
    adds: [
      "WCAG 2.2 AA pass over each page",
      "Skip link, landmarks and visible focus",
      "Reduced motion and live-region fixes",
    ],
    prompt:
      "Audit every page to WCAG 2.2 AA and fix what fails: one h1 with ordered headings; header, nav, main and footer landmarks; a working skip link; visible :focus-visible styles; 4.5:1 text contrast; every input has a label, name and autocomplete; informative alt text; keyboard-operable menus and dialogs; and aria-live for status changes. Prefer native HTML over ARIA. Respect prefers-reduced-motion and never trap focus.",
  },
  {
    id: "seo-social",
    name: "SEO & Social Cards",
    version: "1.0.0",
    category: "Growth",
    mark: "SEO",
    blurb: "Titles, descriptions, Open Graph and JSON-LD that match the real page.",
    adds: [
      "Unique title, description and canonical",
      "Open Graph and Twitter cards",
      "JSON-LD for the actual entity",
    ],
    prompt:
      "Give every page a unique title and meta description, a canonical link, Open Graph and Twitter card tags, and one descriptive h1. Add JSON-LD only for the entity the page actually represents, plus robots.txt and sitemap.xml on multi-page sites. Use absolute URLs only when the project has a real deployment domain; otherwise keep the tags valid without inventing one. Never invent ratings, reviews, addresses, prices or business details.",
  },
  {
    id: "pwa-offline",
    name: "PWA & Offline",
    version: "1.0.0",
    category: "Performance",
    mark: "PWA",
    blurb: "Installable app shell with a real offline fallback and safe caching.",
    adds: [
      "Web app manifest and icons",
      "Service worker with offline.html",
      "Install button only when supported",
    ],
    prompt:
      "Make the site installable: add a web app manifest with name, short_name, start_url, display standalone, theme and background colours, plus 192px and 512px icons; register a service worker that precaches the app shell, serves an offline.html fallback for failed navigations, and removes old caches. Show an Install button only after beforeinstallprompt fires, and keep core content readable without JavaScript. Do not cache user-specific data.",
  },
  {
    id: "motion-polish",
    name: "Motion Polish",
    version: "1.0.0",
    category: "Design",
    mark: "~",
    blurb: "One coherent motion system that stays subtle, quick and accessible.",
    adds: [
      "Shared easing and duration tokens",
      "Hover, press and entrance feedback",
      "Full reduced-motion fallback",
    ],
    prompt:
      "Add one coherent motion system: CSS custom properties for duration and easing, purposeful entrance transitions, clear hover and press feedback, and at most one ambient animation. Animate transform and opacity rather than layout properties, never block input, and disable all nonessential motion under prefers-reduced-motion. No scroll-jacking, no parallax that hides content, and no infinite distracting loops.",
  },
  {
    id: "chart-kit",
    name: "Chart Kit",
    version: "1.0.0",
    category: "Data",
    mark: "CH",
    blurb: "Library-free SVG charts with focusable tooltips and a data table.",
    adds: [
      "Responsive charts without libraries",
      "Accessible titles and hidden tables",
      "Honest sample-data labels",
    ],
    prompt:
      "Build charts as inline SVG without libraries: labelled axes, sensible gridlines, a zero baseline where appropriate, a responsive viewBox, accessible title and desc elements, keyboard-focusable tooltips, and a visually hidden data table with the same values. Use the project's real data, and label any example data as sample data. Never imply the numbers are live.",
  },
  {
    id: "form-guard",
    name: "Form Guard",
    version: "1.0.0",
    category: "Quality",
    mark: "FV",
    blurb: "Validation, error summaries and drafts that behave like a real form.",
    adds: [
      "Inline validation on blur and submit",
      "Linked errors and aria-invalid",
      "Working success state and saved drafts",
    ],
    prompt:
      "Forms must validate inline on blur and again on submit, show an error summary whose links focus the fields, set aria-invalid and aria-describedby, keep entered values after a failure, and save a draft in localStorage when that helps. Provide a real success state on the page; there is no backend, so never claim an email, payment or submission was sent. Disable submit only while processing.",
  },
  {
    id: "design-tokens",
    name: "Design Tokens",
    version: "1.0.0",
    category: "Design",
    mark: "{}",
    blurb: "A single token layer with light and dark palettes that actually switch.",
    adds: [
      "Colour, spacing, radius and type tokens",
      "Light/dark palettes with a working toggle",
      "AA contrast in both schemes",
    ],
    prompt:
      "Create one :root token layer for colour, spacing, radius, type scale and shadows, then build light and dark palettes with prefers-color-scheme plus a manual toggle persisted in localStorage. Keep WCAG AA contrast in both schemes, avoid pure black and pure white, and replace ad-hoc values throughout with the tokens. The toggle must update live and survive a reload.",
  },
  {
    id: "launch-page",
    name: "Launch Page",
    version: "1.0.0",
    category: "Growth",
    mark: "LP",
    blurb: "A conversion page with specific copy, real proof and working CTAs.",
    adds: [
      "Hero promise and primary CTA",
      "Benefits, pricing and FAQ structure",
      "Specific copy, no lorem ipsum",
    ],
    prompt:
      "Structure the page for conversion: a specific hero promise with one primary CTA above the fold, three concrete benefits, proof only when real content exists, pricing when relevant, an FAQ that answers real objections, and a final CTA. Write specific copy and never use lorem ipsum, invented metrics, fake logos or fake testimonials. Every CTA must do something real on the page.",
  },
  {
    id: "performance-budget",
    name: "Performance Budget",
    version: "1.0.0",
    category: "Performance",
    mark: "PB",
    blurb: "Fast by default: no frameworks, sized media and a measured budget.",
    adds: [
      "No external JS or CSS libraries",
      "Sized images and deferred scripts",
      "Actual measurements, not guesses",
    ],
    prompt:
      "Keep the initial page fast: no frameworks or external JS, system fonts or at most one preconnected font with font-display swap, explicit width and height on media, lazy-loading below the fold, deferred scripts, and no layout shift from late content. Target under 150 KB compressed for the initial view. When a browser is available, measure and report actual load numbers instead of estimates.",
  },
  {
    id: "print-export",
    name: "Print & Export",
    version: "1.0.0",
    category: "Data",
    mark: "PX",
    blurb: "Print styles plus real CSV, JSON and clipboard export actions.",
    adds: [
      "Print stylesheet with clean page breaks",
      "Working CSV and JSON downloads",
      "Clipboard copy with visible feedback",
    ],
    prompt:
      "Add a print stylesheet that hides navigation and controls, expands link URLs, avoids page breaks inside cards, and renders black on white. Where the page holds data, add working CSV and JSON downloads through Blob URLs, and a copy-to-clipboard action with a visible success state. Export the values currently on screen, not placeholders, and revoke object URLs after use.",
  },
];

export const EXTENSION_IDS = new Set(EXTENSIONS.map((extension) => extension.id));

export function extensionById(id: string): BuildExtension | undefined {
  return EXTENSIONS.find((extension) => extension.id === id);
}
