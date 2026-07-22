import type { ArticleDocument, Block, Diagnostic, LayoutConfig, PageCover, PageFragment, PagePlan, PagePlanPage } from '../domain/document';
import { canvasHeight, cardBottomPadding } from '../domain/card-metrics';
import { inlineText } from '../parser/parse-markdown';

const CONTENT_SAFETY_BUFFER = 53;
const PAGE_NUMBER_HEIGHT = 35;

const DENSITY_FACTOR: Record<LayoutConfig['density'], number> = {
  relaxed: 1.14,
  balanced: 1,
  compact: 0.87,
  custom: 1,
};

function contentCapacity(config: LayoutConfig): number {
  return canvasHeight(config.ratio)
    - config.cardVerticalPadding
    - cardBottomPadding(config)
    - (config.showPageNumber ? PAGE_NUMBER_HEIGHT : 0)
    - CONTENT_SAFETY_BUFFER;
}

function fallbackHeight(block: Block, config: LayoutConfig): number {
  const factor = config.density === 'custom'
    ? (config.bodyFontSize / 30) * (config.bodyLineHeight / 1.62)
    : DENSITY_FACTOR[config.density];
  switch (block.kind) {
    case 'heading':
      return (block.depth <= 2 ? 92 : 70) * factor;
    case 'paragraph':
      return (64 + Math.ceil(inlineText(block.children).length / 31) * 49) * factor;
    case 'list':
      return (42 + block.items.reduce((sum, item) => sum + item.reduce((itemSum, child) => itemSum + fallbackHeight(child, config), 0), 0)) * factor;
    case 'blockquote':
      return (42 + block.children.reduce((sum, child) => sum + fallbackHeight(child, config), 0)) * factor;
    case 'code':
      return (78 + Math.max(1, block.value.split('\n').length) * 35) * factor;
    case 'math':
      return 120 * factor;
    case 'image':
      return 580 * factor;
    case 'table':
      return (92 + Math.max(1, block.rows.length) * 52) * factor;
    case 'thematicBreak':
      return 42;
    case 'pageBreak':
      return 0;
  }
}

function measuredHeight(block: Block, config: LayoutConfig, measurements: Record<string, number>): number {
  return measurements[block.id] ?? fallbackHeight(block, config);
}

function cloneBlock(block: Block, id: string): Block {
  return { ...block, id } as Block;
}

function splitText(text: string, maxCharacters: number): string[] {
  if (text.length <= maxCharacters) return [text];
  const segments = text.split(/(?<=[。！？；;.!?])\s*|(?<=，|、|：|,|:)\s*/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const segment of segments) {
    if (current && current.length + segment.length > maxCharacters) {
      chunks.push(current);
      current = segment;
    } else {
      current += segment;
    }
  }
  if (current) chunks.push(current);
  if (chunks.length > 1) return chunks;

  const hardChunks: string[] = [];
  for (let start = 0; start < text.length; start += maxCharacters) hardChunks.push(text.slice(start, start + maxCharacters));
  return hardChunks;
}

function splitOversizeBlock(
  block: Block,
  blockHeight: number,
  available: number,
  diagnostics: Diagnostic[],
): PageFragment[] {
  if (blockHeight <= available || block.kind === 'heading' || block.kind === 'pageBreak') {
    return [{ id: block.id, sourceId: block.id, block }];
  }

  if (block.kind === 'code') {
    const lines = block.value.split('\n');
    const lineHeight = Math.max(25, (blockHeight - 78) / Math.max(1, lines.length));
    const perPage = Math.max(1, Math.floor((available - 86) / lineHeight));
    const total = Math.ceil(lines.length / perPage);
    return Array.from({ length: total }, (_, index) => {
      const start = index * perPage;
      const continuation = total > 1 ? { index: index + 1, total, label: `代码续 ${index + 1}/${total}` } : undefined;
      const fragment = cloneBlock({ ...block, value: lines.slice(start, start + perPage).join('\n') }, `${block.id}-code-${index}`);
      return { id: fragment.id, sourceId: block.id, block: fragment, continuation };
    });
  }

  if (block.kind === 'table' && block.rows.length > 2) {
    const bodyRows = block.rows.slice(1);
    const headerHeight = Math.max(62, blockHeight * 0.18);
    const perPage = Math.max(1, Math.floor((bodyRows.length * (available - headerHeight)) / Math.max(1, blockHeight - headerHeight)));
    const total = Math.ceil(bodyRows.length / perPage);
    return Array.from({ length: total }, (_, index) => {
      const rows = [block.rows[0], ...bodyRows.slice(index * perPage, (index + 1) * perPage)];
      const fragment = cloneBlock({ ...block, rows }, `${block.id}-table-${index}`);
      return {
        id: fragment.id,
        sourceId: block.id,
        block: fragment,
        continuation: total > 1 ? { index: index + 1, total, label: `表格续 ${index + 1}/${total}` } : undefined,
      };
    });
  }

  if (block.kind === 'paragraph') {
    const text = inlineText(block.children);
    const parts = splitText(text, Math.max(100, Math.floor((text.length * available) / blockHeight)));
    if (parts.length > 1) {
      diagnostics.push({
        level: 'warning',
        message: '超长段落已按句子续页；续页中的复杂行内样式会降级为正文文本。',
        blockId: block.id,
      });
      return parts.map((part, index) => {
        const fragment = cloneBlock({ id: `${block.id}-paragraph-${index}`, kind: 'paragraph', children: [{ kind: 'text', value: part }] }, `${block.id}-paragraph-${index}`);
        return {
          id: fragment.id,
          sourceId: block.id,
          block: fragment,
          continuation: { index: index + 1, total: parts.length, label: `正文续 ${index + 1}/${parts.length}` },
        };
      });
    }
  }

  diagnostics.push({
    level: 'warning',
    message: block.kind === 'math' ? '公式过高，已单独放置并采用公式缩放；建议手动改为 aligned 多行公式。' : '该块过高，已独占一页以避免内容裁切。',
    blockId: block.id,
  });
  return [{ id: block.id, sourceId: block.id, block }];
}

