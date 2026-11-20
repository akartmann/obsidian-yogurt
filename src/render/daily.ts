/** Adds `- link` under `heading` (created at the end when missing). Does nothing when the link is already there. */
export function addLinkUnderHeading(note: string, heading: string, link: string): string {
  if (note.includes(link)) return note;
  const item = `- ${link}`;
  const lines = note.split("\n");
  const h = lines.findIndex((l) => l.trim() === heading.trim());
  if (h < 0) {
    const base = note.replace(/\s*$/, "");
    return `${base ? base + "\n\n" : ""}${heading.trim()}\n${item}\n`;
  }
  const level = (heading.trim().match(/^#+/) ?? ["#"])[0].length;
  let end = lines.length;
  for (let i = h + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  // insert after the last non-blank line of the section
  let at = end;
  while (at - 1 > h && lines[at - 1].trim() === "") at--;
  lines.splice(at, 0, item);
  const out = lines.join("\n");
  return out.endsWith("\n") ? out : out + "\n";
}
