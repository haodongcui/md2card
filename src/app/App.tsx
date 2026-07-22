import {
  useEffect,
  useRef,
  useState,
} from "preact/hooks";
import type { LayoutConfig } from "../domain/document";
import { DEFAULT_CONFIG, DENSITY_PRESETS } from "../domain/document";
import { STARTER_MARKDOWN } from "../data/starter-markdown";
import { MeasureStage } from "../renderer/MeasureStage";
import {
  MobileWorkspaceTabs,
  type MobileWorkspacePane,
} from "./components/MobileWorkspaceTabs";
import { EditorPane } from "./components/EditorPane";
import { ExportDialog } from "./components/ExportDialog";
import { ImageManagerDialog } from "./components/ImageManagerDialog";
import { ImageResourceInputs } from "./components/ImageResourceInputs";
import { MarkdownAssetDialog } from "./components/MarkdownAssetDialog";
import { PreviewPane } from "./components/PreviewPane";
import { useDraftPersistence } from "./hooks/useDraftPersistence";
import { useCardLayout } from "./hooks/useCardLayout";
import { useExportWorkflow } from "./hooks/useExportWorkflow";
import { useImageResources } from "./hooks/useImageResources";
import { usePreviewWorkspace } from "./hooks/usePreviewWorkspace";
import { useUiTheme } from "./hooks/useUiTheme";
import {
  SettingsCategoryNav,
  type SettingsCategory,
} from "./components/settings/SettingsCategoryNav";
import { ContentSettings } from "./components/settings/ContentSettings";
import { CanvasSettings } from "./components/settings/CanvasSettings";
import { LayoutSettings } from "./components/settings/LayoutSettings";
import { ThemeSettings } from "./components/settings/ThemeSettings";
import { WorkspaceHeader } from "./components/WorkspaceHeader";

function normalizeCardTheme(value: unknown): LayoutConfig["cardTheme"] {
  if (
    value === "minimal" ||
    value === "editorial" ||
    value === "notebook" ||
    value === "research"
  )
    return value;
  if (value === "paper" || value === "ink" || value === "mono")
    return "minimal";
  if (value === "apricot" || value === "obsidian") return "notebook";
  if (value === "sage" || value === "blueprint") return "research";
  return DEFAULT_CONFIG.cardTheme;
}

function normalizeCodeBlockAppearance(
  value: unknown,
): LayoutConfig["codeBlockAppearance"] {
  return value === "macos" || value === "theme"
    ? value
    : DEFAULT_CONFIG.codeBlockAppearance;
}

type ReadingSetting =
  | "bodyFontSize"
  | "bodyLineHeight"
  | "blockGap"
  | "headingH2BeforeSpacing"
  | "headingH3BeforeSpacing"
  | "codeFontSize";
type MobilePane = MobileWorkspacePane;

function isMarkdownFile(file: File): boolean {
  return (
    /\.(md|markdown|mdown|mkdn|txt)$/i.test(file.name) ||
    Boolean(file.type && file.type.startsWith("text/"))
  );
}