function fragmentHeight(fragment: PageFragment, config: LayoutConfig, measurements: Record<string, number>): number {
  const base = measurements[fragment.id] ?? measurements[fragment.sourceId] ?? fallbackHeight(fragment.block, config);
  if (!fragment.continuation) return base;
  if (fragment.block.kind === 'code') return 78 + fragment.block.value.split('\n').length * 35;
  if (fragment.block.kind === 'table') return 92 + fragment.block.rows.length * 52;
  return base;
}

function fallbackCoverHeight(cover: PageCover, config: LayoutConfig): number {
  const titleLines = Math.max(1, Math.ceil(cover.title.length / 16));
  const subtitleLines = cover.subtitle ? Math.ceil(cover.subtitle.length / 30) : 0;
  const kickerHeight = cover.kicker ? 38 : 0;
  const densityFactor = config.density === 'compact' ? 0.9 : config.density === 'relaxed' ? 1.08 : 1;
  return Math.round((112 + kickerHeight + titleLines * 78 + subtitleLines * 42) * densityFactor);
}

function nextMeaningfulIndex(fragments: PageFragment[], start: number): number | undefined {
  for (let index = start; index < fragments.length; index += 1) {
    const kind = fragments[index].block.kind;
    if (kind === 'pageBreak') return undefined;
    if (kind !== 'thematicBreak') return index;
  }
  return undefined;
}

function isShortLead(fragment: PageFragment, height: number, capacity: number): boolean {
  // Two visual lines are a lead-in; a longer paragraph is already enough
  // reading context to keep with its heading.
  return (fragment.block.kind === 'paragraph' || fragment.block.kind === 'blockquote') && height <= capacity * 0.12;
}

function headingTailPercent(depth: number, config: LayoutConfig): number {
  if (depth <= 1) return 100;
  if (depth === 2) return config.headingH2TailPercent;
  if (depth === 3) return config.headingH3TailPercent;
  if (depth === 4) return config.headingH4TailPercent;
  return 0;
}

function beforeSpacingFor(block: Block, config: LayoutConfig): number {
  if (block.kind === 'heading' && block.depth === 2) return config.headingH2BeforeSpacing;
  if (block.kind === 'heading' && block.depth === 3) return config.headingH3BeforeSpacing;
  return config.blockGap;
}

/**
 * The smallest context that should travel with a heading. H2 gets stronger
 * protection: a short lead paragraph is not enough context on its own. The
 * following substantive block, or a child heading and its first block, joins
 * the reservation as well.
 */
