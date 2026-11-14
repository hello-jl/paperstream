# Paperstream chibi agent avatars

Selected asset: [paperstream-agent-avatars.png](paperstream-agent-avatars.png), **2172 × 724 pixels**, a 3:1 transparent PNG with three cute, round **head-only chibi icons**. Generated on **2026-11-14** with the built-in image_gen tool and the imagegen skill after viewing the four references below. This replaces the earlier uncommitted adult portrait strip. The discarded portrait and its record are kept only in the ignored local reference directory.

Left to right: **DeepSeek with an upside-down stainless-steel basin on her head**, silver-white GPT dragon with pale horns, and orange Claude with a sunburst ornament and no horns. Only tiny collar tips appear beneath their rounded faces; there are no shoulders, busts, bodies or hands. This is a newly generated cartoon composition using existing community designs, not a crop or redistribution of the original reference pictures.

## Actual references

Four images were supplied to the final generation:

1. **Steel-basin DeepSeek community meme**, 196 × 230 pixels: reference for the upside-down silver basin and compact, toy-like chibi simplification. [Source page](https://xn--pssy23gqgbz2d718b.com/works/deepseek202609150119.html), [archived image](https://raw.githubusercontent.com/lmy414/ai-girl-stickers/main/blue-fish-originals/a2353f9af593df8c76bdcd29bf47ad69.jpg). The original author and permission for this meme image are unconfirmed. It was used as a visual reference only and is not redistributed in this repository.
2. **ApprenTice’s DeepSeek chibi illustration**, downloaded locally as apprentice-deepseek-chibi.png, 941 × 1672 pixels.
3. **ApprenTice’s ChatGPT chibi illustration**, downloaded locally as apprentice-chatgpt-chibi.png, 941 × 1672 pixels.
4. **ApprenTice’s Claude chibi illustration**, downloaded locally as apprentice-claude-chibi.png, 941 × 1672 pixels.

The three ApprenTice adaptations are from [Apprentice-Geo/AI-Fanworks, AI-Girls-and-Chibis, pinned revision ee1f517](https://github.com/Apprentice-Geo/AI-Fanworks/tree/ee1f5176710f3bcfd60ee5cb0af00f77ed96748e/ApprenTice/AI-Girls-and-Chibis), published under **CC BY-NC-SA 4.0**. They supplied the existing chibi faces, colours, fin ears, horns, knot ornament and sunburst accessory. They are **ApprenTice adaptations**, not an original ZipZipPipe chibi release or official company mascots.

As a cross-check, three frames from ZipZipPipe’s [《大AI和小AI们》](https://www.bilibili.com/video/BV1tE9XBbErS/) were viewed using the [shuaizenge/ai-girls archive](https://github.com/shuaizenge/ai-girls): DeepSeek at 5 s, GPT at 23 s and Claude at 17 s. These full-character frames were not supplied to the final generation and were not treated as the round-head chibi proportion reference. Earlier community-design provenance, including DeepSeek’s recorded **上善无形 → ZipZipPipe** lineage, is preserved in the [v2 source record](paperstream-classroom-promo-v2-prompt.md#character-design-references-and-credit) and [v4 classroom record](paperstream-classroom-promo-v4-prompt.md).

All downloaded reference originals remain in the ignored local reference directory. The selected PNG is newly generated derivative fan art. **The project’s MIT license does not grant rights over these third-party character designs, the ApprenTice adaptations, the basin meme or brand marks.** The source licences and attribution remain separate; this record does not claim that an unconfirmed meme permission has been obtained. No affiliation with or endorsement by DeepSeek, OpenAI or Anthropic is implied.

## Verification

The saved PNG was actually viewed: all three have short rounded chins and large cartoon eyes, the whale’s inverted silver basin and both fin ears are visible, GPT’s horns are intact, and Claude has her orange flower and black ribbon without horns. No adult torso or exposed shoulder remains. The heads are arranged in three equal-width areas with visible separation and no text.

Read-only Node inspection confirmed an 8-bit **RGBA PNG with real transparency**, including **646,512 fully transparent pixels (41.11%)**. The file is 1,670,626 bytes. Alpha and edges are retained from the built-in tool; no Python drawing, crop, background-removal script or other raster editing was used. Some previews display alpha as black. This version was generated in one completed reference-based call; the earlier interrupted unreferenced chibi call is not the selected asset.

## Complete selected prompt

```text
Use case: stylized-concept.
Asset type: ONE approximately 3:1 transparent PNG strip containing exactly THREE cute CHIBI BIG-HEAD CARTOON avatar stickers for small 72px icons.

Reference roles, all four images are references, NOT a scene to copy:
Image 1: DeepSeek community steel-basin meme. Use its comically huge round head, tiny facial features, puffy compact toy-like chibi cuteness as the strongest simplification/style guide, AND its precise upside-down silver metal washbasin hat. The basin is worn ON TOP OF THE HEAD like a helmet, opening down, flat metallic crown, curved tapering sides and a simple rolled rim. It is a stainless-steel washing basin, NOT a flowerpot, bowl held in hands, food container or a person sitting in a basin.
Image 2: existing blue DeepSeek CHIBI identity and soft round face, fin ears, blue hair and eyes.
Image 3: existing silver-white ChatGPT dragon CHIBI identity, pale white/lavender dragon horns, purple eyes and simplified knot ornament.
Image 4: existing orange Claude CHIBI identity, warm eyes, orange sunburst flower ornament and black ribbon, no horns.

Compose exactly three SEPARATE HEAD-ONLY icons, left-to-right DeepSeek / GPT / Claude. The canvas has three equal square cells; one complete centered cartoon head fits within each third. No bodies, hands, arms, shoulders or busts: only the giant cute head with at most a TINY closed collar tip below the chin. Round puffy cheeks, very short rounded chin, soft oversized eyes, a tiny nose and little mouth, gentle lively expression. Strongly super-deformed mascot/sticker proportions, not mature adult anime portraits and not photorealistic people. All three faces have the SAME apparent size and horizontal eye-line, looking at the reader. Keep hair compact and soft around the heads, no long full-body hair trails.

LEFT: adorable blue-haired whale girl with blue eyes and both fish-fin ears sticking out visibly at the sides. She MUST be wearing the inverted SILVER-GREY STAINLESS-STEEL BASIN on top of her head exactly like reference 1; the entire basin and rim fit inside her cell. The basin can cover most of the maid headband. A tiny navy bow/high collar can peek below her chin. Small cheerful smile, a little innocent/comic earnestness.
MIDDLE: adorable silver-white dragon chibi with pale white/lavender dragon horns, little pointed ears, purple eyes and a very simplified pale knot hair ornament. Both horns completely visible inside her cell. Soft curious little smile, a tiny closed white-lavender collar at most.
RIGHT: adorable orange Claude chibi with amber eyes, an orange sunburst/chrysanthemum hair ornament and small black ribbon, gentle pleased little smile, tiny cream closed collar at most. She has NO horns, fin ears or other added fantasy appendages.

Style: clean charming 2D animation/emote stickers, simple confident outlines, rounded silhouettes, flat harmonious colors with at most two gentle cel-shading tones, minimal hair strands and facial details. Keep the recognisable existing reference designs and chibi face shapes; simplify their ornate clothes away because these are just big-head icons. No mature makeup, elongated face, slender adult neck, realistic anatomy, glamour portrait rendering, exposed shoulders, chest or sensual framing. Do not create a new generic character. No full-body pose, no books, magic props, wings, tails, setting, card, diagram or text.

Background must be genuinely TRANSPARENT ALPHA, not a white or black rectangle or a drawn checkerboard. Maintain a generous completely transparent border around each head AND a clear vertical transparent gap between neighboring heads. Heads, basin, horns, hair and ornaments never cross the boundaries of their own equal thirds. Keep all headgear intact and uncropped. No disk backgrounds, badge frames, shadows cast on an invisible floor, watermarks, signatures, letters, names, logos or captions. Precisely three cute, rounded chibi HEADS, with the left blue whale wearing her funny upside-down steel basin.
```
