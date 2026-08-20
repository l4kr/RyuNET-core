import https from 'https';

const TACHI_BASE_URL = 'https://kamai.tachi.ac';

const SDVX_DIFF_TO_TYPE: Record<string, number> = {
  NOV: 0, ADV: 1, EXH: 2,
  INF: 3, GRV: 3, HVN: 3, VVD: 3, XCD: 3,
  MXM: 4, ULT: 5,
};

export interface TachiRecentPlay {
  mid: number;
  type: number;
  score: number;
  exscore: number;
  clear: number;
  grade: number;
  maxChain: number;
  critical: number;
  s_critical: number;
  near: number;
  error: number;
  early: number;
  late: number;
  timeAchieved: number | null;
}

function tachiGet(urlPath: string, token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https
      .get(`${TACHI_BASE_URL}${urlPath}`, { headers: { Authorization: `Bearer ${token}` } }, (r: any) => {
        let body = '';
        r.on('data', (c: string) => (body += c));
        r.on('end', () => {
          try { resolve(JSON.parse(body)); } catch { reject(new Error('Failed to parse Tachi response')); }
        });
      })
      .on('error', reject);
  });
}

// SDVX lamp -> local numeric clear code (kept in sync with tachi.ts /pbs mapping)
const LAMP_TO_CLEAR: Record<string, number> = {
  FAILED: 1, CLEAR: 2, 'EXCESSIVE CLEAR': 3, 'ULTIMATE CHAIN': 4,
  'PERFECT ULTIMATE CHAIN': 5, 'MAXXIVE CLEAR': 6,
};

const GRADE_MAP: Record<string, number> = {
  D: 1, C: 2, B: 3, A: 4, 'A+': 5, AA: 6, 'AA+': 7, AAA: 8, 'AAA+': 9, S: 10, PUC: 10,
};

/**
 * Fetches this user's actual last 100 SDVX plays from Tachi (not personal-bests),
 * using the same bearer token already stored for score auto-export.
 * Returns null on any failure (caller should fall back to local PB-based data).
 */
export async function getTachiRecentSdvxPlays(token: string): Promise<TachiRecentPlay[] | null> {
  try {
    const result = await tachiGet('/api/v1/users/me/games/sdvx/scores/recent', token);
    if (!result || !result.success || !result.body) return null;

    const scores: any[] = result.body.scores || [];
    const charts: any[] = result.body.charts || [];
    const songs: any[] = result.body.songs || [];

    const chartMap: Record<string, any> = {};
    for (const c of charts) chartMap[c.chartID] = c;
    const songMap: Record<number, any> = {};
    for (const s of songs) songMap[s.id] = s;

    const plays: TachiRecentPlay[] = [];
    for (const s of scores) {
      const chart = chartMap[s.chartID];
      const song = songMap[s.songID];
      if (!chart || !song) continue;

      const type = SDVX_DIFF_TO_TYPE[chart.difficulty];
      if (type === undefined) continue;

      const sd = s.scoreData || {};
      const judgements = sd.judgements || {};
      const optional = sd.optional || {};

      plays.push({
        mid: chart.data.inGameID,
        type,
        score: sd.score || 0,
        exscore: optional.exScore || 0,
        clear: LAMP_TO_CLEAR[sd.lamp] || 0,
        grade: GRADE_MAP[sd.grade] || 0,
        maxChain: optional.maxCombo || 0,
        critical: judgements.critical || 0,
        s_critical: 0,
        near: judgements.near || 0,
        error: judgements.miss || 0,
        early: optional.fast || 0,
        late: optional.slow || 0,
        timeAchieved: s.timeAchieved || null,
      });
    }

    // Tachi's "recent" endpoint isn't guaranteed sorted; enforce most-recent-first ourselves.
    plays.sort((a, b) => (b.timeAchieved || 0) - (a.timeAchieved || 0));

    return plays;
  } catch {
    return null;
  }
}
