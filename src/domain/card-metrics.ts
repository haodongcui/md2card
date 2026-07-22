import type { LayoutConfig } from './document';

export const canvasHeight = (ratio: LayoutConfig['ratio']) => (ratio === '3:4' ? 1440 : 1620);

export function cardBottomPadding(config: LayoutConfig): number {
  // Reserve a little less at the bottom because the optional page number lives
  // there. Keep a safe minimum when the user chooses the smallest value.
  return Math.max(35, config.cardVerticalPadding - 12);
}

export function cardContentWidth(config: LayoutConfig): number {
  return 1080 - config.cardHorizontalPadding * 2;
}
