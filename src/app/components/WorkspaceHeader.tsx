export type WorkspaceUiTheme = "system" | "light" | "dark";

export type WorkspaceExportState = {
  status: "idle" | "running" | "done" | "error";
  message: string;
};

function GitHubLink() {
  return (
    <a
      class="github-link"
      href="https://github.com/haodongcui/md2card"
      target="_blank"
      rel="noreferrer"
      aria-label="在 GitHub 查看 Md2Card 项目源码"
      title="在 GitHub 查看项目源码"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 .7A11.3 11.3 0 0 0 8.4 22.72c.57.1.78-.25.78-.55v-2.16c-3.18.7-3.85-1.35-3.85-1.35-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.67 1.25 3.32.96.1-.74.4-1.25.72-1.54-2.54-.29-5.21-1.27-5.21-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.11 1.17A10.8 10.8 0 0 1 12 5.92c.97 0 1.94.13 2.85.38 2.15-1.48 3.11-1.17 3.11-1.17.62 1.57.23 2.73.11 3.02.73.8 1.18 1.82 1.18 3.07 0 4.4-2.67 5.36-5.22 5.65.41.35.78 1.04.78 2.1v3.13c0 .3.2.65.79.54A11.3 11.3 0 0 0 12 .7Z"
        />
      </svg>
    </a>
  );
}

export function WorkspaceHeader({
  uiTheme,
  exportState,
  onUiThemeChange,
  onOpenExport,
}: {
  uiTheme: WorkspaceUiTheme;
  exportState: WorkspaceExportState;
  onUiThemeChange: (theme: WorkspaceUiTheme) => void;
  onOpenExport: () => void;
}) {
  return (
    <header class="topbar">
      <div class="topbar-branding">
        <a class="brand" href="../" aria-label="返回 Md2Card 首页">
          <span class="brand-mark">M</span>
          <span>Md2Card</span>
          <small>Markdown 转小红书图片</small>
        </a>
        <nav class="workspace-site-nav" aria-label="站点导航">
          <a class="workspace-home-link" href="../">首页</a>
        </nav>
      </div>
      <div class="topbar-actions">
        <div class="theme-segmented" role="group" aria-label="网页外观">
          <button
            type="button"
            class={uiTheme === "system" ? "selected" : ""}
            aria-pressed={uiTheme === "system"}
            onClick={() => onUiThemeChange("system")}
          >
            <span class="theme-full">跟随系统</span>
            <span class="theme-short">系统</span>
          </button>
          <button
            type="button"
            class={uiTheme === "light" ? "selected" : ""}
            aria-pressed={uiTheme === "light"}
            onClick={() => onUiThemeChange("light")}
          >
            浅色
          </button>
          <button
            type="button"
            class={uiTheme === "dark" ? "selected" : ""}
            aria-pressed={uiTheme === "dark"}
            onClick={() => onUiThemeChange("dark")}
          >
            暗色
          </button>
        </div>
        <GitHubLink />
        <span class="privacy-note">全部在本地浏览器中完成</span>
        <button
          class="top-export-button"
          disabled={exportState.status === "running"}
          onClick={onOpenExport}
        >
          {exportState.status === "running"
            ? exportState.message
            : "下载图片…"}
        </button>
      </div>
    </header>
  );
}