function headingClusterHeight(
  fragments: PageFragment[],
  headingIndex: number,
  config: LayoutConfig,
  measurements: Record<string, number>,
  capacity: number,
): number {
  const heading = fragments[headingIndex];
  if (heading.block.kind !== 'heading') return 0;

  const heightAt = (index: number) => fragmentHeight(fragments[index], config, measurements);
  let reserved = heightAt(headingIndex);
  const firstIndex = nextMeaningfulIndex(fragments, headingIndex + 1);
  if (firstIndex === undefined) return reserved;

  const include = (index: number) => { reserved += beforeSpacingFor(fragments[index].block, config) + heightAt(index); };
  include(firstIndex);
  const first = fragments[firstIndex];
  const firstIsSubheading = first.block.kind === 'heading' && first.block.depth > heading.block.depth;

  if (heading.block.depth <= 2 && firstIsSubheading) {
    const childIndex = nextMeaningfulIndex(fragments, firstIndex + 1);
    if (childIndex !== undefined) include(childIndex);
  } else if (heading.block.depth <= 2 && isShortLead(first, heightAt(firstIndex), capacity)) {
    const nextIndex = nextMeaningfulIndex(fragments, firstIndex + 1);
    const next = nextIndex === undefined ? undefined : fragments[nextIndex];
    if (nextIndex !== undefined && next?.block.kind === 'heading' && next.block.depth > heading.block.depth) {
      include(nextIndex);
      const childIndex = nextMeaningfulIndex(fragments, nextIndex + 1);
      if (childIndex !== undefined) include(childIndex);
    } else if (nextIndex !== undefined && next?.block.kind !== 'heading') {
      include(nextIndex);
    }
  } else if (heading.block.depth === 3 && firstIsSubheading) {
    const childIndex = nextMeaningfulIndex(fragments, firstIndex + 1);
    if (childIndex !== undefined) include(childIndex);
  }

  // A single atomic table/code block can be taller than a heading cluster.
  // Keep the page-break decision conservative without making an empty page
  // impossible to fill; its own splitter handles the block afterwards.
  return Math.min(reserved, capacity);
}

export function createPagePlan(
  article: ArticleDocument,
  config: LayoutConfig,
  measurements: Record<string, number>,
  cover?: PageCover,
): PagePlan {
  const diagnostics: Diagnostic[] = [...article.diagnostics];
  // Density changes rendered block heights, not the physical height of a
  // 1080px card. Applying its fallback factor here would overfill relaxed
  // cards after DOM measurement has produced the real block sizes.
  const capacity = contentCapacity(config);
  const expanded = article.blocks.flatMap((block) =>
    splitOversizeBlock(block, measuredHeight(block, config, measurements), capacity * 0.92, diagnostics),
  );

  const pages: PagePlanPage[] = [];
  if (cover?.mode === 'standalone') {
    pages.push({ id: 'page-cover', index: 0, section: '', cover, fragments: [], estimatedHeight: 0 });
  }
  let current: PageFragment[] = [];
  let currentCover = cover?.mode === 'integrated' ? cover : undefined;
  let used = currentCover ? (measurements[currentCover.id] ?? fallbackCoverHeight(currentCover, config)) : 0;
  let section = '';

  const flush = () => {
    if (!current.length && !currentCover) return;
    pages.push({ id: `page-${pages.length + 1}`, index: pages.length, section, cover: currentCover, fragments: current, estimatedHeight: used });
    current = [];
    currentCover = undefined;
    used = 0;
  };

  for (let index = 0; index < expanded.length; index += 1) {
    const fragment = expanded[index];
    const { block } = fragment;
    if (block.kind === 'pageBreak') {
      flush();
      continue;
    }
    if (block.kind === 'heading' && block.depth <= 2) section = inlineText(block.children);

    const height = fragmentHeight(fragment, config, measurements);
    const pageHasContent = current.length > 0 || Boolean(currentCover);
    let beforeSpacing = current.length ? beforeSpacingFor(block, config) : 0;
    if (block.kind === 'heading') {
      // An in-document H1 is a hard document/part boundary. The first H1 is
      // already consumed as metadata by the parser.
      if (block.depth <= 1 && pageHasContent) {
        flush();
        beforeSpacing = 0;
      } else if (pageHasContent) {
        const cluster = headingClusterHeight(expanded, index, config, measurements, capacity);
        const tailGuard = capacity * (headingTailPercent(block.depth, config) / 100);
        // The setting describes the zone where the heading itself must not
        // begin. Reserve its rendered height in addition to the tail zone;
        // comparing only the space before the heading lets its text drift
        // into that zone.
        const required = beforeSpacing + Math.max(cluster, height + tailGuard);
        if (capacity - used < required) {
          flush();
          beforeSpacing = 0;
        }
      }
    }

    if (pageHasContent && used + beforeSpacing + height > capacity) {
      flush();
      beforeSpacing = 0;
    }
    current.push(beforeSpacing ? { ...fragment, beforeSpacing } : fragment);
    used += beforeSpacing + height;

    if (height > capacity) {
      diagnostics.push({ level: 'warning', message: '该页面包含无法进一步安全拆分的超高内容，请检查公式或资源。', blockId: block.id });
      flush();
    }
  }
  flush();

  if (!pages.length && article.blocks.length === 0) {
    pages.push({ id: 'page-1', index: 0, section: '', fragments: [], estimatedHeight: 0 });
  }

  const sparsePages = pages.filter((page, index) => index > 0 && index < pages.length - 1 && page.estimatedHeight < capacity * 0.48);
  if (sparsePages.length) {
    diagnostics.push({ level: 'info', message: `${sparsePages.length} 个中间页留白较多；可切换“紧凑”或使用手动分页微调。` });
  }
  return { pages, diagnostics };
}
