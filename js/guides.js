// Direct wikis for games Map Genie often does not cover.
// Matched against the player's game name. First match wins for each pattern.
const WIKI_HINTS = [
  { test: /minecraft/, guides: [
    { name: 'Minecraft Wiki', url: 'https://minecraft.wiki/', note: 'Blocks, mobs, and tutorials' },
    { name: 'Survival tutorials', url: 'https://minecraft.wiki/w/Tutorials/Menu', note: 'Official beginner and advanced tutorials' }
  ]},
  { test: /fortnite/, guides: [
    { name: 'Fortnite Wiki', url: 'https://fortnite.fandom.com/wiki/Fortnite_Wiki', note: 'Seasons, weapons, and locations' }
  ]},
  { test: /valorant/, guides: [
    { name: 'Valorant Wiki', url: 'https://valorant.fandom.com/wiki/VALORANT_Wiki', note: 'Agents, maps, and abilities' }
  ]},
  { test: /apex legends|\bapex\b/, guides: [
    { name: 'Apex Legends Wiki', url: 'https://apexlegends.fandom.com/wiki/Apex_Legends_Wiki', note: 'Legends, weapons, and maps' }
  ]},
  { test: /league of legends|\blol\b/, guides: [
    { name: 'League of Legends Wiki', url: 'https://leagueoflegends.fandom.com/wiki/League_of_Legends_Wiki', note: 'Champions and items' }
  ]},
  { test: /stardew/, guides: [
    { name: 'Stardew Valley Wiki', url: 'https://stardewvalleywiki.com/', note: 'Villagers, bundles, and seasons' }
  ]},
  { test: /terraria/, guides: [
    { name: 'Terraria Wiki', url: 'https://terraria.wiki.gg/', note: 'Bosses, classes, and progression' }
  ]},
  { test: /hades/, guides: [
    { name: 'Hades Wiki', url: 'https://hades.fandom.com/wiki/Hades_Wiki', note: 'Boons, weapons, and keepsakes' }
  ]},
  { test: /hollow knight/, guides: [
    { name: 'Hollow Knight Wiki', url: 'https://hollowknight.wiki/', note: 'Areas, charms, and bosses' }
  ]},
  { test: /baldur.?s gate 3|\bbg3\b/, guides: [
    { name: 'BG3 Wiki', url: 'https://bg3.wiki/', note: 'Quests, builds, and approvals' }
  ]},
  { test: /zelda|tears of the kingdom|breath of the wild/, guides: [
    { name: 'Zelda Wiki', url: 'https://zelda.fandom.com/wiki/Main_Page', note: 'Shrines, quests, and items' }
  ]}
];

export function wikiHints(gameName) {
  const name = String(gameName || '');
  const found = [];
  for (const hint of WIKI_HINTS) {
    if (hint.test.test(name)) found.push(...hint.guides);
  }
  return found;
}

export function externalPack(gameName) {
  const name = gameName || 'game';
  const q = encodeURIComponent(name);
  const guide = encodeURIComponent(`${name} guide`);
  const walk = encodeURIComponent(`${name} walkthrough`);
  const codes = encodeURIComponent(`${name} cheat codes`);
  const tips = encodeURIComponent(`${name} tips`);
  return {
    guides: [
      { name: 'IGN', url: `https://www.ign.com/search?q=${guide}`, note: 'Walkthroughs and interactive maps' },
      { name: 'GameFAQs', url: `https://gamefaqs.gamespot.com/search?game=${q}`, note: 'FAQs, boards, and codes' },
      { name: 'Fandom', url: `https://www.fandom.com/search?query=${q}`, note: 'Wikis, items, and quests' },
      { name: 'StrategyWiki', url: `https://strategywiki.org/wiki/Special:Search?search=${q}`, note: 'Step-by-step pages' },
      { name: 'YouTube walkthrough', url: `https://www.youtube.com/results?search_query=${walk}`, note: 'Video guides' },
      { name: 'Reddit', url: `https://www.reddit.com/search/?q=${guide}&type=link`, note: 'Player answers' }
    ],
    tips: [
      { name: 'GameFAQs codes', url: `https://gamefaqs.gamespot.com/search?game=${codes}`, note: 'Published codes and FAQs' },
      { name: 'IGN tips', url: `https://www.ign.com/search?q=${tips}`, note: 'Beginner tips and secrets' },
      { name: 'YouTube tips', url: `https://www.youtube.com/results?search_query=${tips}`, note: 'Short trick videos' }
    ],
    deals: [
      { name: 'Steam', url: `https://store.steampowered.com/search/?term=${q}`, note: 'Official PC store' },
      { name: 'GOG', url: `https://www.gog.com/en/games?query=${q}`, note: 'DRM-free when listed' },
      { name: 'Epic Games', url: `https://store.epicgames.com/browse?q=${q}`, note: 'Epic store search' },
      { name: 'Humble', url: `https://www.humblebundle.com/store/search?search=${q}`, note: 'Store and bundles' },
      { name: 'Fanatical', url: `https://www.fanatical.com/en/search?search=${q}`, note: 'Official key seller' },
      { name: 'CDKeys', url: `https://www.cdkeys.com/?q=${q}`, note: 'Key price check' },
      { name: 'Instant Gaming', url: `https://www.instant-gaming.com/en/search/?query=${q}`, note: 'Key price check' },
      { name: 'G2A', url: `https://www.g2a.com/search?query=${q}`, note: 'Marketplace. Check seller ratings' }
    ]
  };
}
