import { Router } from 'express';
import { ScoreEventBus, ScoreSubmitPayload } from '../../utils/ScoreEvents';
import { enrichScoreEvent } from '../shared/liveScoreEnrichment';

export const liveRouter = Router();

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
