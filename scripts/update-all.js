
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SCRIPTS_DIR = __dirname;

const scripts = [
  {
    name: "Update UFC events and fighter profiles",
    file: "update-events.js",
    nodeArgs: ["--experimental-default-type=module"]
  },
  {
    name: "Generate fighter image database",
    file: "collect-espn-fighters.js",
    nodeArgs: []
  }
];

console.log("\n======================================");
console.log("       MMA FIGHT CARDS - UPDATE ALL");
console.log("======================================\n");

const startTime = Date.now();

for (const script of scripts) {
  console.log("\n--------------------------------------");
  console.log(`RUNNING: ${script.name}`);
  console.log("--------------------------------------\n");

  const scriptPath = path.join(SCRIPTS_DIR, script.file);

  const result = spawnSync(
    process.execPath,
    [...script.nodeArgs, scriptPath],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: process.env
    }
  );

  if (result.error) {
    console.error(`\nERROR running ${script.file}:`);
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\nUPDATE FAILED: ${script.file}`);
    console.error("Remaining scripts will not run.");
    process.exit(result.status || 1);
  }

  console.log(`\nSUCCESS: ${script.file}`);
}

const duration = ((Date.now() - startTime) / 1000).toFixed(1);

console.log("\n======================================");
console.log("       ALL UPDATES COMPLETED");
console.log("======================================");
console.log(`Total time: ${duration} seconds\n`);
