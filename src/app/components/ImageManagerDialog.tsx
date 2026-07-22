import {
  normalizeImagePath,
  type ImageResolution,
} from "../../resources/image-resources";
import type { LocalImage } from "../../storage/draft-store";

type ImageManagerNotice = {
  kind: "success" | "error";
  message: string;
};

type ImageReference = {
  url: string;
  resolution: ImageResolution;
};

type ImageBindingSummary = {
  matched: number;
  total: number;
};

export function ImageManagerDialog({
  state,
  actions,
}: {
  state: {
    imageBindingSummary: ImageBindingSummary;
    attachmentBusy: boolean;
    unresolvedReferences: string[];
    localImageReferences: string[];
    notice: ImageManagerNotice | null;
    selectedReference: string | null;
    imageReferences: ImageReference[];
    localImages: LocalImage[];
    localImagesById: Map<string, LocalImage>;
    imageBindingOverrides: Record<string, string>;
    resourceObjectUrls: Record<string, string>;
    imageUsageCount: Map<string, number>;
    unusedImageCount: number;
  };
  actions: {
    close: () => void;
    autoFillAttachments: () => void;
    addImages: (files: FileList | File[], bindReference?: string) => void;
    selectReference: (reference: string | null) => void;
    bindImage: (reference: string, imageId: string) => void;
    requestImageBinding: (reference: string) => void;
    clearBindingOverride: (reference: string) => void;
    removeImage: (imageId: string) => void;
    clearUnusedImages: () => void;
    clearAllImages: () => void;
    getImageId: (image: LocalImage, index: number) => string;
  };
}) {
  const {
    imageBindingSummary,
    attachmentBusy,
    unresolvedReferences,
    localImageReferences,
    notice,
    selectedReference,
    imageReferences,
    localImages,
    localImagesById,
    imageBindingOverrides,
    resourceObjectUrls,
    imageUsageCount,
    unusedImageCount,
  } = state;
  const {
    close,
    autoFillAttachments,
    addImages,
    selectReference,
    bindImage,
    requestImageBinding,
    clearBindingOverride,
    removeImage,
    clearUnusedImages,
    clearAllImages,
    getImageId,
  } = actions;

  return (
    <div
      class="export-dialog-backdrop image-manager-backdrop"
      role="presentation"
      onMouseDown={close}
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
            onClick={close}
            aria-label="关闭输入图片窗口"
          >
            ×
          </button>
        </header>

        <p class="image-manager-summary">
          本地图片引用已绑定 {imageBindingSummary.matched} / {imageBindingSummary.total}。
          Markdown 始终决定图片顺序与路径。
        </p>

        <div class="image-manager-import-actions">
          <button
            type="button"
            class="file-button recommended-file-button"
            disabled={attachmentBusy || unresolvedReferences.length === 0}
            onClick={autoFillAttachments}
          >
            {attachmentBusy
              ? "正在匹配图片…"
              : "自动补齐（选择图片所在文件夹）"}
          </button>
          <label class="file-button">
            手动添加图片
            <input
              type="file"
              accept="image/*"
              multiple={!selectedReference}
              onChange={(event) => {
                addImages(
                  event.currentTarget.files ?? [],
                  selectedReference ?? undefined,
                );
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        <p class="image-manager-import-help">
          {unresolvedReferences.length > 0 ? (
            <>
              自动补齐会选择文章根目录或 <code>assets</code> 文件夹，只匹配左侧缺失或需要指定的图片。
              手动添加可从电脑选择图片；选中左侧引用时会直接绑定。
            </>
          ) : localImageReferences.length > 0 ? (
            <>当前本地图片引用均已绑定，无需自动补齐；仍可手动添加图片，用于替换或补充资源。</>
          ) : (
            <>当前 Markdown 没有本地图片引用；可手动添加图片，供后续编辑时使用。</>
          )}
        </p>

        {notice && (
          <p
            class={`image-manager-notice ${notice.kind}`}
            role={notice.kind === "error" ? "alert" : "status"}
          >
            {notice.message}
          </p>
        )}

        {selectedReference && (
          <p class="image-manager-selection">
            正在为 <code>{selectedReference}</code> 选择图片
            <button
              type="button"
              class="text-button"
              onClick={() => selectReference(null)}
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
                      class={`image-reference-item ${resolution.state}${selectedReference === url ? " selected" : ""}`}
                    >
                      <header class="image-reference-header">
                        <button
                          type="button"
                          class="image-reference-select"
                          onClick={() => selectReference(url)}
                          aria-pressed={selectedReference === url}
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
                                  bindImage(url, id);
                                  selectReference(null);
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
                          onClick={() => requestImageBinding(url)}
                        >
                          {resolution.state === "matched" ? "替换图片" : "选择图片补齐"}
                        </button>
                        {isOverridden && (
                          <button
                            type="button"
                            class="text-button"
                            onClick={() => clearBindingOverride(url)}
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
                  const id = getImageId(image, index);
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
                        {selectedReference && (
                          <button
                            type="button"
                            class="image-manager-use"
                            onClick={() => {
                              bindImage(selectedReference, id);
                              selectReference(null);
                            }}
                          >
                            使用此图
                          </button>
                        )}
                        <button
                          type="button"
                          class="image-manager-remove"
                          onClick={() => removeImage(id)}
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
          <button type="button" class="dialog-cancel" onClick={close}>
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
              onClick={clearAllImages}
            >
              清空导入图片
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
