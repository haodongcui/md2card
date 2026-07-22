import type { LayoutConfig, PagePlan } from "../../domain/document";
import type { ImageResourceIndex } from "../../resources/image-resources";
import { CardPage } from "../../renderer/CardPage";

type PreviewColumns = 1 | 2 | 3;

export function PreviewPane({
  activeOnMobile,
  articleName,
  pagePlan,
  config,
  resources,
  previewStyle,
  effectiveColumns,
  columnLimit,
  compactWorkspace,
  diagnosticLabel,
  hasExportErrors,
  onSelectColumns,
  onOpenSettings,
  onCardRef,
}: {
  activeOnMobile: boolean;
  articleName: string;
  pagePlan: PagePlan;
  config: LayoutConfig;
  resources: ImageResourceIndex;
  previewStyle: string;
  effectiveColumns: PreviewColumns;
  columnLimit: PreviewColumns;
  compactWorkspace: boolean;
  diagnosticLabel?: string;
  hasExportErrors: boolean;
  onSelectColumns: (columns: PreviewColumns) => void;
  onOpenSettings: () => void;
  onCardRef: (pageId: string, node: HTMLElement | null) => void;
}) {
  return (
    <section class={`preview-panel${activeOnMobile ? " mobile-active" : ""}`}>
      <div class="panel-heading preview-heading">
        <div>
          <span class="eyebrow">所见即所得</span>
          <h2 title={articleName}>{articleName}</h2>
        </div>
        <div class="preview-toolbar">
          <div
            class="preview-layout-control"
            role="group"
            aria-label={`预览列数，当前显示 ${effectiveColumns} 列`}
          >
            {([1, 2, 3] as const)
              .filter((columns) => !compactWorkspace || columns === 1)
              .map((columns) => (
                <button
                  key={columns}
                  type="button"
                  class={effectiveColumns === columns ? "selected" : ""}
                  aria-pressed={effectiveColumns === columns}
                  disabled={columns > columnLimit}
                  title={
                    columns > columnLimit
                      ? "当前卡片数量或预览宽度不足，暂不适合此列数"
                      : undefined
                  }
                  onClick={() => onSelectColumns(columns)}
                >
                  {columns} 列
                </button>
              ))}
          </div>
          <span class="page-badge">{pagePlan.pages.length} 张卡片</span>
          {diagnosticLabel && (
            <button
              type="button"
              class={`preview-diagnostic${hasExportErrors ? " error" : ""}`}
              onClick={onOpenSettings}
            >
              {diagnosticLabel}
            </button>
          )}
        </div>
      </div>
      <div class="preview-scroll" style={previewStyle}>
        {pagePlan.pages.map((page) => (
          <div key={page.id} class="preview-frame">
            <div class="preview-scale">
              <CardPage
                ref={(node: HTMLElement | null) => onCardRef(page.id, node)}
                page={page}
                totalPages={pagePlan.pages.length}
                config={config}
                resources={resources}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
