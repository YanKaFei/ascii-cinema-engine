# DRAFT-T2 — 表示变化（质料变形）接入报告

## 机制本来就在，需要的是把它接上计划

我第一次调查时以为要先验证机制是否存在——**它一直存在且完整**：

```
intent.modeTransitions
  → 编译器 validateModeTransition（TRANSITION_METHODS / KNOWN_OBJECTS / 窗口必须落在镜头内）
  → spec.modeTransitions（编译器验证后保留）
  → 运行时 ACTIVE_TRANSITION → typoState === 'GLYPH_FIELD' → drawField 产生载体
```

**已验证的前置条件**（不再假设）：

| 检查 | 结果 |
|---|---|
| `TRANSITION_METHODS` 合法值 | `["TOPOLOGY_CARRIED_FRAGMENTATION"]` |
| `KNOWN_OBJECTS` | `["NAME","PERSON","ROOM"]` |
| `VALID_MODES` | 含 `SCENE_ASCII / TYPOGRAPHIC_GRAPHIC / GLYPH_FIELD` |
| 编译器是否消费 | 是（`shot-compiler.ts` 校验并保留） |
| 渲染器是否消费 | 是（`spec.modeTransitions` → `ACTIVE_TRANSITION`）|

## 接入内容

`scripts/draftt-plan.mjs` 新增 `S6_MODE_TRANSITIONS`：

```js
{
  transitionId: 'MATERIAL:graphic-to-field',
  sourceObjectId: 'NAME',              // KNOWN_OBJECTS 里唯一的字形对象
  sourceMode: 'TYPOGRAPHIC_GRAPHIC',
  targetMode: 'GLYPH_FIELD',
  startFrame: 29, endFrame: 48,        // 不是随便选的
  transitionMethod: 'TOPOLOGY_CARRIED_FRAGMENTATION',
  continuityPolicy: 'IDENTITY_AND_TOPOLOGY',
  fragmentCount: 96, seed: 20261,
}
```

### 时刻不是发明的

`startFrame: 29` 正好是**这部片子自己作者化的因果地标**。
编译器独立重导出的 S6 因果对是 `causeReadable 19 → 绝对 310`、`effectOnset 29 → 绝对 320`，
而计划用的是同一个 `action-local(REACH 0..59)` 域。**变形发生在被验证的原因处，不是任意帧。**

### 实测确认

```
帧 291–319  SCENE_ASCII    carriers 0
帧 320      GLYPH_FIELD    ← 恰好等于因果 effectOnset（绝对 320）
帧 330–350  GLYPH_FIELD    carriers 85
```

GLYPH_FIELD 共 31 帧，载体总数 2,550，峰值 **85 个载体**（与 `fragmentCount: 96` 同量级）。

## 第二处修复：一个载体的场是看不见的

**第一个能工作的版本是正确的，而且看不见。** `drawField` 每个载体**只写 1 格**：
85 个载体覆盖 28,800 格中的 85 格 = **0.3%**。变形发生了、被 trace 记录了、**看不出任何东西**。

已改为**沿每个载体自身速度方向绘制运动拖尾**（尾长 0.42 世界单位、9 个采样点、密度沿尾递减）。
方向取自编译后的载体状态，所以拖尾**不可能与实际运动方向不一致**。

**帧 335 实测**：中央黑腔里现在能看到分散的载体字符（红橙 `#` 与白色 `+` `-` 呈放射状）。
**此前那里是全黑。**

## 诚实记录：视觉影响仍然很小

| 帧 | 原 DRAFT-T | T2（填充面＋碎裂） | T2（＋表示变化） |
|---|---|---|---|
| 1 | 0.0197 | 0.0874 | 0.0874 |
| 311 | 0.0112 | **0.2006** | 0.2008 |
| 335 | 0.0112 | **0.2088** | 0.2044 |
| 350 | 0.0087 | 0.2853 | 0.2854 |

**表示变化对墨覆盖的贡献约 0.05%**（311 帧 +0.0002，335 帧 −0.0044）。

**原因不是 bug，是量级**：85 个载体在一个 28,800 格的画面里天生微不足道。
画面的密度来自**填充的结构面**（0.20–0.29），载体场是叠加在其上的一层薄雾。

**要让它成为可见的「质料正在碎裂」，需要的是数量级提升，不是继续加工这 85 个载体。**
两种可选做法（均未执行）：
1. **提高 `fragmentCount`**（96 → 数千），让碎裂成为真正的粒子化——但会改变载体身份语义，需重新验证连续性。
2. **让结构面本身在该帧解构**：不是叠加一个场，而是把 `drawScene` 的填充面按碎裂进度逐步打散。
   第二种更符合「质料本身在变」，也更接近 V1 研究 C 的效果。

## 未做

1. **视觉质量未评审**——我看过帧 335，载体场可见但淡；构图是否成立需人判断。
2. **帧 350 密度突然升至 0.2854** ——这是碎裂材质的 envelope 峰值，与载体场不是同一机制，两者是否协调未评审。
3. `endFrame: 48` 之后的连续性（`continuationPolicy`）未声明续接，S7 的 `structural-decay` 独立承担。
