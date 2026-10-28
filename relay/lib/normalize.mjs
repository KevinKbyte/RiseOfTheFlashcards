// NORM-001: the shared answer normalization. tests/fixtures/normalize.json is the
// contract; the engine-side implementation must match it step for step.
export function normalize(s) {
  return s
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/\p{P}/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
