# License and third-party notices — ascii-cinema

## This project's own code

**No license has been granted for this repository's own source code.** It is a private, local project, and the
absence of a license here is deliberate rather than an oversight: choosing a license is the author's decision, and
asserting one that was never chosen would be worse than stating plainly that none is in force.

If this is ever to be published or shared, a license must be chosen first. Until then, the default applies: all
rights reserved by the author.

## Remotion — the one dependency with real terms to respect

This engine renders MP4s through **Remotion 4.0.532**, which is **not** an ordinary open-source dependency. Its
license is a two-tier arrangement:

| | |
|---|---|
| **Free License** | individuals · for-profit organizations with **up to 3 employees** · non-profits · evaluation use |
| **Company License** | required for for-profit organizations **above that size** |

The Free License permits commercial use for eligible entities, and permits modifying Remotion for your own use. It
**does not** permit copying or modifying Remotion in order to sell, rent, license, relicense or sublicense a derived
product.

The full, authoritative text is vendored alongside this notice and ships inside the release payload:
`vendor/LICENSE-Remotion.md`. Read that file rather than this summary if the distinction matters — this table is a
convenience, not the license.

**Practical consequence:** whether this project may be used commercially depends on the *size and nature of the
entity using it*, not on anything in this repository. That determination cannot be made here.

Also note: `vendor/LICENSE-Remotion.md` records that the license will change slightly in Remotion 5.0.

## Other third-party components

| Component | Version | Used for | License |
|---|---|---|---|
| [Remotion](https://remotion.dev) | 4.0.532 | frame rendering, H.264 encoding | two-tier, see above · `vendor/LICENSE-Remotion.md` |
| [Three.js](https://threejs.org) | 0.186.0 | camera / 3D projection | MIT · `vendor/LICENSE-three` |
| [threejs-previz](https://github.com/DevMartinese/threejs-previz) | `615b0562…` | camera-move vocabulary reference | MIT · `vendor/LICENSE-threejs-previz` |
| [SVG-Loaders](https://github.com/SamHerbert/SVG-Loaders) | — | loader asset | MIT · `vendor/LICENSE-SVG-Loaders.md` |
| IBM Plex Mono | — | monospace glyph grid | SIL OFL 1.1 · `vendor/OFL-IBMPlexMono.txt` |
| Archivo | — | Latin labels | SIL OFL 1.1 · `vendor/OFL-Archivo.txt` |
| ZCOOL QingKe HuangYou | — | CJK glyphs | SIL OFL 1.1 · `vendor/OFL-ZCOOLQingKeHuangYou.txt` |

### Two things this project does NOT do

**This engine does not vendor FFmpeg.** Encoding goes through Remotion's own platform compositor
(`node_modules/@remotion/compositor-darwin-arm64/`). No FFmpeg binary is redistributed with this engine, so no GPL
obligation attaches to it.

**This engine does not bundle the fonts.** It names them, but there is no `.ttf` anywhere in this repository outside
`node_modules`. The OFL texts are vendored here only so the attribution is complete; the font *files* ship with the
plugin.

### The fonts and their OFL text ship together

In the plugin, all three fonts are SIL OFL 1.1, which requires the license text to accompany the font. They do — the
`.ttf` files sit in `templates/remotion/public/` and the matching OFL texts in `templates/remotion/licenses/`, and a
verified release archive contains both (4 font members, 3 OFL texts). This was checked against the archive itself,
not assumed.

---

*This file states what is known about the licensing of this project and its dependencies as of the versions pinned
above. It is a factual notice, not legal advice; the vendored license texts are authoritative.*
