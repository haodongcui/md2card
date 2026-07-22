import { Fragment } from 'preact';
import katex from 'katex';
import Prism from 'prismjs';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-tsx.js';
import type { Block, Inline, LayoutConfig } from '../domain/document';
import {
  resolveImageReference,
  type ImageResourceIndex,
} from '../resources/image-resources';

function mathHtml(expression: string, displayMode: boolean): string {
  try {
    return katex.renderToString(expression, { displayMode, throwOnError: false, strict: 'ignore', output: 'html' });
  } catch {
    return `<code>${expression.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] ?? char)}</code>`;
  }
}

export function InlineContent({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        const key = `${node.kind}-${index}`;
        switch (node.kind) {
          case 'text':
            return <Fragment key={key}>{node.value}</Fragment>;
          case 'strong':
            return <strong key={key}><InlineContent nodes={node.children} /></strong>;
          case 'emphasis':
            return <em key={key}><InlineContent nodes={node.children} /></em>;
          case 'delete':
            return <del key={key}><InlineContent nodes={node.children} /></del>;
          case 'link':
            return <a key={key} href={node.url} target="_blank" rel="noreferrer"><InlineContent nodes={node.children} /></a>;
          case 'inlineCode':
            return <code key={key} class="inline-code">{node.value}</code>;
          case 'inlineMath':
            return <span key={key} class="inline-math" dangerouslySetInnerHTML={{ __html: mathHtml(node.value, false) }} />;
          case 'break':
            return <br key={key} />;
        }
      })}
    </>
  );
}

function languageGrammar(language: string) {
  const normalized = language.toLowerCase().replace(/^shell$/, 'bash').replace(/^py$/, 'python').replace(/^ts$/, 'typescript');
  return { normalized, grammar: Prism.languages[normalized] ?? Prism.languages.plain };
}

function CodeBlock({ value, language, numbered }: { value: string; language: string; numbered: boolean }) {
  const { normalized, grammar } = languageGrammar(language);
  const html = Prism.highlight(value, grammar, normalized);
  const lines = value.split('\n');
  return (
    <div class="code-card">
      <div class="code-toolbar">
        <span class="code-window-controls" aria-hidden="true">
          <i class="code-window-dot" />
          <i class="code-window-dot" />
          <i class="code-window-dot" />
        </span>
        <span class="code-language">{language || 'text'}</span>
        <span class="code-meta">{lines.length} 行</span>
      </div>
      <pre class={numbered ? 'code-lines' : ''} data-line-count={numbered ? lines.length : undefined}>
        {numbered ? (
          <ol class="code-line-list">
            {lines.map((line, index) => <li key={index}><code class={`language-${normalized}`} dangerouslySetInnerHTML={{ __html: Prism.highlight(line || ' ', grammar, normalized) }} /></li>)}
          </ol>
        ) : <code class={`language-${normalized}`} dangerouslySetInnerHTML={{ __html: html }} />}
      </pre>
    </div>
  );
}

function TableBlock({ block, config }: { block: Extract<Block, { kind: 'table' }>; config: LayoutConfig }) {
  const [header, ...body] = block.rows;
  const tableStyle = { '--table-font-size': `${config.tableFontSize}px` } as unknown as Record<string, string>;
  return (
    <div class="table-frame" style={tableStyle}>
      <table>
        <thead>
          <tr>{(header ?? []).map((cell, index) => <th key={index} style={{ textAlign: block.align[index] ?? 'left' }}><InlineContent nodes={cell} /></th>)}</tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} class={`table-cell-align-${block.align[cellIndex] ?? 'left'}`} style={{ textAlign: block.align[cellIndex] ?? 'left' }}><InlineContent nodes={cell} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImageBlock({ block, resources }: { block: Extract<Block, { kind: 'image' }>; resources: ImageResourceIndex }) {
  const resolution = resolveImageReference(block.url, resources);
  if (!resolution.source) {
    const message = resolution.state === 'ambiguous'
      ? '检测到多个同名或同路径候选图片。请在“管理图片”中选择“自动补齐（选择图片所在文件夹）”，然后重新选择文章根目录。'
      : '未找到本地图片。请在“管理图片”中选择“自动补齐（选择图片所在文件夹）”，或手动添加图片。';
    return <div class="image-missing">{message} <code>{block.url}</code></div>;
  }
  return (
    <figure class="image-card">
      <img src={resolution.source} alt={block.alt || 'Markdown 图片'} />
      {block.alt && <figcaption>{block.alt}</figcaption>}
    </figure>
  );
}

function ListBlock({ block, config, resources }: { block: Extract<Block, { kind: 'list' }>; config: LayoutConfig; resources: ImageResourceIndex }) {
  const Tag = block.ordered ? 'ol' : 'ul';
  return (
    <Tag class="markdown-list" start={block.ordered ? block.start : undefined}>
      {block.items.map((item, itemIndex) => (
        <li key={itemIndex}>{item.map((child) => <BlockView key={child.id} block={child} config={config} resources={resources} nested />)}</li>
      ))}
    </Tag>
  );
}

const EMPTY_IMAGE_RESOURCES: ImageResourceIndex = {
  sources: {},
  sourceImageIds: {},
  candidateImageIds: {},
  objectUrlsByImageId: {},
  overrides: {},
  ambiguousPaths: new Set<string>(),
};

export function BlockView({ block, config, resources = EMPTY_IMAGE_RESOURCES, nested = false }: { block: Block; config: LayoutConfig; resources?: ImageResourceIndex; nested?: boolean }) {
  const content = (() => {
    switch (block.kind) {
      case 'heading': {
        const Tag = block.depth <= 2 ? 'h2' : block.depth === 3 ? 'h3' : 'h4';
        return <Tag class={`heading depth-${block.depth}`}><InlineContent nodes={block.children} /></Tag>;
      }
      case 'paragraph':
        return <p><InlineContent nodes={block.children} /></p>;
      case 'list':
        return <ListBlock block={block} config={config} resources={resources} />;
      case 'blockquote':
        return <blockquote>{block.children.map((child) => <BlockView key={child.id} block={child} config={config} resources={resources} nested />)}</blockquote>;
      case 'code':
        return <CodeBlock value={block.value} language={block.language} numbered={config.codeLineNumbers} />;
      case 'math': {
        const style = { '--math-scale': String(config.mathScale) } as unknown as Record<string, string>;
        return <div class="math-display" style={style} dangerouslySetInnerHTML={{ __html: mathHtml(block.value, true) }} />;
      }
      case 'image':
        return <ImageBlock block={block} resources={resources} />;
      case 'table':
        return <TableBlock block={block} config={config} />;
      case 'thematicBreak':
        return <hr />;
      case 'pageBreak':
        return null;
    }
  })();
  return <div class={`content-block block-${block.kind}${nested ? ' is-nested' : ''}`}>{content}</div>;
}
