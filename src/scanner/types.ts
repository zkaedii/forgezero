/**
 * ForgeZero Scanner Type Definitions
 *
 * All types for parsed .agents/ extension surfaces and ~/.gemini/antigravity/ data.
 */

// ─── Skill Surface ──────────────────────────────────────────────────

export interface SkillFrontmatter {
  name: string;
  description: string;
  [key: string]: unknown;
}

export interface ParsedSkill {
  filePath: string;
  frontmatter: SkillFrontmatter;
  bodyMarkdown: string;
  /** SHA-256 of the full file content */
  contentHash: string;
}

// ─── Rule Surface ───────────────────────────────────────────────────

export type RuleActivation = 'Manual' | 'Always-On' | 'Model-Decision' | 'Glob' | 'Unknown';

export interface ParsedRule {
  filePath: string;
  name: string;
  activation: RuleActivation;
  bodyMarkdown: string;
  contentHash: string;
}

// ─── Knowledge Item ─────────────────────────────────────────────────

export interface KIMetadata {
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
  references: string[];
  artifacts: string[];
}

export interface ParsedKI {
  dirPath: string;
  slug: string;
  metadata: KIMetadata;
  contentHash: string;
}

// ─── Brain / Conversation Provenance ────────────────────────────────

export interface ToolCall {
  name: string;
  args: Record<string, string>;
}

export interface OverviewStep {
  step_index: number;
  source: 'MODEL' | 'USER_EXPLICIT' | string;
  type: 'PLANNER_RESPONSE' | 'USER_INPUT' | string;
  status: string;
  created_at: string;
  content?: string;
  tool_calls?: ToolCall[];
}

/**
 * Detection confidence level for provenance signals.
 *
 * DETECTED_WHEN_EXPLICIT: The agent explicitly loaded this resource via a tool call.
 *   We can prove it was loaded, but absence does NOT prove it wasn't considered.
 *   Skills available in the system prompt but never explicitly read leave no trace.
 */
export type DetectionConfidence = 'DETECTED_WHEN_EXPLICIT';

export interface ProvenanceSkillRef {
  skillName: string;
  skillPath: string;
  stepIndex: number;
  timestamp: string;
  confidence: DetectionConfidence;
}

export interface ProvenanceKIRef {
  kiSlug: string;
  kiPath: string;
  stepIndex: number;
  timestamp: string;
  confidence: DetectionConfidence;
}

export interface ProvenanceArtifactRef {
  artifactPath: string;
  stepIndex: number;
  timestamp: string;
}

export interface ProvenanceReport {
  conversationId: string;
  scannedAt: string;
  skillsLoaded: ProvenanceSkillRef[];
  kisReferenced: ProvenanceKIRef[];
  artifactsProduced: ProvenanceArtifactRef[];
  totalSteps: number;
  /** Honest caveat about detection boundaries */
  caveat: string;
}

// ─── Audit ──────────────────────────────────────────────────────────

export type ChangeType = 'Added' | 'Modified' | 'Deleted' | 'Renamed';

export interface AuditEntry {
  filePath: string;
  changeType: ChangeType;
  surfaceType: 'Skill' | 'Rule' | 'Workflow' | 'MCP' | 'Permission' | 'Unknown' | '[META]' | 'Skill [META]';
  /** Semantic description of what changed (e.g., "activation mode: Model-Decision → Always-On") */
  semanticDiff?: string;
}

export interface AuditReport {
  scannedAt: string;
  gitRef: string;
  entries: AuditEntry[];
  totalChanges: number;
  /** Whether git was available and the workspace is a git repo */
  gitAvailable: boolean;
  /** Honest caveat about audit scope boundaries */
  caveat: string;
}

// ─── Share / Bundle ─────────────────────────────────────────────────

export interface BundleManifest {
  version: string;
  tag: string;
  createdAt: string;
  createdBy: string;
  sha256Checksums: Record<string, string>;
  fileCount: number;
  secretsScrubbed: boolean;
}

// ─── Secret Scrub ───────────────────────────────────────────────────

export interface SecretDetection {
  filePath: string;
  lineNumber: number;
  matchedPattern: string;
  context: string;
}

// ─── Config ─────────────────────────────────────────────────────────

export interface ForgeZeroConfig {
  antigravityDataRoot: string;
  agentsSurfacePaths: string[];
  firstRunComplete: boolean;
  secretDenyPatterns: string[];
  defaultBundleTagPrefix: string;
  auditDepth: number;
}
