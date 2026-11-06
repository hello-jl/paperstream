import type { CanvasNode } from './canvas.ts';
import { addFigurePatch, figureFromFile } from './card-media.ts';
import type { CardFigure } from './card-media.ts';

interface ClipboardImageData {
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }>;
  files?: ArrayLike<File>;
}
export interface ClipboardImages {
  files: File[];
  hasImages: boolean;
  unsupportedTypes: string[];
}
const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|svg|bmp|tiff?|heic|heif|avif|ico)$/i;
const EXTENSION_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

/** Read the event's local files synchronously, before the clipboard event ends.
 * HTML/text are deliberately ignored: copying an image URL must not fetch it.
 * Some browsers expose the same files through both items and files. Match their
 * multiplicity across those lists without collapsing distinct equal-size images.
 */
export function extractClipboardImages(data: ClipboardImageData | null): ClipboardImages {
  const result: ClipboardImages = { files: [], hasImages: false, unsupportedTypes: [] };
  if (!data) return result;
  const seen = new Set<File>();
  const itemCounts = new Map<string, number>();
  const fingerprint = (file: File) => JSON.stringify([file.name, file.size, file.type, file.lastModified]);
  function accept(file: File, itemType = '') {
    if (seen.has(file)) return;
    seen.add(file);
    const extension = IMAGE_EXTENSION.exec(file.name)?.[1].toLowerCase();
    const declared = (file.type || itemType).toLowerCase();
    const type = declared.startsWith('image/') ? declared : extension ? EXTENSION_TYPES[extension] ?? `image/${extension}` : '';
    if (!type) return;
    result.hasImages = true;
    if (SUPPORTED_TYPES.has(type)) result.files.push(file);
    else if (!result.unsupportedTypes.includes(type)) result.unsupportedTypes.push(type);
  }
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) {
      const key = fingerprint(file);
      itemCounts.set(key, (itemCounts.get(key) ?? 0) + 1);
      accept(file, item.type);
    } else if (item.type.toLowerCase().startsWith('image/')) {
      result.hasImages = true;
      const type = `${item.type}（无法读取）`;
      if (!result.unsupportedTypes.includes(type)) result.unsupportedTypes.push(type);
    }
  }
  for (const file of Array.from(data.files ?? [])) {
    const key = fingerprint(file), remaining = itemCounts.get(key) ?? 0;
    if (remaining) { itemCounts.set(key, remaining - 1); continue; }
    accept(file);
  }
  return result;
}

/** Decode the whole paste before changing the document: a bad image leaves the
 * card intact, and multiple images can be committed as one undo transaction. */
export async function readClipboardFigures(files: readonly File[]): Promise<CardFigure[]> {
  const figures: CardFigure[] = [];
  for (const file of files) figures.push(await figureFromFile(file));
  return figures;
}

/** Call after decoding with the latest node, after checking the captured node ID
 * and document generation. Unknown fields and existing figure order survive. */
export function appendFiguresPatch(node: CanvasNode, figures: readonly CardFigure[]): Partial<CanvasNode> {
  if (!figures.length) return {};
  let next = node;
  for (const figure of figures) next = { ...next, ...addFigurePatch(next, figure) };
  return { paperstreamCard: next.paperstreamCard };
}
