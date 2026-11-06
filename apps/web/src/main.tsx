import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Docs, docTitle, docsPageFromPath } from "./Docs";
import { Landing } from "./Landing";
import { Match } from "./Match";
import { navigate, useLinkInterception, usePath } from "./router";
import { deskPath, matchIsHome, matchPath } from "./site";
import "./styles.css";

function Root() {
  useLinkInterception();
  const path = usePath();
  const isDesk = path === deskPath || path === "/app";
  const isMatch = path === matchPath || path.startsWith(`${matchPath}/`) || (matchIsHome && path === "/");
  const docsPage = isDesk || isMatch ? null : docsPageFromPath(path);

  useEffect(() => {
    if (path === "/app") navigate(deskPath, { replace: true });
  }, [path]);

  useEffect(() => {
    document.title = isDesk ? "Shift · Desk" : isMatch ? "Shift · Match" : docsPage ? `Shift · ${docTitle(docsPage)}` : "Shift";
  }, [isDesk, isMatch, docsPage]);

  if (isDesk) return <App />;
  if (isMatch) return <Match />;
  if (docsPage) return <Docs page={docsPage} />;
  return <Landing />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
