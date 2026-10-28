// In SQL LIKE / ILIKE patterns, % and _ are wildcards. Escape them so a
// search for "50%" looks for the real characters.
export function escapeLike(text) {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}