export function App() {
  const [markdown, setMarkdown] = useState(STARTER_MARKDOWN);
  const [config, setConfig] = useState<LayoutConfig>(DEFAULT_CONFIG);
  const [titleOverride, setTitleOverride] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [activePane, setActivePane] = useState<"editor" | "settings">("editor");
  const [mobilePane, setMobilePane] = useState<MobilePane>("editor");
  const [activeSettingsCategory, setActiveSettingsCategory] =
    useState<SettingsCategory>("theme");
  const { uiTheme, setUiTheme } = useUiTheme();
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  const {
    acceptMeasure,
    article,
    articleName,
    cover,
    inferredTitle,
    invalidateLayout,
    pagePlan,
    titleSource,
  } = useCardLayout({
    markdown,
    config,
    titleOverride,
    sourceFileName,
  });
  const {
    compactWorkspace,
    effectivePreviewColumns,
    fitPreviewColumns,
    previewColumnLimit,
    previewStyle,
    selectPreviewColumns,
    sidebarWidth,
    startSidebarResize,
  } = usePreviewWorkspace({
    pageCount: pagePlan.pages.length,
    ratio: config.ratio,
  });
  const {
    diagnosticWarningCount,
    exportDialogOpen,
    exportHasErrors,
    exportPreflight,
    exportState,
    handleExport,
    inspectExportReadiness,
    openExportDialog,
    setExportDialogOpen,
    setExportState,
  } = useExportWorkflow({
    pagePlan,
    config,
    filename: articleName,
    cardRefs,
  });
  const {
    addImages,
    bindImageToReference,
    bindSelectedImage,
    bindingFileInputRef,
    clearArticleResources,
    clearImageBindingOverride,
    clearLocalImages,
    clearUnusedImages,
    currentReferenceFolderInputRef,
    imageBindingOverrides,
    imageBindingSummary,
    imageManagerAttachmentBusy,
    imageManagerNotice,
    imageManagerOpen,
    imageReferences,
    imageUsageCount,
    importCurrentReferenceFolder,
    importMarkdownAssetFolder,
    localImageReferences,
    localImageId,
    localImages,
    localImagesById,
    markdownAssetBusy,
    markdownAssetError,
    markdownAssetFolderInputRef,
    markdownAssetImport,
    openCurrentReferenceAttachmentImport,
    openMarkdownAssetFolderImport,
    prepareMarkdownAssetImport,
    removeLocalImage,
    requestImageBinding,
    resourceObjectUrls,
    resources,
    restoreDraftResources,
    selectedImageReference,
    setImageManagerOpen,
    setMarkdownAssetImport,
    setSelectedImageReference,
    unresolvedImageReferences,
    unusedImageCount,
  } = useImageResources({
    article,
    markdown,
    sourceFileName,
    invalidateLayout,
    reportStatus: setExportState,
  });
  const previewDiagnosticLabel = exportHasErrors
    ? "有排版错误"
    : diagnosticWarningCount > 0
      ? `${diagnosticWarningCount} 项提醒`
      : undefined;
  useDraftPersistence({
    snapshot: {
      markdown,
      config,
      titleOverride,
      sourceFileName,
      images: localImages,
      imageBindingOverrides,
    },
    onRestore: (draft) => {
      if (!draft?.markdown) return;
      setMarkdown(draft.markdown);
      setConfig({
        ...DEFAULT_CONFIG,
        ...(draft.config ?? {}),
        cardTheme: normalizeCardTheme(draft.config?.cardTheme),
        codeBlockAppearance: normalizeCodeBlockAppearance(
          draft.config?.codeBlockAppearance,
        ),
      });
      setTitleOverride(draft.titleOverride ?? "");
      setSourceFileName(draft.sourceFileName ?? "");
      restoreDraftResources(draft.images, draft.imageBindingOverrides);
    },
  });

  useEffect(() => {
    document.title = `${articleName} · Md2Card`;
  }, [articleName]);

  const updateConfig = <Key extends keyof LayoutConfig>(
    key: Key,
    value: LayoutConfig[Key],
  ) => {
    setConfig((previous) => ({ ...previous, [key]: value }));
  };

  const updateReadingConfig = <Key extends ReadingSetting>(
    key: Key,
    value: LayoutConfig[Key],
  ) => {
    setConfig((previous) => ({ ...previous, density: "custom", [key]: value }));
  };

  const applyDensityPreset = (
    density: Exclude<LayoutConfig["density"], "custom">,
  ) => {
    setConfig((previous) => ({
      ...previous,
      density,
      ...DENSITY_PRESETS[density],
    }));
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!isMarkdownFile(file)) {
      setExportState({
        status: "error",
        message: "请选择 Markdown 或纯文本文件。",
      });
      return;
    }
    const nextMarkdown = await file.text();
    setMarkdown(nextMarkdown);
    setSourceFileName(file.name);
    setTitleOverride("");
    invalidateLayout();
    prepareMarkdownAssetImport(nextMarkdown, file.name);
    setExportState({ status: "idle", message: `已载入 ${file.name}` });
  };

  const clearArticle = () => {
    const hasArticleData = Boolean(
      markdown.trim() ||
        titleOverride.trim() ||
        sourceFileName ||
        localImages.length ||
        markdownAssetImport,
    );
    if (
      hasArticleData &&
      !window.confirm(
        "清空当前文章、已导入图片与图片绑定吗？排版设置会保留。",
      )
    )
      return;

    setMarkdown("");
    setTitleOverride("");
    setSourceFileName("");
    invalidateLayout();
    clearArticleResources();
  };

  return (
    <div class="application-shell">
      <WorkspaceHeader
        uiTheme={uiTheme}
        exportState={exportState}
        onUiThemeChange={setUiTheme}
        onOpenExport={openExportDialog}
      />
      <MobileWorkspaceTabs
        activePane={mobilePane}
        onSelect={(pane) => {
          setMobilePane(pane);
          if (pane === "preview") {
            requestAnimationFrame(() => fitPreviewColumns());
            return;
          }
          setActivePane(pane);
        }}
      />

      <div
        class="workspace"
        style={`--authoring-panel-width: ${sidebarWidth}px;`}
      >
        <aside class={`authoring-panel mobile-pane-${mobilePane}`}>
          <nav class="workbench-tabs" aria-label="工作区">
            <button
              type="button"
              class={activePane === "editor" ? "selected" : ""}
              aria-pressed={activePane === "editor"}
              onClick={() => setActivePane("editor")}
            >
              Markdown 编辑
            </button>
            <button
              type="button"
              class={activePane === "settings" ? "selected" : ""}
              aria-pressed={activePane === "settings"}
              onClick={() => setActivePane("settings")}
            >
              排版设置
            </button>
          </nav>
          <EditorPane
            active={activePane === "editor"}
            markdown={markdown}
            titleOverride={titleOverride}
            inferredTitle={inferredTitle}
            titleSource={titleSource}
            dragging={dragging}
            localImageCount={localImages.length}
            localImageReferences={localImageReferences}
            imageBindingSummary={imageBindingSummary}
            onClear={clearArticle}
            onImportMarkdown={(file) => void loadFile(file)}
            onTitleChange={setTitleOverride}
            onRestoreDefaultTitle={() => setTitleOverride("")}
            onMarkdownChange={(value) => {
              setMarkdown(value);
              invalidateLayout();
            }}
            onDraggingChange={setDragging}
            onDropFiles={(files) => {
              const markdownFile = Array.from(files).find(
                (file) =>
                  /\.(md|markdown|mdown|mkdn|txt)$/i.test(file.name) ||
                  file.type.startsWith("text/"),
              );
              if (markdownFile) {
                void loadFile(markdownFile);
                return;
              }
              addImages(files);
            }}
            onOpenImageManager={() => setImageManagerOpen(true)}
          />

          <section
            class={`settings-panel workbench-pane${activePane === "settings" ? " is-active" : ""}`}
          >
            <div class="panel-heading compact">
              <div>
                <span class="eyebrow">排版</span>
                <h2>阅读设置</h2>
              </div>
            </div>
            <SettingsCategoryNav
              activeCategory={activeSettingsCategory}
              onSelect={setActiveSettingsCategory}
            />
            {activeSettingsCategory === "layout" && (
              <LayoutSettings
                config={config}
                onConfigChange={updateConfig}
                onReadingConfigChange={updateReadingConfig}
                onApplyDensity={applyDensityPreset}
              />
            )}
            {activeSettingsCategory === "content" && (
              <ContentSettings config={config} onConfigChange={updateConfig} onReadingConfigChange={updateReadingConfig} />
            )}
            {activeSettingsCategory === "theme" && (
              <ThemeSettings config={config} onConfigChange={updateConfig} />
            )}
            {activeSettingsCategory === "canvas" && (
              <CanvasSettings
                config={config}
                articleName={articleName}
                onConfigChange={updateConfig}
                onEditArticle={() => {
                  setActivePane("editor");
                  setMobilePane("editor");
                }}
              />
            )}
          </section>
        </aside>
        <div
          class="workspace-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="拖动调整编辑区与预览区宽度"
          title="拖动调整左右区域宽度"
          onPointerDown={startSidebarResize}
        />

        <PreviewPane
          activeOnMobile={mobilePane === "preview"}
          articleName={articleName}
          pagePlan={pagePlan}
          config={config}
          resources={resources}
          previewStyle={previewStyle}
          effectiveColumns={effectivePreviewColumns}
          columnLimit={previewColumnLimit}
          compactWorkspace={compactWorkspace}
          diagnosticLabel={previewDiagnosticLabel}
          hasExportErrors={exportHasErrors}
          onSelectColumns={selectPreviewColumns}
          onOpenSettings={() => {
            setActivePane("settings");
            setMobilePane("settings");
          }}
          onCardRef={(pageId, node) => {
            cardRefs.current[pageId] = node;
          }}
        />
      </div>

      <MeasureStage
        article={article}
        config={config}
        cover={cover}
        resources={resources}
        onMeasure={acceptMeasure}
      />
      {imageManagerOpen && (
        <ImageManagerDialog
          state={{
            imageBindingSummary,
            attachmentBusy: imageManagerAttachmentBusy,
            unresolvedReferences: unresolvedImageReferences,
            localImageReferences,
            notice: imageManagerNotice,
            selectedReference: selectedImageReference,
            imageReferences,
            localImages,
            localImagesById,
            imageBindingOverrides,
            resourceObjectUrls,
            imageUsageCount,
            unusedImageCount,
          }}
          actions={{
            close: () => setImageManagerOpen(false),
            autoFillAttachments: () => void openCurrentReferenceAttachmentImport(),
            addImages,
            selectReference: setSelectedImageReference,
            bindImage: bindImageToReference,
            requestImageBinding,
            clearBindingOverride: clearImageBindingOverride,
            removeImage: removeLocalImage,
            clearUnusedImages,
            clearAllImages: clearLocalImages,
            getImageId: localImageId,
          }}
        />
      )}
      {markdownAssetImport && (
        <MarkdownAssetDialog
          assetImport={markdownAssetImport}
          busy={markdownAssetBusy}
          error={markdownAssetError}
          onClose={() => setMarkdownAssetImport(null)}
          onChooseFolder={() => void openMarkdownAssetFolderImport()}
        />
      )}
      <ImageResourceInputs
        bindingFileInputRef={bindingFileInputRef}
        markdownAssetFolderInputRef={markdownAssetFolderInputRef}
        currentReferenceFolderInputRef={currentReferenceFolderInputRef}
        onBindSelectedImage={bindSelectedImage}
        onImportMarkdownAssetFolder={importMarkdownAssetFolder}
        onImportCurrentReferenceFolder={importCurrentReferenceFolder}
      />
      {exportDialogOpen && (
        <ExportDialog
          pageCount={pagePlan.pages.length}
          config={config}
          exportState={exportState}
          preflight={exportPreflight}
          onClose={() => setExportDialogOpen(false)}
          onConfigChange={updateConfig}
          onRecheck={() => void inspectExportReadiness()}
          onExport={() => void handleExport()}
        />
      )}
    </div>
  );
}
