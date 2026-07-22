const FENCE = '```';

export const STARTER_MARKDOWN = String.raw`# 把技术 Markdown 做成可读的卡片

## 粘贴一篇笔记，右侧会自动分页

md2card 优先保留 Markdown 的原始结构：公式、表格、代码和列表不会被静默改写。选择或拖放 \`.md\` 文件也可以开始。

| 内容 | 当前策略 |
| --- | --- |
| 正文 | 保持基线字号，不被宽表格连带缩小 |
| 表格 | 单独紧凑、换行，必要时按行续页 |
| 公式 | KaTeX 渲染，单独缩放或独占页面 |

$$
\mathcal L = \mathbb E_{x\sim p_{data}}\left[\lVert f_\theta(x)-y\rVert^2\right]
$$

${FENCE}python
def export_locally(markdown: str) -> bytes:
    return render(markdown).to_png_zip()
${FENCE}

> 提示：左侧可选 3:4 / 2:3 比例和阅读密度。所有转换与下载都在本地浏览器完成。
`;
