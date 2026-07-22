import { forwardRef } from 'preact/compat';
import type { LayoutConfig, PagePlanPage } from '../domain/document';
import type { ImageResourceIndex } from '../resources/image-resources';
import { cardStyle } from './card-style';
import { CardCover } from './CardCover';
import { BlockView } from './RichText';

export const CardPage = forwardRef<HTMLElement, {
  page: PagePlanPage;
  totalPages: number;
  config: LayoutConfig;
  resources?: ImageResourceIndex;
}>(({ page, totalPages, config, resources }, ref) => {
  const style = cardStyle(config) as unknown as Record<string, string>;
  const pageNumber = String(page.index + 1).padStart(2, '0');
  const total = String(totalPages).padStart(2, '0');
  const standaloneCover = page.cover?.mode === 'standalone';
  return (
    <article ref={ref} class={`card-page theme-${config.cardTheme} density-${config.density} code-appearance-${config.codeBlockAppearance}`} style={style} data-card-page={page.index + 1}>
      <main class={`card-content${standaloneCover ? ' cover-only' : ''}`}>
        {page.cover && <CardCover cover={page.cover} />}
        {page.fragments.map((fragment) => (
          <section key={fragment.id} class="card-fragment" style={fragment.beforeSpacing ? { marginTop: `${fragment.beforeSpacing}px` } : undefined}>
            {fragment.continuation && <div class="continuation-label">{fragment.continuation.label}</div>}
            <BlockView block={fragment.block} config={config} resources={resources} />
          </section>
        ))}
      </main>
      {config.showPageNumber && !standaloneCover && <footer class="card-footer">
        <span class="page-number">{pageNumber} / {total}</span>
      </footer>}
    </article>
  );
});

CardPage.displayName = 'CardPage';
