import { EventEmitter } from 'events';

/**
 * Payload broadcast whenever a game plugin saves a score. Kept intentionally
 * loose/`any`-friendly since different games report wildly different stats.
 */
export interface ScoreSubmitPayload {
  /** Plugin identifier, e.g. "sdvx", "iidx" (the "@asphyxia" suffix is stripped). */
  game: string;
  /** Profile refid the score belongs to. */
  refid: string;
  /** Chart identifiers, when applicable. */
  mid?: number | string;
  type?: number | string;
  /** Whether this play set a new personal best (on score, ex-score, etc). */
  isNewBest?: boolean;
  /** Epoch ms the event was recorded. Filled in automatically if omitted. */
  timestamp?: number;
  [key: string]: any;
}

/**
 * Process-wide event bus used to broadcast score submissions in real time.
 * Game plugins run in the same Node process as the core (see
 * ExternalPluginLoader), so a single shared EventEmitter is enough to bridge
 * "a score was just saved" to any number of SSE listeners in the WebUI.
 */
class ScoreEventBusImpl extends EventEmitter {}

export const ScoreEventBus = new ScoreEventBusImpl();
// Many concurrent WebUI tabs/viewers may subscribe (one listener per SSE
// connection), so don't warn about "possible EventEmitter memory leak".
ScoreEventBus.setMaxListeners(0);

export function emitScoreSubmit(payload: ScoreSubmitPayload) {
  const event: ScoreSubmitPayload = { timestamp: Date.now(), ...payload };
  ScoreEventBus.emit('score', event);
}
