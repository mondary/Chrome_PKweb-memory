const { join } = require("path");
const puppeteer = require("puppeteer-core");

const BASE = process.env.BASE_URL || "http://localhost:4173";
const OUT = join(__dirname, "..", "screenshots");
const SHOTS = [
  ["inventaire", "01-inventaire.png"],
  ["recherche", "02-recherche.png"],
  ["historique", "03-historique.png"],
  ["galerie", "04-galerie.png"],
  ["doublons", "05-doublons.png"],
  ["sessions", "06-sessions.png"],
  ["morts", "07-liens-morts.png"],
  ["backup", "08-backup.png"],
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: "new",
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 750, deviceScaleFactor: 2 });
  for (const [scene, file] of SHOTS) {
    await page.goto(`${BASE}/media-kit/dynamic-demo.html?scene=${scene}`, { waitUntil: "load" });
    await page.screenshot({ path: join(OUT, file) });
    console.log("✓", file);
  }
  await browser.close();
})();
