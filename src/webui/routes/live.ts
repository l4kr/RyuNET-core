import { Router } from 'express';
import { ScoreEventBus, ScoreSubmitPayload } from '../../utils/ScoreEvents';
import { FindCardsByRefid, FindUserByCardNumber, FindProfile } from '../../utils/EamuseIO';
import { sdvxJacketUrl } from '../../utils/sdvx_jacket_resolver';

export const liveRouter = Router();

// Enrich the raw plugin payload with display-friendly info (song title,
// difficulty, jacket, submitting username) before pushing it to browsers.
async function enrichScoreEvent(evt: ScoreSubmitPayload): Promise<any> {
  const enriched: any = { ...evt };

  try {
    if (evt.game === 'sdvx' && evt.mid !== undefined && evt.type !== undefined) {
      // Lazily required to avoid a circular import (profile.ts also pulls in
      // shared helpers that eventually touch this router's mount point).
      const { getSdvxTitle, getSdvxDiff } = require('./profile');
      enriched.title = getSdvxTitle(evt.mid);
      enriched.diff = getSdvxDiff(evt.mid, evt.type);
      enriched.jacketUrl = sdvxJacketUrl(evt.mid, evt.type);
    } else if (evt.game === 'iidx' && evt.mid !== undefined && evt.clid !== undefined) {
      const { getIidxTitle, getIidxDiffStr } = require('./profile');
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

// Server-Sent Events stream of scores as they're submitted, in real time.
// Public (mounted before auth middleware) so the live feed works for guests
// browsing the leaderboard too.
liveRouter.get('/live/scores', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering if proxied
  (res as any).flushHeaders?.();

  res.write('retry: 5000\n\n');

  // Keep intermediary proxies/load balancers from timing out idle connections.
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  const listener = (evt: ScoreSubmitPayload) => {
    enrichScoreEvent(evt)
      .then(payload => {
        res.write(`event: score\ndata: ${JSON.stringify(payload)}\n\n`);
      })
      .catch(() => { /* drop malformed events rather than killing the stream */ });
  };

  ScoreEventBus.on('score', listener);

  req.on('close', () => {
    clearInterval(heartbeat);
    ScoreEventBus.off('score', listener);
  });
});

export default liveRouter;
