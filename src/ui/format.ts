/**
 * Terminal formatting utilities for ForgeZero.
 * Respects NO_COLOR environment variable.
 */

const NO_COLOR = !!process.env['NO_COLOR'];

function color(code: string, text: string): string {
  if (NO_COLOR) return text;
  return `\x1b[${code}m${text}\x1b[0m`;
}

export const fmt = {
  cyan: (t: string) => color('36', t),
  green: (t: string) => color('32', t),
  red: (t: string) => color('31', t),
  yellow: (t: string) => color('33', t),
  magenta: (t: string) => color('35', t),
  bold: (t: string) => color('1', t),
  dim: (t: string) => color('2', t),
  redBold: (t: string) => color('1;31', t),
  greenBold: (t: string) => color('1;32', t),
  cyanBold: (t: string) => color('1;36', t),
  magentaBold: (t: string) => color('1;35', t),
};

/**
 * Format a change type with appropriate color.
 */
export function formatChangeType(changeType: string): string {
  switch (changeType) {
    case 'Added':
      return fmt.green('+ Added');
    case 'Modified':
      return fmt.yellow('~ Modified');
    case 'Deleted':
      return fmt.red('- Deleted');
    case 'Renamed':
      return fmt.magenta('→ Renamed');
    default:
      return changeType;
  }
}

/**
 * Format a confidence level.
 */
export function formatConfidence(confidence: string): string {
  return fmt.yellow(`[${confidence}]`);
}

/**
 * Print a section header.
 */
export function sectionHeader(title: string): string {
  return `\n${fmt.cyanBold('━'.repeat(60))}\n${fmt.cyanBold(title)}\n${fmt.cyanBold('━'.repeat(60))}`;
}
