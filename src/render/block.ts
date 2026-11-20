/** The part of a meeting note the plugin owns. Everything outside the markers belongs to the person. */
export const BLOCK_START = "<!-- yogurt:start -->";
export const BLOCK_END = "<!-- yogurt:end -->";
export const BLOCK_PLACEHOLDER = "{{yogurt}}";

/** Marker text inside synced content would end the block early, so it is defused. */
const defuse = (s: string) => s.split(BLOCK_START).join("<!-- yogurt start -->").split(BLOCK_END).join("<!-- yogurt end -->");

export function wrapBlock(inner: string): string {
  return `${BLOCK_START}\n${defuse(inner).trim()}\n${BLOCK_END}`;
}

function appendBlock(content: string, block: string): string {
  if (!content.trim()) return `${block}\n`;
  return `${content.replace(/\s*$/, "")}\n\n${block}\n`;
}

/** Swaps the managed region for `block`; when the markers are missing the block is appended instead. */
export function replaceBlock(content: string, block: string): { content: string; replaced: boolean } {
  const start = content.indexOf(BLOCK_START);
  const end = start >= 0 ? content.indexOf(BLOCK_END, start + BLOCK_START.length) : -1;
  if (start < 0 || end < 0) return { content: appendBlock(content, block), replaced: false };
  return { content: content.slice(0, start) + block + content.slice(end + BLOCK_END.length), replaced: true };
}

/** Puts the block where the template says ({{yogurt}}), or at the end. */
export function placeInTemplate(body: string, block: string): string {
  const at = body.indexOf(BLOCK_PLACEHOLDER);
  if (at < 0) return appendBlock(body, block);
  return body.slice(0, at) + block + body.slice(at + BLOCK_PLACEHOLDER.length);
}
