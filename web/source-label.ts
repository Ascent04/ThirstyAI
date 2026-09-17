/**
 * Short label for a source link in the facts table. Long "Authors: Title"
 * strings wrapped onto a dozen lines; the link now shows "First et al. (year)"
 * and carries the full title as a tooltip. Sources without a recognisable
 * author head keep their full title.
 */
export interface SourceLike {
  title: string;
  year?: number;
  authors?: string;
}

export function sourceLabel(source: SourceLike): string {
  const colon = source.title.indexOf(": ");
  const head = source.authors ?? (colon > 0 ? source.title.slice(0, colon) : undefined);
  if (!head) return source.title;
  const first = head.split(",")[0].trim();
  const short = head.includes(",") ? `${first} et al.` : first;
  return source.year ? `${short} (${source.year})` : short;
}
