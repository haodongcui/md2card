import { useMemo, useState } from "preact/hooks";
import type { LayoutConfig, PagePlan } from "../../domain/document";

export type ExportState = {
  status: "idle" | "running" | "done" | "error";
  message: string;
};

export type ExportPreflight = {
  status: "idle" | "checking" | "ready" | "error";
  message: string;
};

function safeFilename(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim()
      .slice(0, 64) || "md2card-cards"
  );
}

function readCardNodes(
  pagePlan: PagePlan,
  cardRefs: { current: Record<string, HTMLElement | null> },
): HTMLElement[] {
  return pagePlan.pages
    .map((page) => cardRefs.current[page.id])
    .filter((card): card is HTMLElement => Boolean(card));
}

/** Keeps export readiness and PNG archive creation independent from the UI. */
export function useExportWorkflow({
  pagePlan,
  config,
  filename,
  cardRefs,
}: {
  pagePlan: PagePlan;
  config: LayoutConfig;
  filename: string;
  cardRefs: { current: Record<string, HTMLElement | null> };
}) {
  const [exportState, setExportState] = useState<ExportState>({
    status: "idle",
    message: "",
  });
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportPreflight, setExportPreflight] = useState<ExportPreflight>({
    status: "idle",
    message: "",
  });
  const exportHasErrors = useMemo(
    () => pagePlan.diagnostics.some((item) => item.level === "error"),
    [pagePlan.diagnostics],
  );
  const diagnosticWarningCount = useMemo(
    () => pagePlan.diagnostics.filter((item) => item.level === "warning").length,
    [pagePlan.diagnostics],
  );

  const inspectExportReadiness = async () => {
    setExportPreflight({
      status: "checking",
      message: "正在检查字体、图片和卡片边界…",
    });
    try {
      if (exportHasErrors)
        throw new Error("Markdown 存在解析错误，请先处理页面提示。");
      const cards = readCardNodes(pagePlan, cardRefs);
      if (!cards.length) throw new Error("卡片仍在生成，请稍后重试。");
      if ("fonts" in document) await document.fonts.ready;
      await Promise.all(
        cards.flatMap((card) =>
          Array.from(card.querySelectorAll("img")).map(async (image) => {
            if (!image.complete) {
              await new Promise<void>((resolve, reject) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener(
                  "error",
                  () => reject(new Error("有图片无法加载。")),
                  { once: true },
                );
              });
            }
            await image.decode().catch(() => {
              throw new Error("有图片无法解码。");
            });
          }),
        ),
      );
      if (
        cards.some((card) => {
          const content = card.querySelector<HTMLElement>(".card-content");
          return Boolean(content && content.scrollHeight > content.clientHeight + 1);
        })
      )
        throw new Error("检测到卡片内容溢出，请调整排版后重试。");
      setExportPreflight({
        status: "ready",
        message: "字体、图片与卡片边界检查通过。",
      });
    } catch (error) {
      setExportPreflight({
        status: "error",
        message:
          error instanceof Error ? error.message : `检查失败：${String(error)}`,
      });
    }
  };

  const openExportDialog = () => {
    if (exportState.status !== "running")
      setExportState({ status: "idle", message: "" });
    setExportDialogOpen(true);
    void inspectExportReadiness();
  };

  const handleExport = async () => {
    const cards = readCardNodes(pagePlan, cardRefs);
    try {
      setExportState({
        status: "running",
        message: `正在生成 0 / ${cards.length} 张 PNG…`,
      });
      // html-to-image, ZIP compression, and their dependencies are only
      // needed after the user confirms an export. Keep them out of the
      // interactive editor's initial bundle.
      const { exportCards } = await import("../../export/export-cards");
      await exportCards({
        cards,
        filename: safeFilename(filename),
        pixelRatio: config.exportScale,
        onProgress: (completed, total) =>
          setExportState({
            status: "running",
            message: `正在生成 ${completed} / ${total} 张 PNG…`,
          }),
      });
      setExportState({
        status: "done",
        message: `已下载 ${cards.length} 张真实 PNG 的 ZIP。`,
      });
    } catch (error) {
      setExportState({
        status: "error",
        message:
          error instanceof Error ? error.message : `导出失败：${String(error)}`,
      });
    }
  };

  return {
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
  };
}
