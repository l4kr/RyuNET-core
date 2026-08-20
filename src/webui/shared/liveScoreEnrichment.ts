import { ScoreSubmitPayload } from '../../utils/ScoreEvents';
import { FindCardsByRefid, FindUserByCardNumber, FindProfile } from '../../utils/EamuseIO';
import { sdvxJacketUrl } from '../../utils/sdvx_jacket_resolver';

// Enrich the raw plugin payload with display-friendly info (song title,
// difficulty, jacket, submitting username) before pushing it to browsers or
// storing it in the in-memory live feed buffer. Shared by both the
// '/live/scores' SSE stream (live.ts) and the live feed's own recent-play
// buffer (LiveFeedStore.ts) so the two never drift out of shape.
export async function enrichScoreEvent(evt: ScoreSubmitPayload): Promise<any> {
  const enriched: any = { ...evt };

  try {
    if (evt.game === 'sdvx' && evt.mid !== undefined && evt.type !== undefined) {
      // Lazily required to avoid a circular import (profile.ts also pulls in
      // shared helpers that eventually touch this module's callers).
      const { getSdvxTitle, getSdvxDiff, loadSongDBs } = require('../routes/profile');
      loadSongDBs();
      enriched.title = getSdvxTitle(evt.mid);
      enriched.diff = getSdvxDiff(evt.mid, evt.type);
      enriched.jacketUrl = sdvxJacketUrl(evt.mid, evt.type);
    } else if (evt.game === 'iidx' && evt.mid !== undefined && evt.clid !== undefined) {
      const { getIidxTitle, getIidxDiffStr, loadSongDBs } = require('../routes/profile');
      loadSongDBs();
      enriched.title = getIidxTitle(evt.mid);
      enriched.diff = getIidxDiffStr(evt.clid);
    }
  } catch { /* best effort enrichment only */ }

  try {
    const cards = await FindCardsByRefid(evt.refid);
    if (cards && Array.isArray(cards)) {
      for (const card of cards) {
        const acct = (await FindUserByCardNumber(card.cid)) || (await FindUserByCardNumber(card.print));
        if (acct) {
          enriched.username = acct.username;
          break;
        }
      }
    }
  } catch { /* best effort enrichment only */ }

  try {
    const profile: any = await FindProfile(evt.refid);
    enriched.avatarUrl = profile?.avatarUrl ? `/uploads/${profile.avatarUrl}` : '/static/img/avatar.jpg';
  } catch { /* best effort enrichment only */ }

  return enriched;
}
