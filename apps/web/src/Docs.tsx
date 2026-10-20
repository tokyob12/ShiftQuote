import { DocArticle } from "./docsPages";
import { Logo } from "./Logo";

export const githubUrl = "https://github.com/tokyob12/ShiftQuote";
export const xUrl = "https://x.com/shift_hl";

const headerLinks = [
  { id: "home", href: "/docs", label: "Docs" },
  { id: "how", href: "/docs/how-it-works", label: "How it works" },
  { id: "why", href: "/docs/why-shift", label: "Why Shift" },
] as const;

export const docGroups = [
  {
    label: "Introduction",
    pages: [
      { id: "home", href: "/docs", label: "Docs" },
      { id: "why", href: "/docs/why-shift", label: "Why Shift" },
      { id: "glossary", href: "/docs/glossary", label: "Glossary" },
      { id: "faq", href: "/docs/faq", label: "FAQ" },
    ],
  },
  {
    label: "The position",
    pages: [
      { id: "how", href: "/docs/how-it-works", label: "How it works" },
      { id: "locations", href: "/docs/locations", label: "Locations" },
      { id: "decisions", href: "/docs/decisions", label: "Decisions" },
    ],
  },
  {
    label: "Math",
    pages: [{ id: "math", href: "/docs/math", label: "Pricing" }],
  },
  {
    label: "Contracts",
    pages: [{ id: "contracts", href: "/docs/contracts", label: "Deployment" }],
  },
  {
    label: "Books",
    pages: [{ id: "books", href: "/docs/books", label: "Books" }],
  },
  {
    label: "Testnet",
    pages: [{ id: "testnet", href: "/docs/testnet", label: "Try the desk" }],
  },
  {
    label: "Roadmap",
    pages: [{ id: "roadmap", href: "/docs/roadmap", label: "What is next" }],
  },
] as const;

export type DocsPage = (typeof docGroups)[number]["pages"][number]["id"];

export function docsPageFromPath(path: string): DocsPage | null {
  for (const group of docGroups) {
    for (const page of group.pages) {
      if (page.href === path) return page.id;
    }
  }
  return null;
}

export function SiteNav({ current }: { current?: DocsPage }) {
  return (
    <nav className="site-nav" aria-label="Docs">
      {headerLinks.map((page) => (
        <a key={page.id} href={page.href} aria-current={page.id === current ? "page" : undefined}>
          {page.label}
        </a>
      ))}
      <a href={githubUrl} target="_blank" rel="noreferrer">
        GitHub
      </a>
    </nav>
  );
}

function DocsNav({ current }: { current: DocsPage }) {
  return (
    <nav className="docs-nav" aria-label="Documentation">
      {docGroups.map((group) => (
        <div key={group.label} className="docs-group">
          <p>{group.label}</p>
          {group.pages.map((page) => (
            <a key={page.id} href={page.href} aria-current={page.id === current ? "page" : undefined}>
              {page.label}
            </a>
          ))}
        </div>
      ))}
      <div className="docs-group">
        <p>Code</p>
        <a href={githubUrl} target="_blank" rel="noreferrer">
          GitHub
        </a>
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <a href={xUrl} target="_blank" rel="noreferrer">
        @shift_hl
      </a>
      <a href={githubUrl} target="_blank" rel="noreferrer">
        GitHub
      </a>
    </footer>
  );
}

export function Docs({ page }: { page: DocsPage }) {
  return (
    <div className="app docs">
      <header>
        <a className="brand" href="/">
          <Logo />
        </a>
        <SiteNav current={page} />
        <a className="desk-link" href="/app">
          Open the desk
        </a>
      </header>
      <div className="docs-shell">
        <DocsNav current={page} />
        <article className="docs-body">
          <DocArticle page={page} />
        </article>
      </div>
      <SiteFooter />
    </div>
  );
}
