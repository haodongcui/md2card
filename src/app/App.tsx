import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import type { LayoutConfig, PageCover } from "../domain/document";
import { DEFAULT_CONFIG, DENSITY_PRESETS } from "../domain/document";
import { STARTER_MARKDOWN } from "../data/starter-markdown";
import { exportCards } from "../export/export-cards";
import { createPagePlan } from "../layout/paginate";
import { parseMarkdown } from "../parser/parse-markdown";
import { CardPage } from "../renderer/CardPage";
import { MeasureStage } from "../renderer/MeasureStage";
import {
  articleImageUrls,
  buildImageResourceIndex,
  isRemoteImageUrl,
  normalizeImagePath,
  resolveImageReference,
  summarizeImageBindings,
} from "../resources/image-resources";
import type { LocalImage } from "../storage/draft-store";
import { readDraft, saveDraft } from "../storage/draft-store";

function safeFilename(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim()
      .slice(0, 64) || "md2card-cards"
  );
}

function filenameStem(filename: string): string {
  return filename.replace(/\.[^./\\]+$/, "").trim();
}

function exportDimensions(ratio: LayoutConfig["ratio"], scale: 1 | 2): string {
  const height = ratio === "3:4" ? 1440 : 1620;
  return `${1080 * scale} × ${height * scale}`;
}

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

function GitHubLink() {
  return (
    <a
      class="github-link"
      href="https://github.com/haodongcui/md2card"
      target="_blank"
      rel="noreferrer"
      aria-label="在 GitHub 查看 md2card 项目源码"
      title="在 GitHub 查看项目源码"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 .7A11.3 11.3 0 0 0 8.4 22.72c.57.1.78-.25.78-.55v-2.16c-3.18.7-3.85-1.35-3.85-1.35-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.67 1.25 3.32.96.1-.74.4-1.25.72-1.54-2.54-.29-5.21-1.27-5.21-5.66 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.11 1.17A10.8 10.8 0 0 1 12 5.92c.97 0 1.94.13 2.85.38 2.15-1.48 3.11-1.17 3.11-1.17.62 1.57.23 2.73.11 3.02.73.8 1.18 1.82 1.18 3.07 0 4.4-2.67 5.36-5.22 5.65.41.35.78 1.04.78 2.1v3.13c0 .3.2.65.79.54A11.3 11.3 0 0 0 12 .7Z"
        />
      </svg>
    </a>
  );
}

type ReadingSetting =
  | "bodyFontSize"
  | "bodyLineHeight"
  | "blockGap"
  | "headingH2BeforeSpacing"
  | "headingH3BeforeSpacing"
  | "codeFontSize";
type SettingsCategory = "text" | "heading" | "technical" | "canvas";
type ExportPreflight = {
  status: "idle" | "checking" | "ready" | "error";
  message: string;
};
type UiTheme = "system" | "light" | "dark";
type MobilePane = "editor" | "settings" | "preview";
type PreviewColumns = 1 | 2 | 3;
type ImageAttachmentSource = "smart" | "compat";
type IndexedLocalFile = {
  name: string;
  path: string;
  readFile: () => Promise<File>;
};
type DirectoryIndex = {
  markdownFiles: IndexedLocalFile[];
  imageFiles: IndexedLocalFile[];
};
type MarkdownAssetImport = {
  markdown: string;
  fileName: string;
  references: string[];
};
type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  values?: () => AsyncIterableIterator<FileSystemHandle>;
};
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" }) => Promise<DirectoryHandleWithEntries>;
};

const COMPACT_WORKSPACE_QUERY = "(max-width: 920px)";
const MIN_READABLE_PREVIEW_SCALE = 0.25;

function asPreviewColumns(value: number): PreviewColumns {
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
}

function localImageId(image: LocalImage, index = 0): string {
  const fallbackPath = image.paths?.[0] ?? image.name;
  return image.id ?? `legacy-${index}-${normalizeImagePath(fallbackPath)}`;
}

function restoreLocalImage(image: LocalImage, index: number): LocalImage {
  const paths = Array.from(
    new Set(
      (image.paths?.length ? image.paths : [image.name])
        .map(normalizeImagePath)
        .filter(Boolean),
    ),
  );
  return {
    ...image,
    id: localImageId(image, index),
    paths: paths.length ? paths : [image.name],
  };
}

function fileRelativePath(file: File): string {
  return (
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    file.name
  );
}

function importedLocalImage(file: File): LocalImage {
  const path = normalizeImagePath(fileRelativePath(file)) || file.name;
  return {
    id: `image-${path}`,
    name: file.name,
    paths: [path],
    blob: file,
  };
}

function isMarkdownFile(file: File): boolean {
  return (
    isMarkdownFilename(file.name) ||
    Boolean(file.type && file.type.startsWith("text/"))
  );
}

function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    isImageFilename(file.name)
  );
}

function isMarkdownFilename(name: string): boolean {
  return /\.(md|markdown|mdown|mkdn|txt)$/i.test(name);
}

function isImageFilename(name: string): boolean {
  return /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(name);
}

function folderRelativePath(file: File): string {
  const path = normalizeImagePath(fileRelativePath(file));
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : path;
}

function importedArticleImage(file: File, knownPath?: string): LocalImage {
  const path = normalizeImagePath(knownPath || folderRelativePath(file)) || file.name;
  return {
    id: `image-${path}`,
    name: file.name,
    paths: [path],
    blob: file,
  };
}

async function indexLocalDirectory(
  root: DirectoryHandleWithEntries,
): Promise<DirectoryIndex> {
  const markdownFiles: IndexedLocalFile[] = [];
  const imageFiles: IndexedLocalFile[] = [];

  const walk = async (
    directory: DirectoryHandleWithEntries,
    prefix: string,
  ): Promise<void> => {
    if (!directory.values)
      throw new Error("当前浏览器无法读取所选目录的文件索引。");
    for await (const entry of directory.values()) {
      const path = normalizeImagePath(
        prefix ? `${prefix}/${entry.name}` : entry.name,
      );
      if (entry.kind === "directory") {
        await walk(entry as DirectoryHandleWithEntries, path);
        continue;
      }
      if (entry.kind !== "file") continue;
      const file = entry as FileSystemFileHandle;
      const indexedFile: IndexedLocalFile = {
        name: entry.name,
        path,
        readFile: () => file.getFile(),
      };
      if (isMarkdownFilename(entry.name)) markdownFiles.push(indexedFile);
      else if (isImageFilename(entry.name)) imageFiles.push(indexedFile);
    }
  };

  await walk(root, "");
  return {
    markdownFiles: markdownFiles.sort((left, right) =>
      left.path.localeCompare(right.path),
    ),
    imageFiles,
  };
}

async function selectReferencedArticleImages(
  markdown: string,
  imageFiles: IndexedLocalFile[],
  articlePath = "",
  references?: string[],
): Promise<LocalImage[]> {
  const localReferences = references ?? articleImageUrls(parseMarkdown(markdown)).filter(
    (url) => !isRemoteImageUrl(url),
  );
  const imageCandidates = imageFiles.map((file) => ({
    ...file,
    id: `image-${file.path}`,
  }));
  const articleDirectory = articlePath.includes("/")
    ? articlePath.slice(0, articlePath.lastIndexOf("/"))
    : "";
  const candidatesByPath = new Map<string, typeof imageCandidates>();
  imageCandidates.forEach((image) => {
    const matches = candidatesByPath.get(image.path) ?? [];
    matches.push(image);
    candidatesByPath.set(image.path, matches);
  });
  const temporaryResources = buildImageResourceIndex(
    imageCandidates.map((image) => ({
      id: image.id,
      name: image.name,
      paths: [image.path],
    })),
    Object.fromEntries(imageCandidates.map((image) => [image.id, image.id])),
  );
  const selectedIds = new Set<string>();
  localReferences.forEach((reference) => {
    const resolvedPath = normalizeImagePath(
      articleDirectory ? `${articleDirectory}/${reference}` : reference,
    );
    const exactMatches = candidatesByPath.get(resolvedPath) ?? [];
    if (exactMatches.length) {
      exactMatches.forEach((image) => selectedIds.add(image.id));
      return;
    }
    const resolution = resolveImageReference(reference, temporaryResources);
    if (resolution.imageId) selectedIds.add(resolution.imageId);
    resolution.candidateImageIds?.forEach((id) => selectedIds.add(id));
  });
  return Promise.all(
    imageCandidates
      .filter((image) => selectedIds.has(image.id))
      .map(async (image) =>
        importedArticleImage(await image.readFile(), image.path),
      ),
  );
}

