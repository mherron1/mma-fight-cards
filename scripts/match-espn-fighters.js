const fs = require("fs");
const path = require("path");

// --------------------------------------------------
// FILE PATHS
// --------------------------------------------------

const CACHE_FILE = path.join(
  __dirname,
  "../data/fighters-cache.json"
);

const OUTPUT_FILE = path.join(
  __dirname,
  "../data/fighter-images.json"
);

// ESPN UFC scoreboard API
const ESPN_URL =
  "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard";


// --------------------------------------------------
// NAME NORMALISATION
// --------------------------------------------------

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}


// --------------------------------------------------
// FETCH ESPN DATA
// --------------------------------------------------

async function fetchEspnData() {
  console.log("Fetching fighter data from ESPN...");

  const response = await fetch(ESPN_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `ESPN API returned HTTP ${response.status}`
    );
  }

  return response.json();
}


// --------------------------------------------------
// EXTRACT FIGHTERS FROM ESPN RESPONSE
// --------------------------------------------------

function extractEspnFighters(data) {
  const fighters = new Map();

  function walk(node) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    if (
      node.athlete &&
      typeof node.athlete === "object"
    ) {
      const athlete = node.athlete;

      const id = athlete.id || node.id;

      const name =
        athlete.displayName ||
        athlete.fullName ||
        athlete.name;

      if (id && name) {
        fighters.set(String(id), {
          id: String(id),
          name,
          headshot:
            athlete.headshot?.href ||
            athlete.headshot ||
            null
        });
      }
    }

    Object.values(node).forEach(walk);
  }

  walk(data);

  return Array.from(fighters.values());
}


// --------------------------------------------------
// LOAD EXISTING IMAGE MATCHES
// --------------------------------------------------

function loadExistingMatches() {
  if (!fs.existsSync(OUTPUT_FILE)) {
    return {};
  }

  try {
    return JSON.parse(
      fs.readFileSync(OUTPUT_FILE, "utf8")
    );
  } catch (error) {
    console.warn(
      "Could not read existing fighter-images.json."
    );

    return {};
  }
}


// --------------------------------------------------
// MAIN MATCHING PROCESS
// --------------------------------------------------

async function main() {
  try {
    // Check input file
    if (!fs.existsSync(CACHE_FILE)) {
      throw new Error(
        `Fighter cache not found: ${CACHE_FILE}`
      );
    }

    // Load UFCalendar fighter cache
    const fighterCache = JSON.parse(
      fs.readFileSync(CACHE_FILE, "utf8")
    );

    const existingMatches = loadExistingMatches();

    const ufcalFighters = Object.values(fighterCache);

    console.log(
      `Loaded ${ufcalFighters.length} UFCalendar fighters.`
    );

    // Fetch ESPN fighters
    const espnData = await fetchEspnData();

    const espnFighters = extractEspnFighters(espnData);

    console.log(
      `Found ${espnFighters.length} ESPN athletes.`
    );

    // Index ESPN fighters by normalised name
    const espnIndex = new Map();

    for (const fighter of espnFighters) {
      const normalized = normalizeName(fighter.name);

      if (!normalized) continue;

      if (!espnIndex.has(normalized)) {
        espnIndex.set(normalized, []);
      }

      espnIndex.get(normalized).push(fighter);
    }

    // Output object
    const results = {};

    let matched = 0;
    let ambiguous = 0;
    let notFound = 0;
    let preserved = 0;

    // Match each UFCalendar fighter
    for (const fighter of ufcalFighters) {
      const key = fighter.slug;

      if (!key) continue;

      const existing = existingMatches[key];

      // Preserve manually verified matches
      if (
        existing &&
        (
          existing.matchStatus === "verified" ||
          existing.matchStatus === "manual"
        )
      ) {
        results[key] = existing;
        preserved++;
        continue;
      }

      const normalized = normalizeName(fighter.name);

      const candidates = espnIndex.get(normalized) || [];

      // Exactly one match
      if (candidates.length === 1) {
        const athlete = candidates[0];

        results[key] = {
          ufcalendarId: fighter.id,
          name: fighter.name,
          espnId: athlete.id,

          headshot:
            athlete.headshot ||
            `https://a.espncdn.com/i/headshots/mma/players/full/${athlete.id}.png`,

          source: "ESPN",
          matchMethod: "exact-name",
          matchStatus: "matched"
        };

        matched++;
      }

      // Multiple possible matches
      else if (candidates.length > 1) {
        results[key] = {
          ufcalendarId: fighter.id,
          name: fighter.name,
          espnId: null,
          headshot: null,
          source: "ESPN",
          matchMethod: "exact-name",
          matchStatus: "ambiguous",

          candidates: candidates.map(candidate => ({
            espnId: candidate.id,
            name: candidate.name,
            headshot: candidate.headshot
          }))
        };

        ambiguous++;
      }

      // No match found
      else {
        results[key] = {
          ufcalendarId: fighter.id,
          name: fighter.name,
          espnId: null,
          headshot: null,
          source: null,
          matchMethod: null,
          matchStatus: "not-found"
        };

        notFound++;
      }
    }

    // Write results
    fs.writeFileSync(
      OUTPUT_FILE,
      JSON.stringify(results, null, 2),
      "utf8"
    );

    // Summary
    console.log("\n------------------------------");
    console.log("ESPN FIGHTER MATCHING COMPLETE");
    console.log("------------------------------");
    console.log(`UFCalendar fighters: ${ufcalFighters.length}`);
    console.log(`ESPN athletes found: ${espnFighters.length}`);
    console.log(`Matched: ${matched}`);
    console.log(`Ambiguous: ${ambiguous}`);
    console.log(`Not found: ${notFound}`);
    console.log(`Manually verified/preserved: ${preserved}`);
    console.log("------------------------------");

    console.log(
      `\nOutput saved to: ${OUTPUT_FILE}`
    );

  } catch (error) {
    console.error("\nERROR:", error.message);
    process.exitCode = 1;
  }
}


// --------------------------------------------------
// RUN
// --------------------------------------------------

main();