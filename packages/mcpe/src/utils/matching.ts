/**
 * Check if a string matches a pattern with wildcard support
 *
 * Supports:
 * - Exact match: "github.push" matches "github.push"
 * - Prefix wildcard: "github.*" matches "github.push", "github.pr"
 * - Universal wildcard: "*" matches everything
 */
export function matchesPattern(value: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return value.startsWith(prefix + '.') || value === prefix;
  }
  return value === pattern;
}

/**
 * Check if any pattern in a list matches a value
 */
export function matchesAnyPattern(value: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesPattern(value, pattern));
}
