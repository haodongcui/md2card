type ImageBindingSummary = {
  matched: number;
  total: number;
  missing: string[];
  ambiguous: string[];
};

export function EditorPane({
  active,
  markdown,
  titleOverride,
  inferredTitle,
  titleSource,
  dragging,
  localImageCount,
  localImageReferences,
  imageBindingSummary,
  onClear,
  onImportMarkdown,
  onTitleChange,
  onRestoreDefaultTitle,
  onMarkdownChange,
  onDraggingChange,
  onDropFiles,
  onOpenImageManager,
}: {
  active: boolean;
  markdown: string;
  titleOverride: string;
  inferredTitle: string;
  titleSource: string;
  dragging: boolean;
  localImageCount: number;
  localImageReferences: string[];
  imageBindingSummary: ImageBindingSummary;
  onClear: () => void;
  onImportMarkdown: (file: File | undefined) => void;
  onTitleChange: (value: string) => void;
  onRestoreDefaultTitle: () => void;
  onMarkdownChange: (value: string) => void;
  onDraggingChange: (dragging: boolean) => void;
  onDropFiles: (files: FileList) => void;
  onOpenImageManager: () => void;
}) {
  return (
    <section class={`editor-panel workbench-pane${active ? " is-active" : ""}`}>
      <div class="panel-heading">
        <div>
          <span class="eyebrow">输入</span>
          <h1>Markdown 编辑器</h1>
        </div>
        <div class="panel-heading-actions">
          <button
            type="button"
            class="clear-article-button"
            onClick={onClear}
            title="清空文章、已导入图片与图片绑定，保留排版设置"
          >
            清空文章
          </button>
          <label class="file-button recommended-file-button">
            导入 Markdown
            <input
              type="file"
              accept=".md,.markdown,.mdown,.mkdn,.txt,text/markdown,text/plain"
              onChange={(event) =>
                onImportMarkdown((event.currentTarget.files ?? [])[0])
              }
            />
          </label>
        </div>
      </div>
      <p class="editor-drop-note">
        可直接拖入 Markdown；检测到本地图片引用时，会引导你按需导入附件。
      </p>
      <div class="article-name-control">
        <label>
          文章名（可选）
          <input
            value={titleOverride}
            placeholder={`默认使用：${inferredTitle}`}
            onInput={(event) => onTitleChange(event.currentTarget.value)}
            aria-label="文章名（可选）"
          />
        </label>
        <button
          type="button"
          disabled={!titleOverride}
          onClick={onRestoreDefaultTitle}
        >
          恢复默认
        </button>
        <small>当前：{titleSource}</small>
      </div>
      <div
        class={`editor-drop-zone${dragging ? " is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          onDraggingChange(true);
        }}
        onDragLeave={() => onDraggingChange(false)}
        onDrop={(event) => {
          event.preventDefault();
          onDraggingChange(false);
          if (event.dataTransfer?.files) onDropFiles(event.dataTransfer.files);
        }}
      >
        <textarea
          value={markdown}
          onInput={(event) => onMarkdownChange(event.currentTarget.value)}
          spellcheck={false}
          aria-label="Markdown 编辑器"
        />
      </div>
      <div class="editor-hint">
        <span>
          支持标题、列表、GFM 表格、围栏代码、<code>$...$</code> /{" "}
          <code>\[...\]</code> 公式。草稿自动保存在此浏览器。
        </span>
        <span class="editor-resource-actions">
          {localImageCount > 0 && (
            <span class="image-count">已导入 {localImageCount} 张</span>
          )}
          <button
            type="button"
            class="image-manager-button"
            onClick={onOpenImageManager}
          >
            管理图片
          </button>
        </span>
        {localImageReferences.length > 0 && (
          <div class="image-resource-status" aria-live="polite">
            <div class="image-resource-summary">
              <strong>本地图片</strong>
              <span class="matched">
                已绑定 {imageBindingSummary.matched} / {imageBindingSummary.total}
              </span>
              {imageBindingSummary.missing.length > 0 && (
                <span class="missing">缺少 {imageBindingSummary.missing.length}</span>
              )}
              {imageBindingSummary.ambiguous.length > 0 && (
                <span class="ambiguous">
                  路径冲突 {imageBindingSummary.ambiguous.length}
                </span>
              )}
            </div>
            {(imageBindingSummary.missing.length > 0 ||
              imageBindingSummary.ambiguous.length > 0) && (
              <details class="image-binding-details">
                <summary>查看未绑定图片</summary>
                <ul>
                  {imageBindingSummary.missing.map((url) => (
                    <li key={`missing-${url}`}>
                      <code>{url}</code>
                    </li>
                  ))}
                  {imageBindingSummary.ambiguous.map((url) => (
                    <li key={`ambiguous-${url}`}>
                      <code>{url}</code>（存在多个候选文件）
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
