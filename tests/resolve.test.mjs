import assert from 'node:assert/strict';
import { prepareCatalog, profileFromCatalog, rankGames, scoreGame, shouldAutoPick } from '../js/resolve.js';

const catalog = prepareCatalog([
  {
    name: 'Elden Ring',
    slug: 'elden-ring',
    aliases: [],
    mapgenie: 'https://mapgenie.io/elden-ring',
    maps: [{ name: 'The Lands Between', url: 'https://mapgenie.io/elden-ring/maps/the-lands-between' }],
    guides: [{ name: 'Quests', url: 'https://mapgenie.io/elden-ring/guides/quests' }]
  },
  {
    name: 'Grand Theft Auto 6',
    slug: 'grand-theft-auto-6',
    aliases: ['gta', 'gta 6'],
    mapgenie: 'https://mapgenie.io/grand-theft-auto-6',
    maps: [],
    guides: []
  },
  {
    name: 'Grand Theft Auto V',
    slug: 'grand-theft-auto-5',
    aliases: ['gta', 'gta 5'],
    mapgenie: 'https://mapgenie.io/grand-theft-auto-5',
    maps: [],
    guides: []
  }
]);

const elden = rankGames(catalog, 'elden');
assert.equal(elden[0].game.slug, 'elden-ring');
assert.equal(shouldAutoPick(elden), true);

const gta = rankGames(catalog, 'gta');
assert.equal(shouldAutoPick(gta), false, 'shared nickname should not auto-pick');
assert.ok(gta.filter((row) => row.score === 100).length >= 2);

assert.equal(scoreGame(catalog[1], 'gta 6'), 100);
assert.equal(rankGames(catalog, 'a').length, 0);

const profile = profileFromCatalog(catalog[0]);
assert.equal(profile.maps.length, 1);
assert.ok(profile.guides.some((guide) => guide.url.includes('ign.com')));
assert.ok(profile.mapGuides.some((guide) => guide.name === 'Quests'));
assert.ok(profile.deals.some((deal) => deal.name === 'Steam'));

console.log('resolve tests passed');
