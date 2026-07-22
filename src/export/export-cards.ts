import { zipSync, strToU8 } from 'fflate';
import { getFontEmbedCSS, toBlob } from 'html-to-image';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function exportCards({
  cards,
  filename,
  pixelRatio,
  onProgress,
}: {
  cards: HTMLElement[];
  filename: string;
  pixelRatio: 1 | 2;
  onProgress: (completed: number, total: number) => void;
}): Promise<void> {
  if (!cards.length) throw new Error('没有可导出的卡片。');
  if ('fonts' in document) await document.fonts.ready;
  await Promise.all(cards.flatMap((card) => Array.from(card.querySelectorAll('img')).map(async (image) => {
    if (!image.complete) await new Promise<void>((resolve) => image.addEventListener('load', () => resolve(), { once: true }));
    try { await image.decode(); } catch { /* the browser reports the broken image in the card itself */ }
  })));

  // Font discovery/data-URL conversion is expensive for a CJK font. Do it
  // once, then give every page the exact same embedded CSS.
  const fontEmbedCSS = await getFontEmbedCSS(cards[0]);
  const files: Record<string, Uint8Array> = {};
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const blob = await toBlob(card, {
      // A cache-busting query string makes browser-created blob: image URLs
      // invalid. Local imported images are already immutable object URLs.
      cacheBust: false,
      fontEmbedCSS,
      pixelRatio,
      backgroundColor: '#fbfaf7',
      width: card.offsetWidth,
      height: card.offsetHeight,
    });
    if (!blob || blob.type !== 'image/png') throw new Error(`第 ${index + 1} 张卡片没有生成真实 PNG。`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!isPng(bytes)) throw new Error(`第 ${index + 1} 张卡片的文件头不是 PNG，已取消下载。`);
    files[`${String(index + 1).padStart(2, '0')}.png`] = bytes;
    onProgress(index + 1, cards.length);
    // Yield after each bitmap so a long article keeps the page responsive.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  files['README.txt'] = strToU8('由 Md2Card 在本地浏览器生成。每个 .png 已通过 PNG 文件头校验。\n');
  const archive = zipSync(files, { level: 6 });
  download(new Blob([archive], { type: 'application/zip' }), `${filename || 'md2card-cards'}.zip`);
}
