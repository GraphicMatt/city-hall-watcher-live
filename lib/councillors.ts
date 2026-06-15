// Councillors with compound surnames that should not be reduced to the final
// word when displaying a short name in vote-card pills. Add new entries here
// as needed (key = final word, value = full display name).
const COMPOUND_SURNAMES: Record<string, string> = {
  lin: 'Chernos Lin',
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
