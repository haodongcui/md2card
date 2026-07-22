import { useEffect, useState } from "preact/hooks";
import type { WorkspaceUiTheme } from "../components/WorkspaceHeader";

const UI_THEME_STORAGE_KEY = "md2card-ui-theme";

function readInitialTheme(): WorkspaceUiTheme {
  try {
    const saved = localStorage.getItem(UI_THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" || saved === "system"
      ? saved
      : "system";
  } catch {
    return "system";
  }
}

export function useUiTheme() {
  const [uiTheme, setUiTheme] = useState<WorkspaceUiTheme>(readInitialTheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.uiTheme =
        uiTheme === "system" ? (media.matches ? "dark" : "light") : uiTheme;
    };
    apply();
    media.addEventListener("change", apply);
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, uiTheme);
    } catch {
      /* Browser privacy modes may deny local storage. */
    }
    return () => media.removeEventListener("change", apply);
  }, [uiTheme]);

  return { uiTheme, setUiTheme };
}
