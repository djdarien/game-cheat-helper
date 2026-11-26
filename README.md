# Game Cheat Helper

A game companion for maps, guides, tips, deals, and chat. It works for any title: games on [Map Genie](https://mapgenie.io/) open their real maps and checklists, and every other name still gets guide links plus chat.

**Live target:** gamecheat.goodvibez.life

## What you can do

- Search any game. The list follows Map Genie’s maps and guide pages.
- Switch sections from the side on a computer, or the bottom bar on a phone: Map, Guides, Tips, Deals, Chat.
- Read a Map Genie map or guide in the page, or open it in a new tab.
- Chat with Groq about the game you loaded. Live guide lookup can search the web. A screenshot uses Groq’s vision model.
- Add a game Map Genie does not list, and pin a Map Genie URL when you have one.

## Groq chat

Chat needs a [Groq API key](https://console.groq.com/keys).

Locally, put `GROQ_API_KEY` in `.env` and run `npm start`. Chat then uses that key through `/api/chat`. `.env` is gitignored. Do not commit a real key.

On GitHub Pages, open **Settings** in the app and paste the key. It stays in that browser and is sent only to `api.groq.com`.

On Vercel you can set `GROQ_API_KEY` instead, so visitors do not paste a key. A public server key can be used by anyone who can open the site, which spends your Groq quota.

Guide answers use `openai/gpt-oss-120b` with Groq browser search. Fast mode uses the same model and skips live lookup. Screenshots use `qwen/qwen3.8-27b` when that model is enabled for the key.

## Add or refresh a game

In the app, use **Add any game** on the home page. That save stays in this browser.

To share a game in the repo, add an object to `data/games.json`:

```json
{
  "name": "Example Game",
  "slug": "example-game",
  "aliases": ["eg"],
  "image": "",
  "mapgenie": "https://mapgenie.io/example-game",
  "maps": [{ "name": "World", "url": "https://mapgenie.io/example-game/maps/world" }],
  "guides": [{ "name": "Quests", "url": "https://mapgenie.io/example-game/guides/quests" }]
}
```

Refresh the whole Map Genie list with:

```bash
python3 scripts/fetch-mapgenie.py
```

The script is polite and can take several minutes. It rewrites `data/games.json`.

## Develop

Serve the folder over HTTP so ES modules load. Opening `index.html` as a file will not:

```bash
python3 -m http.server 8765
```

Then open `http://127.0.0.1:8765`.

```bash
node tests/resolve.test.mjs
```

## Deploy

GitHub Pages from `main`, or Vercel. `CNAME` is `gamecheat.goodvibez.life`. The service worker is network-first, so a refresh picks up a new version.
