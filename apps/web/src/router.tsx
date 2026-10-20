import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

const listeners = new Set<() => void>();

function normalize(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => normalize(window.location.pathname));
}

export function navigate(href: string, options: { replace?: boolean } = {}) {
  const url = new URL(href, window.location.href);
  const next = url.pathname + url.search + url.hash;
  const samePage = normalize(url.pathname) === normalize(window.location.pathname);
  if (options.replace) window.history.replaceState(null, "", next);
  else if (next !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.pushState(null, "", next);
  }
  listeners.forEach((listener) => listener());
  if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView();
  else if (!samePage || !options.replace) window.scrollTo(0, 0);
}

/** Same-origin links navigate in place, so pages switch without a reload. */
export function useLinkInterception() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/hl")) return;
      event.preventDefault();
      navigate(href);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** True once the element has scrolled into view. */
export function useInView(ref: RefObject<Element | null>, threshold = 0.35): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || seen) return;
    if (!("IntersectionObserver" in window)) {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, seen, threshold]);
  return seen;
}
