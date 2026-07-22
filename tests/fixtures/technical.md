# 技术内容回归样例

## 表格不是分页符

| 名称 | 形状 | 说明 |
| --- | --- | --- |
| latent | [4, 64, 64] | 连续生成状态 |
| token | [N, D] | Transformer 输入 |

\[
q_\phi(z\mid x)=\mathcal N(\mu_\phi(x),\operatorname{diag}(\sigma_\phi^2(x))).
\]

```python
def reparameterize(mu, logvar):
    return mu + (0.5 * logvar).exp() * torch.randn_like(mu)
```

<!-- md2card:break -->

## 手动分页后的内容

正文不能因为表格或公式而被缩小。
