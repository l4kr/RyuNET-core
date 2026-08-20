import { ScoreEventBus, ScoreSubmitPayload } from './ScoreEvents';
import { enrichScoreEvent } from '../webui/shared/liveScoreEnrichment';
import { Logger } from './Logger';

// In-memory, process-lifetime buffer of the most recent SDVX plays across all
// players, used to seed the site-wide "Live Feed" page's initial render.
//
// Deliberately NOT backed by a database: the previous PB-collection-based
// approach showed each player's all-time best score/exscore instead of what
// they actually just played (since that's all a "personal best" collection
// can ever store). Keeping a small rolling buffer of the raw per-play events
// (the same accurate data already pushed live over SSE) is enough to make
// the initial page load accurate too, without adding a new persisted store.
//
// Trade-off: this buffer is empty after every server restart/deploy — there
// is no history before the process started. That's expected, not a bug.
const MAX_ENTRIES = 100;
const buffer: any[] = []; // stored most-recent-first

let initialized = false;

export function initLiveFeedStore() {
  if (initialized) return;
  initialized = true;

  ScoreEventBus.on('score', (evt: ScoreSubmitPayload) => {
    // The live feed only renders SDVX-shaped cards (judgement breakdown,
    // volforce-adjacent fields, etc) for now.
    if (evt.game !== 'sdvx') return;

    enrichScoreEvent(evt)
      .then(enriched => {
        buffer.unshift({ ...enriched, timestamp: evt.timestamp || Date.now() });
        if (buffer.length > MAX_ENTRIES) buffer.length = MAX_ENTRIES;
      })
      .catch(err => {
        Logger.error(`[LiveFeedStore] Failed to record play: ${err?.stack || err?.message || String(err)}`);
      });
  });
}

export function getLiveFeedEntries(limit: number = MAX_ENTRIES): any[] {
  return buffer.slice(0, limit);
}
