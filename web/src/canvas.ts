/** JSON Canvas data operations. No rendering or filesystem dependencies. */

export interface CanvasNode {
  id: string;
  type: "text" | "file" | "link" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  file?: string;
  url?: string;
  subpath?: string;
  label?: string;
  color?: string;
  background?: string;
  backgroundStyle?: "cover" | "ratio" | "repeat";
  [key: string]: unknown;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  toNode: string;
  fromSide?: "top" | "right" | "bottom" | "left";
  toSide?: "top" | "right" | "bottom" | "left";
  fromEnd?: "none" | "arrow";
  toEnd?: "none" | "arrow";
  color?: string;
  label?: string;
  [key: string]: unknown;
}

export interface JSONCanvasDocument {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  [key: string]: unknown;
}

export interface PaperFields {
  alias: string;
  takeaway: string;
  name?: string | null;
  url?: string | null;
  year?: number | null;
}

export interface Paper {
  alias: string;
  takeaway: string;
  name: string | null;
  url: string | null;
  year: number | null;
}

export interface NodePlacement {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export class CanvasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanvasError";
  }
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CanvasError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, field: string, singleLine = true, allowEmpty = false): asserts value is string {
  requireCondition(typeof value === "string" && (allowEmpty || value.trim().length > 0), `${field} must be ${allowEmpty ? "" : "non-empty "}text`);
  if (singleLine) requireCondition(!/[\r\n]/.test(value), `${field} must be a single line`);
  requireCondition(!/[\u0000-\u0008\u000b-\u001f\ud800-\udfff]/u.test(value.replace(/\r\n/g, "\n")),
    `${field} contains unsupported control characters`);
}

function decimalValue(token: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token)!;
  const fraction = match[3] ?? "";
  const digits = (match[2] + fraction).replace(/^0+/, "");
  if (!digits) return "0";
  const zeros = /0*$/.exec(digits)![0].length;
  const power = BigInt(match[4] ?? "0") - BigInt(fraction.length) + BigInt(zeros);
  return `${match[1]}${digits.slice(0, digits.length - zeros)}e${power}`;
}

/** JSON.parse silently keeps the final duplicate key; reject that data loss. */
function parseJSON(source: string): unknown {
  const result: unknown = JSON.parse(source);
  let offset = 0;
  const whitespace = () => { while (/\s/.test(source[offset] ?? "") && offset < source.length) offset++; };
  const string = (): string => {
    const start = offset++;
    while (offset < source.length) {
      const char = source[offset++];
      if (char === "\\") offset++;
      else if (char === '"') break;
    }
    return JSON.parse(source.slice(start, offset)) as string;
  };
  const value = (): void => {
    whitespace();
    const char = source[offset];
    if (char === '"') { string(); return; }
    if (char === "{" || char === "[") {
      offset++;
      const close = char === "{" ? "}" : "]";
      const keys = new Set<string>();
      whitespace();
      while (source[offset] !== close) {
        if (char === "{") {
          const key = string();
          requireCondition(!keys.has(key), `Duplicate JSON key: ${key}`);
          keys.add(key);
          whitespace();
          offset++; // Colon: syntax was already checked by JSON.parse.
        }
        value();
        whitespace();
        if (source[offset] === ",") { offset++; whitespace(); }
      }
      offset++;
      return;
    }
    const start = offset;
    while (offset < source.length && !/[\s,}\]]/.test(source[offset])) offset++;
    const token = source.slice(start, offset);
    if (/^-?\d/.test(token)) {
      const number = Number(token);
      requireCondition(Number.isFinite(number), "JSON numbers must be finite");
      requireCondition(decimalValue(token) === decimalValue(JSON.stringify(number)),
        "JSON number cannot be preserved without losing precision");
    }
  };
  value();
  return result;
}

/** Reject values JSON.stringify would silently discard or transform. */
function requireJSON(value: unknown, ancestors = new Set<object>()): void {
  if (typeof value === "string") {
    requireCondition(!/[\ud800-\udfff]/u.test(value), "JSON strings must not contain unpaired Unicode surrogates");
    return;
  }
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    requireCondition(Number.isFinite(value), "JSON numbers must be finite");
    requireCondition(!Number.isInteger(value) || Number.isSafeInteger(value), "JSON integers must be within the safe JavaScript range");
    return;
  }
  requireCondition(typeof value === "object", "Document contains a value that cannot be stored in JSON");
  requireCondition(!ancestors.has(value), "Document contains a circular reference");
  requireCondition(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
    "Document values must be plain JSON objects");
  requireCondition(Object.getOwnPropertySymbols(value).length === 0, "JSON cannot preserve symbol properties");
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const child of value) requireJSON(child, ancestors);
  } else {
    for (const child of Object.values(value)) requireJSON(child, ancestors);
  }
  ancestors.delete(value);
}

