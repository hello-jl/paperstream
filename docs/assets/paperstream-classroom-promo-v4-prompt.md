# Paperstream classroom illustration — clearer model diagrams

Image: [paperstream-classroom-promo-v4.png](paperstream-classroom-promo-v4.png), 1672 × 941 pixels. Edited on 2026-11-14 with the built-in `image_gen` tool using the `imagegen` skill. The initial edit target was [v3](paperstream-classroom-promo-v3.png); earlier versions remain unchanged. Three sequential edits corrected the relation words and diagrams, clarified the encoder dataflow, then moved the external residual-relation label out of the card. No Python image manipulation or CLI fallback was used.

## Requested changes

- ENIAC → Backprop: replace **compute** with **learn**.
- Backprop → AlexNet: replace **learn** with **deepen**.
- ResNet: show a single residual block, with two Conv operations and one identity shortcut meeting at a single addition point.
- Transformer: replace the crossed-box icon with an explicitly labelled Encoder layer, using the original post-norm sequence Self-Attn → Add & Norm → FFN → Add & Norm and two separate residual paths.

The classroom expressions and established community character designs remain those of v3. The short timeline is a promotional illustration, not an exhaustive technical dependency graph. “Residual links” describes a reused mechanism, not a claim that ResNet invented attention.

Scientific references for the simplified icons: [He et al., Deep Residual Learning for Image Recognition, §3.1 and Figure 2](https://arxiv.org/html/1512.03385), and [Vaswani et al., Attention Is All You Need, §3.1 and Figure 1](https://papers.nips.cc/paper_files/paper/2017/file/3f5ee243547dee91fbd053c1c4a845aa-Paper.pdf). These are schematic icons: normalization and activation details inside the ResNet block are omitted; the Transformer icon shows an encoder layer, not a complete encoder–decoder system.

## Visual verification

The two top-row relation replacements are spelled correctly. ResNet has two Conv boxes, one forward identity shortcut and one sum junction. Transformer has four correctly ordered stages, a visible upward main path and two independent forward residual paths. All six titles and years remain readable, and the three attentive characters retain their expressions and outfits. The Transformer card is larger than v3 to keep its diagram readable; it remains on the board without covering another card. In the final edit the external “residual links” label is below the card, with a small green gap, and above the wooden board frame. Its connector descends from ResNet, passes through the label, then points upward into Transformer. Card dimensions are not an exact-pixel match to v3, and the model did not follow the suggested label coordinates exactly; the actual visual result was checked rather than treating the prompt coordinates as measured output.

## Character references and rights

This revision retains the unofficial community personifications credited in the [v2 source record](paperstream-classroom-promo-v2-prompt.md#character-design-references-and-credit) and [v3 edit record](paperstream-classroom-promo-v3-prompt.md). The characters follow **ZipZipPipe（胖次狐）**: [Bilibili](https://space.bilibili.com/4168597), [Pixiv](https://www.pixiv.net/users/18604994), and [《AI娘化》, Pixiv 148186519](https://www.pixiv.net/artworks/148186519). DeepSeek’s recorded design lineage is **上善无形 → ZipZipPipe**.

This remains a derivative fan illustration, not an original Paperstream character design or an official mascot image. The project’s MIT license does not grant rights over the underlying third-party character designs or brand marks. No affiliation with or endorsement by DeepSeek, OpenAI or Anthropic is implied. Original downloaded character references remain outside distribution; this revision used generated v3 and its intermediate edit as image targets.

## Prompt 1 — relation words and model diagrams

```text
Use case: precise-object-edit.
Asset type: refined Paperstream README classroom promotional illustration.
Input image 1 is the EDIT TARGET. Preserve its entire wide composition and all three adult characters exactly: faces, expressions, eye-lines, hairstyles, costumes, hands, posture, species features, teacher's pointer, desk and classroom. Preserve lighting, sage-green/cream palette, anime linework, lettering style, every card boundary and position, title "Paperstream", subtitle "AI History", all six paper titles and all six bottom-right year labels. Make ONLY the following targeted edits on the board.

1. Precise text replacement in the top row: replace the first small relation box between ENIAC and Backprop, currently "compute", with exactly "learn". Replace the second small relation box between Backprop and AlexNet, currently "learn", with exactly "deepen". Keep the original box sizes, cream backgrounds, green borders, attachment to arrows and legible dark-green type. Preserve "train deeper", "residual links" and "scale" elsewhere verbatim.

2. Replace only the unclear schematic INSIDE the existing ResNet card with a clean, scientifically correct residual-block diagram in the existing dark moss-green line-art style on cream. The card's title "ResNet", year "2015", borders and dimensions must stay unchanged. Draw a left-to-right feed-forward block: an input x at left splits into two paths. The main path passes through two small successive rectangular boxes labelled exactly "Conv" and "Conv", then enters a SINGLE circled-plus summation junction. The second path is one unambiguous identity shortcut from the input that arches neatly above the two Conv boxes and joins the SAME plus junction. An arrow from the summation points to the output at the right. Draw clear arrowheads showing both paths flow from input to output; the shortcut is NOT a feedback loop. Use just this single bypass and single addition, no extraneous loops, circles or convoluted symbols. A small "identity" above the bypass and/or "x+F(x)" near output is optional only if clearly readable without clutter. Do not cover the title or year.

3. Replace only the unclear schematic INSIDE the existing Transformer card with a compact, correct 2017 Transformer ENCODER layer, rather than a random crossed graph. Keep its title "Transformer", year "2017", borders and dimensions unchanged. Reserve the interior for a crisp small block diagram, with a small but legible "Encoder" label so this cannot be mistaken for the full encoder-decoder. Draw a single bottom-to-top main flow of FOUR compact, evenly spaced boxes in this EXACT input-to-output order:
bottom: "Self-Attn"
above: "Add & Norm"
above: "FFN"
top: "Add & Norm"
The input arrow enters Self-Attn from below. The output arrow exits the TOP Add & Norm upward. Use readable concise type and consistent dark-green lines. Include exactly TWO clear residual shortcut paths, routed with clean right angles at the sides of the vertical stack: the first branches from the input immediately before Self-Attn, bypasses Self-Attn ONLY and joins the first Add & Norm box; the second branches from the first Add & Norm output immediately before FFN, bypasses FFN ONLY and joins the TOP Add & Norm box. These are forward skips into addition then normalization, not backward loops or one giant shortcut across the whole layer. Do NOT draw an encoder-decoder pair, cross-attention, QKV matrices, embeddings, extra layers, crisscrossed edges or decorative square networks. Omit an Nx marker if necessary to keep the four essential labels and two residual paths legible. The small schematic must fit inside the existing card without moving any neighboring card, external relation line, or year.

Constraints: all changes confined to the two top relation words and the two specified card interiors. Do not alter the ENIAC, Backprop, AlexNet or LLMs illustrations. Keep the teacher pointing at Backprop with her natural explaining expression, GPT white dragon with her thoughtful open-eyed smile and hand at her chin, and Claude with her book looking toward the teacher. Do not change any character or add new people, props, logos, captions, signatures or watermarks. This is a precise scientific-diagram correction, not a fresh redesign. Retain a polished, warm, coherent Paperstream classroom.
```

## Prompt 2 — explicit encoder dataflow

```text
Use case: precise-object-edit. Image 1 is the EDIT TARGET. Make ONE narrow scientific correction, ONLY inside the Transformer card. Keep the rest of the image absolutely unchanged, especially all three characters, every label, the exact words "learn", "deepen", "train deeper", "residual links", "scale", the correct ResNet diagram, and every year. Do not repaint faces or bodies.

Inside Transformer, keep the compact bottom-to-top four-box encoder schematic and exact labels: bottom "Self-Attn", then "Add & Norm", then "FFN", then top "Add & Norm"; also retain small "Encoder". Improve the ARROWS and RESIDUAL PATHS so the scientific logic is unambiguous. Make the four boxes a little shallower and give them enough vertical gaps for clearly visible upward arrows along the central main spine. There must be a continuous, visible main vertical dataflow: input arrow from below -> Self-Attn -> upward arrow -> lower Add & Norm -> upward arrow -> FFN -> upward arrow -> upper Add & Norm -> output upward arrow. The current draft has too little visible connection between boxes: fix that with crisp, separated strokes and readable arrowheads.

There are exactly TWO independent forward skip paths:
- The LOWER skip branches from a small junction on the vertical INPUT ARROW BELOW Self-Attn, not from the Self-Attn box. It runs left, up along the left side of Self-Attn, then right into the LEFT EDGE of the LOWER Add & Norm box, with an arrowhead entering that box.
- The UPPER skip branches from a small junction on the vertical main spine in the gap AFTER LOWER Add & Norm and BEFORE FFN, not from the FFN box. It runs right, up along the right side of FFN, then left into the RIGHT EDGE of the UPPER Add & Norm box, with an arrowhead entering that box.
Use little round branch dots ONLY at the two genuine source junctions. Keep the two skips separate, one at each side; no long shared bracket, no shortcut directly from the Self-Attn box, no shortcut from the FFN box, no backward arrows, no cycles, no crossings through words. The arrows enter the Add & Norm stages: add residual first, normalize second, in the original 2017 post-norm encoder.

Keep the small schematic visually clean: dark moss-green line art and readable type on cream, no QKV, no embeddings, no decoder, no extra architectural detail or new text. The subtly enlarged existing Transformer card is acceptable; do not move it or change its title, year, border, external relation connections, or any other element. Preserve the full warm Paperstream classroom illustration exactly outside this small card interior.
```

## Prompt 3 — external label clearance

```text
Use case: precise-object-edit.
Input image 1 is the EDIT TARGET. Make ONLY ONE local layout repair to the EXTERNAL ResNet-to-Transformer relation line and its "residual links" label. The existing ResNet scientific icon and Transformer encoder schematic are now correct: preserve them exactly, including all four modules, arrows, residual branch dots, the "Encoder" label, the Transformer card's current size and position, its "2017" year and border. Do not edit any card interior or any person.

Problem to fix: the external cream "residual links" label currently overlaps the lower-left part of the Transformer card. Move that label and only its external connector BELOW the Transformer card, fully in the green board background. The image is 1672 by 941 pixels. Approximate layout guide: Transformer bottom edge is around y=575 and the green chalkboard ends near y=608. Route the external relation from the BOTTOM of the ResNet card (near x=574, y=527) vertically DOWN to approximately y=592, then horizontally RIGHT to approximately x=842, then vertically UP with a clear arrowhead entering the BOTTOM BORDER of the Transformer card around y=575. Put the small cream rounded "residual links" box on the HORIZONTAL segment, approximately x=610 to x=766 and y=581 to y=605. The label's cream rectangle must be completely outside every card, with visible green breathing room above it and below the Transformer card. It must remain fully within the green chalkboard, above the wooden frame. Keep this one short line neatly attached to the box's two sides, in the existing thin cream connector style. The exact readable text remains "residual links". Remove the old overlapping label and old external route, restoring their local background cleanly.

This is the ONLY change. Preserve the current enlarged Transformer card, its legible scientifically correct bottom-to-top encoder flow, all branch dots and internal connections without any edits. Preserve title "Paperstream", subtitle "AI History", every card title and year, labels "learn", "deepen", "train deeper", "scale", all three characters' faces/expressions/gazes/poses/clothing, the teacher pointer and complete classroom composition. Do not move or resize cards. Do not change existing diagrams. Do not add new words, people, objects, signatures or watermarks. Priority: the external label no longer covers a card and no part of it touches or crosses the wooden board frame.
```
