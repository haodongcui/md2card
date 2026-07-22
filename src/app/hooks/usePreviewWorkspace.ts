import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { CanvasRatio } from "../../domain/document";

export type PreviewColumns = 1 | 2 | 3;

const COMPACT_WORKSPACE_QUERY = "(max-width: 920px)";
const MIN_READABLE_PREVIEW_SCALE = 0.25;

function asPreviewColumns(value: number): PreviewColumns {
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
}

export function usePreviewWorkspace({
  pageCount,
  ratio,
}: {
  pageCount: number;
  ratio: CanvasRatio;
}) {
  const [previewScale, setPreviewScale] = useState(0.34);
  const [previewColumns, setPreviewColumns] = useState<PreviewColumns>(2);
  const [effectivePreviewColumns, setEffectivePreviewColumns] =
    useState<PreviewColumns>(2);
  const [previewColumnLimit, setPreviewColumnLimit] =
    useState<PreviewColumns>(3);
  const [compactWorkspace, setCompactWorkspace] = useState(() =>
    window.matchMedia(COMPACT_WORKSPACE_QUERY).matches,
  );
  const [sidebarWidth, setSidebarWidth] = useState(520);
  const sidebarResizeCleanup = useRef<(() => void) | null>(null);

  const fitPreviewColumns = useCallback(
    (columns: PreviewColumns = previewColumns) => {
      const preview = document.querySelector<HTMLElement>(".preview-scroll");
      if (!preview) return;
      const styles = window.getComputedStyle(preview);
      const horizontalPadding =
        Number.parseFloat(styles.paddingLeft) +
        Number.parseFloat(styles.paddingRight);
      const gap = Number.parseFloat(styles.columnGap) || 0;
      const usableWidth = Math.max(240, preview.clientWidth - horizontalPadding);
      const maxByContent = Math.max(1, Math.min(3, pageCount || 1));
      const maxByWidth = compactWorkspace
        ? 1
        : ([3, 2, 1] as const).find((candidate) => {
            const scale =
              (usableWidth - gap * (candidate - 1)) / (1080 * candidate);
            return scale >= MIN_READABLE_PREVIEW_SCALE;
          }) ?? 1;
      const limit = asPreviewColumns(Math.min(maxByContent, maxByWidth));
      const effectiveColumns = asPreviewColumns(Math.min(columns, limit));
      const scale =
        (usableWidth - gap * (effectiveColumns - 1)) /
        (1080 * effectiveColumns);
      setPreviewColumnLimit(limit);
      setEffectivePreviewColumns(effectiveColumns);
      setPreviewScale(Math.min(0.72, Math.max(0.12, scale)));
    },
    [compactWorkspace, pageCount, previewColumns],
  );

  const selectPreviewColumns = (columns: PreviewColumns) => {
    if (columns > previewColumnLimit) return;
    setPreviewColumns(columns);
    requestAnimationFrame(() => fitPreviewColumns(columns));
  };

  useEffect(() => {
    const preview = document.querySelector<HTMLElement>(".preview-scroll");
    if (!preview) return;
    const observer = new ResizeObserver(() => fitPreviewColumns());
    observer.observe(preview);
    requestAnimationFrame(() => fitPreviewColumns());
    return () => observer.disconnect();
  }, [fitPreviewColumns]);

  useEffect(() => {
    const media = window.matchMedia(COMPACT_WORKSPACE_QUERY);
    const updateCompactWorkspace = () => setCompactWorkspace(media.matches);
    updateCompactWorkspace();
    media.addEventListener("change", updateCompactWorkspace);
    return () => media.removeEventListener("change", updateCompactWorkspace);
  }, []);

  useEffect(
    () => () => {
      sidebarResizeCleanup.current?.();
    },
    [],
  );

  const startSidebarResize = (event: PointerEvent) => {
    if (window.matchMedia(COMPACT_WORKSPACE_QUERY).matches) return;
    event.preventDefault();
    sidebarResizeCleanup.current?.();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    const minimumWidth = 420;
    const maximumWidth = Math.max(
      minimumWidth,
      Math.min(760, window.innerWidth - 390),
    );
    document.body.classList.add("is-resizing-panels");
    const move = (moveEvent: PointerEvent) =>
      setSidebarWidth(
        Math.round(
          Math.min(
            maximumWidth,
            Math.max(minimumWidth, startWidth + moveEvent.clientX - startX),
          ),
        ),
      );
    const stop = () => {
      document.body.classList.remove("is-resizing-panels");
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
      document.removeEventListener("pointercancel", stop);
      if (sidebarResizeCleanup.current === stop)
        sidebarResizeCleanup.current = null;
    };
    sidebarResizeCleanup.current = stop;
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
  };

  const pageHeight = ratio === "3:4" ? 1440 : 1620;
  const previewStyle = `--preview-columns: ${effectivePreviewColumns}; --preview-scale: ${previewScale}; --preview-card-width: ${Math.round(1080 * previewScale)}px; --preview-card-height: ${Math.round(pageHeight * previewScale)}px;`;

  return {
    compactWorkspace,
    effectivePreviewColumns,
    fitPreviewColumns,
    previewColumnLimit,
    previewStyle,
    selectPreviewColumns,
    sidebarWidth,
    startSidebarResize,
  };
}
