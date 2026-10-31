/**
 * Classify XR input sources into hands vs controllers (pure).
 */

export function classifyInputSources(
  sources: Iterable<{ hand?: unknown | null; handedness: string }>,
): { hands: string[]; controllers: string[] } {
  const hands: string[] = [];
  const controllers: string[] = [];
  for (const source of sources) {
    if (source.hand != null) {
      hands.push(source.handedness);
    } else {
      controllers.push(source.handedness);
    }
  }
  return { hands, controllers };
}
