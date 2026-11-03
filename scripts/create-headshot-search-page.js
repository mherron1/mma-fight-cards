
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const databasePath = path.join(ROOT, "data", "fighter-images.json");
const outputPath = path.join(ROOT, "headshot-search.html");

const fighters = Object.values(
  JSON.parse(fs.readFileSync(databasePath, "utf8"))
);

const cards = fighters.map(fighter => {
  const query = encodeURIComponent(
    `${fighter.name} UFC fighter portrait headshot`
  );

  return `
    <article class="fighter">
      <div class="placeholder">
        <span>${fighter.name}</span>
      </div>

      <h3>${fighter.name}</h3>

      <a
        href="https://www.google.com/search?tbm=isch&q=${query}"
        target="_blank"
        rel="noopener"
      >
        Search Google Images ↗
      </a>

      <p>Save selected image as:</p>
      <code>images/headshots/${fighter.slug}.jpg</code>
    </article>
  `;
}).join("");

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UFC Fighter Headshot Collection</title>
<style>
  body {
    font-family: Arial, sans-serif;
    background: #111;
    color: white;
    padding: 24px;
    margin: 0;
  }
  h1 { margin-bottom: 8px; }
  .summary { color: #aaa; margin-bottom: 28px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 16px;
  }
  .fighter {
    background: #222;
    padding: 14px;
    border-radius: 8px;
    min-width: 0;
  }
  .placeholder {
    aspect-ratio: 1;
    background: #333;
    display: grid;
    place-items: center;
    text-align: center;
    color: #aaa;
    border-radius: 5px;
    padding: 10px;
  }
  h3 { font-size: 16px; }
  a { color: #75baff; }
  p { color: #aaa; font-size: 12px; }
  code {
    font-size: 11px;
    overflow-wrap: anywhere;
    color: #ddd;
  }
</style>
</head>
<body>
  <h1>UFC Fighter Headshots</h1>
  <p class="summary">${fighters.length} fighters · Temporary development images</p>
  <div class="grid">${cards}</div>
</body>
</html>
`;

fs.writeFileSync(outputPath, html);

console.log(`Created headshot search page for ${fighters.length} fighters.`);
console.log("Open headshot-search.html in your browser.");
