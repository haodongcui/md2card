import { useCallback, useMemo, useState } from "preact/hooks";
import type { LayoutConfig, PageCover } from "../../domain/document";
import { createPagePlan } from "../../layout/paginate";
import { parseMarkdown } from "../../parser/parse-markdown";

function filenameStem(filename: string): string {
  return filename.replace(/\.[^./\\]+$/, "").trim();
}

/** Keeps parsing, hidden measurement, and visible pagination on one plan. */
export function useCardLayout({
  markdown,
  config,
  titleOverride,
  sourceFileName,
}: {
  markdown: string;
  config: LayoutConfig;
  titleOverride: string;
  sourceFileName: string;
}) {
  const [measurements, setMeasurements] = useState<Record<string, number>>({});
  const article = useMemo(() => parseMarkdown(markdown), [markdown]);
  const inferredTitle =
    article.title.trim() || filenameStem(sourceFileName) || "未命名笔记";
  const articleName = titleOverride.trim() || inferredTitle;
  const titleSource = article.title.trim()
    ? "Markdown 首个 H1"
    : sourceFileName
      ? "导入文件名"
      : "默认名称";
  const cover = useMemo<PageCover | undefined>(
    () =>
      config.coverMode === "none"
        ? undefined
        : {
            id: "md2card-cover",
            mode: config.coverMode,
            title: articleName,
            kicker: config.coverKicker.trim(),
            subtitle: config.coverSubtitle.trim(),
          },
    [articleName, config.coverKicker, config.coverMode, config.coverSubtitle],
  );
  const pagePlan = useMemo(
    () => createPagePlan(article, config, measurements, cover),
    [article, config, measurements, cover],
  );
  const acceptMeasure = useCallback((next: Record<string, number>) => {
    setMeasurements((previous) => {
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      if (
        previousKeys.length === nextKeys.length &&
        nextKeys.every((key) => Math.abs((previous[key] ?? 0) - next[key]) < 1)
      )
        return previous;
      return next;
    });
  }, []);
  const invalidateLayout = useCallback(() => setMeasurements({}), []);

  return {
    acceptMeasure,
    article,
    articleName,
    cover,
    inferredTitle,
    invalidateLayout,
    pagePlan,
    titleSource,
  };
}
