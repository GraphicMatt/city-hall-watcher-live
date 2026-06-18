// Councillors with compound surnames that should not be reduced to the final
// word when displaying a short name in vote-card pills. Add new entries here
// as needed (key = final word, value = full display name).
const COMPOUND_SURNAMES: Record<string, string> = {
  lin: 'Chernos Lin',
  baeremaeker: 'De Baeremaeker',
  luby: 'Lindsay Luby',
  giorgio: 'Di Giorgio',
  grande: 'Del Grande',
};

// Extracts a short display name from a full councillor name as it appears in
// the Minutes (strips role suffixes like "(Chair)", handles compound surnames).
export function lastName(full: string): string {
  const cleaned = full.replace(/\s*\(.*?\)/g, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 0) return cleaned;
  const last = parts[parts.length - 1]!;
  const compound = COMPOUND_SURNAMES[last.toLowerCase()];
  return compound ?? last;
}

// Builds a display label for each name in a vote, adding a first initial
// ("R. Ford", "D. Ford") when two or more councillors share the same last name.
// Pass all names that appear anywhere in the vote (yes + no + absent).
export function buildDisplayLabels(allNames: string[]): Map<string, string> {
  const lastNames = allNames.map(n => lastName(n).toLowerCase());
  const seen = new Set<string>();
  const duplicated = new Set<string>();
  for (const l of lastNames) {
    if (seen.has(l)) duplicated.add(l);
    seen.add(l);
  }

  return new Map(
    allNames.map(n => {
      const last = lastName(n);
      if (duplicated.has(last.toLowerCase())) {
        const cleaned = n.replace(/\s*\(.*?\)/g, '').trim();
        const initial = cleaned[0]?.toUpperCase() ?? '';
        return [n, initial ? `${initial}. ${last}` : last];
      }
      return [n, last];
    })
  );
}
