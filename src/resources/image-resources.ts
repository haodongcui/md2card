import type { ArticleDocument, Block } from '../domain/document';

export interface LocalImageLike {
  id?: string;
  name: string;
  paths?: string[];
}

export type ImageResolutionState = 'matched' | 'missing' | 'ambiguous' | 'remote';

export interface ImageResolution {
  state: ImageResolutionState;
  source?: string;
  imageId?: string;
  candidateImageIds?: string[];
}

export interface ImageResourceIndex {
  sources: Record<string, string>;
  sourceImageIds: Record<string, string>;
  candidateImageIds: Record<string, string[]>;
  objectUrlsByImageId: Record<string, string>;
  overrides: Record<string, string>;
  ambiguousPaths: ReadonlySet<string>;
}

export interface ImageBindingSummary {
  total: number;
  matched: number;
  missing: string[];
  ambiguous: string[];
}

export function isRemoteImageUrl(url: string): boolean {
  return /^(https?:|data:|blob:)/i.test(url.trim());
}

export function normalizeImagePath(value: string): string {
  let path = value.trim().replace(/^<|>$/g, '');
  const queryOrHash = path.search(/[?#]/);
  if (queryOrHash >= 0) path = path.slice(0, queryOrHash);
  try {
    path = decodeURIComponent(path);
  } catch {
    // A malformed escape sequence should remain visible to the user as-is.
  }
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length && segments[segments.length - 1] !== '..') segments.pop();
      else segments.push(segment);
      continue;
    }
    segments.push(segment);
  }
  return segments.join('/');
}

function pathAliases(value: string): string[] {
  const normalized = normalizeImagePath(value);
  if (!normalized) return [];
  const segments = normalized.split('/');
  return Array.from(
    new Set(segments.map((_, index) => segments.slice(index).join('/'))),
  );
}

function imageId(image: LocalImageLike, index: number): string {
  return image.id ?? `legacy-${index}-${normalizeImagePath(image.name)}`;
}

/**
 * Builds a collision-safe lookup. Directory imports offer every suffix of a
 * selected relative path, so a Markdown reference can be relative to either
 * the article root or a nested Markdown directory. A suffix shared by two
 * images is intentionally left unresolved instead of binding the wrong file.
 */
export function buildImageResourceIndex(
  images: LocalImageLike[],
  objectUrls: Record<string, string>,
  overrides: Record<string, string> = {},
): ImageResourceIndex {
  const candidates = new Map<string, Set<string>>();
  const urlById = new Map<string, string>();

  images.forEach((image, index) => {
    const id = imageId(image, index);
    const objectUrl = objectUrls[id];
    if (!objectUrl) return;
    urlById.set(id, objectUrl);
    const rawPaths = image.paths?.length ? image.paths : [image.name];
    for (const rawPath of rawPaths) {
      for (const alias of pathAliases(rawPath)) {
        const ids = candidates.get(alias) ?? new Set<string>();
        ids.add(id);
        candidates.set(alias, ids);
      }
    }
  });

  const sources: Record<string, string> = {};
  const sourceImageIds: Record<string, string> = {};
  const candidateImageIds: Record<string, string[]> = {};
  const ambiguousPaths = new Set<string>();
  for (const [path, ids] of candidates) {
    candidateImageIds[path] = Array.from(ids);
    if (ids.size !== 1) {
      ambiguousPaths.add(path);
      continue;
    }
    const id = ids.values().next().value as string;
    const objectUrl = urlById.get(id);
    if (objectUrl) {
      sources[path] = objectUrl;
      sourceImageIds[path] = id;
    }
  }
  return {
    sources,
    sourceImageIds,
    candidateImageIds,
    objectUrlsByImageId: Object.fromEntries(urlById),
    overrides,
    ambiguousPaths,
  };
}

export function resolveImageReference(
  url: string,
  index: ImageResourceIndex,
): ImageResolution {
  if (isRemoteImageUrl(url)) return { state: 'remote', source: url };
  const aliases = pathAliases(url);
  const override = index.overrides[normalizeImagePath(url)];
  if (override && index.objectUrlsByImageId[override]) {
    return {
      state: 'matched',
      source: index.objectUrlsByImageId[override],
      imageId: override,
    };
  }
  for (const alias of aliases) {
    const source = index.sources[alias];
    if (source) {
      return {
        state: 'matched',
        source,
        imageId: index.sourceImageIds[alias],
      };
    }
    if (index.ambiguousPaths.has(alias)) {
      return {
        state: 'ambiguous',
        candidateImageIds: index.candidateImageIds[alias],
      };
    }
  }
  return { state: 'missing' };
}

function collectImageUrls(blocks: Block[], result: string[]): void {
  for (const block of blocks) {
    if (block.kind === 'image') result.push(block.url);
    if (block.kind === 'blockquote') collectImageUrls(block.children, result);
    if (block.kind === 'list') {
      for (const item of block.items) collectImageUrls(item, result);
    }
  }
}

export function articleImageUrls(article: ArticleDocument): string[] {
  const urls: string[] = [];
  collectImageUrls(article.blocks, urls);
  return Array.from(new Set(urls));
}

export function summarizeImageBindings(
  urls: string[],
  index: ImageResourceIndex,
): ImageBindingSummary {
  const summary: ImageBindingSummary = {
    total: urls.length,
    matched: 0,
    missing: [],
    ambiguous: [],
  };
  for (const url of urls) {
    const resolution = resolveImageReference(url, index);
    if (resolution.state === 'matched' || resolution.state === 'remote') {
      summary.matched += 1;
    } else if (resolution.state === 'ambiguous') {
      summary.ambiguous.push(url);
    } else {
      summary.missing.push(url);
    }
  }
  return summary;
}
