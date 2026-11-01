import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// The app now lives in the repository root.
const APP_DIR = ROOT;
const DATA_DIR = path.join(APP_DIR, 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const FIGHTERS_CACHE_FILE = path.join(DATA_DIR, 'fighters-cache.json');

const API_BASE = 'https://api.ufcalendar.com/v1';
const API_KEY = process.env.UFCALENDAR_API_KEY;

const EVENT_LIMIT = 5;
const PROFILE_REFRESH_DAYS = 7;

// UFCalendar free plan: 10 requests per minute.
// Use a conservative interval between all API requests.
const MIN_REQUEST_INTERVAL_MS = 6500;
let lastRequestAt = 0;
let requestQueue = Promise.resolve();

async function waitForRequestSlot() {
  const slot = requestQueue.then(async () => {
    const wait = Math.max(
      0,
      MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt)
    );

    if (wait > 0) {
      await new Promise(resolve => setTimeout(resolve, wait));
    }

    lastRequestAt = Date.now();
  });

  requestQueue = slot.catch(() => {});
  return slot;
}

if (!API_KEY) {
  console.error('Missing UFCALENDAR_API_KEY environment variable.');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: 'application/json'
};

async function apiGet(endpoint) {
  const url = `${API_BASE}${endpoint}`;
  let response;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await waitForRequestSlot();

    response = await fetch(url, { headers });

    if (response.status !== 429 && response.status < 500) break;
    if (attempt === 4) break;

    const headerDelay = Number(response.headers.get('retry-after'));

    const retryAfter = response.status === 429
      ? (headerDelay || 65)
      : (headerDelay || attempt * 2);

    console.warn(
      `API returned ${response.status}; retrying in ${retryAfter}s...`
    );

    await new Promise(resolve =>
      setTimeout(resolve, retryAfter * 1000)
    );
  }

  const raw = await response.text();
  let body;

  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `Invalid JSON from ${endpoint}: ${raw.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `UFCalendar ${response.status} for ${endpoint}: ${
        body?.error?.message || raw.slice(0, 300)
      }`
    );
  }

  return body?.data ?? body;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.events)) return value.events;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function flagEmoji(countryCode = '') {
  const code = String(countryCode).trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(code)) return '';

  return [...code]
    .map(char =>
      String.fromCodePoint(127397 + char.charCodeAt(0))
    )
    .join('');
}

function formatHeight(inches) {
  const value = Number(inches);

  if (!Number.isFinite(value) || value <= 0) return '';

  const feet = Math.floor(value / 12);
  const remainder = Math.round(value % 12);

  return `${feet}' ${remainder}"`;
}

