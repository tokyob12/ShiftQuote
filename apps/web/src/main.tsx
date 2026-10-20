import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Docs, docsPageFromPath } from "./Docs";
import { Landing } from "./Landing";
import "./styles.css";

const path = window.location.pathname.replace(/\/$/, "") || "/";
const docsPage = docsPageFromPath(path);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {path === "/app" ? <App /> : docsPage ? <Docs page={docsPage} /> : <Landing />}
  </StrictMode>,
);
