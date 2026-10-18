import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

/**
 * A hidden tab gets no animation frames, so CSS transitions stop advancing
 * part-way and stay there. That is not cosmetic: it was found freezing three
 * real states — the band-card numerals at 0, the nav pill at zero width, and
 * the active tab label stuck in its old colour, because each had a
 * transitioned property carrying its resting value.
 *
 * Dropping transitions while hidden snaps every one of them straight to its
 * target instead of parking it mid-flight. They animate normally again the
 * moment the tab is visible.
 */
const freezeWhenHidden = () => {
  document.documentElement.classList.toggle("pt-frozen", document.visibilityState === "hidden");
};
freezeWhenHidden();
document.addEventListener("visibilitychange", freezeWhenHidden);

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