function paperPayload(node: CanvasNode): Record<string, unknown> | null {
  if (node.type !== "text" || typeof node.text !== "string") return null;
  const match = /^```json\r?\n([\s\S]*)\r?\n```$/.exec(node.text.trim());
  if (!match) return null;
  let value: unknown;
  try {
    value = parseJSON(match[1]);
  } catch {
    requireCondition(!match[1].includes('"paperstream"'), "Paper card contains invalid JSON");
    return null; // Ordinary text cards may contain incomplete JSON examples.
  }
  return isObject(value) && value.paperstream === 1 ? value : null;
}

function validateURL(value: unknown): asserts value is string {
  requireText(value, "url", true);
  requireCondition(!/[\s\\\u0000-\u001f\u007f-\u009f]/u.test(value) && /^https?:\/\//i.test(value),
    "url must be an absolute HTTP(S) URL without whitespace or backslashes");
  try {
    const url = new URL(value);
    requireCondition((url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0,
      "url must have an HTTP(S) host");
  } catch (error) {
    if (error instanceof CanvasError) throw error;
    throw new CanvasError("url must have a valid HTTP(S) host and port");
  }
}

function validatePaper(value: Record<string, unknown>): void {
  requireCondition(value.paperstream === 1, "Paper card must have paperstream version 1");
  requireJSON(value);
  requireText(value.alias, "alias", true, true);
  requireText(value.takeaway, "takeaway", false, true);
  if (value.name !== undefined && value.name !== null) requireText(value.name, "name", true);
  if (value.url !== undefined && value.url !== null) validateURL(value.url);
  if (value.year !== undefined && value.year !== null) {
    requireCondition(typeof value.year === "number" && Number.isInteger(value.year) && value.year >= 1 && value.year <= 9999,
      "year must be an integer from 1 to 9999");
  }
}

function optionalString(value: Record<string, unknown>, key: string, where: string): void {
  if (Object.hasOwn(value, key)) requireCondition(typeof value[key] === "string", `${where}.${key} must be text`);
}

function optionalEnum(value: Record<string, unknown>, key: string, options: readonly string[], where: string): void {
  if (Object.hasOwn(value, key)) requireCondition(typeof value[key] === "string" && options.includes(value[key]),
    `${where}.${key} has an invalid value`);
}

/** Validate standard fields, paper fields, graph references, and JSON round-trip safety. */
export function validateCanvas(value: unknown): asserts value is JSONCanvasDocument {
  requireCondition(isObject(value), "Canvas must be a JSON object");
  requireJSON(value);
  requireCondition(Array.isArray(value.nodes) && Array.isArray(value.edges), "Canvas nodes and edges must be arrays");
  const nodeIds = new Set<string>();
  for (const entry of value.nodes) {
    requireCondition(isObject(entry), "Every node must be an object");
    requireText(entry.id, "Node id");
    requireCondition(!nodeIds.has(entry.id), `Duplicate node id: ${entry.id}`);
    nodeIds.add(entry.id);
    requireCondition(typeof entry.type === "string" && ["text", "file", "link", "group"].includes(entry.type), `Unsupported node type: ${String(entry.type)}`);
    for (const key of ["x", "y", "width", "height"] as const) {
      requireCondition(typeof entry[key] === "number" && Number.isSafeInteger(entry[key]), `${entry.id}.${key} must be a finite safe integer`);
    }
    requireCondition((entry.width as number) > 0 && (entry.height as number) > 0, `${entry.id} must have positive dimensions`);
    if (entry.type === "text") requireCondition(typeof entry.text === "string", `${entry.id}.text must be text`);
    if (entry.type === "file") requireText(entry.file, `${entry.id}.file`);
    if (entry.type === "link") requireText(entry.url, `${entry.id}.url`);
    for (const key of ["color", "label", "background", "subpath"]) optionalString(entry, key, entry.id);
    if (Object.hasOwn(entry, "subpath")) requireCondition((entry.subpath as string).startsWith("#"), `${entry.id}.subpath must start with #`);
    optionalEnum(entry, "backgroundStyle", ["cover", "ratio", "repeat"], entry.id);
    const payload = paperPayload(entry as CanvasNode);
    if (payload) validatePaper(payload);
  }
  const edgeIds = new Set<string>();
  for (const entry of value.edges) {
    requireCondition(isObject(entry), "Every edge must be an object");
    requireText(entry.id, "Edge id");
    requireCondition(!edgeIds.has(entry.id), `Duplicate edge id: ${entry.id}`);
    edgeIds.add(entry.id);
    requireCondition(typeof entry.fromNode === "string" && nodeIds.has(entry.fromNode), `${entry.id} has a missing source node`);
    requireCondition(typeof entry.toNode === "string" && nodeIds.has(entry.toNode), `${entry.id} has a missing target node`);
    for (const key of ["color", "label"]) optionalString(entry, key, entry.id);
    for (const key of ["fromSide", "toSide"]) optionalEnum(entry, key, ["top", "right", "bottom", "left"], entry.id);
    for (const key of ["fromEnd", "toEnd"]) optionalEnum(entry, key, ["none", "arrow"], entry.id);
  }
}

export function createCanvas(): JSONCanvasDocument {
  return { nodes: [], edges: [] };
}

/** The format permits omitted arrays; normalize only those two fields. */
export function parseCanvas(source: string): JSONCanvasDocument {
  let value: unknown;
  try {
    value = parseJSON(source);
  } catch (error) {
    if (error instanceof CanvasError) throw error;
    throw new CanvasError("Canvas is not valid JSON");
  }
  requireCondition(isObject(value), "Canvas must be a JSON object");
  const document = {
    ...value,
    nodes: Object.hasOwn(value, "nodes") ? value.nodes : [],
    edges: Object.hasOwn(value, "edges") ? value.edges : [],
  };
  validateCanvas(document);
  return document;
}

export function serializeCanvas(document: JSONCanvasDocument): string {
  validateCanvas(document);
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function readPaper(node: CanvasNode): Paper | null {
  const value = paperPayload(node);
  if (!value) return null;
  validatePaper(value);
  return {
    alias: value.alias as string,
    takeaway: value.takeaway as string,
    name: (value.name ?? null) as string | null,
    url: (value.url ?? null) as string | null,
    year: (value.year ?? null) as number | null,
  };
}

function newId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function encodePaper(payload: Record<string, unknown>): string {
  return `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
}

function normalizePaperPatch(patch: Partial<PaperFields>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...patch };
  if (typeof normalized.takeaway === "string") normalized.takeaway = normalized.takeaway.replace(/\r\n/g, "\n");
  return normalized;
}

export function createPaperNode(paper: PaperFields, placement: NodePlacement = {}): CanvasNode {
  const payload = { paperstream: 1, name: null, url: null, year: null, ...normalizePaperPatch(paper) };
  validatePaper(payload);
  requireJSON(payload);
  const node: CanvasNode = {
    id: placement.id ?? newId(), type: "text",
    x: placement.x ?? 0, y: placement.y ?? 0,
    width: placement.width ?? 360, height: placement.height ?? 220,
    text: encodePaper(payload),
  };
  validateCanvas({ nodes: [node], edges: [] });
  return node;
}

export function addNode(document: JSONCanvasDocument, node: CanvasNode): JSONCanvasDocument {
  const next = { ...document, nodes: [...document.nodes, node] };
  validateCanvas(next);
  return next;
}

export function patchNode(document: JSONCanvasDocument, id: string, patch: Partial<CanvasNode>): JSONCanvasDocument {
  requireCondition(!Object.hasOwn(patch, "id"), "A node id cannot be changed");
  requireCondition(document.nodes.some((node) => node.id === id), `Node not found: ${id}`);
  const next = { ...document, nodes: document.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) };
  validateCanvas(next);
  return next;
}

export function updatePaper(document: JSONCanvasDocument, id: string, patch: Partial<PaperFields>): JSONCanvasDocument {
  const node = document.nodes.find((candidate) => candidate.id === id);
  requireCondition(node, `Node not found: ${id}`);
  const payload = paperPayload(node);
  requireCondition(payload, `Node is not a paper: ${id}`);
  const next = { ...payload, ...normalizePaperPatch(patch) };
  validatePaper(next);
  requireJSON(next);
  return patchNode(document, id, { text: encodePaper(next) });
}

export function removeNode(document: JSONCanvasDocument, id: string, options: { cascade?: boolean } = {}): JSONCanvasDocument {
  requireCondition(document.nodes.some((node) => node.id === id), `Node not found: ${id}`);
  const connected = document.edges.some((edge) => edge.fromNode === id || edge.toNode === id);
  requireCondition(!connected || options.cascade, "Node has connections; explicitly request cascade to remove them");
  const next = {
    ...document,
    nodes: document.nodes.filter((node) => node.id !== id),
    edges: document.edges.filter((edge) => edge.fromNode !== id && edge.toNode !== id),
  };
  validateCanvas(next);
  return next;
}

export function createEdge(fromNode: string, toNode: string, label: string, options: { id?: string } = {}): CanvasEdge {
  requireText(fromNode, "source");
  requireText(toNode, "target");
  requireText(label, "relation", true, true);
  const id = options.id ?? newId();
  requireText(id, "Edge id");
  return { id, fromNode, toNode, label };
}

export function addEdge(document: JSONCanvasDocument, edge: CanvasEdge): JSONCanvasDocument {
  const next = { ...document, edges: [...document.edges, edge] };
  validateCanvas(next);
  return next;
}

export function patchEdge(document: JSONCanvasDocument, id: string, patch: Partial<CanvasEdge>): JSONCanvasDocument {
  requireCondition(!Object.hasOwn(patch, "id"), "An edge id cannot be changed");
  requireCondition(document.edges.some((edge) => edge.id === id), `Edge not found: ${id}`);
  if (Object.hasOwn(patch, "label")) requireText(patch.label, "relation", true, true);
  const next = { ...document, edges: document.edges.map((edge) => edge.id === id ? { ...edge, ...patch } : edge) };
  validateCanvas(next);
  return next;
}

export function removeEdge(document: JSONCanvasDocument, id: string): JSONCanvasDocument {
  requireCondition(document.edges.some((edge) => edge.id === id), `Edge not found: ${id}`);
  const next = { ...document, edges: document.edges.filter((edge) => edge.id !== id) };
  validateCanvas(next);
  return next;
}
