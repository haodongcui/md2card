import { useEffect, useRef } from 'preact/hooks';
import type { ArticleDocument, LayoutConfig, PageCover } from '../domain/document';
import type { ImageResourceIndex } from '../resources/image-resources';
import { cardContentWidth, cardStyle } from './card-style';
import { CardCover } from './CardCover';
import { BlockView } from './RichText';

export function MeasureStage({ article, config, cover, resources, onMeasure }: {
  article: ArticleDocument;
  config: LayoutConfig;
  cover?: PageCover;
  resources?: ImageResourceIndex;
  onMeasure: (measurements: Record<string, number>) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const collect = async () => {
      if ('fonts' in document) await document.fonts.ready;
      await Promise.all(Array.from(stageRef.current?.querySelectorAll('img') ?? []).map(async (image) => {
        if (!image.complete) await new Promise<void>((resolve) => image.addEventListener('load', () => resolve(), { once: true }));
        try { await image.decode(); } catch { /* broken images retain their native fallback height */ }
      }));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (cancelled || !stageRef.current) return;
      const next: Record<string, number> = {};
      stageRef.current.querySelectorAll<HTMLElement>('[data-measure-id]').forEach((element) => {
        const computed = getComputedStyle(element);
        next[element.dataset.measureId ?? ''] = element.getBoundingClientRect().height + Number.parseFloat(computed.marginBottom || '0');
      });
      onMeasure(next);
    };
    void collect();
    return () => { cancelled = true; };
  }, [article, config, resources, onMeasure]);

  return (
    <aside ref={stageRef} class={`measure-stage theme-${config.cardTheme} density-${config.density} code-appearance-${config.codeBlockAppearance}`} style={{ ...cardStyle(config), width: `${cardContentWidth(config)}px` }} aria-hidden="true">
      {cover?.mode === 'integrated' && <div data-measure-id={cover.id} class="measure-cover"><CardCover cover={cover} /></div>}
      {article.blocks.filter((block) => block.kind !== 'pageBreak').map((block) => (
        <div key={block.id} data-measure-id={block.id} class="measure-block">
          <BlockView block={block} config={config} resources={resources} />
        </div>
      ))}
    </aside>
  );
}
