const FENCE = '```';
const TICK = '`';

/**
 * The first-run article must work without requesting file access. It is
 * deliberately image-free: local-image binding belongs to the downloadable
 * integration example, while this article demonstrates the rest of the card
 * system in a few immediately readable pages.
 */
export const STARTER_MARKDOWN = String.raw`# md2card：让技术 Markdown 成为可发布的图片卡片

> **纯前端、本地处理、预览即导出。** 这是一篇首次打开工作台就能完整阅读的产品演示：不需要上传文件，也不需要先授予图片目录权限。

md2card 面向包含公式、表格、代码和多级标题的技术笔记。它不把文章机械截断，而是根据真实卡片尺寸重新组织阅读节奏；右侧预览看到的内容，就是之后导出的 PNG。

## 01 · 从一篇 Markdown 开始

你可以直接替换左侧内容、粘贴自己的笔记，或导入单篇 ${TICK}.md${TICK} 文件。默认的 **3:4 标准卡片 + 技术平衡密度 + 融合首卡** 已适合多数技术文章；遇到特殊内容时，再进入排版设置细调。

1. 输入或导入 Markdown；
2. 先检查右侧自动分页；
3. 只对表格、公式、代码等特殊内容做局部调整；
4. 点击右上角“下载图片”，获得本地 PNG ZIP。

| 内容类型 | 默认策略 | 可单独调整 |
| --- | --- | --- |
| 普通正文 | 保持稳定字号与阅读宽度 | 字号、行距、段间距 |
| 标题层级 | 避免孤立停在页尾 | H2 / H3 / H4 安全区与段前距 |
| 技术内容 | 不连带缩小整页正文 | 表格字号、公式缩放、代码字号 |

<!-- md2card:break -->

## 02 · 公式应当自然融入叙述

技术笔记里，中文说明、English terms、${TICK}inline_code()${TICK} 与行内公式常常同时出现。例如信噪比可以写作 $\mathrm{SNR}=10\log_{10}(P_s/P_n)$，而不应迫使整段文字为一条公式让步。

对于独立公式，md2card 使用 KaTeX 渲染，并允许单独缩放：

$$
\begin{aligned}
x_t &= \sqrt{\bar\alpha_t}\,x_0 + \sqrt{1-\bar\alpha_t}\,\epsilon,\\
\mathcal{L}_{\mathrm{simple}}
&= \mathbb{E}_{t,x_0,\epsilon}
\left[\left\|\epsilon-\epsilon_\theta(x_t,t)\right\|_2^2\right].
\end{aligned}
$$

> 排版原则：公式太长时，先调整公式缩放或将表达式拆为多行；不要为了容纳一条技术内容而缩小普通正文。

<!-- md2card:break -->

## 03 · 表格需要自己的收纳方式

宽表格在卡片里最容易破坏阅读宽度。md2card 让表格使用独立字号；表格过高时按行续页并重复表头，而不是裁掉底部信息。

| 阶段 | 输入 | 输出 | 关键检查 | 常见问题 |
| --- | --- | --- | --- | --- |
| 解析 | Markdown 文本 | 文档模型 | 标题、公式、表格 | 原始 HTML 被安全忽略 |
| 资源 | 图片引用路径 | 绑定状态 | 已绑定 / 缺失 / 冲突 | 同名图片不随机选择 |
| 分页 | 真实 DOM 高度 | 页面计划 | 标题簇与安全区 | 页尾不留孤立标题 |
| 预览 | 页面计划 | 卡片列表 | 缩放与列数 | 所见即所得 |
| 导出 | 已渲染卡片 | PNG ZIP | 字体、图片、边界 | 失败时保留重试入口 |

### 03.1 · 本地图片怎样处理

当你的 Markdown 写有 ${TICK}![结构图](assets/diagram.png)${TICK} 时，导入 ${TICK}.md${TICK} 后可在“管理图片”选择“自动补齐（选择图片所在文件夹）”。浏览器会要求你选择文章根目录或 ${TICK}assets${TICK} 文件夹；应用随后只读取当前文章真正引用到的图片，而不会把整个文件夹导进草稿。

<!-- md2card:break -->

## 04 · 代码是内容，不是装饰

代码块默认使用 macOS 浅色外观，也可以在“主题”中改为跟随卡片主题。长代码会按源代码行续页，避免半行被裁切。

${FENCE}typescript
type ExportPreset = 'standard' | 'high-res';

export function chooseExportSize(
  preset: ExportPreset,
  ratio: '3:4' | '2:3',
) {
  const width = preset === 'high-res' ? 2160 : 1080;
  const height = ratio === '2:3' ? width * 1.5 : width * (4 / 3);
  return { width, height };
}
${FENCE}

- **标准发布**：3:4 为 1080 × 1440，适合直接发布；
- **高清原图**：像素翻倍，适合留存或细看公式、表格；
- **深紫工作台**：只改变编辑界面，不改变最终卡片的主题。

<!-- md2card:break -->

## 05 · 导出前先检查完整性

点击“下载图片”后，应用会检查 Markdown 诊断、字体加载、图片解码与卡片垂直边界。通过后，预览中同一份卡片 DOM 会逐页生成 PNG，再打包成 ZIP 下载到本地。

首个 H1 默认用作文章名和首卡标题，不会在正文重复；后续 H1 会作为新的章节起点。H2、H3、H4 则拥有不同强度的页尾保护，因此标题不会轻易留在卡片最后一两行。

最后，试试切换画布比例、主题和密度。只有当自己的笔记出现长公式、宽表格或特殊封面需求时，才需要继续展开细项设置。所有文字、图片、排版和导出文件都留在当前浏览器中。
`;
