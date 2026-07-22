import type { LayoutConfig } from "../../../domain/document";

type UpdateConfig = <Key extends keyof LayoutConfig>(
  key: Key,
  value: LayoutConfig[Key],
) => void;

export function ThemeSettings({
  config,
  onConfigChange,
}: {
  config: LayoutConfig;
  onConfigChange: UpdateConfig;
}) {
  return (
    <section class="settings-category-content">
      <h3>主题</h3>
      <p class="field-help">
        主题会同时调整卡片的配色、标题、表格、图注与背景纹理；网页浅色或深色外观不会改变导出结果。
      </p>
      <div class="card-theme-grid">
        {(
          [
            { id: "minimal", name: "纯净排版", hint: "白底 · 正式" },
            { id: "research", name: "雾蓝实验室", hint: "蓝色 · 精确" },
            { id: "editorial", name: "柔光浅紫", hint: "浅紫 · 现代" },
            { id: "notebook", name: "雾松笔记", hint: "绿色 · 清透" },
          ] as const
        ).map((theme) => (
          <button
            key={theme.id}
            type="button"
            class={`card-theme-option theme-${theme.id}${config.cardTheme === theme.id ? " selected" : ""}`}
            aria-pressed={config.cardTheme === theme.id}
            onClick={() => onConfigChange("cardTheme", theme.id)}
          >
            <span class="card-theme-swatch" />
            <strong>{theme.name}</strong>
            <small>{theme.hint}</small>
          </button>
        ))}
      </div>
      <h4>代码外观</h4>
      <div class="segmented code-block-appearance-control">
        <button
          type="button"
          class={config.codeBlockAppearance === "macos" ? "selected" : ""}
          aria-pressed={config.codeBlockAppearance === "macos"}
          onClick={() => onConfigChange("codeBlockAppearance", "macos")}
        >
          macOS 浅色
          <br />
          <small>默认 · 窗口栏与白色代码区</small>
        </button>
        <button
          type="button"
          class={config.codeBlockAppearance === "theme" ? "selected" : ""}
          aria-pressed={config.codeBlockAppearance === "theme"}
          onClick={() => onConfigChange("codeBlockAppearance", "theme")}
        >
          跟随主题
          <br />
          <small>使用卡片主题的技术面</small>
        </button>
      </div>
    </section>
  );
}
