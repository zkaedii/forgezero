/**
 * Secret Scrub Engine — prevents credential leaks in forge0 share bundles.
 *
 * Default-ON denylist. Scans all files targeted for bundling.
 * Refuses to proceed if secrets detected unless --allow-secrets is passed.
 */

import { readFileSync } from 'node:fs';
import type { SecretDetection } from '../scanner/types.js';

/**
 * Default denylist patterns for secret-shaped JSON keys.
 * Matched case-insensitively against JSON key names.
 */
export const DEFAULT_SECRET_PATTERNS: string[] = [
  'api_key',
  'apikey',
  'api-key',
  'secret',
  'secret_key',
  'secretkey',
  'token',
  'access_token',
  'auth_token',
  'bearer',
  'authorization',
  'password',
  'passwd',
  'client_secret',
  'clientsecret',
  'private_key',
  'privatekey',
];

/**
 * High-entropy string detector.
 * Strings that look like API keys: 20+ alphanumeric chars, mixed case or with special chars.
 */
function isHighEntropyString(value: string): boolean {
  if (value.length < 16) return false;

  // Check for common placeholder patterns — these are NOT secrets
  const placeholders = [
    'your-api-key',
    'your_api_key',
    'xxx',
    'placeholder',
    'example',
    'change-me',
    'INSERT_',
    'TODO',
  ];
  const lowerVal = value.toLowerCase();
  if (placeholders.some((p) => lowerVal.includes(p.toLowerCase()))) {
    return false;
  }

  // Calculate character class diversity
  const hasUpper = /[A-Z]/.test(value);
  const hasLower = /[a-z]/.test(value);
  const hasDigit = /[0-9]/.test(value);
  const hasSpecial = /[^a-zA-Z0-9]/.test(value);
  const classCount = [hasUpper, hasLower, hasDigit, hasSpecial].filter(Boolean).length;

  return classCount >= 3 && value.length >= 20;
}

/**
 * Scan a file for secret-shaped content.
 *
 * For JSON/YAML/config files: flags lines where denylist patterns appear as keys.
 * For .md files: only flags lines with actual key-value assignments (not prose).
 *
 * @param filePath - Path to file to scan
 * @param denyPatterns - Key patterns to match (default: DEFAULT_SECRET_PATTERNS)
 * @returns Array of detected secrets with context
 */
export function scanFileForSecrets(
  filePath: string,
  denyPatterns: string[] = DEFAULT_SECRET_PATTERNS,
): SecretDetection[] {
  const detections: SecretDetection[] = [];

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return detections;
  }

  const isMarkdown = filePath.toLowerCase().endsWith('.md');
  const lines = content.split('\n');
  const patternsLower = denyPatterns.map((p) => p.toLowerCase());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();

    // Check for denylist key patterns
    for (const pattern of patternsLower) {
      if (!lineLower.includes(pattern)) continue;

      if (isMarkdown) {
        // MARKDOWN MODE: Only flag if the pattern appears in a key-value context,
        // not as natural language prose. This prevents false-positives on SKILL.md
        // files that discuss "use a JWT token" or "set the authorization header".
        //
        // Key-value contexts in markdown:
        //   - YAML frontmatter: "api_key: actual-value"
        //   - JSON embedded: '"api_key": "value"'
        //   - Assignment: "API_KEY=value"
        //   - Environment variable: "export SECRET_KEY=value"
        const keyValueRegex = new RegExp(
          `(?:^\\s*|["'\\s])${escapeRegex(pattern)}["']?\\s*[:=]\\s*["']?([^"'\\s,}]{4,})`,
          'i',
        );
        const kvMatch = line.match(keyValueRegex);
        if (!kvMatch) continue;

        const value = kvMatch[1];
        // Skip placeholder values
        if (isPlaceholderValue(value)) continue;

        detections.push({
          filePath,
          lineNumber: i + 1,
          matchedPattern: pattern,
          context: line.trim().substring(0, 80) + (line.trim().length > 80 ? '...' : ''),
        });
        break;
      } else {
        // CONFIG/JSON MODE: Standard detection — pattern appears anywhere on the line,
        // but must have an associated value via := assignment.
        const valueMatch = line.match(/["']?\s*[:=]\s*["']?([^"',}\s]+)/);
        const value = valueMatch?.[1] ?? '';

        // Skip if value is empty, a placeholder, or very short
        if (value.length < 4 || isPlaceholderValue(value)) {
          continue;
        }

        detections.push({
          filePath,
          lineNumber: i + 1,
          matchedPattern: pattern,
          context: line.trim().substring(0, 80) + (line.trim().length > 80 ? '...' : ''),
        });
        break; // One detection per line is enough
      }
    }

    // Also check for high-entropy strings that look like raw API keys
    const quotedStrings = line.match(/"([^"]{20,})"|'([^']{20,})'/g);
    if (quotedStrings) {
      for (const qs of quotedStrings) {
        const inner = qs.slice(1, -1);
        if (isHighEntropyString(inner)) {
          // Don't double-report if already caught by denylist
          if (!detections.some((d) => d.lineNumber === i + 1)) {
            detections.push({
              filePath,
              lineNumber: i + 1,
              matchedPattern: 'HIGH_ENTROPY_STRING',
              context: line.trim().substring(0, 80) + (line.trim().length > 80 ? '...' : ''),
            });
          }
        }
      }
    }
  }

  return detections;
}

/**
 * Check if a value looks like a placeholder, not a real secret.
 */
function isPlaceholderValue(value: string): boolean {
  const v = value.toLowerCase();
  return (
    v === 'null' ||
    v === '""' ||
    v === "''" ||
    v === 'true' ||
    v === 'false' ||
    v === 'undefined' ||
    v.includes('your-') ||
    v.includes('your_') ||
    v.includes('<your') ||
    v.includes('xxx') ||
    v.includes('placeholder') ||
    v.includes('example') ||
    v.includes('change-me') ||
    v.includes('insert_') ||
    v.includes('todo') ||
    v.length < 4
  );
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scan multiple files for secrets.
 */
export function scanFilesForSecrets(
  filePaths: string[],
  denyPatterns?: string[],
): SecretDetection[] {
  return filePaths.flatMap((fp) => scanFileForSecrets(fp, denyPatterns));
}
