/** Hero names: 2-15 chars, starts with a letter; letters, spaces, apostrophes and hyphens. */
export function validName(name: string): boolean {
  return /^[A-Za-z][A-Za-z '-]{1,14}$/.test(name.trim());
}
