import { useEffect, useRef, useState } from "preact/hooks";
import type { LayoutConfig } from "../../domain/document";
import {
  readDraft,
  saveDraft,
  type Draft,
  type LocalImage,
} from "../../storage/draft-store";

type DraftSnapshot = {
  markdown: string;
  config: LayoutConfig;
  titleOverride: string;
  sourceFileName: string;
  images: LocalImage[];
  imageBindingOverrides: Record<string, string>;
};

/**
 * Restores the single browser-local draft once, then coalesces subsequent
 * edits before committing them back to IndexedDB. The caller owns migration
 * and any object URL lifecycle needed while applying the restored draft.
 */
export function useDraftPersistence({
  snapshot,
  onRestore,
}: {
  snapshot: DraftSnapshot;
  onRestore: (draft: Draft | undefined) => void;
}) {
  const [hydrated, setHydrated] = useState(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    let alive = true;
    void readDraft()
      .then((draft) => {
        if (alive) onRestoreRef.current(draft);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void saveDraft({ ...snapshot, updatedAt: Date.now() }).catch(
        () => undefined,
      );
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    hydrated,
    snapshot.config,
    snapshot.imageBindingOverrides,
    snapshot.images,
    snapshot.markdown,
    snapshot.sourceFileName,
    snapshot.titleOverride,
  ]);

  return { hydrated };
}
