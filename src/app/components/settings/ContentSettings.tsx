import type { LayoutConfig } from "../../../domain/document";

type UpdateConfig = <Key extends keyof LayoutConfig>(key: Key, value: LayoutConfig[Key]) => void;

export function ContentSettings({ config, onConfigChange, onReadingConfigChange }: {
  config: LayoutConfig;
  onConfigChange: UpdateConfig;
  onReadingConfigChange: (key: "codeFontSize", value: number) => void;
}) {
  return <section class="settings-category-content">
    <h3>内容</h3>
    <div class="setting-control-grid">
      <label class="range-label">表格字号 <output>{config.tableFontSize}px</output><input type="range" min="20" max="25" value={config.tableFontSize} onInput={(event) => onConfigChange("tableFontSize", Number(event.currentTarget.value))} /></label>
      <label class="range-label">公式缩放 <output>{config.mathScale.toFixed(2)}×</output><input type="range" min="0.72" max="1" step="0.02" value={config.mathScale} onInput={(event) => onConfigChange("mathScale", Number(event.currentTarget.value))} /></label>
      <label class="range-label">代码字号 <output>{config.codeFontSize}px</output><input type="range" min="20" max="26" value={config.codeFontSize} onInput={(event) => onReadingConfigChange("codeFontSize", Number(event.currentTarget.value))} /></label>
    </div>
    <h4>图片</h4>
    <div class="setting-control-grid"><label class="range-label">图片最大页高 <output>{config.imageMaxHeightPercent}%</output><input type="range" min="35" max="68" value={config.imageMaxHeightPercent} onInput={(event) => onConfigChange("imageMaxHeightPercent", Number(event.currentTarget.value))} /></label></div>
    <h4>代码</h4>
    <label class="check-label"><input type="checkbox" checked={config.codeLineNumbers} onChange={(event) => onConfigChange("codeLineNumbers", event.currentTarget.checked)} /> 代码行号</label>
  </section>;
}
