export type DiffTag = "equal" | "replace" | "insert" | "delete";

export interface DiffToken {
  text: string;
  tag: DiffTag;
}

function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function levenshteinMatrix(ref: string[], hyp: string[]): number[][] {
  const m = ref.length;
  const n = hyp.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

export function computeWordDiff(
  reference: string,
  hypothesis: string
): { refTokens: DiffToken[]; hypTokens: DiffToken[] } {
  const refRaw = tokenize(reference);
  const hypRaw = tokenize(hypothesis);

  const refNorm = tokenize(normalizeText(reference));
  const hypNorm = tokenize(normalizeText(hypothesis));

  if (refNorm.length === 0 && hypNorm.length === 0) {
    return { refTokens: [], hypTokens: [] };
  }

  const dp = levenshteinMatrix(refNorm, hypNorm);

  const refTags: DiffTag[] = [];
  const hypTags: DiffTag[] = [];

  let i = refNorm.length;
  let j = hypNorm.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && refNorm[i - 1] === hypNorm[j - 1]) {
      refTags.unshift("equal");
      hypTags.unshift("equal");
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      refTags.unshift("replace");
      hypTags.unshift("replace");
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      refTags.unshift("delete");
      i--;
    } else {
      hypTags.unshift("insert");
      j--;
    }
  }

  const refTokens: DiffToken[] = refTags.map((tag, idx) => ({
    text: refRaw[idx] ?? refNorm[idx],
    tag,
  }));

  const hypTokens: DiffToken[] = hypTags.map((tag, idx) => ({
    text: hypRaw[idx] ?? hypNorm[idx],
    tag,
  }));

  return { refTokens, hypTokens };
}
