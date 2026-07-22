import type { LayoutConfig } from "../../domain/document";

type ExportState = { status: "idle" | "running" | "done" | "error"; message: string };
type ExportPreflight = { status: "idle" | "checking" | "ready" | "error"; message: string };
const dimensions = (ratio: LayoutConfig["ratio"], scale: 1 | 2) => `${1080 * scale} × ${(ratio === "3:4" ? 1440 : 1620) * scale}`;

export function ExportDialog({ pageCount, config, exportState, preflight, onClose, onConfigChange, onRecheck, onExport }: { pageCount: number; config: LayoutConfig; exportState: ExportState; preflight: ExportPreflight; onClose: () => void; onConfigChange: <Key extends keyof LayoutConfig>(key: Key, value: LayoutConfig[Key]) => void; onRecheck: () => void; onExport: () => void }) {
  const running = exportState.status === "running";
  return <div class="export-dialog-backdrop" role="presentation" onMouseDown={() => !running && onClose()}><section class="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
    <header class="export-dialog-header"><div><span class="eyebrow">导出</span><h2 id="export-dialog-title">下载图片</h2></div><button type="button" class="dialog-close" disabled={running} onClick={onClose} aria-label="关闭导出窗口">×</button></header>
    <p class="export-summary">{pageCount} 张卡片 · {config.ratio} · 将下载为 ZIP</p><section class="export-quality"><h3>清晰度</h3>
      <button type="button" class={`export-quality-option${config.exportScale === 1 ? " selected" : ""}`} onClick={() => onConfigChange("exportScale", 1)}><strong>标准发布 <em>推荐</em></strong><span>每张 {dimensions(config.ratio, 1)} PNG</span><small>适合直接发布，导出更快、文件更小。</small></button>
      <button type="button" class={`export-quality-option${config.exportScale === 2 ? " selected" : ""}`} onClick={() => onConfigChange("exportScale", 2)}><strong>高清原图</strong><span>每张 {dimensions(config.ratio, 2)} PNG</span><small>适合公式、表格放大查看或本地留存；文件更大、导出更慢。</small></button>
    </section><section class={`export-preflight ${preflight.status}`}><h3>导出前检查</h3><p>{preflight.message || "等待检查。"}</p>{preflight.status === "error" && <button type="button" class="secondary-button" onClick={onRecheck}>重新检查</button>}</section>
    {pageCount >= 8 && <p class="export-caution">当前共有 {pageCount} 张卡片；高清原图会占用更多时间和浏览器内存。</p>}{exportState.message && <p class={`export-dialog-message ${exportState.status}`}>{exportState.message}</p>}
    <footer class="export-dialog-footer"><button type="button" class="dialog-cancel" disabled={running} onClick={onClose}>取消</button><button type="button" class="dialog-submit" disabled={preflight.status !== "ready" || running} onClick={onExport}>{running ? exportState.message : exportState.status === "done" ? "再次下载" : "开始下载"}</button></footer>
  </section></div>;
}
