import { Router } from 'express';
import { APIFind, FindCardsByRefid, FindUserByCardNumber, GetProfiles } from '../../utils/EamuseIO';
import { ROOT_CONTAINER } from '../../eamuse/index';
import { data } from '../shared/helpers';
import { getSdvxTitle, getSdvxDiff } from './profile';
import { sdvxJacketUrl } from '../../utils/sdvx_jacket_resolver';
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
// sorted most-recent-first. Populated on initial load from the DB, then kept
// live via the same '/live/scores' SSE stream / 'live-score' window event
// that powers the toast notifications and the profile page's own feed.
livefeedRouter.get('/live-feed', wrap(async (req, res, next) => {
  const plugin = ROOT_CONTAINER.getPluginByID('sdvx@asphyxia');
  if (!plugin) return next();

  const docs = await APIFind({ identifier: plugin.Identifier, core: true }, null, { collection: 'music' });

  const allProfiles = (await GetProfiles()) || [];
  const profileMap = new Map(allProfiles.map((p: any) => [String(p.__refid), p]));

  const musicDocs = (docs || []).filter((d: any) => d.mid != null && d.type != null && d.updatedAt);

  const recent = [...musicDocs]
    .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .filter((d: any) => {
      const p: any = profileMap.get(String(d.__refid));
      return !p?.isPrivate;
    })
    .slice(0, 100);

  // Resolve usernames (best effort, same approach as the SSE enrichment in live.ts)
  const usernameCache = new Map<string, string>();
  async function resolveUsername(refid: string): Promise<string> {
    if (usernameCache.has(refid)) return usernameCache.get(refid)!;
    let username = (profileMap.get(String(refid)) as any)?.name || 'Unknown';
    try {
      const cards = await FindCardsByRefid(refid);
      if (cards && Array.isArray(cards)) {
        for (const card of cards) {
          const acct = (await FindUserByCardNumber(card.cid)) || (await FindUserByCardNumber(card.print));
          if (acct) {
            username = acct.username;
            break;
          }
        }
      }
    } catch { /* best effort */ }
    usernameCache.set(refid, username);
    return username;
  }

  const plays = await Promise.all(
    recent.map(async (play: any) => {
      const profile: any = profileMap.get(String(play.__refid));
      return {
        refid: play.__refid,
        username: await resolveUsername(play.__refid),
        avatarUrl: profile?.avatarUrl ? `/uploads/${profile.avatarUrl}` : '/static/img/avatar.jpg',
        title: getSdvxTitle(play.mid),
        diff: getSdvxDiff(play.mid, play.type),
        jacketUrl: sdvxJacketUrl(play.mid, play.type),
        score: play.score || 0,
        exscore: play.exscore || 0,
        clear: play.clear || 0,
        grade: play.grade || 0,
        maxChain: play.maxChain || 0,
        critical: play.critical || 0,
        s_critical: play.s_critical || play.just || 0,
        near: play.near || 0,
        error: play.error || 0,
        early: play.early || 0,
        late: play.late || 0,
        dateStr: timeAgo(play.updatedAt),
      };
    })
  );

  return res.render('livefeed', data(req, 'Live Feed', 'core', { plays }));
}));

export default livefeedRouter;
