import { dedupeByUrl, normalize, slugify } from './util.js';
import { externalPack, wikiHints } from './guides.js';

// Extra nicknames players type. Applied only when that Map Genie slug exists.
const EXTRA_ALIASES = {
  'elden-ring': ['er', 'eldenring'],
  'elden-ring-nightreign': ['nightreign'],
  'baldurs-gate-3': ['bg3', 'baldurs gate'],
  'red-dead-redemption-2': ['rdr2', 'rdr', 'red dead'],
  'cyberpunk-2077': ['cyberpunk', 'cp2077'],
  'the-legend-of-zelda-tears-of-the-kingdom': ['totk', 'tears of the kingdom', 'zelda totk'],
  'the-legend-of-zelda-breath-of-the-wild': ['botw', 'breath of the wild'],
  'grand-theft-auto-5': ['gta', 'gta 5', 'gta v', 'gtav', 'gta5'],
  'grand-theft-auto-6': ['gta 6', 'gta vi', 'gta6', 'gta vi'],
  'black-myth-wukong': ['wukong', 'black myth'],
  'clair-obscur-expedition-33': ['expedition 33', 'e33', 'clair obscur'],
  'hogwarts-legacy': ['hogwarts'],
  'god-of-war-ragnarok': ['ragnarok', 'gow ragnarok'],
  'ghost-of-tsushima': ['tsushima', 'got'],
  'stardew-valley': ['stardew'],
  'palworld': ['palworld'],
  'helldivers-2': ['helldivers'],
  'monster-hunter-wilds': ['mhwilds', 'wilds'],
  'kingdom-come-deliverance-2': ['kcd2', 'kcd 2'],
  'silksong': ['silksong', 'hk silksong']
};

export function prepareCatalog(games) {
  return (games || []).map((game) => {
    const extra = EXTRA_ALIASES[game.slug] || [];
    const aliases = [...new Set([...(game.aliases || []), ...extra].map((a) => String(a).trim()).filter(Boolean))];
    return { ...game, aliases };
  });
}

function fields(game) {
  return [game.name, game.slug.replace(/-/g, ' '), ...(game.aliases || [])];
}

function scoreField(field, query) {
  const name = normalize(field);
  if (!name || !query) return 0;
  if (name === query) return query.length < 3 ? (name.length >= 2 ? 100 : 0) : 100;
  if (query.length < 3) return 0;
  if (name.startsWith(query)) {
    const extra = name.slice(query.length).trim().split(' ').filter(Boolean).length;
    if (!extra) return 100;
    return Math.max(86, 96 - extra * 4);
  }
  if (query.startsWith(name) && name.length > 4) return 84;
  const qTokens = query.split(' ').filter(Boolean);
  const nTokens = new Set(name.split(' ').filter(Boolean));
  if (!qTokens.length) return 0;
  const hits = qTokens.filter((token) => nTokens.has(token)).length;
  if (hits === qTokens.length) return 78;
  if (name.includes(query)) return 74;
  if (hits === 0) return 0;
  const matched = qTokens.filter((token) => nTokens.has(token));
  if (matched.every((token) => /^\d+$/.test(token))) return 0;
  return Math.round(36 + (40 * hits) / qTokens.length);
}

export function scoreGame(game, query) {
  const q = normalize(query);
  let best = 0;
  for (const field of fields(game)) {
    best = Math.max(best, scoreField(field, q));
  }
  return best;
}

export function rankGames(catalog, query, limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  const ranked = [];
  for (const game of catalog) {
    const score = scoreGame(game, q);
    if (score > 0) ranked.push({ game, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.game.name.localeCompare(b.game.name));
  return ranked.slice(0, limit);
}

export function shouldAutoPick(ranked) {
  if (!ranked.length || ranked[0].score < 92) return false;
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 4) return false;
  return true;
}

function mapHubFromUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('mapgenie.io')) return url;
    const slug = parsed.pathname.split('/').filter(Boolean)[0];
    return slug ? `https://mapgenie.io/${slug}` : url;
  } catch {
    return '';
  }
}

export function withLinks(profile) {
  const pack = externalPack(profile.name);
  return {
    ...profile,
    guides: dedupeByUrl([...wikiHints(profile.name), ...pack.guides]),
    tips: dedupeByUrl(pack.tips),
    deals: dedupeByUrl(pack.deals),
    maps: dedupeByUrl(profile.maps || []),
    mapGuides: dedupeByUrl(profile.mapGuides || [])
  };
}

export function profileFromCatalog(game, override) {
  const maps = override?.maps?.length ? override.maps : (game.maps || []);
  const mapGuides = override?.mapGuides?.length ? override.mapGuides : (game.guides || []);
  return withLinks({
    kind: 'g',
    id: game.slug,
    name: game.name,
    image: game.image || '',
    mapgenie: override?.mapgenie || game.mapgenie || '',
    maps,
    mapGuides,
    source: 'mapgenie'
  });
}

export function profileFromCustom(entry) {
  const rawUrl = String(entry.mapgenieUrl || '').trim();
  const hub = mapHubFromUrl(rawUrl);
  const maps = /\/maps\//.test(rawUrl) ? [{ name: entry.mapName || 'Interactive map', url: rawUrl }] : [];
  return withLinks({
    kind: 'c',
    id: entry.id,
    name: entry.name,
    image: '',
    mapgenie: hub,
    maps,
    mapGuides: [],
    source: 'custom'
  });
}

export function genericProfile(name) {
  const clean = String(name || '').trim();
  return profileFromCustom({
    id: `free-${slugify(clean) || 'game'}`,
    name: clean,
    mapgenieUrl: ''
  });
}

export function newCustomId(name) {
  const base = slugify(name) || 'game';
  return `${base}-${Date.now().toString(36)}`;
}
