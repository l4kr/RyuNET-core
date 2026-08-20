import { Router } from 'express';
import { GetProfiles } from '../../utils/EamuseIO';
import { data } from '../shared/helpers';
import { getLiveFeedEntries } from '../../utils/LiveFeedStore';
import { wrap } from '../shared/middleware';

export const livefeedRouter = Router();

function timeAgo(date: any) {
  if (!date) return 'Unknown';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return interval + ' year' + (interval === 1 ? '' : 's') + ' ago';
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return interval + ' month' + (interval === 1 ? '' : 's') + ' ago';
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return interval + ' day' + (interval === 1 ? '' : 's') + ' ago';
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return interval + ' hour' + (interval === 1 ? '' : 's') + ' ago';
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return interval + ' minute' + (interval === 1 ? '' : 's') + ' ago';
  return Math.floor(seconds) + ' seconds ago';
}

// Site-wide feed of the 100 most recent SDVX plays, across every player,
// sorted most-recent-first. Backed by an in-memory buffer (LiveFeedStore)
// fed straight from the same raw per-play events broadcast over the
// '/live/scores' SSE stream — NOT the plugin's personal-best collection, so
// score/exscore here are what was actually just played, not a player's
// all-time best. The buffer only holds plays recorded since this process
// started; it does not backfill from history on a fresh restart.
livefeedRouter.get('/live-feed', wrap(async (req, res, next) => {
  const allProfiles = (await GetProfiles()) || [];
  const profileMap = new Map(allProfiles.map((p: any) => [String(p.__refid), p]));

  const plays = getLiveFeedEntries(100)
    .filter((play: any) => {
      const p: any = profileMap.get(String(play.refid));
      return !p?.isPrivate;
    })
    .map((play: any) => ({
      ...play,
      dateStr: timeAgo(play.timestamp),
    }));

  return res.render('livefeed', data(req, 'Live Feed', 'core', { plays }));
}));

export default livefeedRouter;
