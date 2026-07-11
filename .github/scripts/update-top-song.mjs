// Fetches your #1 most-played track over the last 7 days from Last.fm,
// grabs its album cover, and rewrites the block between the TOP_SONG
// markers in README.md as a cover-image + text layout.
//
// Requires two env vars (set by the workflow):
//   LASTFM_USERNAME - your Last.fm username
//   LASTFM_API_KEY  - a Last.fm API key (stored as a repo secret)

import { readFile, writeFile } from 'node:fs/promises';

const USER = process.env.LASTFM_USERNAME;
const KEY = process.env.LASTFM_API_KEY;
const README = 'README.md';
const START = '<!-- TOP_SONG:START -->';
const END = '<!-- TOP_SONG:END -->';
const API = 'https://ws.audioscrobbler.com/2.0/';
const COVER_SIZE = 96; // px

if (!USER || !KEY) {
  console.error('Missing LASTFM_USERNAME or LASTFM_API_KEY env vars.');
  process.exit(1);
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function lastfm(params) {
  const url = `${API}?${new URLSearchParams({ ...params, api_key: KEY, format: 'json' })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (data.error) throw new Error(`Last.fm error ${data.error}: ${data.message}`);
  return data;
}

// Pick the largest non-empty image URL from a Last.fm image array.
function pickCover(images) {
  if (!Array.isArray(images)) return null;
  const order = ['extralarge', 'large', 'medium', 'small'];
  for (const size of order) {
    const hit = images.find((i) => i.size === size && i['#text']);
    if (hit) return hit['#text'];
  }
  const any = images.find((i) => i['#text']);
  return any ? any['#text'] : null;
}

function buildBlock({ name, artist, url, plays, cover }) {
  const coverCell = cover
    ? `<td width="${COVER_SIZE + 12}"><a href="${url}"><img src="${esc(cover)}" width="${COVER_SIZE}" height="${COVER_SIZE}" alt="Album cover" /></a></td>`
    : `<td width="${COVER_SIZE + 12}" align="center"><a href="${url}" style="font-size:42px;text-decoration:none">🎵</a></td>`;
  const playLine = plays ? `<br />♫ ${esc(plays)} plays this week` : '';
  return (
    `<table><tr>` +
    coverCell +
    `<td>🎧 <b>On repeat this week</b><br /><br />` +
    `<a href="${url}"><b>${esc(name)}</b></a><br />` +
    `<sub>${esc(artist)}${playLine}</sub></td>` +
    `</tr></table>`
  );
}

// 1. Top track over the last 7 days.
const top = await lastfm({
  method: 'user.gettoptracks',
  user: USER,
  period: '7day',
  limit: '1',
});
const track = top?.toptracks?.track?.[0];

let block;
if (track) {
  const name = track.name ?? 'Unknown';
  const artist = track.artist?.name ?? '';
  const url = track.url ?? `https://www.last.fm/user/${encodeURIComponent(USER)}`;
  const plays = track.playcount;

  // 2. Album cover (top-tracks images are usually placeholders, so ask
  //    track.getInfo for the real album art; fall back gracefully).
  let cover = null;
  try {
    const info = await lastfm({ method: 'track.getInfo', artist, track: name });
    cover = pickCover(info?.track?.album?.image);
  } catch (err) {
    console.warn('Could not fetch album art:', err.message);
  }

  block = buildBlock({ name, artist, url, plays, cover });
  console.log(`Top track: ${name} — ${artist} (${plays ?? '?'} plays), cover: ${cover ? 'yes' : 'no'}`);
} else {
  block = `<table><tr><td><sub><em>Nothing scrobbled in the last 7 days.</em></sub></td></tr></table>`;
  console.log('No tracks returned for the 7-day window.');
}

const content = await readFile(README, 'utf8');
const s = content.indexOf(START);
const e = content.indexOf(END);
if (s === -1 || e === -1) {
  console.error('Could not find TOP_SONG markers in README.md.');
  process.exit(1);
}

const updated = content.slice(0, s + START.length) + '\n' + block + '\n' + content.slice(e);
if (updated === content) {
  console.log('No change — README already up to date.');
} else {
  await writeFile(README, updated);
  console.log('README.md updated.');
}
