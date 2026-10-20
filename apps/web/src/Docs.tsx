import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DocArticle } from "./docsPages";
import { githubUrl, SiteFooter, SiteHeader } from "./site";

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

const flatPages = docGroups.flatMap((group) => group.pages.map((page) => ({ ...page, group: group.label })));

export function docsPageFromPath(path: string): DocsPage | null {
  return flatPages.find((page) => page.href === path)?.id ?? null;
}

export function docTitle(page: DocsPage): string {
  return flatPages.find((entry) => entry.id === page)?.label ?? "Docs";
}

function DocsNav({ current }: { current: DocsPage }) {
  const navRef = useRef<HTMLElement>(null);
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!active || !navRef.current) return;
    setMarker({ top: active.offsetTop, height: active.offsetHeight });
  }, [current]);

  return (
    <nav ref={navRef} className="docs-nav" aria-label="Documentation">
      {marker && (
        <span className="docs-marker" style={{ transform: `translateY(${marker.top}px)`, height: marker.height }} aria-hidden="true" />
      )}
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

function DocsContents({ current }: { current: DocsPage }) {
  const [open, setOpen] = useState(false);
  const entry = flatPages.find((page) => page.id === current)!;

  useEffect(() => setOpen(false), [current]);

  return (
    <div className={`docs-contents${open ? " open" : ""}`}>
      <button type="button" className="docs-contents-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="docs-contents-where">
          <span>{entry.group}</span>
          <strong>{entry.label}</strong>
        </span>
        <span className="docs-contents-icon" aria-hidden="true" />
        <span className="sr-only">Contents</span>
      </button>
      {open && <DocsNav current={current} />}
    </div>
  );
}

export function Docs({ page }: { page: DocsPage }) {
  const index = flatPages.findIndex((entry) => entry.id === page);
  const previous = flatPages[index - 1];
  const next = flatPages[index + 1];
  const href = flatPages[index].href;

  return (
    <div className="site docs">
      <SiteHeader path={href} />
      <div className="docs-shell">
        <aside className="docs-side">
          <DocsNav current={page} />
        </aside>
        <main className="docs-main">
          <DocsContents current={page} />
          <article key={page} className="docs-body">
            <DocArticle page={page} />
          </article>
          <nav className="docs-pager" aria-label="Previous and next">
            {previous ? (
              <a className="pager-link prev" href={previous.href}>
                <span>Previous</span>
                <strong>{previous.label}</strong>
              </a>
            ) : (
              <span />
            )}
            {next && (
              <a className="pager-link next" href={next.href}>
                <span>Next</span>
                <strong>{next.label}</strong>
              </a>
            )}
          </nav>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
