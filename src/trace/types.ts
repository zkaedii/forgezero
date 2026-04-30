export type TraceTag =
  | 'NOT_OBSERVED'
  | 'TRACE_INTEGRITY_FAILURE'
  | 'MODE_MISMATCH'
  | 'SCOPE_EXCEEDED_MODE'
  | 'DIVERGENT_FROM_DISK'
  | 'AGENT_DUMP_PARTIAL'
  | 'CORROBORATED_VIA_DISK'
  | 'DETECTED_VIA_AGENT_REPORT';

/**
 * Tag precedence order (first match wins):
 * NOT_OBSERVED → TRACE_INTEGRITY_FAILURE → MODE_MISMATCH →
 * SCOPE_EXCEEDED_MODE → DIVERGENT_FROM_DISK → AGENT_DUMP_PARTIAL →
 * CORROBORATED_VIA_DISK → DETECTED_VIA_AGENT_REPORT
 */

export interface TraceResult {
  session_id: string;
  tag: TraceTag;
  exit_code: number;
  detail: string;
  payload?: Record<string, unknown>;
  honesty: {
    claim: string;
    verified: string[];
    notObservable: string[];
  };
}
