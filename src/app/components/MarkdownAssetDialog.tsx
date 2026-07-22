import type { MarkdownAssetImport } from "../hooks/useImageResources";

export function MarkdownAssetDialog({ assetImport, busy, error, onClose, onChooseFolder }: { assetImport: MarkdownAssetImport; busy: boolean; error: string; onClose: () => void; onChooseFolder: () => void }) {
  return <div class="export-dialog-backdrop" role="presentation" onMouseDown={() => !busy && onClose()}>
    <section class="export-dialog markdown-asset-dialog" role="dialog" aria-modal="true" aria-labelledby="markdown-asset-title" onMouseDown={(event) => event.stopPropagation()}>
      <header class="export-dialog-header"><div><span class="eyebrow">本地图片</span><h2 id="markdown-asset-title">导入图片附件</h2></div><button type="button" class="dialog-close" disabled={busy} onClick={onClose} aria-label="暂不导入图片附件">×</button></header>
      <p class="markdown-asset-summary"><strong>{assetImport.fileName}</strong> 检测到 {assetImport.references.length} 条本地图片引用。请选择包含文章和 <code>assets</code> 的根目录，或直接选择 <code>assets</code> 文件夹；之后将自动匹配并只读取这些附件。</p>
      <details class="markdown-asset-reference-list"><summary>查看 Markdown 图片引用</summary><ul>{assetImport.references.map((reference) => <li key={reference}><code>{reference}</code></li>)}</ul></details>
      {error && <p class="markdown-asset-error" role="alert">{error}</p>}<p class="markdown-asset-privacy-note">文件始终留在浏览器本地，不会上传到服务器。</p>
      <footer class="export-dialog-footer"><button type="button" class="dialog-cancel" disabled={busy} onClick={onClose}>稍后处理</button><button type="button" class="dialog-submit markdown-asset-submit" disabled={busy} onClick={onChooseFolder}>{busy ? "正在匹配图片…" : "选择目录并自动导入"}</button></footer>
    </section>
  </div>;
}