function formatLocalDate(iso, timeZone) {
  if (!iso) return '';

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return '';

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const part = type =>
      parts.find(item => item.type === type)?.value || '';

    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function joinLocation(venue = {}) {
  return [
    venue.city,
    venue.region,
    venue.country
  ].filter(Boolean).join(', ') || 'Location TBA';
}

function americanPrice(point) {
  if (point == null) return '';

  if (typeof point === 'string' || typeof point === 'number') {
    return String(point);
  }

  return point.american == null ? '' : String(point.american);
}

function mapOdds(odds) {
  if (!odds) {
    return {
      format: 'American',
      fighter_1: '',
      fighter_2: '',
      status: 'not_available'
    };
  }

  const a = odds.a ?? odds.fighter_a ?? odds.fighter_1;
  const b = odds.b ?? odds.fighter_b ?? odds.fighter_2;

  const fighter1 = americanPrice(a);
  const fighter2 = americanPrice(b);

  return {
    format: 'American',
    fighter_1: fighter1,
    fighter_2: fighter2,
    status:
      fighter1 && fighter2
        ? 'consensus_odds'
        : 'not_available'
  };
}

function mapFighterRef(
  ref = {},
  profile = null,
  fallbackWeight = '',
  rankings = []
) {
  const data = profile || {};
  const rankingData = rankings[0] || {};

  const record =
    data.records?.pro_mma?.value ||
    data.records?.ufc?.value ||
    '';

  const images = Array.isArray(data.images) ? data.images : [];

  const usableImage = images.find(
    item => item?.url && item?.artist && item?.license
  ) || null;

  const height = formatHeight(data.height_inches);

  const weight =
    Number.isFinite(Number(data.weight_lbs)) && data.weight_lbs
      ? `${data.weight_lbs} lbs`
      : fallbackWeight;

  return {
    name: ref.name || data.name || 'TBA',
    nickname: ref.nickname || data.nickname || '',
    record: record || '',

    country:
      data.nationality ||
      ref.nationality ||
      rankingData.nationality ||
      '',

    flag: flagEmoji(
      data.country_code ||
      ref.country_code ||
      rankingData.country_code
    ),

    rankings,

    image: usableImage?.url || '',

    image_credit: usableImage
      ? {
          artist: usableImage.artist,
          license: usableImage.license,
          license_url: usableImage.license_url || '',
          source_page: usableImage.source_page || ''
        }
      : null,

    height,
    weight
  };
}

function buildRankingsMap(rankingsData) {
  const rankings = new Map();

  const divisions = Array.isArray(rankingsData)
    ? rankingsData
    : rankingsData?.divisions || [];

  for (const division of divisions) {
    for (const entry of division.entries || []) {
      const slug =
        entry.fighter_slug ||
        entry.fighter?.slug;

      if (!slug) continue;

      if (!rankings.has(slug)) {
        rankings.set(slug, []);
      }

      rankings.get(slug).push({
        division: division.division,
        rank: Number(entry.rank),
        is_champion: Boolean(entry.is_champion),
        movement: Number(entry.movement || 0),
        nationality: entry.nationality || '',
        country_code: entry.country_code || ''
      });
    }
  }

  return rankings;
}

function profileNeedsRefresh(profile) {
  if (!profile) return true;

  const lastUpdated = Date.parse(
    profile._cache_updated_at || ''
  );

  if (!Number.isFinite(lastUpdated)) return true;

  const refreshInterval =
    PROFILE_REFRESH_DAYS * 24 * 60 * 60 * 1000;

  return Date.now() - lastUpdated >= refreshInterval;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;

      if (index >= items.length) return;

      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(limit, items.length) },
      worker
    )
  );

  return results;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const fighterCache = await readJson(
    FIGHTERS_CACHE_FILE,
    {}
  );

  console.log('Fetching official UFC rankings...');

  const rankingsData = await apiGet('/rankings/ufc');
  const rankingsMap = buildRankingsMap(rankingsData);

  console.log(
    `Loaded rankings for ${rankingsMap.size} fighters.`
  );

  console.log('Fetching upcoming UFC events...');

  const scheduleData = await apiGet(
    '/events?org=ufc&status=upcoming&order=asc&limit=50'
  );

  // Do not filter by start time here.
  // The API's "upcoming" status can include live events.
  // Filtering by starts_at >= now would incorrectly remove
  // an event as soon as its scheduled start time passes.
  const upcoming = asArray(scheduleData)
    .filter(event =>
      !['cancelled', 'postponed', 'completed'].includes(
        String(event.status || '').toLowerCase()
      )
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at) - new Date(b.starts_at)
    )
    .slice(0, EVENT_LIMIT);

  if (!upcoming.length) {
    throw new Error(
      'The API returned no upcoming or live UFC events. Existing events.json was not changed.'
    );
  }

  console.log(`Found ${upcoming.length} upcoming or live UFC events.`);

  const eventDetails = await mapWithConcurrency(
    upcoming,
    1,
    async event => {
      const key = event.slug || event.id;

      if (!key) {
        throw new Error(
          `An event is missing both slug and id: ${
            event.title || 'unknown event'
          }`
        );
      }

      console.log(`Fetching card: ${event.title || key}`);

      return apiGet(
        `/events/${encodeURIComponent(key)}?include=odds`
      );
    }
  );

  // Only include events where UFCalendar has published
  // at least one fight. This prevents blank event cards.
  const eventsWithCards = eventDetails
    .map((detail, index) => ({
      detail,
      sourceEvent: upcoming[index]
    }))
    .filter(({ detail }) =>
      Array.isArray(detail.card) && detail.card.length > 0
    );

  const omittedEvents = eventDetails.length - eventsWithCards.length;

  if (omittedEvents > 0) {
    console.warn(
      `Omitting ${omittedEvents} event(s) with no published fight card.`
    );
  }

  if (eventsWithCards.length === 0) {
    throw new Error(
      'No events with published fight cards were returned. Existing events.json was not changed.'
    );
  }

  console.log(
    `Continuing with ${eventsWithCards.length} event(s) with published fight cards.`
  );

  const allFighters = new Map();

  for (const { detail } of eventsWithCards) {
    for (const bout of detail.card || []) {
      if (
        String(bout.status || '').toLowerCase() === 'cancelled'
      ) {
        continue;
      }

      for (const corner of [
        bout.fighter_a,
        bout.fighter_b
      ]) {
        if (corner?.slug) {
          allFighters.set(corner.slug, corner);
        }
      }
    }
  }

  const profilesDueForRefresh = [...allFighters.keys()]
    .filter(slug =>
      profileNeedsRefresh(fighterCache[slug])
    )
    .sort((a, b) => {
      const aCached = Boolean(fighterCache[a]);
      const bCached = Boolean(fighterCache[b]);

      if (aCached !== bCached) {
        return aCached ? 1 : -1;
      }

      const aDate =
        Date.parse(fighterCache[a]?._cache_updated_at || '') || 0;

      const bDate =
        Date.parse(fighterCache[b]?._cache_updated_at || '') || 0;

      return aDate - bDate;
    });

  // Fetch every new or stale fighter profile.
  const profileSlugsThisRun = profilesDueForRefresh;

  console.log(
    `Found ${allFighters.size} fighters across upcoming cards.`
  );

  console.log(
    `${profilesDueForRefresh.length} profiles need refreshing.`
  );

  console.log(
    `Refreshing all ${profileSlugsThisRun.length} profiles due for refresh.`
  );

  let refreshedCount = 0;
  let failedCount = 0;

  for (const slug of profileSlugsThisRun) {
    try {
      const freshProfile = await apiGet(
        `/fighters/${encodeURIComponent(slug)}`
      );

      const existingProfile = fighterCache[slug];

      const hasUsableImage =
        Array.isArray(freshProfile.images) &&
        freshProfile.images.some(image =>
          image?.url && image?.artist && image?.license
        );

      fighterCache[slug] = {
        ...freshProfile,

        images: hasUsableImage
          ? freshProfile.images
          : existingProfile?.images || [],

        _cache_updated_at: new Date().toISOString()
      };

      refreshedCount++;

      console.log(`Refreshed fighter profile: ${slug}`);

    } catch (error) {
      failedCount++;

      console.warn(
        `Could not refresh fighter profile for ${slug}: ${error.message}`
      );

      if (error.message.includes('UFCalendar 429')) {
        console.warn(
          'Rate limit reached. Remaining profiles will be retried on the next run.'
        );
        break;
      }
    }
  }

  const events = eventsWithCards.map(({ detail, sourceEvent }) => {
    const venue = detail.venue || sourceEvent.venue || {};

    const timeZone =
      venue.tz ||
      sourceEvent.tz ||
      'UTC';

    const rawCard = Array.isArray(detail.card)
      ? detail.card
      : [];

    const activeCard = rawCard
      .filter(
        bout =>
          String(bout.status || '').toLowerCase() !== 'cancelled'
      )
      .sort(
        (a, b) =>
          Number(a.ordering ?? 999) -
          Number(b.ordering ?? 999)
      );

    const fights = activeCard.map((bout, boutIndex) => {
      const section = String(
        bout.card_section || ''
      ).toLowerCase();

      const cardPosition = bout.is_main
        ? 'main_event'
        : section === 'main'
          ? 'main_card'
          : /^early[_\s-]*prelims?$/.test(section)
            ? 'early_prelim'
            : 'prelim';

      const weightClass = bout.weight_class || 'Bout';

      const weightMatch = weightClass.match(
        /(\d{2,3})\s*lbs/i
      );

      const fallbackWeight = weightMatch
        ? `${weightMatch[1]} lbs`
        : '';

      const a = bout.fighter_a || {};
      const b = bout.fighter_b || {};

      return {
        id: String(
          bout.id ||
          `${sourceEvent.slug || sourceEvent.id}-fight-${boutIndex + 1}`
        ),

        card_position: cardPosition,
        weight_class: weightClass,
        title_fight: Boolean(bout.title_fight || bout.is_title),

        fighter_1: mapFighterRef(
          a,
          a.slug ? fighterCache[a.slug] : null,
          fallbackWeight,
          rankingsMap.get(a.slug) || []
        ),

        fighter_2: mapFighterRef(
          b,
          b.slug ? fighterCache[b.slug] : null,
          fallbackWeight,
          rankingsMap.get(b.slug) || []
        ),

        odds: mapOdds(bout.odds)
      };
    });

    const startsAt =
      detail.starts_at ||
      sourceEvent.starts_at;

    const mainCardAt =
      detail.main_card_at ||
      sourceEvent.main_card_at ||
      null;

    const prelimsAt =
      detail.prelims_at ||
      sourceEvent.prelims_at ||
      null;

    const earlyPrelimsAt =
      detail.early_prelims_at ||
      sourceEvent.early_prelims_at ||
      null;

    return {
      id: String(
        detail.slug ||
        sourceEvent.slug ||
        detail.id ||
        sourceEvent.id
      ),

      promotion: 'UFC',

      name:
        detail.title ||
        sourceEvent.title ||
        sourceEvent.short_title ||
        'UFC Event',

      date: formatLocalDate(startsAt, timeZone),
      start_time: startsAt || '',
      location: joinLocation(venue),
      venue: venue.name || 'Venue TBA',
      sport: 'MMA',

      status: String(
        detail.status ||
        sourceEvent.status ||
        'upcoming'
      ).toLowerCase(),

      fights,

      schedule: {
        main_card_start_time: mainCardAt,
        prelims_start_time: prelimsAt,
        early_prelims_start_time: earlyPrelimsAt,
        timezone: timeZone,
        time_note:
          'Times are supplied by UFCalendar; check local broadcaster listings.'
      }
    };
  });

  const output = `${JSON.stringify({ events }, null, 2)}\n`;

  await fs.writeFile(EVENTS_FILE, output, 'utf8');

  await fs.writeFile(
    FIGHTERS_CACHE_FILE,
    `${JSON.stringify(fighterCache, null, 2)}\n`,
    'utf8'
  );

  console.log(
    `Updated data/events.json with ${events.length} upcoming UFC events.`
  );

  console.log(
    `Cached ${Object.keys(fighterCache).length} fighter profiles in data/fighters-cache.json.`
  );

  console.log(
    `Fighter profiles refreshed this run: ${refreshedCount}.`
  );

  console.log(
    `Fighter profiles that failed to refresh: ${failedCount}.`
  );
}

main().catch(error => {
  console.error(
    `Update failed: ${error.stack || error.message}`
  );

  process.exit(1);
});