import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const FIGHTERS_FILE = path.join(DATA_DIR, 'fighters-cache.json');
const STATE_FILE = path.join(DATA_DIR, 'live-event-state.json');

const API_BASE = 'https://api.ufcalendar.com/v1';
const API_KEY = process.env.UFCALENDAR_API_KEY;

// The event can be up to 18 hours before or after its scheduled start.
const EVENT_WINDOW_HOURS = 18;

if (!API_KEY) {
  console.error('Missing UFCALENDAR_API_KEY environment variable.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: 'application/json'
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
}

async function apiGet(endpoint) {
  const url = `${API_BASE}${endpoint}`;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, { headers });

    if (response.ok) {
      const raw = await response.text();

      let body;
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`Invalid JSON returned by ${endpoint}`);
      }

      return body?.data ?? body;
    }

    const retryable = response.status === 429 || response.status >= 500;

    if (!retryable || attempt === 4) {
      const message = await response.text();
      throw new Error(
        `UFCalendar ${response.status}: ${message.slice(0, 300)}`
      );
    }

    const retryAfter = Number(response.headers.get('retry-after'));
    const delaySeconds = retryAfter || (response.status === 429 ? 65 : attempt * 3);

    console.warn(`API returned ${response.status}. Retrying in ${delaySeconds}s.`);
    await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
  }

  throw new Error('UFCalendar request failed after retries.');
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function parseRecord(value) {
  const match = String(value || '').match(/^(\d+)-(\d+)-(\d+)/);

  if (!match) return null;

  return {
    wins: Number(match[1]),
    losses: Number(match[2]),
    draws: Number(match[3])
  };
}

function formatRecord(record) {
  return `${record.wins}-${record.losses}-${record.draws}`;
}

function findLiveCandidate(events) {
  const now = Date.now();
  const windowMs = EVENT_WINDOW_HOURS * 60 * 60 * 1000;

  return events
    .filter(event => {
      const status = String(event.status || '').toLowerCase();

        if (['cancelled', 'postponed'].includes(status)) {
        return false;
        }

      const start = Date.parse(event.start_time || '');

      if (!Number.isFinite(start)) return false;

      return start >= now - windowMs && start <= now + windowMs;
    })
    .sort((a, b) => {
      const aStart = Date.parse(a.start_time);
      const bStart = Date.parse(b.start_time);
      return Math.abs(aStart - now) - Math.abs(bStart - now);
    })[0] || null;
}

function mapResult(rawResult, fighterA, fighterB) {
  if (!rawResult) return null;

  let winner = '';

  if (rawResult.winner_fighter_id != null) {
    const winnerId = String(rawResult.winner_fighter_id);

    if (String(fighterA?.id) === winnerId) {
      winner = fighterA?.name || '';
    } else if (String(fighterB?.id) === winnerId) {
      winner = fighterB?.name || '';
    }
  }

  winner = winner || rawResult.winner || '';

  return {
    winner,
    winner_fighter_id: rawResult.winner_fighter_id ?? null,
    method: rawResult.method || '',
    method_normalized: rawResult.method_normalized || '',
    finish_detail: rawResult.finish_detail || '',
    round: rawResult.round ?? null,
    time: rawResult.time || '',
    time_seconds: rawResult.time_seconds ?? null,
    details: rawResult.details || ''
  };
}

function getOutcome(result, fighterA, fighterB) {
  const winnerId = result?.winner_fighter_id == null
    ? ''
    : String(result.winner_fighter_id);

  if (winnerId && String(fighterA?.id) === winnerId) return 'a';
  if (winnerId && String(fighterB?.id) === winnerId) return 'b';

  const winnerName = normalizeName(result?.winner);

  if (winnerName && winnerName === normalizeName(fighterA?.name)) return 'a';
  if (winnerName && winnerName === normalizeName(fighterB?.name)) return 'b';

  const method = normalizeName(
    `${result?.method || ''} ${result?.method_normalized || ''} ${result?.details || ''}`
  );

  if (method.includes('draw')) return 'draw';
  if (method.includes('nocontest') || method.includes('overturned')) {
    return 'no_contest';
  }

  return null;
}

