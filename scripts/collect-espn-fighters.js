
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const fightersData = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "fighters-cache.json"), "utf8")
);

const espnData = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "espn-athletes-cache.json"), "utf8")
);

const outputPath = path.join(ROOT, "data", "fighter-images.json");

const fighters = Object.values(fightersData);
const espnAthletes = Object.values(espnData);

function normalize(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Index ESPN athletes by name.
const espnByName = new Map();

for (const athlete of espnAthletes) {
  const key = normalize(athlete.name);

  if (!key) continue;

  if (!espnByName.has(key)) {
    espnByName.set(key, []);
  }

  espnByName.get(key).push(athlete);
}

const database = {};

let matched = 0;
let ambiguous = 0;
let missing = 0;

for (const fighter of fighters) {
  const matches = espnByName.get(normalize(fighter.name)) || [];
  const athlete = matches.length === 1 ? matches[0] : null;
  const id = athlete?.id;

  let matchStatus;

  if (id) {
    matched++;
    matchStatus = "matched";
  } else if (matches.length > 1) {
    ambiguous++;
    matchStatus = "ambiguous";
  } else {
    missing++;
    matchStatus = "not-found";
  }

  database[fighter.slug] = {
    id: fighter.id,
    slug: fighter.slug,
    name: fighter.name,

    // ESPN Combiner headshot.
    headshot: id
      ? `https://a.espncdn.com/combiner/i?img=/i/headshots/mma/players/full/${id}.png&w=600&h=436`
      : null,

    headshotSource: id ? "ESPN Combiner (temporary)" : null,

    // Original ESPN full-body image.
    fullBody: id
      ? `https://a.espncdn.com/i/headshots/mma/players/full/${id}.png`
      : null,

    fullBodySource: id ? "ESPN (temporary)" : null,

    espnId: id || null,
    matchStatus
  };
}

fs.writeFileSync(
  outputPath,
  JSON.stringify(database, null, 2)
);

console.log("\nFIGHTER IMAGE DATABASE UPDATED");
console.log("--------------------------------");
console.log(`UFCalendar fighters: ${fighters.length}`);
console.log(`ESPN athletes: ${espnAthletes.length}`);
console.log(`Matched: ${matched}`);
console.log(`Ambiguous: ${ambiguous}`);
console.log(`Not found: ${missing}`);
console.log(`Headshots populated: ${matched}`);
console.log(`Full-body images populated: ${matched}`);
console.log("Output: data/fighter-images.json");
