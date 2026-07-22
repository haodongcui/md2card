type InputRef = { current: HTMLInputElement | null };

/** Hidden picker controls are kept beside the resource UI rather than App. */
export function ImageResourceInputs({
  bindingFileInputRef,
  markdownAssetFolderInputRef,
  currentReferenceFolderInputRef,
  onBindSelectedImage,
  onImportMarkdownAssetFolder,
  onImportCurrentReferenceFolder,
}: {
  bindingFileInputRef: InputRef;
  markdownAssetFolderInputRef: InputRef;
  currentReferenceFolderInputRef: InputRef;
  onBindSelectedImage: (file: File | undefined) => void;
  onImportMarkdownAssetFolder: (files: FileList | File[]) => void;
  onImportCurrentReferenceFolder: (files: FileList | File[]) => void;
}) {
  return (
    <>
      <input
        ref={bindingFileInputRef}
        type="file"
        accept="image/*"
        class="visually-hidden"
        onChange={(event) => {
          onBindSelectedImage((event.currentTarget.files ?? [])[0]);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={markdownAssetFolderInputRef}
        type="file"
        multiple
        class="visually-hidden"
        onChange={(event) => {
          onImportMarkdownAssetFolder(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={currentReferenceFolderInputRef}
        type="file"
        multiple
        class="visually-hidden"
        onChange={(event) => {
          onImportCurrentReferenceFolder(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
        }}
      />
    </>
  );
}
