import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DENSITY_PRESETS } from '../../src/domain/document';
import { createPagePlan } from '../../src/layout/paginate';
import { parseMarkdown } from '../../src/parser/parse-markdown';
import {
  articleImageUrls,
  buildImageResourceIndex,
  resolveImageReference,
  summarizeImageBindings,
} from '../../src/resources/image-resources';

const fixture = readFileSync(resolve(import.meta.dirname, '../fixtures/technical.md'), 'utf8');
const completeExample = readFileSync(
  resolve(import.meta.dirname, '../../examples/complex-markdown/复杂排版与资源回归样例.md'),
  'utf8',
);

describe('技术 Markdown 解析', () => {
  it('保留表格、围栏代码、LaTex 方括号公式和手动分页', () => {
    const article = parseMarkdown(fixture);
    expect(article.title).toBe('技术内容回归样例');
    expect(article.blocks.some((block) => block.kind === 'table')).toBe(true);
    expect(article.blocks.some((block) => block.kind === 'code')).toBe(true);
    expect(article.blocks.some((block) => block.kind === 'math')).toBe(true);
    expect(article.blocks.some((block) => block.kind === 'pageBreak')).toBe(true);
  });

  it('识别显式手动分页标记', () => {
    const article = parseMarkdown('# 标题\n\n<!-- md2card:break -->\n\n下一页。');
    expect(article.blocks.some((block) => block.kind === 'pageBreak')).toBe(true);
  });

  it('不把 GFM 表格的分隔线当成分页，并遵守显式分页', () => {
    const article = parseMarkdown(fixture);
    const plan = createPagePlan(article, DEFAULT_CONFIG, {});
    expect(plan.pages).toHaveLength(2);
    expect(plan.pages[0].fragments.some((fragment) => fragment.block.kind === 'table')).toBe(true);
    expect(plan.pages[1].fragments.some((fragment) => fragment.block.kind === 'heading')).toBe(true);
  });

  it('将单独的 Markdown 图片保留为图片块，而不是丢失或变成 HTML', () => {
    const article = parseMarkdown('# 图片\n\n![结构图](assets/diagram.png)');
    expect(article.blocks[0]).toMatchObject({ kind: 'image', url: 'assets/diagram.png', alt: '结构图' });
  });

  it('项目自带完整样例覆盖图片、公式、表格、代码和显式分页', () => {
    const article = parseMarkdown(completeExample);
    expect(article.title).toContain('md2card 产品能力演示');
    expect(article.blocks.filter((block) => block.kind === 'image')).toHaveLength(3);
    expect(article.blocks.some((block) => block.kind === 'math')).toBe(true);
    expect(article.blocks.some((block) => block.kind === 'table')).toBe(true);
    expect(article.blocks.some((block) => block.kind === 'code')).toBe(true);
    expect(article.blocks.some((block) => block.kind === 'pageBreak')).toBe(true);
  });

  it('将超高表格按行续页，并在续页中重复表头', () => {
    const rows = Array.from({ length: 26 }, (_, index) => `| 行 ${index + 1} | 用于分页的长说明 |`).join('\n');
    const article = parseMarkdown(`# 表格\n\n| 名称 | 说明 |\n| --- | --- |\n${rows}`);
    const table = article.blocks.find((block) => block.kind === 'table');
    if (!table || table.kind !== 'table') throw new Error('测试前提：应解析出表格');
    const plan = createPagePlan(article, DEFAULT_CONFIG, { [table.id]: 2_200 });
    const fragments = plan.pages.flatMap((page) => page.fragments).filter((fragment) => fragment.block.kind === 'table');
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.every((fragment) => fragment.block.kind === 'table' && fragment.block.rows[0][0][0].kind === 'text' && fragment.block.rows[0][0][0].value === '名称')).toBe(true);
  });

  it('将页尾的 H2、短引言、首个 H3 与首段作为一个标题簇回退到下一页', () => {
    const article = parseMarkdown('# 标题\n\n前置正文。\n\n## 二级标题\n\n短引言。\n\n### 三级标题\n\n三级标题的首段正文。');
    const [before, h2, lead, h3, body] = article.blocks;
    const plan = createPagePlan(article, DEFAULT_CONFIG, {
      [before.id]: 900,
      [h2.id]: 90,
      [lead.id]: 90,
      [h3.id]: 70,
      [body.id]: 200,
    });
    expect(plan.pages[0].fragments.map((fragment) => fragment.sourceId)).toEqual([before.id]);
    expect(plan.pages[1].fragments.map((fragment) => fragment.sourceId)).toEqual([h2.id, lead.id, h3.id, body.id]);
  });

  it('将 H2、短引言及其后的实质代码块一起移出页尾', () => {
    const article = parseMarkdown('# 标题\n\n前置正文。\n\n## 二级标题\n\n短引言。\n\n```text\n第一行\n第二行\n```');
    const [before, h2, lead, code] = article.blocks;
    const plan = createPagePlan(article, DEFAULT_CONFIG, {
      [before.id]: 700,
      [h2.id]: 90,
      [lead.id]: 90,
      [code.id]: 350,
    });
    expect(plan.pages[0].fragments.map((fragment) => fragment.sourceId)).toEqual([before.id]);
    expect(plan.pages[1].fragments.map((fragment) => fragment.sourceId)).toEqual([h2.id, lead.id, code.id]);
  });

  it('将标题本身计入页尾安全区，避免标题文字进入保留区域', () => {
    const article = parseMarkdown('# 标题\n\n前置正文。\n\n## 二级标题\n\n紧随的正文。');
    const [before, h2, body] = article.blocks;
    const plan = createPagePlan(article, DEFAULT_CONFIG, {
      [before.id]: 900,
      [h2.id]: 90,
      [body.id]: 100,
    });
    expect(plan.pages[0].fragments.map((fragment) => fragment.sourceId)).toEqual([before.id]);
    expect(plan.pages[1].fragments.map((fragment) => fragment.sourceId)).toEqual([h2.id, body.id]);
  });

  it('将 H2 段前留白计入分页，并在新页首块移除该留白', () => {
    const article = parseMarkdown('# 标题\n\n前置正文。\n\n## 二级标题\n\n紧随的正文。');
    const [before, h2, body] = article.blocks;
    const config = { ...DEFAULT_CONFIG, headingH2TailPercent: 0 };
    const fits = createPagePlan(article, config, {
      [before.id]: 970,
      [h2.id]: 90,
      [body.id]: 100,
    });
    expect(fits.pages).toHaveLength(1);
    expect(fits.pages[0].fragments[1].beforeSpacing).toBe(config.headingH2BeforeSpacing);
    expect(fits.pages[0].fragments[2].beforeSpacing).toBe(config.blockGap);

    const wraps = createPagePlan(article, config, {
      [before.id]: 1_000,
      [h2.id]: 90,
      [body.id]: 100,
    });
    expect(wraps.pages).toHaveLength(2);
    expect(wraps.pages[1].fragments[0].beforeSpacing).toBeUndefined();
  });

  it('密度只改变块的排版，不放大物理卡片高度', () => {
    const article = parseMarkdown('# 标题\n\n第一段。\n\n第二段。');
    const [first, second] = article.blocks;
    const measurements = { [first.id]: 700, [second.id]: 600 };
    const balanced = createPagePlan(article, DEFAULT_CONFIG, measurements);
    const relaxed = createPagePlan(article, { ...DEFAULT_CONFIG, density: 'relaxed', ...DENSITY_PRESETS.relaxed }, measurements);
    expect(balanced.pages).toHaveLength(2);
    expect(relaxed.pages).toHaveLength(2);
  });

  it('根据 H3 的可调页尾安全区避免三级标题孤立在底部', () => {
    const article = parseMarkdown('# 标题\n\n前置正文。\n\n### 三级标题\n\n三级标题的首段正文。');
    const [before, h3, body] = article.blocks;
    const plan = createPagePlan(article, DEFAULT_CONFIG, {
      [before.id]: 1_105,
      [h3.id]: 70,
      [body.id]: 90,
    });
    expect(plan.pages[0].fragments.map((fragment) => fragment.sourceId)).toEqual([before.id]);
    expect(plan.pages[1].fragments.map((fragment) => fragment.sourceId)).toEqual([h3.id, body.id]);
  });

  it('允许用户收紧 H2 页尾安全区以减少不必要的换页', () => {
    const article = parseMarkdown('# 标题\n\n前置正文。\n\n## 二级标题\n\n紧随的正文。');
    const [before, h2, body] = article.blocks;
    const measurements = { [before.id]: 970, [h2.id]: 90, [body.id]: 100 };
    const guarded = createPagePlan(article, DEFAULT_CONFIG, measurements);
    const relaxed = createPagePlan(article, { ...DEFAULT_CONFIG, headingH2TailPercent: 10 }, measurements);
    expect(guarded.pages).toHaveLength(2);
    expect(relaxed.pages).toHaveLength(1);
  });

  it('融合首页的封面高度会占用首张卡片容量，且不会重复到后续页面', () => {
    const article = parseMarkdown('# 标题\n\n第一段正文。\n\n第二段正文。');
    const [first, second] = article.blocks;
    const cover = { id: 'cover', mode: 'integrated' as const, title: '标题', subtitle: '副标题' };
    const plan = createPagePlan(article, DEFAULT_CONFIG, {
      [cover.id]: 260,
      [first.id]: 600,
      [second.id]: 600,
    }, cover);
    expect(plan.pages).toHaveLength(2);
    expect(plan.pages[0].cover).toEqual(cover);
    expect(plan.pages[1].cover).toBeUndefined();
  });

  it('独立封面会成为无正文的第一页，并使正文页码顺延', () => {
    const article = parseMarkdown('# 标题\n\n正文。');
    const cover = { id: 'cover', mode: 'standalone' as const, title: '标题' };
    const plan = createPagePlan(article, DEFAULT_CONFIG, {}, cover);
    expect(plan.pages[0]).toMatchObject({ index: 0, cover, fragments: [] });
    expect(plan.pages[1].index).toBe(1);
    expect(plan.pages[1].fragments).not.toHaveLength(0);
  });
});

