export type Inline =
  | { kind: 'text'; value: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'emphasis'; children: Inline[] }
  | { kind: 'delete'; children: Inline[] }
  | { kind: 'link'; url: string; children: Inline[] }
  | { kind: 'inlineCode'; value: string }
  | { kind: 'inlineMath'; value: string }
  | { kind: 'break' };

export type Block =
  | { id: string; kind: 'heading'; depth: number; children: Inline[] }
  | { id: string; kind: 'paragraph'; children: Inline[] }
  | { id: string; kind: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { id: string; kind: 'blockquote'; children: Block[] }
  | { id: string; kind: 'code'; value: string; language: string }
  | { id: string; kind: 'math'; value: string }
  | { id: string; kind: 'image'; url: string; alt: string; caption?: string }
  | { id: string; kind: 'table'; align: Array<'left' | 'center' | 'right' | null>; rows: Inline[][][]; caption?: string }
  | { id: string; kind: 'thematicBreak' }
  | { id: string; kind: 'pageBreak' };

export interface Diagnostic {
  level: 'info' | 'warning' | 'error';
  message: string;
  blockId?: string;
}

export interface ArticleDocument {
  title: string;
  blocks: Block[];
  diagnostics: Diagnostic[];
}

export type Density = 'relaxed' | 'balanced' | 'compact' | 'custom';
export type CanvasRatio = '3:4' | '2:3';
export type CardTheme = 'minimal' | 'editorial' | 'notebook' | 'research';
export type CodeBlockAppearance = 'theme' | 'macos';
export type CoverMode = 'none' | 'integrated' | 'standalone';

export interface PageCover {
  id: string;
  mode: Exclude<CoverMode, 'none'>;
  title: string;
  kicker?: string;
  subtitle?: string;
}

export interface LayoutConfig {
  ratio: CanvasRatio;
  density: Density;
  bodyFontSize: number;
  bodyLineHeight: number;
  blockGap: number;
  headingH2BeforeSpacing: number;
  headingH3BeforeSpacing: number;
  codeFontSize: number;
  tableFontSize: number;
  mathScale: number;
  headingH2TailPercent: number;
  headingH3TailPercent: number;
  headingH4TailPercent: number;
  codeLineNumbers: boolean;
  codeBlockAppearance: CodeBlockAppearance;
  cardHorizontalPadding: number;
  cardVerticalPadding: number;
  imageMaxHeightPercent: number;
  showPageNumber: boolean;
  cardTheme: CardTheme;
  coverMode: CoverMode;
  coverKicker: string;
  coverSubtitle: string;
  exportScale: 1 | 2;
}

export const DEFAULT_CONFIG: LayoutConfig = {
  ratio: '3:4',
  density: 'balanced',
  bodyFontSize: 30,
  bodyLineHeight: 1.62,
  blockGap: 16,
  headingH2BeforeSpacing: 32,
  headingH3BeforeSpacing: 20,
  codeFontSize: 23,
  tableFontSize: 23,
  mathScale: 1,
  headingH2TailPercent: 22,
  headingH3TailPercent: 11,
  headingH4TailPercent: 6,
  codeLineNumbers: false,
  codeBlockAppearance: 'macos',
  cardHorizontalPadding: 76,
  cardVerticalPadding: 67,
  imageMaxHeightPercent: 53,
  showPageNumber: true,
  cardTheme: 'minimal',
  coverMode: 'integrated',
  coverKicker: '',
  coverSubtitle: '',
  exportScale: 1,
};

export const DENSITY_PRESETS: Record<Exclude<Density, 'custom'>, Pick<LayoutConfig,
  'bodyFontSize' | 'bodyLineHeight' | 'blockGap' | 'headingH2BeforeSpacing' | 'headingH3BeforeSpacing' | 'codeFontSize'
>> = {
  relaxed: {
    bodyFontSize: 32,
    bodyLineHeight: 1.68,
    blockGap: 21,
    headingH2BeforeSpacing: 40,
    headingH3BeforeSpacing: 24,
    codeFontSize: 24,
  },
  balanced: {
    bodyFontSize: 30,
    bodyLineHeight: 1.62,
    blockGap: 16,
    headingH2BeforeSpacing: 32,
    headingH3BeforeSpacing: 20,
    codeFontSize: 23,
  },
  compact: {
    bodyFontSize: 27,
    bodyLineHeight: 1.54,
    blockGap: 11,
    headingH2BeforeSpacing: 24,
    headingH3BeforeSpacing: 14,
    codeFontSize: 21,
  },
};

export interface PageFragment {
  id: string;
  sourceId: string;
  block: Block;
  beforeSpacing?: number;
  continuation?: { index: number; total: number; label: string };
}

export interface PagePlanPage {
  id: string;
  index: number;
  section: string;
  cover?: PageCover;
  fragments: PageFragment[];
  estimatedHeight: number;
}

export interface PagePlan {
  pages: PagePlanPage[];
  diagnostics: Diagnostic[];
}