function inferArticlePath(
  markdownFiles: IndexedLocalFile[],
  fileName: string,
): string {
  const candidates = markdownFiles.filter((file) => file.name === fileName);
  return candidates.length === 1 ? candidates[0].path : "";
}

export function App() {
  const [markdown, setMarkdown] = useState(STARTER_MARKDOWN);
  const [config, setConfig] = useState<LayoutConfig>(DEFAULT_CONFIG);
  const [measurements, setMeasurements] = useState<Record<string, number>>({});
  const [resourceObjectUrls, setResourceObjectUrls] = useState<
    Record<string, string>
  >({});
  const [localImages, setLocalImages] = useState<LocalImage[]>([]);
  const [imageBindingOverrides, setImageBindingOverrides] = useState<
    Record<string, string>
  >({});
  const [titleOverride, setTitleOverride] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [activePane, setActivePane] = useState<"editor" | "settings">("editor");
  const [mobilePane, setMobilePane] = useState<MobilePane>("editor");
  const [previewScale, setPreviewScale] = useState(0.34);
  const [previewColumns, setPreviewColumns] =
    useState<PreviewColumns>(2);
  const [effectivePreviewColumns, setEffectivePreviewColumns] =
    useState<PreviewColumns>(2);
  const [previewColumnLimit, setPreviewColumnLimit] =
    useState<PreviewColumns>(3);
  const [compactWorkspace, setCompactWorkspace] = useState(() =>
    window.matchMedia(COMPACT_WORKSPACE_QUERY).matches,
  );
  const [sidebarWidth, setSidebarWidth] = useState(520);
  const [activeSettingsCategory, setActiveSettingsCategory] =
    useState<SettingsCategory>("canvas");
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => {
    try {
      const saved = localStorage.getItem("md2card-ui-theme");
      return saved === "light" || saved === "dark" || saved === "system"
        ? saved
        : "system";
    } catch {
      return "system";
    }
  });
  const [exportState, setExportState] = useState<{
    status: "idle" | "running" | "done" | "error";
    message: string;
  }>({ status: "idle", message: "" });
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [imageManagerOpen, setImageManagerOpen] = useState(false);
  const [selectedImageReference, setSelectedImageReference] = useState<
    string | null
  >(null);
  const [imageManagerAttachmentBusy, setImageManagerAttachmentBusy] =
    useState(false);
  const [imageManagerNotice, setImageManagerNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [markdownAssetImport, setMarkdownAssetImport] =
    useState<MarkdownAssetImport | null>(null);
  const [markdownAssetBusy, setMarkdownAssetBusy] = useState(false);
  const [markdownAssetError, setMarkdownAssetError] = useState("");
  const [pendingBindingReference, setPendingBindingReference] = useState<
    string | null
  >(null);
  const [exportPreflight, setExportPreflight] = useState<ExportPreflight>({
    status: "idle",
    message: "",
  });
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const resourceUrls = useRef<Record<string, string>>({});
  const markdownAssetFolderInputRef = useRef<HTMLInputElement | null>(null);
  const currentReferenceFolderInputRef = useRef<HTMLInputElement | null>(null);
  const bindingFileInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarResizeCleanup = useRef<(() => void) | null>(null);

  const article = useMemo(() => parseMarkdown(markdown), [markdown]);
  const resources = useMemo(
    () =>
      buildImageResourceIndex(
        localImages,
        resourceObjectUrls,
        imageBindingOverrides,
      ),
    [imageBindingOverrides, localImages, resourceObjectUrls],
  );
  const localImageReferences = useMemo(
    () => articleImageUrls(article).filter((url) => !isRemoteImageUrl(url)),
    [article],
  );
  const imageBindingSummary = useMemo(
    () => summarizeImageBindings(localImageReferences, resources),
    [localImageReferences, resources],
  );
  const imageReferences = useMemo(
    () =>
      localImageReferences.map((url) => ({
        url,
        resolution: resolveImageReference(url, resources),
      })),
    [localImageReferences, resources],
  );
  const localImagesById = useMemo(
    () =>
      new Map(
        localImages.map((image, index) => [localImageId(image, index), image]),
      ),
    [localImages],
  );
  const imageUsageCount = useMemo(() => {
    const count = new Map<string, number>();
    imageReferences.forEach(({ resolution }) => {
      if (!resolution.imageId) return;
      count.set(resolution.imageId, (count.get(resolution.imageId) ?? 0) + 1);
    });
    return count;
  }, [imageReferences]);
  const unusedImageCount = localImages.filter(
    (image, index) => !imageUsageCount.has(localImageId(image, index)),
  ).length;
  const unresolvedImageReferences = useMemo(
    () =>
      imageReferences
        .filter(({ resolution }) => resolution.state !== "matched")
        .map(({ url }) => url),
    [imageReferences],
  );
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
  const previewStyle = useMemo(() => {
    const pageHeight = config.ratio === "3:4" ? 1440 : 1620;
    return `--preview-columns: ${effectivePreviewColumns}; --preview-scale: ${previewScale}; --preview-card-width: ${Math.round(1080 * previewScale)}px; --preview-card-height: ${Math.round(pageHeight * previewScale)}px;`;
  }, [config.ratio, effectivePreviewColumns, previewScale]);

  useEffect(() => {
    let alive = true;
    void readDraft()
      .then((draft) => {
        if (alive && draft?.markdown) {
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
          setImageBindingOverrides(draft.imageBindingOverrides ?? {});
          const restored = (draft.images ?? []).map(restoreLocalImage);
          const nextObjectUrls: Record<string, string> = {};
          for (const [index, image] of restored.entries()) {
            const id = localImageId(image, index);
            const url = URL.createObjectURL(image.blob);
            nextObjectUrls[id] = url;
            resourceUrls.current[id] = url;
          }
          setLocalImages(restored);
          setResourceObjectUrls(nextObjectUrls);
        }
      })
      .catch(() => undefined)
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(
    () => () => {
      Object.values(resourceUrls.current).forEach((url) =>
        URL.revokeObjectURL(url),
      );
    },
    [],
  );

  useEffect(() => {
    [
      markdownAssetFolderInputRef.current,
      currentReferenceFolderInputRef.current,
    ].forEach(
      (input) => {
        if (!input) return;
        input.setAttribute("webkitdirectory", "");
        input.setAttribute("directory", "");
      },
    );
  }, [imageManagerOpen]);

  useEffect(
    () => () => {
      sidebarResizeCleanup.current?.();
    },
    [],
  );

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      void saveDraft({
        markdown,
        config,
        titleOverride,
        sourceFileName,
        images: localImages,
        imageBindingOverrides,
        updatedAt: Date.now(),
      }).catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [
    markdown,
    config,
    titleOverride,
    sourceFileName,
    localImages,
    imageBindingOverrides,
    hydrated,
  ]);

  useEffect(() => {
    document.title = `${articleName} · md2card`;
  }, [articleName]);

  useEffect(() => {
    if (
      selectedImageReference &&
      !localImageReferences.includes(selectedImageReference)
    )
      setSelectedImageReference(null);
  }, [localImageReferences, selectedImageReference]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.uiTheme =
        uiTheme === "system" ? (media.matches ? "dark" : "light") : uiTheme;
    };
    apply();
    media.addEventListener("change", apply);
    try {
      localStorage.setItem("md2card-ui-theme", uiTheme);
    } catch {
      /* Browser privacy modes may deny local storage. */
    }
    return () => media.removeEventListener("change", apply);
  }, [uiTheme]);

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
    const references = articleImageUrls(parseMarkdown(nextMarkdown)).filter(
      (url) => !isRemoteImageUrl(url),
    );
    const needsAttachmentImport = references.some((reference) => {
      const resolution = resolveImageReference(reference, resources);
      return resolution.state !== "matched";
    });
    setMarkdown(nextMarkdown);
    setSourceFileName(file.name);
    setTitleOverride("");
    setMeasurements({});
    setSelectedImageReference(null);
    setMarkdownAssetImport(
      needsAttachmentImport
        ? { markdown: nextMarkdown, fileName: file.name, references }
        : null,
    );
    setMarkdownAssetError("");
    setExportState({ status: "idle", message: `已载入 ${file.name}` });
  };

  const replaceLocalImages = (images: LocalImage[], message: string) => {
    Object.values(resourceUrls.current).forEach((url) => URL.revokeObjectURL(url));
    const nextObjectUrls: Record<string, string> = {};
    const nextResourceUrls: Record<string, string> = {};
    images.forEach((image, index) => {
      const id = localImageId(image, index);
      const url = URL.createObjectURL(image.blob);
      nextObjectUrls[id] = url;
      nextResourceUrls[id] = url;
    });
    resourceUrls.current = nextResourceUrls;
    setLocalImages(images);
    setResourceObjectUrls(nextObjectUrls);
    setImageBindingOverrides({});
    setMeasurements({});
    setExportState({ status: "idle", message });
  };

  const addLocalImageRecords = (images: LocalImage[], message: string) => {
    if (!images.length) return;
    setLocalImages((previous) => {
      const byId = new Map(
        previous.map((image, index) => [localImageId(image, index), image]),
      );
      images.forEach((image, index) =>
        byId.set(localImageId(image, index), image),
      );
      return Array.from(byId.values());
    });
    setResourceObjectUrls((previous) => {
      const next = { ...previous };
      images.forEach((image, index) => {
        const id = localImageId(image, index);
        const oldUrl = resourceUrls.current[id];
        if (oldUrl) URL.revokeObjectURL(oldUrl);
        const url = URL.createObjectURL(image.blob);
        resourceUrls.current[id] = url;
        next[id] = url;
      });
      return next;
    });
    setMeasurements({});
    setExportState({ status: "idle", message });
  };

  const attachMarkdownAssetImages = async (
    imageFiles: IndexedLocalFile[],
    source: ImageAttachmentSource,
    articlePath = "",
  ) => {
    const pending = markdownAssetImport;
    if (!pending) return;
    setMarkdownAssetBusy(true);
    setMarkdownAssetError("");
    try {
      const selectedImages = await selectReferencedArticleImages(
        pending.markdown,
        imageFiles,
        articlePath,
        pending.references,
      );
      if (!selectedImages.length) {
        const message = "所选目录中没有匹配当前 Markdown 引用的图片。";
        setMarkdownAssetError(message);
        setExportState({
          status: "error",
          message,
        });
        return;
      }
      addLocalImageRecords(
        selectedImages,
        source === "smart"
          ? `已按需读取并导入 ${selectedImages.length} 张当前 Markdown 引用的图片。`
          : `已从目录中导入 ${selectedImages.length} 张当前 Markdown 引用的图片。`,
      );
      setMarkdownAssetImport(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? `读取图片附件失败：${error.message}`
          : "读取图片附件失败。";
      setMarkdownAssetError(message);
      setExportState({
        status: "error",
        message,
      });
    } finally {
      setMarkdownAssetBusy(false);
    }
  };

  const importMarkdownAssetFolder = (files: FileList | File[]) => {
    const imageFiles = Array.from(files)
      .filter(isImageFile)
      .map((file) => ({
        name: file.name,
        path: folderRelativePath(file) || file.name,
        readFile: async () => file,
      }));
    if (!imageFiles.length) {
      const message = "所选文件夹中未找到可用图片。";
      setMarkdownAssetError(message);
      setExportState({
        status: "error",
        message,
      });
      return;
    }
    void attachMarkdownAssetImages(imageFiles, "compat");
  };

  const openMarkdownAssetFolderImport = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      markdownAssetFolderInputRef.current?.click();
      return;
    }
    setMarkdownAssetBusy(true);
    try {
      const directory = await picker({ mode: "read" });
      const directoryIndex = await indexLocalDirectory(directory);
      const articlePath = markdownAssetImport
        ? inferArticlePath(
            directoryIndex.markdownFiles,
            markdownAssetImport.fileName,
          )
        : "";
      await attachMarkdownAssetImages(
        directoryIndex.imageFiles,
        "smart",
        articlePath,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message =
        error instanceof Error
          ? `无法建立图片附件索引：${error.message}`
          : "无法建立图片附件索引。";
      setMarkdownAssetError(message);
      setExportState({
        status: "error",
        message,
      });
    } finally {
      setMarkdownAssetBusy(false);
    }
  };

  const attachCurrentReferenceImages = async (
    imageFiles: IndexedLocalFile[],
    source: ImageAttachmentSource,
    articlePath = "",
  ) => {
    if (!unresolvedImageReferences.length) {
      setImageManagerNotice({
        kind: "success",
        message: "当前本地图片引用均已绑定，无需补齐。",
      });
      return;
    }
    setImageManagerAttachmentBusy(true);
    setImageManagerNotice(null);
    try {
      const selectedImages = await selectReferencedArticleImages(
        markdown,
        imageFiles,
        articlePath,
        unresolvedImageReferences,
      );
      if (!selectedImages.length) {
        setImageManagerNotice({
          kind: "error",
          message: "所选目录中没有匹配当前缺失或冲突引用的图片。",
        });
        return;
      }
      addLocalImageRecords(
        selectedImages,
        source === "smart"
          ? `已按需补齐 ${selectedImages.length} 张当前文章的图片附件。`
          : `已从目录中补齐 ${selectedImages.length} 张当前文章的图片附件。`,
      );
      setImageManagerNotice({
        kind: "success",
        message: `已补齐 ${selectedImages.length} 张图片；请在左侧确认绑定结果。`,
      });
    } catch (error) {
      setImageManagerNotice({
        kind: "error",
        message:
          error instanceof Error
            ? `读取图片附件失败：${error.message}`
            : "读取图片附件失败。",
      });
    } finally {
      setImageManagerAttachmentBusy(false);
    }
  };

  const importCurrentReferenceFolder = (files: FileList | File[]) => {
    const imageFiles = Array.from(files)
      .filter(isImageFile)
      .map((file) => ({
        name: file.name,
        path: folderRelativePath(file) || file.name,
        readFile: async () => file,
      }));
    if (!imageFiles.length) {
      setImageManagerNotice({
        kind: "error",
        message: "所选目录中未找到可用图片。",
      });
      return;
    }
    void attachCurrentReferenceImages(imageFiles, "compat");
  };

  const openCurrentReferenceAttachmentImport = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      currentReferenceFolderInputRef.current?.click();
      return;
    }
    setImageManagerAttachmentBusy(true);
    setImageManagerNotice(null);
    try {
      const directory = await picker({ mode: "read" });
      const directoryIndex = await indexLocalDirectory(directory);
      await attachCurrentReferenceImages(
        directoryIndex.imageFiles,
        "smart",
        inferArticlePath(directoryIndex.markdownFiles, sourceFileName),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setImageManagerNotice({
        kind: "error",
        message:
          error instanceof Error
            ? `无法建立图片附件索引：${error.message}`
            : "无法建立图片附件索引。",
      });
    } finally {
      setImageManagerAttachmentBusy(false);
    }
  };

  const addImages = (
    files: FileList | File[],
    bindReference?: string,
  ) => {
    const accepted = Array.from(files).filter(isImageFile);
    if (!accepted.length) return;
    const imported = accepted.map(importedLocalImage);
    addLocalImageRecords(
      imported,
      bindReference && imported.length === 1
        ? `已导入并绑定 ${imported[0].name}。`
        : `已导入 ${accepted.length} 张本地图片。`,
    );
    if (bindReference && imported.length === 1) {
      bindImageToReference(bindReference, localImageId(imported[0]));
      setSelectedImageReference(null);
    }
  };

  const bindImageToReference = (reference: string, imageId: string) => {
    setImageBindingOverrides((previous) => ({
      ...previous,
      [normalizeImagePath(reference)]: imageId,
    }));
    setMeasurements({});
    setExportState({ status: "idle", message: `已为 ${reference} 指定本地图片。` });
  };

  const clearImageBindingOverride = (reference: string) => {
    const key = normalizeImagePath(reference);
    setImageBindingOverrides((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    setMeasurements({});
  };

  const bindSelectedImage = (file: File | undefined) => {
    const reference = pendingBindingReference;
    if (!file || !reference || !isImageFile(file)) return;
    const image = importedLocalImage(file);
    const id = localImageId(image);
    setLocalImages((previous) => {
      const byId = new Map(
        previous.map((item, index) => [localImageId(item, index), item]),
      );
      byId.set(id, image);
      return Array.from(byId.values());
    });
    setResourceObjectUrls((previous) => {
      const next = { ...previous };
      const oldUrl = resourceUrls.current[id];
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      const url = URL.createObjectURL(image.blob);
      resourceUrls.current[id] = url;
      next[id] = url;
      return next;
    });
    bindImageToReference(reference, id);
    setPendingBindingReference(null);
    setSelectedImageReference(null);
  };

  const removeImagesById = (ids: Set<string>, message: string) => {
    if (!ids.size) return;
    setLocalImages((previous) =>
      previous.filter((image, index) => !ids.has(localImageId(image, index))),
    );
    setResourceObjectUrls((previous) => {
      const next = { ...previous };
      ids.forEach((id) => {
        const objectUrl = resourceUrls.current[id];
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        delete resourceUrls.current[id];
        delete next[id];
      });
      return next;
    });
    setImageBindingOverrides((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([, imageId]) => !ids.has(imageId)),
      ),
    );
    setMeasurements({});
    setExportState({ status: "idle", message });
  };

  const removeLocalImage = (id: string) => {
    removeImagesById(new Set([id]), "已移除 1 张本地图片。");
  };

  const clearLocalImages = () => {
    replaceLocalImages([], "已清空导入图片。");
  };

  const clearUnusedImages = () => {
    const ids = new Set(
      localImages
        .map((image, index) => localImageId(image, index))
        .filter((id) => !imageUsageCount.has(id)),
    );
    removeImagesById(ids, `已清理 ${ids.size} 张未被当前 Markdown 引用的图片。`);
  };

  const diagnostics = pagePlan.diagnostics;
  const manyPages = pagePlan.pages.length > 20;
  const exportHasErrors = diagnostics.some((item) => item.level === "error");
  const diagnosticWarningCount = diagnostics.filter(
    (item) => item.level === "warning",
  ).length;
  const previewDiagnosticLabel = exportHasErrors
    ? "有排版错误"
    : diagnosticWarningCount > 0
      ? `${diagnosticWarningCount} 项提醒`
      : undefined;

  const inspectExportReadiness = async () => {
    setExportPreflight({
      status: "checking",
      message: "正在检查字体、图片和卡片边界…",
    });
    try {
      if (exportHasErrors)
        throw new Error("Markdown 存在解析错误，请先处理页面提示。");
      const cards = pagePlan.pages
        .map((page) => cardRefs.current[page.id])
        .filter((card): card is HTMLElement => Boolean(card));
      if (!cards.length) throw new Error("卡片仍在生成，请稍后重试。");
      if ("fonts" in document) await document.fonts.ready;
      await Promise.all(
        cards.flatMap((card) =>
          Array.from(card.querySelectorAll("img")).map(async (image) => {
            if (!image.complete)
              await new Promise<void>((resolve, reject) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener(
                  "error",
                  () => reject(new Error("有图片无法加载。")),
                  { once: true },
                );
              });
            await image.decode().catch(() => {
              throw new Error("有图片无法解码。");
            });
          }),
        ),
      );
      if (
        cards.some((card) => {
          const content = card.querySelector<HTMLElement>(".card-content");
          return Boolean(
            content && content.scrollHeight > content.clientHeight + 1,
          );
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
    const cards = pagePlan.pages
      .map((page) => cardRefs.current[page.id])
      .filter((card): card is HTMLDivElement => Boolean(card));
    try {
      setExportState({
        status: "running",
        message: `正在生成 0 / ${cards.length} 张 PNG…`,
      });
      await exportCards({
        cards,
        filename: safeFilename(articleName),
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
      const maxByContent = Math.max(
        1,
        Math.min(3, pagePlan.pages.length || 1),
      );
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
    [compactWorkspace, pagePlan.pages.length, previewColumns],
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
    const updateCompactWorkspace = () => {
      setCompactWorkspace(media.matches);
    };
    updateCompactWorkspace();
    media.addEventListener("change", updateCompactWorkspace);
    return () => media.removeEventListener("change", updateCompactWorkspace);
  }, []);

  const startSidebarResize = (event: PointerEvent) => {
    if (window.matchMedia("(max-width: 920px)").matches) return;
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

  return (
    <div class="application-shell">
      <header class="topbar">
        <div class="topbar-branding">
          <a class="brand" href="../" aria-label="返回 md2card 首页">
            <span class="brand-mark">M</span>
            <span>md2card</span>
            <small>技术 Markdown 卡片</small>
          </a>
          <nav class="workspace-site-nav" aria-label="站点导航">
            <a class="workspace-home-link" href="../">首页</a>
          </nav>
        </div>
        <div class="topbar-actions">
          <div class="theme-segmented" role="group" aria-label="网页外观">
            <button
              type="button"
              class={uiTheme === "system" ? "selected" : ""}
              aria-pressed={uiTheme === "system"}
              onClick={() => setUiTheme("system")}
            >
              <span class="theme-full">跟随系统</span>
              <span class="theme-short">系统</span>
            </button>
            <button
              type="button"
              class={uiTheme === "light" ? "selected" : ""}
              aria-pressed={uiTheme === "light"}
              onClick={() => setUiTheme("light")}
            >
              浅色
            </button>
            <button
              type="button"
              class={uiTheme === "dark" ? "selected" : ""}
              aria-pressed={uiTheme === "dark"}
              onClick={() => setUiTheme("dark")}
            >
              暗色
            </button>
          </div>
          <GitHubLink />
          <span class="privacy-note">全部在本地浏览器中完成</span>
          <button
            class="top-export-button"
            disabled={exportState.status === "running"}
            onClick={openExportDialog}
          >
            {exportState.status === "running"
              ? exportState.message
              : "下载图片…"}
          </button>
        </div>
      </header>

      <nav class="mobile-workspace-tabs" aria-label="移动工作区">
        <button
          type="button"
          class={mobilePane === "editor" ? "selected" : ""}
          onClick={() => {
            setMobilePane("editor");
            setActivePane("editor");
          }}
        >
          编辑
        </button>
        <button
          type="button"
          class={mobilePane === "settings" ? "selected" : ""}
          onClick={() => {
            setMobilePane("settings");
            setActivePane("settings");
          }}
        >
          设置
        </button>
        <button
          type="button"
          class={mobilePane === "preview" ? "selected" : ""}
            onClick={() => {
              setMobilePane("preview");
              requestAnimationFrame(() => fitPreviewColumns());
            }}
        >
          预览
        </button>
      </nav>

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
          <section
            class={`editor-panel workbench-pane${activePane === "editor" ? " is-active" : ""}`}
          >
            <div class="panel-heading">
              <div>
                <span class="eyebrow">输入</span>
                <h1>Markdown 编辑器</h1>
              </div>
              <div class="panel-heading-actions">
                <label class="file-button recommended-file-button">
                  导入 Markdown
                  <input
                    type="file"
                    accept=".md,.markdown,.mdown,.mkdn,.txt,text/markdown,text/plain"
                    onChange={(event) =>
                      void loadFile((event.currentTarget.files ?? [])[0])
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
                  onInput={(event) =>
                    setTitleOverride(event.currentTarget.value)
                  }
                  aria-label="文章名（可选）"
                />
              </label>
              <button
                type="button"
                disabled={!titleOverride}
                onClick={() => setTitleOverride("")}
              >
                恢复默认
              </button>
              <small>当前：{titleSource}</small>
            </div>
            <div
              class={`editor-drop-zone${dragging ? " is-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const files = event.dataTransfer?.files;
                if (!files) return;
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
            >
              <textarea
                value={markdown}
                onInput={(event) => {
                  setMarkdown(event.currentTarget.value);
                  setMeasurements({});
                }}
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
                {localImages.length > 0 && (
                  <span class="image-count">已导入 {localImages.length} 张</span>
                )}
                <button
                  type="button"
                  class="image-manager-button"
                  onClick={() => setImageManagerOpen(true)}
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

          <section
            class={`settings-panel workbench-pane${activePane === "settings" ? " is-active" : ""}`}
          >
            <div class="panel-heading compact">
              <div>
                <span class="eyebrow">排版</span>
                <h2>阅读设置</h2>
              </div>
            </div>
            <fieldset class="quick-settings">
              <legend>快捷设置</legend>
              <div class="quick-settings-grid">
                <div>
                  <span class="quick-setting-label">画布比例</span>
                  <div class="segmented">
                    <button
                      class={config.ratio === "3:4" ? "selected" : ""}
                      onClick={() => updateConfig("ratio", "3:4")}
                    >
                      3:4
                      <br />
                      <small>标准卡片</small>
                    </button>
                    <button
                      class={config.ratio === "2:3" ? "selected" : ""}
                      onClick={() => updateConfig("ratio", "2:3")}
                    >
                      2:3
                      <br />
                      <small>技术长图</small>
                    </button>
                  </div>
                </div>
                <div>
                  <span class="quick-setting-label">
                    整体密度（正文、标题、代码）
                  </span>
                  <div class="density-choices">
                    {(["relaxed", "balanced", "compact"] as const).map(
                      (density) => (
                        <button
                          key={density}
                          class={config.density === density ? "selected" : ""}
                          onClick={() => applyDensityPreset(density)}
                        >
                          {
                            {
                              relaxed: "舒展",
                              balanced: "技术平衡",
                              compact: "紧凑",
                            }[density]
                          }
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
              <p class="field-help">
                预设会同步调整正文字号、行距、标题留白与代码字号；表格、公式和图片保持单独控制。
              </p>
              {config.density === "custom" && (
                <div class="density-custom-state">
                  <span>已按下方参数微调整体密度。</span>
                  <button
                    type="button"
                    class="secondary-button"
                    onClick={() => applyDensityPreset("balanced")}
                  >
                    恢复技术平衡
                  </button>
                </div>
              )}
            </fieldset>
            <nav class="settings-category-nav" aria-label="排版分类">
              <button
                type="button"
                class={activeSettingsCategory === "canvas" ? "selected" : ""}
                aria-pressed={activeSettingsCategory === "canvas"}
                onClick={() => setActiveSettingsCategory("canvas")}
              >
                <strong>画布</strong>
                <small>主题 · 首卡 · 边距</small>
              </button>
              <button
                type="button"
                class={activeSettingsCategory === "text" ? "selected" : ""}
                aria-pressed={activeSettingsCategory === "text"}
                onClick={() => setActiveSettingsCategory("text")}
              >
                <strong>正文</strong>
                <small>字号 · 行距 · 间距</small>
              </button>
              <button
                type="button"
                class={activeSettingsCategory === "heading" ? "selected" : ""}
                aria-pressed={activeSettingsCategory === "heading"}
                onClick={() => setActiveSettingsCategory("heading")}
              >
                <strong>标题</strong>
                <small>留白 · 分页</small>
              </button>
              <button
                type="button"
                class={activeSettingsCategory === "technical" ? "selected" : ""}
                aria-pressed={activeSettingsCategory === "technical"}
                onClick={() => setActiveSettingsCategory("technical")}
              >
                <strong>技术块</strong>
                <small>表格 · 公式 · 代码</small>
              </button>
            </nav>
            {activeSettingsCategory === "text" && (
              <section class="settings-category-content">
                <h3>正文排版</h3>
                <div class="setting-control-grid">
                  <label class="range-label">
                    正文字号 <output>{config.bodyFontSize}px</output>
                    <input
                      type="range"
                      min="26"
                      max="34"
                      value={config.bodyFontSize}
                      onInput={(event) =>
                        updateReadingConfig(
                          "bodyFontSize",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                  <label class="range-label">
                    正文行距 <output>{config.bodyLineHeight.toFixed(2)}</output>
                    <input
                      type="range"
                      min="1.45"
                      max="1.78"
                      step="0.01"
                      value={config.bodyLineHeight}
                      onInput={(event) =>
                        updateReadingConfig(
                          "bodyLineHeight",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                  <label class="range-label">
                    块间距 <output>{config.blockGap}px</output>
                    <input
                      type="range"
                      min="0"
                      max="32"
                      step="2"
                      value={config.blockGap}
                      onInput={(event) =>
                        updateReadingConfig(
                          "blockGap",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                </div>
              </section>
            )}
            {activeSettingsCategory === "heading" && (
              <section class="settings-category-content">
                <h3>标题结构</h3>
                <p class="field-help">
                  标题留白只在标题不位于卡片首块时生效，并会参与分页计算。
                </p>
                <div class="setting-control-grid">
                  <label class="range-label">
                    H2 章节前留白{" "}
                    <output>{config.headingH2BeforeSpacing}px</output>
                    <input
                      type="range"
                      min="0"
                      max="72"
                      step="4"
                      value={config.headingH2BeforeSpacing}
                      onInput={(event) =>
                        updateReadingConfig(
                          "headingH2BeforeSpacing",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                  <label class="range-label">
                    H3 小节前留白{" "}
                    <output>{config.headingH3BeforeSpacing}px</output>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      step="2"
                      value={config.headingH3BeforeSpacing}
                      onInput={(event) =>
                        updateReadingConfig(
                          "headingH3BeforeSpacing",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                </div>
                <h4>标题分页</h4>
                <p class="field-help">
                  H2 会优先携带短引言后的实质内容，或首个 H3
                  与其首段；数值表示标题顶部进入页尾多少比例后自动转到下一页。
                </p>
                <div class="setting-control-grid">
                  <label class="range-label">
                    H2 页尾安全区{" "}
                    <output>{config.headingH2TailPercent}%</output>
                    <input
                      type="range"
                      min="10"
                      max="35"
                      value={config.headingH2TailPercent}
                      onInput={(event) =>
                        updateConfig(
                          "headingH2TailPercent",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                  <label class="range-label">
                    H3 页尾安全区{" "}
                    <output>{config.headingH3TailPercent}%</output>
                    <input
                      type="range"
                      min="4"
                      max="22"
                      value={config.headingH3TailPercent}
                      onInput={(event) =>
                        updateConfig(
                          "headingH3TailPercent",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                  <label class="range-label">
                    H4 页尾安全区{" "}
                    <output>{config.headingH4TailPercent}%</output>
                    <input
                      type="range"
                      min="0"
                      max="14"
                      value={config.headingH4TailPercent}
                      onInput={(event) =>
                        updateConfig(
                          "headingH4TailPercent",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                </div>
              </section>
            )}
            {activeSettingsCategory === "technical" && (
              <section class="settings-category-content">
                <h3>技术块</h3>
                <div class="setting-control-grid">
                  <label class="range-label">
                    表格字号 <output>{config.tableFontSize}px</output>
                    <input
                      type="range"
                      min="20"
                      max="25"
                      value={config.tableFontSize}
                      onInput={(event) =>
                        updateConfig(
                          "tableFontSize",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                  <label class="range-label">
                    公式缩放 <output>{config.mathScale.toFixed(2)}×</output>
                    <input
                      type="range"
                      min="0.72"
                      max="1"
                      step="0.02"
                      value={config.mathScale}
                      onInput={(event) =>
                        updateConfig(
                          "mathScale",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                  <label class="range-label">
                    代码字号 <output>{config.codeFontSize}px</output>
                    <input
                      type="range"
                      min="20"
                      max="26"
                      value={config.codeFontSize}
                      onInput={(event) =>
                        updateReadingConfig(
                          "codeFontSize",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                </div>
                <h4>代码块外观</h4>
                <p class="field-help">
                  跟随模板保留卡片主题的技术面；macOS 编辑器使用银灰窗口栏、三色控制点和白色代码区。
                </p>
                <div class="segmented code-block-appearance-control">
                  <button
                    type="button"
                    class={
                      config.codeBlockAppearance === "theme" ? "selected" : ""
                    }
                    aria-pressed={config.codeBlockAppearance === "theme"}
                    onClick={() => updateConfig("codeBlockAppearance", "theme")}
                  >
                    跟随模板
                    <br />
                    <small>简洁技术面</small>
                  </button>
                  <button
                    type="button"
                    class={
                      config.codeBlockAppearance === "macos" ? "selected" : ""
                    }
                    aria-pressed={config.codeBlockAppearance === "macos"}
                    onClick={() => updateConfig("codeBlockAppearance", "macos")}
                  >
                    macOS 编辑器
                    <br />
                    <small>窗口栏 · 白色代码区</small>
                  </button>
                </div>
                <label class="check-label">
                  <input
                    type="checkbox"
                    checked={config.codeLineNumbers}
                    onChange={(event) =>
                      updateConfig(
                        "codeLineNumbers",
                        event.currentTarget.checked,
                      )
                    }
                  />{" "}
                  代码行号
                </label>
              </section>
            )}
            {activeSettingsCategory === "canvas" && (
              <section class="settings-category-content">
                <h3>画布、主题与首卡</h3>
                <h4>卡片模板</h4>
                <p class="field-help">
                  每套模板同时控制首卡、标题、技术块和纹理；网页浅色/深色外观不会改变导出结果。
                </p>
                <div class="card-theme-grid">
                  {(
                    [
                      {
                        id: "minimal",
                        name: "纯净排版",
                        hint: "白底 · 正式",
                      },
                      {
                        id: "research",
                        name: "雾蓝实验室",
                        hint: "蓝色 · 精确",
                      },
                      {
                        id: "editorial",
                        name: "柔光浅紫",
                        hint: "浅紫 · 现代",
                      },
                      {
                        id: "notebook",
                        name: "雾松笔记",
                        hint: "绿色 · 清透",
                      },
                    ] as const
                  ).map((theme) => (
                    <button
                      key={theme.id}
                      type="button"
                      class={`card-theme-option theme-${theme.id}${config.cardTheme === theme.id ? " selected" : ""}`}
                      aria-pressed={config.cardTheme === theme.id}
                      onClick={() => updateConfig("cardTheme", theme.id)}
                    >
                      <span class="card-theme-swatch" />
                      <strong>{theme.name}</strong>
                      <small>{theme.hint}</small>
                    </button>
                  ))}
                </div>

                <h4>首卡封面</h4>
                <p class="field-help">
                  融合首页只在第一张卡片展示文章名；标题区域会参与分页，后续卡片不会重复显示。
                </p>
                <div class="segmented cover-mode-control">
                  <button
                    type="button"
                    class={config.coverMode === "integrated" ? "selected" : ""}
                    onClick={() => updateConfig("coverMode", "integrated")}
                  >
                    融合首页
                    <br />
                    <small>推荐</small>
                  </button>
                  <button
                    type="button"
                    class={config.coverMode === "standalone" ? "selected" : ""}
                    onClick={() => updateConfig("coverMode", "standalone")}
                  >
                    独立封面
                  </button>
                  <button
                    type="button"
                    class={config.coverMode === "none" ? "selected" : ""}
                    onClick={() => updateConfig("coverMode", "none")}
                  >
                    无封面
                  </button>
                </div>
                {config.coverMode !== "none" && (
                  <>
                    <p class="cover-title-source">
                      封面标题：<strong title={articleName}>{articleName}</strong>
                      <button
                        type="button"
                        onClick={() => {
                          setActivePane("editor");
                          setMobilePane("editor");
                        }}
                      >
                        到编辑区修改
                      </button>
                    </p>
                    <div class="cover-copy-fields">
                      <label class="text-field">
                        封面标签（可选）
                        <input
                          value={config.coverKicker}
                          placeholder="例如：技术笔记"
                          onInput={(event) =>
                            updateConfig(
                              "coverKicker",
                              event.currentTarget.value,
                            )
                          }
                        />
                      </label>
                      <label class="text-field">
                        副标题（可选）
                        <input
                          value={config.coverSubtitle}
                          placeholder="一句话说明文章内容"
                          onInput={(event) =>
                            updateConfig(
                              "coverSubtitle",
                              event.currentTarget.value,
                            )
                          }
                        />
                      </label>
                    </div>
                  </>
                )}

                <h4>画布留白</h4>
                <div class="setting-control-grid">
                  <label class="range-label">
                    左右安全边距{" "}
                    <output>{config.cardHorizontalPadding}px</output>
                    <input
                      type="range"
                      min="60"
                      max="92"
                      step="2"
                      value={config.cardHorizontalPadding}
                      onInput={(event) =>
                        updateConfig(
                          "cardHorizontalPadding",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                  <label class="range-label">
                    上下安全留白 <output>{config.cardVerticalPadding}px</output>
                    <input
                      type="range"
                      min="50"
                      max="88"
                      step="2"
                      value={config.cardVerticalPadding}
                      onInput={(event) =>
                        updateConfig(
                          "cardVerticalPadding",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                </div>
                <h4>图片与页码</h4>
                <div class="setting-control-grid">
                  <label class="range-label">
                    图片最大页高{" "}
                    <output>{config.imageMaxHeightPercent}%</output>
                    <input
                      type="range"
                      min="35"
                      max="68"
                      value={config.imageMaxHeightPercent}
                      onInput={(event) =>
                        updateConfig(
                          "imageMaxHeightPercent",
                          Number(event.currentTarget.value),
                        )
                      }
                    />
                  </label>
                </div>
                <label class="check-label">
                  <input
                    type="checkbox"
                    checked={config.showPageNumber}
                    onChange={(event) =>
                      updateConfig(
                        "showPageNumber",
                        event.currentTarget.checked,
                      )
                    }
                  />{" "}
                  显示右下角页码
                </label>
              </section>
            )}
            <div class="diagnostic-summary">
              <strong>{pagePlan.pages.length} 页</strong>
              {manyPages && (
                <span class="warning">超过 20 页，发布时建议拆成多篇。</span>
              )}
              {diagnostics
                .filter(
                  (item) => item.level === "warning" || item.level === "error",
                )
                .slice(0, 2)
                .map((item, index) => (
                  <span key={index} class={item.level}>
                    {item.message}
                  </span>
                ))}
            </div>
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

        <section
          class={`preview-panel${mobilePane === "preview" ? " mobile-active" : ""}`}
        >
          <div class="panel-heading preview-heading">
            <div>
              <span class="eyebrow">所见即所得</span>
              <h2 title={articleName}>{articleName}</h2>
            </div>
            <div class="preview-toolbar">
              <div
                class="preview-layout-control"
                role="group"
                aria-label={`预览列数，当前显示 ${effectivePreviewColumns} 列`}
              >
                {([1, 2, 3] as const)
                  .filter((columns) => !compactWorkspace || columns === 1)
                  .map((columns) => (
                    <button
                      key={columns}
                      type="button"
                      class={
                        effectivePreviewColumns === columns ? "selected" : ""
                      }
                      aria-pressed={effectivePreviewColumns === columns}
                      disabled={columns > previewColumnLimit}
                      title={
                        columns > previewColumnLimit
                          ? "当前卡片数量或预览宽度不足，暂不适合此列数"
                          : undefined
                      }
                      onClick={() => selectPreviewColumns(columns)}
                    >
                      {columns} 列
                    </button>
                  ))}
              </div>
              <span class="page-badge">{pagePlan.pages.length} 张卡片</span>
              {previewDiagnosticLabel && (
                <button
                  type="button"
                  class={`preview-diagnostic${exportHasErrors ? " error" : ""}`}
                  onClick={() => {
                    setActivePane("settings");
                    setMobilePane("settings");
                  }}
                >
                  {previewDiagnosticLabel}
                </button>
              )}
            </div>
          </div>
          <div class="preview-scroll" style={previewStyle}>
            {pagePlan.pages.map((page) => (
              <div key={page.id} class="preview-frame">
                <div class="preview-scale">
                  <CardPage
                    ref={(node: HTMLElement | null) => {
                      cardRefs.current[page.id] = node;
                    }}
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
      </div>

      <MeasureStage
        article={article}
        config={config}
        cover={cover}
        resources={resources}
        onMeasure={acceptMeasure}
      />
      {imageManagerOpen && (
        <div
          class="export-dialog-backdrop image-manager-backdrop"
          role="presentation"
          onMouseDown={() => setImageManagerOpen(false)}
        >
          <section
            class="image-manager-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-manager-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header class="export-dialog-header">
              <div>
                <span class="eyebrow">资源</span>
                <h2 id="image-manager-title">图片资源</h2>
              </div>
              <button
                type="button"
                class="dialog-close"
                onClick={() => setImageManagerOpen(false)}
                aria-label="关闭输入图片窗口"
              >
                ×
              </button>
            </header>
            <p class="image-manager-summary">
              本地图片引用已绑定 {imageBindingSummary.matched} /{" "}
              {imageBindingSummary.total}。Markdown 始终决定图片顺序与路径。
            </p>
            <div class="image-manager-import-actions">
              <button
                type="button"
                class="file-button recommended-file-button"
                disabled={
                  imageManagerAttachmentBusy ||
                  unresolvedImageReferences.length === 0
                }
                onClick={() => void openCurrentReferenceAttachmentImport()}
              >
                {imageManagerAttachmentBusy
                  ? "正在匹配图片…"
                  : "自动补齐（选择图片所在文件夹）"}
              </button>
              <label class="file-button">
                手动添加图片
                <input
                  type="file"
                  accept="image/*"
                  multiple={!selectedImageReference}
                  onChange={(event) => {
                    addImages(
                      event.currentTarget.files ?? [],
                      selectedImageReference ?? undefined,
                    );
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
            <p class="image-manager-import-help">
              {unresolvedImageReferences.length > 0 ? (
                <>
                  自动补齐会选择文章根目录或 <code>assets</code> 文件夹，只匹配左侧缺失或需要指定的图片。手动添加可从电脑选择图片；选中左侧引用时会直接绑定。
                </>
              ) : localImageReferences.length > 0 ? (
                <>当前本地图片引用均已绑定，无需自动补齐；仍可手动添加图片，用于替换或补充资源。</>
              ) : (
                <>当前 Markdown 没有本地图片引用；可手动添加图片，供后续编辑时使用。</>
              )}
            </p>
            {imageManagerNotice && (
              <p
                class={`image-manager-notice ${imageManagerNotice.kind}`}
                role={imageManagerNotice.kind === "error" ? "alert" : "status"}
              >
                {imageManagerNotice.message}
              </p>
            )}
            {selectedImageReference && (
              <p class="image-manager-selection">
                正在为 <code>{selectedImageReference}</code> 选择图片
                <button
                  type="button"
                  class="text-button"
                  onClick={() => setSelectedImageReference(null)}
                >
                  取消选择
                </button>
              </p>
            )}
            <div class="image-manager-workspace">
              <section class="image-manager-pane references-pane">
                <header class="image-manager-pane-header">
                  <h3>Markdown 引用</h3>
                  <span>{imageReferences.length}</span>
                </header>
                {imageReferences.length > 0 ? (
                <div class="image-manager-reference-list">
                  {imageReferences.map(({ url, resolution }) => {
                    const boundImage = resolution.imageId
                      ? localImagesById.get(resolution.imageId)
                      : undefined;
                    const isOverridden = Boolean(
                      imageBindingOverrides[normalizeImagePath(url)],
                    );
                    const candidateIds = resolution.candidateImageIds ?? [];
                    return (
                      <article
                        key={url}
                        class={`image-reference-item ${resolution.state}${selectedImageReference === url ? " selected" : ""}`}
                      >
                        <header class="image-reference-header">
                          <button
                            type="button"
                            class="image-reference-select"
                            onClick={() => setSelectedImageReference(url)}
                            aria-pressed={selectedImageReference === url}
                          >
                            <span class={`image-resolution-state ${resolution.state}`}>
                              {resolution.state === "matched"
                                ? "已绑定"
                                : resolution.state === "ambiguous"
                                  ? "需要指定"
                                  : "缺少图片"}
                            </span>
                            <code title={url}>{url}</code>
                          </button>
                        </header>
                        {resolution.state === "matched" && boundImage ? (
                          <div class="image-reference-bound">
                            <div class="image-manager-thumbnail compact">
                              {resourceObjectUrls[resolution.imageId!] ? (
                                <img
                                  src={resourceObjectUrls[resolution.imageId!]}
                                  alt={boundImage.name}
                                />
                              ) : (
                                <span>图片不可用</span>
                              )}
                            </div>
                            <div class="image-manager-meta">
                              <strong title={boundImage.name}>{boundImage.name}</strong>
                              <code title={boundImage.paths?.join(" · ")}>
                                {boundImage.paths?.join(" · ") || boundImage.name}
                              </code>
                            </div>
                          </div>
                        ) : resolution.state === "ambiguous" ? (
                          <div class="image-reference-explanation">
                            检测到同名或相同目录后缀的多张图片。请明确指定，避免错误渲染。
                          </div>
                        ) : (
                          <div class="image-reference-explanation">
                            当前已导入的图片中没有可安全匹配的文件。
                          </div>
                        )}
                        {resolution.state === "ambiguous" && candidateIds.length > 0 && (
                          <div class="image-candidate-list" aria-label="可选候选图片">
                            {candidateIds.map((id) => {
                              const image = localImagesById.get(id);
                              const objectUrl = resourceObjectUrls[id];
                              if (!image) return null;
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  class="image-candidate"
                                  onClick={() => {
                                    bindImageToReference(url, id);
                                    setSelectedImageReference(null);
                                  }}
                                  title={`使用 ${image.name}`}
                                >
                                  {objectUrl ? <img src={objectUrl} alt="" /> : <span>图片</span>}
                                  <span>使用此图</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <footer class="image-reference-actions">
                          <button
                            type="button"
                            class="secondary-button compact-button"
                            onClick={() => {
                              setSelectedImageReference(url);
                              setPendingBindingReference(url);
                              bindingFileInputRef.current?.click();
                            }}
                          >
                            {resolution.state === "matched" ? "替换图片" : "选择图片补齐"}
                          </button>
                          {isOverridden && (
                            <button
                              type="button"
                              class="text-button"
                              onClick={() => clearImageBindingOverride(url)}
                            >
                              恢复自动匹配
                            </button>
                          )}
                        </footer>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div class="image-manager-empty">
                  当前 Markdown 没有本地图片引用。远程图片会直接按原始链接渲染，无需在此绑定。
                </div>
                )}
              </section>
              <section class="image-manager-pane files-pane">
                <header class="image-manager-pane-header">
                  <h3>已导入图片</h3>
                  <span>{localImages.length}</span>
                </header>
                {localImages.length > 0 ? (
                <div class="image-manager-list">
                {localImages.map((image, index) => {
                  const id = localImageId(image, index);
                  const objectUrl = resourceObjectUrls[id];
                  const usage = imageUsageCount.get(id) ?? 0;
                  return (
                    <article key={id} class="image-manager-item">
                      <div class="image-manager-thumbnail">
                        {objectUrl ? (
                          <img src={objectUrl} alt={image.name} />
                        ) : (
                          <span>图片不可用</span>
                        )}
                      </div>
                      <div class="image-manager-meta">
                        <strong title={image.name}>{image.name}</strong>
                        <code title={image.paths?.join(" · ")}>
                          {image.paths?.join(" · ") || image.name}
                        </code>
                        <small class={usage ? "image-manager-used-count" : "image-manager-unused-count"}>
                          {usage ? `被引用 ${usage} 次` : "未被当前 Markdown 引用"}
                        </small>
                      </div>
                      <div class="image-manager-item-actions">
                        {selectedImageReference && (
                          <button
                            type="button"
                            class="image-manager-use"
                            onClick={() => {
                              bindImageToReference(selectedImageReference, id);
                              setSelectedImageReference(null);
                            }}
                          >
                            使用此图
                          </button>
                        )}
                        <button
                          type="button"
                          class="image-manager-remove"
                          onClick={() => removeLocalImage(id)}
                        >
                          移除
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div class="image-manager-empty">
                  尚未导入图片。可选择图片，或从图片所在文件夹按路径匹配。
              </div>
                )}
              </section>
            </div>
            <footer class="image-manager-footer">
              <button
                type="button"
                class="dialog-cancel"
                onClick={() => setImageManagerOpen(false)}
              >
                关闭
              </button>
              <div class="image-manager-footer-actions">
                <button
                  type="button"
                  class="dialog-cancel"
                  disabled={unusedImageCount === 0}
                  onClick={clearUnusedImages}
                >
                  清理未使用{unusedImageCount ? `（${unusedImageCount}）` : ""}
                </button>
                <button
                  type="button"
                  class="image-manager-clear"
                  disabled={localImages.length === 0}
                  onClick={clearLocalImages}
                >
                  清空导入图片
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
      {markdownAssetImport && (
        <div
          class="export-dialog-backdrop"
          role="presentation"
          onMouseDown={() =>
            !markdownAssetBusy && setMarkdownAssetImport(null)
          }
        >
          <section
            class="export-dialog markdown-asset-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="markdown-asset-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header class="export-dialog-header">
              <div>
                <span class="eyebrow">本地图片</span>
                <h2 id="markdown-asset-title">导入图片附件</h2>
              </div>
              <button
                type="button"
                class="dialog-close"
                disabled={markdownAssetBusy}
                onClick={() => setMarkdownAssetImport(null)}
                aria-label="暂不导入图片附件"
              >
                ×
              </button>
            </header>
            <p class="markdown-asset-summary">
              <strong>{markdownAssetImport.fileName}</strong> 检测到{" "}
              {markdownAssetImport.references.length} 条本地图片引用。请选择包含文章和{" "}
              <code>assets</code> 的根目录，或直接选择 <code>assets</code> 文件夹；之后将自动匹配并只读取这些附件。
            </p>
            <details class="markdown-asset-reference-list">
              <summary>查看 Markdown 图片引用</summary>
              <ul>
                {markdownAssetImport.references.map((reference) => (
                  <li key={reference}>
                    <code>{reference}</code>
                  </li>
                ))}
              </ul>
            </details>
            {markdownAssetError && (
              <p class="markdown-asset-error" role="alert">
                {markdownAssetError}
              </p>
            )}
            <p class="markdown-asset-privacy-note">
              文件始终留在浏览器本地，不会上传到服务器。
            </p>
            <footer class="export-dialog-footer">
              <button
                type="button"
                class="dialog-cancel"
                disabled={markdownAssetBusy}
                onClick={() => setMarkdownAssetImport(null)}
              >
                稍后处理
              </button>
              <button
                type="button"
                class="dialog-submit markdown-asset-submit"
                disabled={markdownAssetBusy}
                onClick={() => void openMarkdownAssetFolderImport()}
              >
                {markdownAssetBusy
                  ? "正在匹配图片…"
                  : "选择目录并自动导入"}
              </button>
            </footer>
          </section>
        </div>
      )}
      <input
        ref={bindingFileInputRef}
        type="file"
        accept="image/*"
        class="visually-hidden"
        onChange={(event) => {
          bindSelectedImage((event.currentTarget.files ?? [])[0]);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={markdownAssetFolderInputRef}
        type="file"
        multiple
        class="visually-hidden"
        onChange={(event) => {
          importMarkdownAssetFolder(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={currentReferenceFolderInputRef}
        type="file"
        multiple
        class="visually-hidden"
        onChange={(event) => {
          importCurrentReferenceFolder(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
        }}
      />
      {exportDialogOpen && (
        <div
          class="export-dialog-backdrop"
          role="presentation"
          onMouseDown={() =>
            exportState.status !== "running" && setExportDialogOpen(false)
          }
        >
          <section
            class="export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-dialog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header class="export-dialog-header">
              <div>
                <span class="eyebrow">导出</span>
                <h2 id="export-dialog-title">下载图片</h2>
              </div>
              <button
                type="button"
                class="dialog-close"
                disabled={exportState.status === "running"}
                onClick={() => setExportDialogOpen(false)}
                aria-label="关闭导出窗口"
              >
                ×
              </button>
            </header>
            <p class="export-summary">
              {pagePlan.pages.length} 张卡片 · {config.ratio} · 将下载为 ZIP
            </p>
            <section class="export-quality">
              <h3>清晰度</h3>
              <button
                type="button"
                class={`export-quality-option${config.exportScale === 1 ? " selected" : ""}`}
                onClick={() => updateConfig("exportScale", 1)}
              >
                <strong>
                  标准发布 <em>推荐</em>
                </strong>
                <span>每张 {exportDimensions(config.ratio, 1)} PNG</span>
                <small>适合直接发布，导出更快、文件更小。</small>
              </button>
              <button
                type="button"
                class={`export-quality-option${config.exportScale === 2 ? " selected" : ""}`}
                onClick={() => updateConfig("exportScale", 2)}
              >
                <strong>高清原图</strong>
                <span>每张 {exportDimensions(config.ratio, 2)} PNG</span>
                <small>
                  适合公式、表格放大查看或本地留存；文件更大、导出更慢。
                </small>
              </button>
            </section>
            <section class={`export-preflight ${exportPreflight.status}`}>
              <h3>导出前检查</h3>
              <p>{exportPreflight.message || "等待检查。"}</p>
              {exportPreflight.status === "error" && (
                <button
                  type="button"
                  class="secondary-button"
                  onClick={() => void inspectExportReadiness()}
                >
                  重新检查
                </button>
              )}
            </section>
            {manyPages && (
              <p class="export-caution">
                当前共有 {pagePlan.pages.length}{" "}
                张卡片；高清原图会占用更多时间和浏览器内存。
              </p>
            )}
            {exportState.message && (
              <p class={`export-dialog-message ${exportState.status}`}>
                {exportState.message}
              </p>
            )}
            <footer class="export-dialog-footer">
              <button
                type="button"
                class="dialog-cancel"
                disabled={exportState.status === "running"}
                onClick={() => setExportDialogOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                class="dialog-submit"
                disabled={
                  exportPreflight.status !== "ready" ||
                  exportState.status === "running"
                }
                onClick={() => void handleExport()}
              >
                {exportState.status === "running"
                  ? exportState.message
                  : exportState.status === "done"
                    ? "再次下载"
                    : "开始下载"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
