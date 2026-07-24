# 示例文章

这是一篇可以直接导入 Md2Card 的完整 Markdown 排版样例。它以扩散模型为线索，让标题、正文、图片、公式、表格与代码自然穿插，适合用来感受连续卡片的阅读节奏。

工作台首次打开时也有一份不含本地图片的演示稿；本目录的文章则附带三张 SVG 插图，适合体验本地图片的自动匹配与图文排版。

## 文件组成

| 文件 | 用途 |
| --- | --- |
| [`Md2Card Example.md`](./Md2Card%20Example.md) | 一篇带图片、公式、表格、代码、列表与分页的完整 Markdown 样例 |
| `images/architecture.svg` | Markdown 笔记的结构关系插图 |
| `images/sampling-pipeline.svg` | 从采样到去噪的流程插图 |
| `images/wide-matrix.svg` | 宽幅注意力矩阵示意图 |

### 导入方式

1. 下载整个 `examples` 文件夹或 Clone 仓库；只下载 `.md` 文件会缺少 `images/`。
2. 在工作台选择“导入 Markdown”，打开 `Md2Card Example.md`；也可以直接把它拖入编辑区。
3. 出现本地图片提示后，选择 `examples` 文件夹，三张 SVG 会按文章里的相对路径自动关联。
4. 试着切换画布比例、主题和密度，再下载一组卡片。
