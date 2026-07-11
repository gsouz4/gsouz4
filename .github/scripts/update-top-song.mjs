// Fetches your #1 most-played track over the last 7 days from Last.fm
// and rewrites the badge between the TOP_SONG markers in README.md.
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

if (!USER || !KEY) {
  console.error('Missing LASTFM_USERNAME or LASTFM_API_KEY env vars.');
  process.exit(1);
}

// shields.io escaping: literal dashes -> "--", underscores -> "__",
// then percent-encode the rest (spaces, &, emoji, etc.).
const shieldsEscape = (s) =>
  encodeURIComponent(s.replace(/-/g, '--').replace(/_/g, '__'));

const api =
  'https://ws.audioscrobbler.com/2.0/' +
  `?method=user.gettoptracks&user=${encodeURIComponent(USER)}` +
  `&period=7day&limit=1&api_key=${KEY}&format=json`;

const res = await fetch(api);
if (!res.ok) {
  console.error(`Last.fm API error: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const data = await res.json();
const track = data?.toptracks?.track?.[0];

const label = shieldsEscape('🎧 Top track (7d)');
let badge;
if (track) {
  const name = track.name ?? 'Unknown';
  const artist = track.artist?.name ?? '';
  const link = track.url ?? 'https://www.last.fm/';
  const message = shieldsEscape(`${name} — ${artist}`.trim().replace(/ —$/, ''));
  const src = `https://img.shields.io/badge/${label}-${message}-1DB954?style=flat-square&logo=spotify&logoColor=white`;
  badge = `<a href="${link}"><img src="${src}" alt="Top track this week: ${name} by ${artist}" /></a>`;
  console.log(`Top track: ${name} — ${artist} (${track.playcount ?? '?'} plays)`);
} else {
  const src = `https://img.shields.io/badge/${label}-${shieldsEscape('nothing this week')}-1DB954?style=flat-square&logo=spotify&logoColor=white`;
  badge = `<a href="https://www.last.fm/user/${encodeURIComponent(USER)}"><img src="${src}" alt="No tracks this week" /></a>`;
  console.log('No tracks returned for the 7-day window.');
}

const content = await readFile(README, 'utf8');
const s = content.indexOf(START);
const e = content.indexOf(END);
if (s === -1 || e === -1) {
  console.error('Could not find TOP_SONG markers in README.md.');
  process.exit(1);
}

const updated = content.slice(0, s + START.length) + badge + content.slice(e);
if (updated === content) {
  console.log('No change — README already up to date.');
} else {
  await writeFile(README, updated);
  console.log('README.md updated.');
}
