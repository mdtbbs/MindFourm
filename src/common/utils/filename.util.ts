/**
 * Repairs UTF-8 filenames that were decoded as Latin-1 by multipart parsers.
 *
 * A normal Unicode filename is returned unchanged. The round-trip check keeps
 * genuine Latin-1 names from being rewritten while recognizing values such as
 * a mojibake Chinese filename as the UTF-8 bytes it was meant to represent.
 */
export function repairMojibakeFilename(fileName: string | null | undefined): string | null | undefined {
  if (fileName === null || fileName === undefined) return fileName;

  const normalized = fileName.normalize('NFC');
  const repaired = Buffer.from(normalized, 'latin1').toString('utf8');
  if (repaired.includes('\uFFFD')) return normalized;

  const roundTripped = Buffer.from(repaired, 'utf8').toString('latin1');
  return roundTripped === normalized ? repaired.normalize('NFC') : normalized;
}
