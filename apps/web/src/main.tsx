import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Landing } from "./Landing";
import "./styles.css";

const path = window.location.pathname.replace(/\/$/, "") || "/";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {path === "/app" ? <App /> : <Landing />}
  </StrictMode>,
);