function incrementRecord(record, outcome) {
  const updated = { ...record };

  if (outcome === 'win') updated.wins += 1;
  if (outcome === 'loss') updated.losses += 1;
  if (outcome === 'draw') updated.draws += 1;

  return updated;
}

function getCacheRecord(profile) {
  if (profile?.records?.pro_mma?.value) {
    return {
      key: 'pro_mma',
      value: profile.records.pro_mma.value
    };
  }

  if (profile?.records?.ufc?.value) {
    return {
      key: 'ufc',
      value: profile.records.ufc.value
    };
  }

  return null;
}

function ensureBaseline(event, detail, fighterCache, state) {
  const eventId = String(event.id);

  if (!state[eventId]) {
    state[eventId] = { fighters: {} };
  }

  const eventState = state[eventId];

  // Index UFCalendar fights by their unique bout ID.
  const apiBouts = new Map(
    (detail.card || []).map(bout => [String(bout.id), bout])
  );

  // Only accept fighters belonging to fights in our saved event.
  const validFighterSlugs = new Set();

  for (const fight of event.fights || []) {
    const bout = apiBouts.get(String(fight.id));

    if (!bout) continue;

    for (const corner of [bout.fighter_a, bout.fighter_b]) {
      const slug = corner?.slug;

      if (!slug) continue;

      validFighterSlugs.add(slug);

      if (eventState.fighters[slug]) continue;

      const profile = fighterCache[slug];
      const cacheRecord = getCacheRecord(profile);
      const recordValue = cacheRecord?.value || '';
      const parsed = parseRecord(recordValue);

      if (!parsed) {
        console.warn(
          `Could not capture baseline record for ${corner?.name || slug}.`
        );
        continue;
      }

      eventState.fighters[slug] = {
        record_key: cacheRecord.key,
        base: parsed
      };
    }
  }

  // Remove any unrelated fighters captured during earlier runs.
  for (const slug of Object.keys(eventState.fighters)) {
    if (!validFighterSlugs.has(slug)) {
      delete eventState.fighters[slug];
    }
  }

  console.log(
    `Valid fighters in saved event: ${validFighterSlugs.size}`
  );

  return eventState;
}


function calculateUpdatedRecords(event, detail, eventState) {
  const records = {};

  // Start from the original pre-event records every time.
  for (const [slug, saved] of Object.entries(eventState.fighters)) {
    records[slug] = { ...saved.base };
  }

  // Index the API response by fight ID.
  const apiBouts = new Map(
    (detail.card || []).map(bout => [String(bout.id), bout])
  );

  // Only process fights belonging to our saved event.
  for (const fight of event.fights || []) {
    const bout = apiBouts.get(String(fight.id));

    if (!bout || !bout.result) continue;

    const fighterA = bout.fighter_a || {};
    const fighterB = bout.fighter_b || {};

    const slugA = fighterA.slug;
    const slugB = fighterB.slug;

    if (!slugA || !slugB || !records[slugA] || !records[slugB]) {
      continue;
    }

    const outcome = getOutcome(bout.result, fighterA, fighterB);

    if (outcome === 'a') {
      records[slugA] = incrementRecord(records[slugA], 'win');
      records[slugB] = incrementRecord(records[slugB], 'loss');
    } else if (outcome === 'b') {
      records[slugB] = incrementRecord(records[slugB], 'win');
      records[slugA] = incrementRecord(records[slugA], 'loss');
    } else if (outcome === 'draw') {
      records[slugA] = incrementRecord(records[slugA], 'draw');
      records[slugB] = incrementRecord(records[slugB], 'draw');
    }
  }

  return records;
}

