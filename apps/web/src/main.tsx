import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Docs, docTitle, docsPageFromPath } from "./Docs";
import { Landing } from "./Landing";
import { navigate, useLinkInterception, usePath } from "./router";
import { deskPath } from "./site";
import "./styles.css";

function Root() {
  useLinkInterception();
  const path = usePath();
  const isDesk = path === deskPath || path === "/app";
  const docsPage = isDesk ? null : docsPageFromPath(path);

  useEffect(() => {
    if (path === "/app") navigate(deskPath, { replace: true });
  }, [path]);

  useEffect(() => {
    document.title = isDesk ? "Shift · Desk" : docsPage ? `Shift · ${docTitle(docsPage)}` : "Shift";
  }, [isDesk, docsPage]);

  if (isDesk) return <App />;
  if (docsPage) return <Docs page={docsPage} />;
  return <Landing />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