describe('本地图片文件夹绑定', () => {
  it('按 Markdown 相对路径及其目录后缀精确绑定图片', () => {
    const images = [{ id: 'figure', name: 'figure.png', paths: ['article/images/figure.png'] }];
    const index = buildImageResourceIndex(images, { figure: 'blob:figure' });
    expect(resolveImageReference('./images/figure.png', index)).toEqual({ state: 'matched', source: 'blob:figure', imageId: 'figure' });
    expect(resolveImageReference('article/images/figure.png', index)).toEqual({ state: 'matched', source: 'blob:figure', imageId: 'figure' });
  });

  it('遇到重复目录后缀时拒绝猜测，保留冲突状态', () => {
    const images = [
      { id: 'first', name: 'diagram.png', paths: ['first/images/diagram.png'] },
      { id: 'second', name: 'diagram.png', paths: ['second/images/diagram.png'] },
    ];
    const index = buildImageResourceIndex(images, {
      first: 'blob:first',
      second: 'blob:second',
    });
    expect(resolveImageReference('images/diagram.png', index)).toEqual({ state: 'ambiguous', candidateImageIds: ['first', 'second'] });
    expect(resolveImageReference('first/images/diagram.png', index)).toEqual({ state: 'matched', source: 'blob:first', imageId: 'first' });
  });

  it('允许将冲突或缺失引用显式绑定到已导入图片', () => {
    const index = buildImageResourceIndex(
      [{ id: 'selected', name: 'replacement.png', paths: ['assets/replacement.png'] }],
      { selected: 'blob:selected' },
      { 'figures/diagram.png': 'selected' },
    );
    expect(resolveImageReference('figures/diagram.png', index)).toEqual({
      state: 'matched',
      source: 'blob:selected',
      imageId: 'selected',
    });
  });

  it('汇总 Markdown 图片的缺失状态，并保留远程图片', () => {
    const article = parseMarkdown('# 图片\n\n![封面](images/cover.png)\n\n![结构](images/diagram.png)\n\n> ![远程](https://example.com/remote.png)');
    const urls = articleImageUrls(article);
    const index = buildImageResourceIndex(
      [{ id: 'cover', name: 'cover.png', paths: ['post/images/cover.png'] }],
      { cover: 'blob:cover' },
    );
    expect(urls).toEqual(['images/cover.png', 'images/diagram.png', 'https://example.com/remote.png']);
    expect(summarizeImageBindings(urls, index)).toEqual({
      total: 3,
      matched: 2,
      missing: ['images/diagram.png'],
      ambiguous: [],
    });
  });
});
