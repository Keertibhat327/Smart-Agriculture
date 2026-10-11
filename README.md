# Smart Agricultural Climate Risk Visualization - BAIP508

Frontend-only climate-risk dashboard for Karnataka/India agricultural screening. The app reads static JSON/GeoJSON from `public/data`, and it can also analyze a clicked point anywhere on the map using public climate and soil APIs from the browser.

## Run Locally

Double-click:

```text
START-SMART-AGRI.bat
```

It installs dependencies if needed, starts the local frontend server, and opens the website.

Manual option:

```bash
npm install
npm run dev
```

Then open `http://127.0.0.1:5173/`.

This version does not require a local Python backend. It reads static files from `public/data` and uses public climate/soil APIs in the browser for clicked-point analysis.

## Map Dashboard

The dashboard opens in deep-brown dark mode. The sun/moon control switches to light mode and remembers the choice on this browser. Satellite imagery is the default; the map layer control also offers OpenStreetMap.

Select a saved area or click a point to update the area-condition sidebar and crop suitability card. Choose a crop in the sidebar to see its conditions, suitability and constraints on the map. Search covers saved areas. The default risk assessment uses fixed hazard weights. Enable Scenario mode to explore alternate importance and rainfall/temperature assumptions; switching it off restores the defaults. Scenario controls affect risk estimates, not climate observations or crop rankings.

Clicked-place names use [Photon](https://github.com/komoot/photon) reverse geocoding with OpenStreetMap data. Names describe the nearest mapped locality within 5 km, not certified boundaries. Repeated lookups are cached in the browser session; failures retain coordinates and do not block agronomic analysis. The public demo is suitable for modest academic traffic and has no availability guarantee. Use a dedicated Photon endpoint for larger deployments.

Satellite imagery: [Esri World Imagery](https://doc.arcgis.com/en/data-appliance/latest/imagery-elevation/world-imagery.htm), with attribution displayed on the map. Tile loading and arbitrary point analysis require internet access. Annual climate values are not current weather; soil moisture, measured pests, phosphorus and potassium are not currently provided. Sample polygons are not official administrative or field boundaries. Point results use coarse climate/soil grids, not a measured surrounding-field survey.

Optional browser smoke check (requires Playwright with Chromium installed): `node scripts/check-dashboard.cjs`. Set `APP_URL` for a different local port and `PLAYWRIGHT_MODULE` if using a bundled Playwright installation. API success/error and rapid-click checks use test fixtures.

## Build

```bash
npm run build
```

## Refresh Real Area Data

```bash
npm run prepare:data
```

This runs `scripts/generate-area-analysis.mjs` and writes `public/data/area-analysis.json`.

Current live/real inputs:

- NASA POWER daily AG API for rainfall, temperature, humidity and wind.
- ISRIC SoilGrids point queries for pH, organic carbon, nitrogen, CEC and soil texture fractions.
- Rule-based crop suitability scoring inspired by FAO ECOCROP-style crop climate/soil constraints.

The script keeps the deployed app static: collect data offline, commit the generated JSON, then deploy.

## Static Data Contract

Replace the placeholder files in `public/data` with precomputed ML outputs using the same IDs and field names:

- `bengaluru-regions.geojson` - currently loaded sample polygons; replace or expand with Karnataka districts, taluks, wards, or India-wide polygons using the same `id`, `name`, `taluk` properties.
- `risk-scores.json` - hazard, exposure, vulnerability, SHAP-style factor values, advice, decision tabs.
- `area-analysis.json` - per-area climate, soil/mineral indicators, crop suitability ranking, surroundings notes.

No Python server is required for deployment. Offline Python/ML can write JSON/GeoJSON into `public/data`.

## Deploy

- Vercel: import the repo, framework `Vite`, build command `npm run build`, output `dist`.
- Netlify: build command `npm run build`, publish directory `dist`.
- Cloudflare Pages: build command `npm run build`, output directory `dist`.
- GitHub Pages: run `npm run build` and publish `dist`.

## Limitation

This is a screening aid for academic planning and visualization, not a certified agricultural, insurance, or disaster-management model.
