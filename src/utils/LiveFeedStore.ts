import fs from 'fs';
import path from 'path';
import { ScoreEventBus, ScoreSubmitPayload } from './ScoreEvents';
import { enrichScoreEvent } from '../webui/shared/liveScoreEnrichment';
import { Logger } from './Logger';
import { SAVE_PATH } from './EamuseIO';

// In-memory, process-lifetime buffer of the most recent SDVX plays across all
// players, used to seed the site-wide "Live Feed" page's initial render.
//
// The previous PB-collection-based approach showed each player's all-time
// best score/exscore instead of what they actually just played (since that's
// all a "personal best" collection can ever store). Keeping a rolling buffer
// of the raw per-play events (the same accurate data already pushed live over
// SSE) is enough to make the initial page load accurate too.
//
// This buffer is also persisted to a plain JSON file under savedata/ on every
// update, and reloaded from that file on startup, so a server restart/deploy
// doesn't lose the feed. Kept deliberately simple (one small flat file, no
// database) since this is just a rolling cache, not a source of truth --
// Tachi/the plugin DBs remain that.
const MAX_ENTRIES = 100;
const LIVEFEED_FILE = path.join(SAVE_PATH, 'livefeed.json');

let buffer: any[] = []; // stored most-recent-first
let initialized = false;
let writeQueued = false;

function loadFromDisk() {
  try {
    if (!fs.existsSync(LIVEFEED_FILE)) return;
    const raw = fs.readFileSync(LIVEFEED_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      buffer = parsed.slice(0, MAX_ENTRIES);
    }
  } catch (err: any) {
    Logger.error(`[LiveFeedStore] Failed to load ${LIVEFEED_FILE}: ${err?.stack || err?.message || String(err)}`);
  }
}

function persistToDisk() {
  // Coalesce bursts of plays (e.g. multiple cabs saving at once) into a
  // single write on the next tick instead of one fs write per play.
  if (writeQueued) return;
  writeQueued = true;
  setImmediate(() => {
    writeQueued = false;
    try {
      if (!fs.existsSync(SAVE_PATH)) fs.mkdirSync(SAVE_PATH, { recursive: true });
      fs.writeFile(LIVEFEED_FILE, JSON.stringify(buffer), (err) => {
        if (err) Logger.error(`[LiveFeedStore] Failed to save ${LIVEFEED_FILE}: ${err.message}`);
      });
    } catch (err: any) {
      Logger.error(`[LiveFeedStore] Failed to save ${LIVEFEED_FILE}: ${err?.stack || err?.message || String(err)}`);
    }
  });
}

export function initLiveFeedStore() {
  if (initialized) return;
  initialized = true;

  loadFromDisk();

  ScoreEventBus.on('score', (evt: ScoreSubmitPayload) => {
    // The live feed only renders SDVX-shaped cards (judgement breakdown,
    // volforce-adjacent fields, etc) for now.
    if (evt.game !== 'sdvx') return;

    enrichScoreEvent(evt)
      .then(enriched => {
        buffer.unshift({ ...enriched, timestamp: evt.timestamp || Date.now() });
        if (buffer.length > MAX_ENTRIES) buffer.length = MAX_ENTRIES;
        persistToDisk();
      })
      .catch(err => {
        Logger.error(`[LiveFeedStore] Failed to record play: ${err?.stack || err?.message || String(err)}`);
      });
  });
}

export function getLiveFeedEntries(limit: number = MAX_ENTRIES): any[] {
  return buffer.slice(0, limit);
}
