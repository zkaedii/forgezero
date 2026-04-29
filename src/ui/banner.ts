/**
 * ForgeZero ASCII banner — displayed on first run only.
 */

/**
 * The ForgeZero ASCII signature.
 */
export function getBanner(): string {
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
    ║\x1b[0m  v0.1.0 — Sibling tool. Never touches Antigravity.  \x1b[36m║
    ║                                                       ║
    ╚═══════════════════════════════════════════════════════╝\x1b[0m
`;
}

/**
 * Return a compact version line for non-first-run invocations.
 */
export function getCompactHeader(): string {
  return '\x1b[36mforge0\x1b[0m v0.1.0 — Governance & Provenance for .agents/';
}
