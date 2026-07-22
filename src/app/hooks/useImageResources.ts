import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ArticleDocument } from "../../domain/document";
import { parseMarkdown } from "../../parser/parse-markdown";
import {
  articleImageUrls,
  buildImageResourceIndex,
  isRemoteImageUrl,
  normalizeImagePath,
  resolveImageReference,
  summarizeImageBindings,
} from "../../resources/image-resources";
import type { LocalImage } from "../../storage/draft-store";

export type MarkdownAssetImport = {
  markdown: string;
  fileName: string;
  references: string[];
};

type ImageAttachmentSource = "smart" | "compat";
type ImageManagerNotice = { kind: "success" | "error"; message: string };
type ImageStatus = {
  status: "idle" | "running" | "done" | "error";
  message: string;
};
type IndexedLocalFile = {
  name: string;
  path: string;
  readFile: () => Promise<File>;
};
type DirectoryIndex = {
  markdownFiles: IndexedLocalFile[];
  imageFiles: IndexedLocalFile[];
};
type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  values?: () => AsyncIterableIterator<FileSystemHandle>;
};
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" }) => Promise<DirectoryHandleWithEntries>;
};

export function localImageId(image: LocalImage, index = 0): string {
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
  return { id: `image-${path}`, name: file.name, paths: [path], blob: file };
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || isImageFilename(file.name);
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
  return { id: `image-${path}`, name: file.name, paths: [path], blob: file };
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

export function useImageResources({
  article,
  markdown,
  sourceFileName,
  invalidateLayout,
  reportStatus,
}: {
  article: ArticleDocument;
  markdown: string;
  sourceFileName: string;
  invalidateLayout: () => void;
  reportStatus: (status: ImageStatus) => void;
}) {
  const [resourceObjectUrls, setResourceObjectUrls] = useState<
    Record<string, string>
  >({});
  const [localImages, setLocalImages] = useState<LocalImage[]>([]);
  const [imageBindingOverrides, setImageBindingOverrides] = useState<
    Record<string, string>
  >({});
  const [imageManagerOpen, setImageManagerOpen] = useState(false);
  const [selectedImageReference, setSelectedImageReference] = useState<
    string | null
  >(null);
  const [imageManagerAttachmentBusy, setImageManagerAttachmentBusy] =
    useState(false);
  const [imageManagerNotice, setImageManagerNotice] =
    useState<ImageManagerNotice | null>(null);
  const [markdownAssetImport, setMarkdownAssetImport] =
    useState<MarkdownAssetImport | null>(null);
  const [markdownAssetBusy, setMarkdownAssetBusy] = useState(false);
  const [markdownAssetError, setMarkdownAssetError] = useState("");
  const [pendingBindingReference, setPendingBindingReference] = useState<
    string | null
  >(null);
  const resourceUrls = useRef<Record<string, string>>({});
  const markdownAssetFolderInputRef = useRef<HTMLInputElement | null>(null);
  const currentReferenceFolderInputRef = useRef<HTMLInputElement | null>(null);
  const bindingFileInputRef = useRef<HTMLInputElement | null>(null);

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
    ].forEach((input) => {
      if (!input) return;
      input.setAttribute("webkitdirectory", "");
      input.setAttribute("directory", "");
    });
  }, [imageManagerOpen]);

  useEffect(() => {
    if (
      selectedImageReference &&
      !localImageReferences.includes(selectedImageReference)
    )
      setSelectedImageReference(null);
  }, [localImageReferences, selectedImageReference]);

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
    invalidateLayout();
    reportStatus({ status: "idle", message });
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
    invalidateLayout();
    reportStatus({ status: "idle", message });
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
        reportStatus({ status: "error", message });
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
      reportStatus({ status: "error", message });
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
      reportStatus({ status: "error", message });
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
      reportStatus({ status: "error", message });
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
      setImageManagerNotice({ kind: "error", message: "所选目录中未找到可用图片。" });
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

  const bindImageToReference = (reference: string, imageId: string) => {
    setImageBindingOverrides((previous) => ({
      ...previous,
      [normalizeImagePath(reference)]: imageId,
    }));
    invalidateLayout();
    reportStatus({
      status: "idle",
      message: `已为 ${reference} 指定本地图片。`,
    });
  };

  const addImages = (files: FileList | File[], bindReference?: string) => {
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

  const clearImageBindingOverride = (reference: string) => {
    const key = normalizeImagePath(reference);
    setImageBindingOverrides((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    invalidateLayout();
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
    invalidateLayout();
    reportStatus({ status: "idle", message });
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

  const clearArticleResources = () => {
    setSelectedImageReference(null);
    setPendingBindingReference(null);
    setMarkdownAssetImport(null);
    setMarkdownAssetError("");
    setMarkdownAssetBusy(false);
    replaceLocalImages([], "已清空当前文章与导入图片，排版设置已保留。");
  };

  const prepareMarkdownAssetImport = (nextMarkdown: string, fileName: string) => {
    const references = articleImageUrls(parseMarkdown(nextMarkdown)).filter(
      (url) => !isRemoteImageUrl(url),
    );
    const needsAttachmentImport = references.some((reference) => {
      const resolution = resolveImageReference(reference, resources);
      return resolution.state !== "matched";
    });
    setSelectedImageReference(null);
    setMarkdownAssetImport(
      needsAttachmentImport
        ? { markdown: nextMarkdown, fileName, references }
        : null,
    );
    setMarkdownAssetError("");
  };

  const restoreDraftResources = (
    images: LocalImage[] | undefined,
    overrides: Record<string, string> | undefined,
  ) => {
    const restored = (images ?? []).map(restoreLocalImage);
    const nextObjectUrls: Record<string, string> = {};
    Object.values(resourceUrls.current).forEach((url) => URL.revokeObjectURL(url));
    const nextResourceUrls: Record<string, string> = {};
    for (const [index, image] of restored.entries()) {
      const id = localImageId(image, index);
      const url = URL.createObjectURL(image.blob);
      nextObjectUrls[id] = url;
      nextResourceUrls[id] = url;
    }
    resourceUrls.current = nextResourceUrls;
    setLocalImages(restored);
    setResourceObjectUrls(nextObjectUrls);
    setImageBindingOverrides(overrides ?? {});
  };

  const requestImageBinding = (reference: string) => {
    setSelectedImageReference(reference);
    setPendingBindingReference(reference);
    bindingFileInputRef.current?.click();
  };

  return {
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
  };
}
