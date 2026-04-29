/**
 * ForgeZero ASCII banner — displayed on first run only.
 */

/**
 * The ForgeZero ASCII signature.
 */
export function getBanner(version: string = '0.0.0'): string {
  return `
\x1b[36m    ╔═══════════════════════════════════════════════════════╗
    ║                                                       ║
    ║   ███████╗ ██████╗ ██████╗  ██████╗ ███████╗          ║
    ║   ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝          ║
    ║   █████╗  ██║   ██║██████╔╝██║  ███╗█████╗            ║
    ║   ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝            ║
    ║   ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗          ║
    ║   ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝          ║
    ║\x1b[35m              ███████╗███████╗██████╗  ██████╗          \x1b[36m║
    ║\x1b[35m              ╚══███╔╝██╔════╝██╔══██╗██╔═══██╗         \x1b[36m║
    ║\x1b[35m                ███╔╝ █████╗  ██████╔╝██║   ██║         \x1b[36m║
    ║\x1b[35m               ███╔╝  ██╔══╝  ██╔══██╗██║   ██║         \x1b[36m║
    ║\x1b[35m              ███████╗███████╗██║  ██║╚██████╔╝         \x1b[36m║
    ║\x1b[35m              ╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝          \x1b[36m║
    ║                                                       ║
    ║\x1b[0m  Governance & Provenance for .agents/               \x1b[36m║
    ║\x1b[0m  v${version} — Sibling tool. Never touches Antigravity.  \x1b[36m║
    ║                                                       ║
    ╚═══════════════════════════════════════════════════════╝\x1b[0m
`;
}

/**
 * Return a compact version line for non-first-run invocations.
 */
export function getCompactHeader(version: string = '0.0.0'): string {
  return `\x1b[36mforge0\x1b[0m v${version} — Governance & Provenance for .agents/`;
}
