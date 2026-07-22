type UiTheme = "system" | "light" | "dark";

const STORAGE_KEY = "md2card-ui-theme";

function savedTheme(): UiTheme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" || saved === "system"
      ? saved
      : "system";
  } catch {
    return "system";
  }
}

export function mountSiteThemeSwitcher(): void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  let theme = savedTheme();

  const apply = () => {
    document.documentElement.dataset.uiTheme =
      theme === "system" ? (media.matches ? "dark" : "light") : theme;
    document.querySelectorAll<HTMLButtonElement>("[data-site-theme]").forEach(
      (button) => {
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.siteTheme === theme),
        );
      },
    );
  };

  document.querySelectorAll<HTMLButtonElement>("[data-site-theme]").forEach(
    (button) => {
      button.addEventListener("click", () => {
        const selected = button.dataset.siteTheme;
        if (selected !== "system" && selected !== "light" && selected !== "dark")
          return;
        theme = selected;
        try {
          localStorage.setItem(STORAGE_KEY, theme);
        } catch {}
        apply();
      });
    },
  );

  media.addEventListener("change", apply);
  apply();
}
