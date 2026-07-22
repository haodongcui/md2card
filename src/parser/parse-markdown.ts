import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { ArticleDocument, Block, Diagnostic, Inline } from '../domain/document';

type MdNode = {
  type: string;
  value?: string;
  children?: MdNode[];
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  lang?: string | null;
  url?: string;
  alt?: string | null;
  title?: string | null;
  align?: Array<'left' | 'center' | 'right' | null>;
};

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

/**
 * remark-math understands $...$ / $$...$$. The two sample notes also use
 * \[...\] and \(...\), so normalize only outside fenced and inline code.
 */
function normalizeMathDelimiters(markdown: string): string {
  let inFence = false;
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      if (/^\s*\\\[\s*$/.test(line)) return '$$';
      if (/^\s*\\\]\s*$/.test(line)) return '$$';

      // Inline code is intentionally left untouched.
      return line
        .split(/(`[^`]*`)/g)
        .map((part) => (part.startsWith('`') ? part : part.replace(/\\\((.+?)\\\)/g, '$$$1$')))
        .join('');
    })
    .join('\n');
}

function nodeId(index: number, suffix = ''): string {
  return `block-${index}${suffix}`;
}

const CAPTION_PARAGRAPH = /^(?:图|表)\s*[0-9０-９一二三四五六七八九十]+\s*(?:[.:：、·-]\s*|\s+).+$/;

function toInline(nodes: MdNode[] | undefined): Inline[] {
  if (!nodes) return [];
  return nodes.flatMap((node): Inline[] => {
    switch (node.type) {
      case 'text':
        return [{ kind: 'text', value: node.value ?? '' }];
      case 'strong':
        return [{ kind: 'strong', children: toInline(node.children) }];
      case 'emphasis':
        return [{ kind: 'emphasis', children: toInline(node.children) }];
      case 'delete':
        return [{ kind: 'delete', children: toInline(node.children) }];
      case 'link':
        return [{ kind: 'link', url: node.url ?? '#', children: toInline(node.children) }];
      case 'inlineCode':
        return [{ kind: 'inlineCode', value: node.value ?? '' }];
      case 'inlineMath':
        return [{ kind: 'inlineMath', value: node.value ?? '' }];
      case 'break':
        return [{ kind: 'break' }];
      case 'image':
        return [{ kind: 'text', value: `[图片：${node.value ?? '请通过资源面板导入'}]` }];
      default:
        return toInline(node.children);
    }
  });
}

function toBlock(node: MdNode, index: number, diagnostics: Diagnostic[], suffix = ''): Block | null {
  const id = nodeId(index, suffix);
  switch (node.type) {
    case 'heading':
      return { id, kind: 'heading', depth: node.depth ?? 2, children: toInline(node.children) };
    case 'paragraph': {
      const onlyChild = node.children?.length === 1 ? node.children[0] : undefined;
      if (onlyChild?.type === 'image') {
        return {
          id,
          kind: 'image',
          url: onlyChild.url ?? '',
          alt: onlyChild.alt ?? '',
          caption: onlyChild.title ?? undefined,
        };
      }
      return { id, kind: 'paragraph', children: toInline(node.children) };
    }
    case 'code':
      return { id, kind: 'code', value: node.value ?? '', language: node.lang ?? 'text' };
    case 'math':
      return { id, kind: 'math', value: node.value ?? '' };
    case 'thematicBreak':
      return { id, kind: 'thematicBreak' };
    case 'html':
      if ((node.value ?? '').trim() === '<!-- md2card:break -->') return { id, kind: 'pageBreak' };
      diagnostics.push({ level: 'warning', message: '已忽略原始 HTML，以保证预览和导出安全一致。', blockId: id });
      return null;
    case 'blockquote': {
      const children = (node.children ?? [])
        .map((child, childIndex) => toBlock(child, index, diagnostics, `-quote-${childIndex}`))
        .filter((child): child is Block => child !== null);
      return { id, kind: 'blockquote', children };
    }
    case 'list': {
      const items = (node.children ?? []).map((item, itemIndex) =>
        (item.children ?? [])
          .map((child, childIndex) => toBlock(child, index, diagnostics, `-item-${itemIndex}-${childIndex}`))
          .filter((child): child is Block => child !== null),
      );
      return { id, kind: 'list', ordered: Boolean(node.ordered), start: node.start ?? 1, items };
    }
    case 'table': {
      const rows = (node.children ?? []).map((row) =>
        (row.children ?? []).map((cell) => toInline(cell.children)),
      );
      return { id, kind: 'table', align: node.align ?? [], rows };
    }
    case 'image':
      diagnostics.push({ level: 'info', message: '本地图片会优先按导入文件夹中的相对路径绑定；远程图片需要允许浏览器读取。', blockId: id });
      return {
        id,
        kind: 'image',
        url: node.url ?? '',
        alt: node.alt ?? '',
        caption: node.title ?? undefined,
      };
    default:
      if (node.children?.length) {
        diagnostics.push({ level: 'info', message: `已按内容降级渲染 ${node.type}。`, blockId: id });
        return { id, kind: 'paragraph', children: toInline(node.children) };
      }
      return null;
  }
}

export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      if ('value' in node) return node.value;
      if ('children' in node) return inlineText(node.children);
      return '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A direct `图 1：...` / `表 1：...` paragraph is common in Chinese notes.
 * Treat it as a caption only when it immediately follows the matching block,
 * so existing drafts gain semantic captions without requiring a rewrite.
 */
function attachAdjacentCaptions(blocks: Block[]): Block[] {
  const result: Block[] = [];
  for (const block of blocks) {
    const previous = result.at(-1);
    const text = block.kind === 'paragraph' ? inlineText(block.children) : '';
    if (CAPTION_PARAGRAPH.test(text) && previous?.kind === 'image' && !previous.caption && text.startsWith('图')) {
      previous.caption = text;
      continue;
    }
    if (CAPTION_PARAGRAPH.test(text) && previous?.kind === 'table' && !previous.caption && text.startsWith('表')) {
      previous.caption = text;
      continue;
    }
    result.push(block);
  }
  return result;
}

export function parseMarkdown(markdown: string): ArticleDocument {
  const diagnostics: Diagnostic[] = [];
  try {
    const tree = processor.parse(normalizeMathDelimiters(markdown)) as unknown as MdNode;
    const parsed = (tree.children ?? [])
      .map((node, index) => toBlock(node, index, diagnostics))
      .filter((node): node is Block => node !== null);

    let title = '';
    const first = parsed[0];
    const blocks = attachAdjacentCaptions(parsed);
    if (first?.kind === 'heading' && first.depth === 1) {
      title = inlineText(first.children);
      blocks.shift();
    }
    return { title, blocks, diagnostics };
  } catch (error) {
    return {
      title: '',
      blocks: [],
      diagnostics: [{ level: 'error', message: error instanceof Error ? error.message : 'Markdown 解析失败。' }],
    };
  }
}
