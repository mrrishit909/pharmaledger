// Reviewer notes and decisions: a separate, bounded layer keyed by finding ID.
// It never writes into the frozen report. Layers are immutable; setters return new layers.
import { LIMITS } from './schema.js';

export const DECISIONS = Object.freeze(['unreviewed', 'confirmed-exception', 'explained-no-action', 'escalated']);

export function createReviewLayer() {
  return Object.freeze({ notes: new Map(), decisions: new Map() });
}

function findingExists(report, findingId) {
  return Array.isArray(report?.findings) && report.findings.some((f) => f.findingId === findingId);
}

export function setNote(layer, report, findingId, text) {
  if (!findingExists(report, findingId)) {
    return { ok: false, error: { code: 'UNKNOWN_FINDING', path: 'findingId', message: 'note must target an existing finding' } };
  }
  if (typeof text !== 'string') {
    return { ok: false, error: { code: 'WRONG_TYPE', path: 'text', message: 'note must be a string' } };
  }
  if (text.length > LIMITS.maxNoteLength) {
    return { ok: false, error: { code: 'NOTE_TOO_LONG', path: 'text', message: `note exceeds ${LIMITS.maxNoteLength} characters` } };
  }
  const notes = new Map(layer.notes);
  if (text.length === 0) notes.delete(findingId); else notes.set(findingId, text);
  return { ok: true, layer: Object.freeze({ notes, decisions: new Map(layer.decisions) }) };
}

export function setDecision(layer, report, findingId, decision) {
  if (!findingExists(report, findingId)) {
    return { ok: false, error: { code: 'UNKNOWN_FINDING', path: 'findingId', message: 'decision must target an existing finding' } };
  }
  if (!DECISIONS.includes(decision)) {
    return { ok: false, error: { code: 'INVALID_ENUM', path: 'decision', message: `decision must be one of ${DECISIONS.join('|')}` } };
  }
  const decisions = new Map(layer.decisions);
  if (decision === 'unreviewed') decisions.delete(findingId); else decisions.set(findingId, decision);
  return { ok: true, layer: Object.freeze({ notes: new Map(layer.notes), decisions }) };
}
