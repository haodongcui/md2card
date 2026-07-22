export type MobileWorkspacePane = "editor" | "settings" | "preview";

export function MobileWorkspaceTabs({
  activePane,
  onSelect,
}: {
  activePane: MobileWorkspacePane;
  onSelect: (pane: MobileWorkspacePane) => void;
}) {
  return (
    <nav class="mobile-workspace-tabs" aria-label="移动工作区">
      {(
        [
          ["editor", "编辑"],
          ["settings", "设置"],
          ["preview", "预览"],
        ] as const
      ).map(([pane, label]) => (
        <button
          key={pane}
          type="button"
          class={activePane === pane ? "selected" : ""}
          onClick={() => onSelect(pane)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
