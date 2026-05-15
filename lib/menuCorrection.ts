export interface MenuMasterEntry {
  menuName: string;
  aliases: string[];
}

export type CorrectionStatus = 'exact' | 'auto' | 'suggest' | 'none';

export interface CorrectionResult {
  correctedName: string;
  suggestedName?: string;
  status: CorrectionStatus;
  similarity: number;
  originalName: string;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const prev = Array.from({ length: n + 1 }, (_, j) => j);
  const curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[n];
}

function normalize(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

export function correctMenuName(
  ocrName: string,
  masters: MenuMasterEntry[]
): CorrectionResult {
  const normalizedOcr = normalize(ocrName);

  for (const m of masters) {
    if (normalize(m.menuName) === normalizedOcr) {
      return { correctedName: m.menuName, status: 'exact', similarity: 1, originalName: ocrName };
    }
    for (const alias of m.aliases) {
      if (normalize(alias) === normalizedOcr) {
        return { correctedName: m.menuName, status: 'exact', similarity: 1, originalName: ocrName };
      }
    }
  }

  const normalizedOcrLen = normalizedOcr.length;
  let bestName = ocrName;
  let bestSim = 0;
  for (const m of masters) {
    for (const c of [m.menuName, ...m.aliases]) {
      const nc = normalize(c);
      if (Math.abs(nc.length - normalizedOcrLen) >= 2) continue;
      const sim = similarity(ocrName, c);
      if (sim > bestSim) {
        bestSim = sim;
        bestName = m.menuName;
      }
    }
  }

  if (bestSim >= 0.80) {
    return { correctedName: bestName, status: 'auto', similarity: bestSim, originalName: ocrName };
  }
  if (bestSim >= 0.60) {
    return {
      correctedName: ocrName,
      suggestedName: bestName,
      status: 'suggest',
      similarity: bestSim,
      originalName: ocrName,
    };
  }
  return { correctedName: ocrName, status: 'none', similarity: bestSim, originalName: ocrName };
}
