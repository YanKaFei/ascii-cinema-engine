<div align="center">
  <img src="docs/01-title.png" alt="ASCII Cinema Engine" width="100%">
</div>

<h1 align="center">ASCII Cinema Engine</h1>

<p align="center" data-ecosystem-nav="1"><sub><a href="https://github.com/YanKaFei/Costume-Director-Vault-Starter">Costume</a> · <a href="https://github.com/YanKaFei/art-aesthetic-vault">Art</a> · <a href="https://github.com/YanKaFei/ascii-cinema-engine">ASCII Cinema</a> · <a href="https://github.com/YanKaFei/ascii-h3-director">ASCII H3</a> · <a href="https://github.com/YanKaFei/2d-limited-mv-studio">2D MV</a> · <a href="https://github.com/YanKaFei/virtual-heroine-atlas">Virtual Heroine</a></sub></p>


<p align="center">
  <sub>
    <a href="https://github.com/YanKaFei/Costume-Director-Vault-Starter">Costume</a> ·
    <a href="https://github.com/YanKaFei/art-aesthetic-vault">Art</a> ·
    <a href="https://github.com/YanKaFei/ascii-cinema-engine">ASCII Cinema</a> ·
    <a href="https://github.com/YanKaFei/ascii-h3-director">ASCII H3</a> ·
    <a href="https://github.com/YanKaFei/2d-limited-mv-studio">2D MV</a> ·
    <a href="https://github.com/YanKaFei/virtual-heroine-atlas">Virtual Heroine</a>
  </sub>
</p>

**文字だけで作る映画。** 1 フレーム 240×120 の ASCII セル、決定論的レンダリング、コンパイルされた因果性、監査可能な不変量。

## これは何か

文字グリッドのシネマエンジンです。各フレームは 240×120 のグリフ領域で、同一性・連続性・因果変化をデータとして追跡します。AI 画像列ではなく、決定論的でテスト可能な出力です。

## 実行

```bash
npm ci
npm run typecheck && npm run build
npm test
npm run gate:phase2
```


## DSH ecosystem

- [Costume](https://github.com/YanKaFei/Costume-Director-Vault-Starter) — 衣装の視覚知識
- [Art](https://github.com/YanKaFei/art-aesthetic-vault) — 美術・映画スタイルのレイヤー
- [ASCII Cinema](https://github.com/YanKaFei/ascii-cinema-engine) — 文字グリッド・シネマ
- [ASCII H3](https://github.com/YanKaFei/ascii-h3-director) — ASCII / キネティック・タイポグラフィ演出
- [2D MV](https://github.com/YanKaFei/2d-limited-mv-studio) — 2D アニメ MV プロンプト
- [Virtual Heroine](https://github.com/YanKaFei/virtual-heroine-atlas) — バーチャルキャラクター研究
