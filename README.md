<div align="center">

<img src="docs/01-title.png" alt="字符电影引擎 — ASCII CINEMA ENGINE" width="100%">

</div>

<div align="center">

<img src="docs/02-grid.png" alt="每一帧都是 28,800 个字符" width="100%">

</div>

<div align="center">

<img src="docs/03-identity.png" alt="字符记得自己是谁 — 来源 / 连续性 / 可追溯" width="100%">

</div>

<div align="center">

<img src="docs/04-causality.png" alt="形变发生在被验证的那一帧 — 帧 320" width="100%">

</div>

<div align="center">

<img src="docs/05-deconstruction.png" alt="墙体自己失去实质 — 接缝驱动的解构" width="100%">

</div>

<div align="center">

<img src="docs/06-engineering.png" alt="可审计的不变量 — 518,975 断言 / 54 道门" width="100%">

</div>

<div align="center">

<img src="docs/07-progress.png" alt="进度：已达成与尚未完成" width="100%">

</div>

---

<div align="center">

<img src="docs/10-frame-060.png" width="100%">
<img src="docs/11-frame-291.png" width="100%">
<img src="docs/15-frame-292.png" width="100%">
<img src="docs/12-frame-320.png" width="100%">
<img src="docs/13-frame-345.png" width="100%">
<img src="docs/14-frame-470.png" width="100%">
<img src="docs/16-timeline.png" width="100%">

</div>

---

## 运行 / RUN

```bash
npm ci
npm run typecheck && npm run build

npm test          # 518,975 不变式断言
npm run gate:phase2   # 完整质量门：typecheck → build → test → 回归 → 基准 → 多样性
```

完整管线：

```bash
node scripts/pipeline.mjs --prompt <主题> --out out/<name>
```

### 环境变量

两个脚本需要**外部素材**，路径由环境变量提供，仓库内不含这些文件：

| 变量 | 用途 |
|---|---|
| `CINEMA_TRACK` | `scripts/phase4a3*.mjs` / `phase4b0-*.mjs` 的音频轨路径 |
| `CINEMA_PYTHON` | `scripts/phase4a3-independent.mjs` 用于独立比对的 Python 解释器 |

未设置时会**明确报错**，不会静默使用错误路径。

### 依赖的渲染工具链不在本仓库内

`node_modules` 与 FFmpeg / Remotion 平台二进制**不随仓库分发**（见 `LICENSE.md`）。
`out/draftt2/final-draftt2.mp4` 是已生成的成片，用于直接观看。

---

<div align="center">
<sub>ENGINE · 96 TypeScript files / 30,458 lines · 240 × 120 character grid · byte-for-byte reproducible</sub>
</div>