function updateFighterCache(fighterCache, eventState, updatedRecords) {
  for (const [slug, record] of Object.entries(updatedRecords)) {
    const profile = fighterCache[slug];
    const saved = eventState.fighters[slug];

    if (!profile || !saved?.record_key) continue;

    profile.records = profile.records || {};
    profile.records[saved.record_key] = profile.records[saved.record_key] || {};

    const recordObject = profile.records[saved.record_key];

    recordObject.value = formatRecord(record);
    recordObject.wins = record.wins;
    recordObject.losses = record.losses;
    recordObject.draws = record.draws;
  }
}

function updateEventFights(event, detail, updatedRecords) {
  const apiBouts = new Map(
    (detail.card || []).map(bout => [String(bout.id), bout])
  );

  let resultsUpdated = 0;

  for (const fight of event.fights || []) {
    const bout = apiBouts.get(String(fight.id));

    if (!bout) continue;

    if (bout.result) {
      fight.result = mapResult(
        bout.result,
        bout.fighter_a || {},
        bout.fighter_b || {}
      );

      resultsUpdated += 1;
    }

    const fighterA = bout.fighter_a || {};
    const fighterB = bout.fighter_b || {};

    const recordA = updatedRecords[fighterA.slug];
    const recordB = updatedRecords[fighterB.slug];

    if (recordA && fight.fighter_1) {
      fight.fighter_1.record = formatRecord(recordA);
    }

    if (recordB && fight.fighter_2) {
      fight.fighter_2.record = formatRecord(recordB);
    }
  }

  return resultsUpdated;
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const eventsData = await readJson(EVENTS_FILE, null);
  const fighterCache = await readJson(FIGHTERS_FILE, {});
  const state = await readJson(STATE_FILE, {});

  if (!eventsData || !Array.isArray(eventsData.events)) {
    throw new Error('data/events.json is missing or has an invalid structure.');
  }

  const event = findLiveCandidate(eventsData.events);

  if (!event) {
    console.log('No UFC event is within the live monitoring window.');
    return;
  }

  console.log(`Monitoring: ${event.name}`);
  console.log(`Event ID: ${event.id}`);

  const detail = await apiGet(
    `/events/${encodeURIComponent(event.id)}`
  );


  const eventState = ensureBaseline(event, detail, fighterCache, state);
  const updatedRecords = calculateUpdatedRecords(event, detail, eventState);

  const resultsUpdated = updateEventFights(
    event,
    detail,
    updatedRecords
  );

  updateFighterCache(fighterCache, eventState, updatedRecords);

  if (detail.status) {
    event.status = String(detail.status).toLowerCase();
  }
  console.log(`UFCalendar event status: ${detail.status}`);

if (event.status === 'completed') {
  const apiBouts = new Map(
    (detail.card || []).map(bout => [String(bout.id), bout])
  );

  const totalFights = (event.fights || []).length;

  const resolvedFights = (event.fights || []).filter(fight => {
    const bout = apiBouts.get(String(fight.id));

    if (!bout) return false;

    const boutStatus = String(bout.status || '').toLowerCase();

    return Boolean(bout.result) || boutStatus === 'cancelled';
  }).length;

  if (totalFights > 0 && resolvedFights === totalFights) {
    eventsData.latest_completed_event = event;

    eventsData.events = eventsData.events.filter(
      item => String(item.id) !== String(event.id)
    );

    console.log(
      `Event completed: all ${totalFights} fights resolved. Moved to latest_completed_event.`
    );
  } else {
    console.warn(
      `Event marked completed, but only ${resolvedFights}/${totalFights} fights are resolved. Keeping it in upcoming events for now.`
    );
  }
}

  await writeJson(EVENTS_FILE, eventsData);
  await writeJson(FIGHTERS_FILE, fighterCache);
  await writeJson(STATE_FILE, state);

  console.log(`Confirmed results updated: ${resultsUpdated}`);
  console.log(`Fighter records recalculated: ${Object.keys(updatedRecords).length}`);
  console.log('Live event update completed successfully.');
}

main().catch(error => {
  console.error('LIVE EVENT UPDATE FAILED');
  console.error(error);
  process.exit(1);
});