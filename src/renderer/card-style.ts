import type { LayoutConfig } from '../domain/document';
import { canvasHeight, cardBottomPadding, cardContentWidth } from '../domain/card-metrics';

export { canvasHeight, cardBottomPadding, cardContentWidth };

function headingSizes(config: LayoutConfig): { h2: number; h3: number } {
  if (config.density === 'relaxed') return { h2: 50, h3: 38 };
  if (config.density === 'compact') return { h2: 43, h3: 32 };
  if (config.density === 'balanced') return { h2: 48, h3: 36 };
  return { h2: Math.round(config.bodyFontSize * 1.6), h3: Math.round(config.bodyFontSize * 1.2) };
}

export function cardStyle(config: LayoutConfig): Record<string, string> {
  const headings = headingSizes(config);
  return {
    '--card-height': `${canvasHeight(config.ratio)}px`,
    '--card-horizontal-padding': `${config.cardHorizontalPadding}px`,
    '--card-top-padding': `${config.cardVerticalPadding}px`,
    '--card-bottom-padding': `${cardBottomPadding(config)}px`,
    '--body-size': `${config.bodyFontSize}px`,
    '--body-line-height': String(config.bodyLineHeight),
    '--block-gap': `${config.blockGap}px`,
    '--heading-2': `${headings.h2}px`,
    '--heading-3': `${headings.h3}px`,
    '--heading-2-before-space': `${config.headingH2BeforeSpacing}px`,
    '--heading-3-before-space': `${config.headingH3BeforeSpacing}px`,
    '--code-size': `${config.codeFontSize}px`,
    '--table-font-size': `${config.tableFontSize}px`,
    '--image-max-height': `${Math.round(canvasHeight(config.ratio) * config.imageMaxHeightPercent / 100)}px`,
  };
}
