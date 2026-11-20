# Paperstream classroom illustration — an attentive lesson

Draft image: `paperstream-classroom-promo-v3.png`, 1672 × 941 pixels (superseded draft removed from working tree, retained in Git history; current active asset is [paperstream-classroom-promo-v4.png](paperstream-classroom-promo-v4.png)). Edited on 2026-11-13 with the built-in `image_gen` tool using the `imagegen` skill. The edit target was `paperstream-classroom-promo-v2.png` ([v2 record](paperstream-classroom-promo-v2-prompt.md)); both draft PNGs are retained in Git history. Two sequential built-in edits first repaired the expressions and eye-lines, then added two relation labels while preserving the improved interaction. No Python image manipulation or CLI fallback was used.

## What changed and why

The teacher and listeners now share a reason for their expressions. DeepSeek is explaining the Backprop card touched by her pointer, with her head turned into the lesson instead of smiling at the camera. GPT has open eyes and a restrained, thoughtful smile, with a hand at her chin: she is following the explanation rather than laughing without a visible cause. Claude keeps her book and mild smile, looking toward the teacher.

The board also names two previously unlabelled connections: **AlexNet → ResNet: “train deeper”** and **ResNet → Transformer: “residual links”**. The second connector passes below the cards to keep the label readable. These are a compact illustrative narrative, not an exhaustive dependency graph. In particular, ResNet is not presented as inventing attention: the Transformer paper explicitly uses residual connections around its sublayers. The research Canvas and its source notes give the fuller technical history.

Visual check: exactly three recognisable adult characters; teacher pointing at Backprop; both listeners visibly attentive; no exaggerated laughter or closed laughing eyes; exact “Paperstream” title, six card titles and years retained; both new labels readable and attached to their intended connectors without covering cards.

## Character references and rights

The existing unofficial community personifications follow **ZipZipPipe（胖次狐）**: [Bilibili](https://space.bilibili.com/4168597), [Pixiv](https://www.pixiv.net/users/18604994), and [《AI娘化》, Pixiv 148186519](https://www.pixiv.net/artworks/148186519). DeepSeek’s design lineage is credited by the reference archives to **上善无形 → ZipZipPipe**. The exact reference archive paths, original publication links and verification limits are preserved in the [v2 source record](paperstream-classroom-promo-v2-prompt.md#character-design-references-and-credit).

This remains a derivative fan illustration, not original Paperstream character design or an official mascot image. The project’s MIT license does not grant rights to the underlying third-party character designs or brand marks. No affiliation with or endorsement by DeepSeek, OpenAI or Anthropic is implied. The downloaded original reference images remain outside distribution in the ignored local reference directory; this revision used only the generated v2 illustration as its initial edit target.

## Prompt 1 — expressions and eye-lines

```text
Use case: precise-object-edit.
Asset type: revised Paperstream README promotional classroom illustration.
Input image 1 is the EDIT TARGET, not merely a style reference. Preserve the existing wide composition, exact three adult characters and their already established community designs, outfits, hair, species features, sage board, classroom, desk, sunlight, detailed anime rendering and branding. Make a tightly focused edit to expressions, eye-lines and only the minimal head/hand posture needed for a believable lesson.

Primary request: give this scene a clear emotional and conversational logic. DeepSeek, the blue-haired whale/fish-fin-eared maid at left, is the teacher. She is explaining the Backprop card that her wooden pointer already touches. Turn her head and eyes naturally toward that Backprop card and the attentive listeners, with a modest, friendly, focused teaching expression and a small naturally parted mouth mid-explanation. She must no longer pose with a broad smile aimed at the viewer. Keep the pointer touching the same Backprop diagram.
GPT, the silver-white dragon woman seated at center right, is the listener. Replace her wide-open laughing mouth, closed eyes and thrown-back head with open lavender eyes, a relaxed head angled left/up toward the Backprop card and pointer tip, and a subtle closed-mouth smile of recognition: she has just understood the explanation. Her shoulders and free hand should be relaxed rather than theatrical; a hand may rest naturally near her chin or on her lap. She is NOT giving the lesson and NOT laughing at nothing.
Claude, the copper-orange-haired woman at far right, already has a believable expression. Keep her restrained pleasant smile and her brown sunburst book. Make only a slight head/eye adjustment toward the teacher and pointer/board so she is visibly listening, not gazing at the viewer. Keep both listeners seated on the front wooden desk.

Invariants: exactly the same three adult characters; DeepSeek long blue hair, actual fin ears, navy-white long maid dress, ruffled headband and dark blue whale tail; GPT long silver-white hair, pale dragon horns, wings, tail and white-lavender flowing gown; Claude long copper-orange hair, sunburst ornament and cream/orange/black gown. Preserve each character's silhouette and identity. Preserve the entire board layout, white rounded cards, arrows, years, diagrams, all readable typography and every existing word. Keep the exact large title "Paperstream", subtitle "AI History", titles "ENIAC", "Backprop", "AlexNet", "ResNet", "Transformer", "LLMs", and corresponding existing dates and relation labels. No new words, captions or speech bubbles.

Avoid: all three looking at the camera; unexplained laughter; laughing with closed eyes; exaggerated grins; making GPT the teacher; extra characters; extra fingers; clothing redesigns; green hair; whale hats; new logos; watermarks; signatures. Keep all characters fully clothed in the original tasteful adult portrayal. The intended mood is a warm, engaged research discussion, where the facial expressions are caused by the teaching interaction.
```

## Prompt 2 — readable technical relations

```text
Use case: precise-object-edit.
Input image 1 is the EDIT TARGET. This is already the approved expression and gaze revision. Make ONLY two small, readable relation-label additions to the chalkboard timeline. Preserve the entire illustration, all three faces and their expressions, eyes and attentive eye-lines, bodies, clothes, classroom, existing text, title, cards, diagrams, year labels, colors and framing.

Change 1: on the long connector going from the AlexNet card (upper right) down and left into the ResNet card (lower left), add a small cream rounded relation-label box with moss-green border reading exactly "train deeper" in clear dark-green lowercase text. Place it on the spacious horizontal part of that connector in the gap between rows, so the line is visibly attached to both sides of the label box. The label must not cover any card or the teacher's pointer.
Change 2: label the connector from ResNet to Transformer with exactly "residual links" in the same readable small cream/green relation-label style. This describes the residual-connection mechanism reused in attention blocks; do NOT write "attention" alone. The narrow existing gap between these lower-row cards is too small for this phrase: if needed, reroute only this connector with a neat shallow right-angle U-shaped path in the open board space just underneath the two cards (from the bottom of ResNet to the bottom of Transformer, arrowhead entering Transformer). Put the "residual links" box on the middle horizontal segment below the cards. Keep the rest of the graph and all card positions unchanged. It must be unambiguously the ResNet-to-Transformer connection, with no detached floating caption and no dotted leader.

The two new strings are exactly "train deeper" and "residual links". No other wording changes. All previous board words must remain verbatim: "Paperstream", "AI History", "ENIAC", "Backprop", "AlexNet", "ResNet", "Transformer", "LLMs", "compute", "learn", "scale", and all six existing years. Keep the natural teaching interaction: blue-haired whale girl speaking while pointing at Backprop, silver-white GPT dragon listener with open eyes and a restrained thoughtful smile, Claude listener with her book and mild attentive smile. No laughter, no eyes squeezed shut, no looking out at the viewer. Do not redesign or regenerate the characters. No extra characters, speech bubbles, watermarks, signatures, logos, or dense text.
```
