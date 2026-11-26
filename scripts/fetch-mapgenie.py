#!/usr/bin/env python3
"""Refresh data/games.json from public Map Genie pages.

Map Genie rate-limits bursts, so this walks game pages slowly.
"""

import html
import json
import re
import subprocess
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'games.json'
HOME = 'https://mapgenie.io/'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
STOP_ALIASES = {'a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to'}


def slug_from_title(value):
    text = html.unescape(value).lower().replace("'", '').replace('’', '')
    text = text.replace('&', ' and ')
    text = re.sub(r'[^a-z0-9]+', '-', text).strip('-')
    return text[:80]


def aliases_from_search(search):
    """Nicknames live after a double space. Keep the tail plus short codes."""
    text = html.unescape(search).strip().lower()
    parts = re.split(r'\s{2,}', text)
    if len(parts) < 2:
        return []
    title_tokens = set(re.findall(r'[a-z0-9]+', parts[0]))
    tail = re.sub(r'\s+', ' ', parts[1]).strip()
    if not tail:
        return []
    found = [tail] if ' ' in tail else []
    for token in tail.split(' '):
        tok = token.strip('.,:;')
        if len(tok) < 2 or tok in STOP_ALIASES or tok.isdigit():
            continue
        has_letter = bool(re.search(r'[a-z]', tok))
        has_digit = bool(re.search(r'\d', tok))
        if not has_letter:
            continue
        if tok in title_tokens and not has_digit:
            continue
        if has_digit and len(tok) <= 12:
            found.append(tok)
        elif not has_digit and (len(tok) <= 5 or len(tail.split(' ')) == 1):
            found.append(tok)
    deduped = []
    seen = set()
    for alias in found:
        if alias in seen:
            continue
        seen.add(alias)
        deduped.append(alias)
    return deduped


def fetch(url):
    result = subprocess.run(
        ['curl', '-sL', '-A', UA, '--max-time', '40', '-w', '\n%{http_code}', url],
        capture_output=True,
        check=False,
    )
    raw = result.stdout.decode('utf-8', 'replace')
    page, code = raw.rsplit('\n', 1)
    return code.strip(), page


def parse_cards(markup):
    games = []
    seen = set()
    starts = [match.start() for match in re.finditer(r'<div\b[^>]*class="[^"]*game-card-wrapper', markup)]
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else start + 5000
        block = markup[start:end]
        search_match = re.search(r'data-search-content="([^"]*)"', block)
        href_match = re.search(r'href="(https://[^"#?\s]+)"', block)
        image_match = re.search(r'<img[^>]*src="([^"]+)"', block)
        title_match = re.search(r'<h4 class="card-title">([^<]+)</h4>', block)
        if not (search_match and href_match and image_match and title_match):
            continue
        href = href_match.group(1)
        title = html.unescape(title_match.group(1)).strip()
        host = re.search(r'https://([^/]+)', href)
        host = host.group(1) if host else ''
        if host == 'mapgenie.io' or host.endswith('.mapgenie.io'):
            slug = href.replace('https://mapgenie.io/', '').strip('/').split('/')[0]
            hub = f'https://mapgenie.io/{slug}'
        else:
            slug = slug_from_title(title)
            hub = href
        if not slug or slug in seen:
            continue
        seen.add(slug)
        maps = []
        if '/maps/' in href or not hub.startswith('https://mapgenie.io/'):
            segment = href.rstrip('/').rsplit('/', 1)[-1].replace('-', ' ').title()
            maps.append({'name': title if not hub.startswith('https://mapgenie.io/') else (segment or title), 'url': href})
        games.append({
            'name': title,
            'slug': slug,
            'aliases': aliases_from_search(search_match.group(1)),
            'image': image_match.group(1),
            'mapgenie': hub,
            'maps': maps,
            'guides': [],
        })
    return games


def parse_page(slug, page):
    maps = []
    seen_maps = set()
    for href, alt in re.findall(
        r'href="(https://mapgenie.io/' + re.escape(slug) + r'/maps/[^"#?]+)"[\s\S]{0,600}?alt="([^"]*)"',
        page,
    ):
        if href in seen_maps:
            continue
        seen_maps.add(href)
        name = html.unescape(re.sub(r'\s*Map Image$', '', alt)).strip() or href.rsplit('/', 1)[-1].replace('-', ' ').title()
        maps.append({'name': name, 'url': href})
    guides = []
    seen_guides = set()
    for href, name in re.findall(
        r'href="(https://mapgenie.io/' + re.escape(slug) + r'/(?:guides|checklists|checklist)[^"#?]*)"[\s\S]{0,400}?guide-title">([^<]+)',
        page,
    ):
        href = href.rstrip('/')
        if href in seen_guides:
            continue
        seen_guides.add(href)
        guides.append({'name': html.unescape(name).strip(), 'url': href})
    return maps, guides


def main():
    code, markup = fetch(HOME)
    if code != '200':
        raise SystemExit(f'Could not load Map Genie home ({code})')
    games = parse_cards(markup)
    if len(games) < 50:
        raise SystemExit(f'Only found {len(games)} games. The homepage markup may have changed.')
    pending = list(games)
    for _pass in range(4):
        if not pending:
            break
        still = []
        for index, game in enumerate(pending, 1):
            status, page = fetch(game['mapgenie'])
            if status == '200':
                maps, guides = parse_page(game['slug'], page)
                if maps:
                    game['maps'] = maps
                elif not game['maps']:
                    canonical = re.search(r'property="og:url" content="(https://mapgenie.io/[^"]+/maps/[^"]+)"', page)
                    if canonical:
                        url = canonical.group(1).split('?')[0]
                        segment = url.rstrip('/').rsplit('/', 1)[-1].replace('-', ' ').title()
                        game['maps'] = [{'name': segment, 'url': url}]
                game['guides'] = guides or game['guides']
                time.sleep(0.35)
            else:
                still.append(game)
                time.sleep(2.5 if status == '429' else 0.4)
            if index % 25 == 0:
                print(f'{index}/{len(pending)} this pass', flush=True)
        pending = still
        print(f'remaining {len(pending)}', flush=True)
        time.sleep(5)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'source': 'https://mapgenie.io',
        'fetched': time.strftime('%Y-%m-%d'),
        'games': games,
    }
    OUT.write_text(json.dumps(payload, indent=2) + '\n')
    with_maps = sum(1 for game in games if game['maps'])
    with_guides = sum(1 for game in games if game['guides'])
    print(f'wrote {OUT} games={len(games)} maps={with_maps} guides={with_guides} unresolved={len(pending)}')


if __name__ == '__main__':
    main()
