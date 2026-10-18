# Kilcullen Drive

A gentle driving game for small people. Drive the Garda car from home at Carrighill, along the R418 and
R448 into Kilcullen, over the Liffey bridge on Main Street, and on past Kilashee to the roundabout at the edge of
Naas. Three.js + Vite, same stack as Dublin Drive.

## Playing

```bash
npm install      # only needed once (or copy node_modules from dublin-city)
npm run dev      # then open http://localhost:5173
```

Pick a place from the big picture buttons and hold **GO**. The car steers itself and keeps to the left; it slows
for corners and for the car in front, and it can't crash. Blue chevrons on the road and a green arrow over each
junction show the way. Press left or right before a junction to take a different road; it finds its way again
afterwards. Drive through the gold stars to collect them; there are five bonus stars for every place you reach.

| Laptop | Phone / tablet | |
| --- | --- | --- |
| `↑` / `W` / `Space` (hold) | **GO** (hold) | drive |
| `↓` / `S` (hold) | **STOP** | brake |
| `←` `→` | ⬅ ➡ | pick the road at the next junction |
| `H` | 📯 | horn |
| `X` | 🚨 | siren and blue lights (traffic slows down) |
| `C` | 🎥 | camera: behind, high, overhead |
| `V` | 🔊 | sound on or off |
| `M` / `Enter` | 🗺️ Where to? | choose where to go |

Places to drive to: Home, Kidz Akademy, the GAA club, Little Brew, An Tearmann, the playground, the Town Hall,
Kilashee and Naas. Main Street also has signs on The Hideout, The Spout, Bardon's, Eurospar, An Post, the Garda
station, the library, the credit union, River Cafe, O'Connell's, McTernan's, Brennan's Hardware, Woodbine Books,
Nolan's and Centra, with St Brigid's spire, the bridge parapets, the 1798 memorial and the spearhead sculpture.

Every push to `main` builds and publishes the game to GitHub Pages (`.github/workflows/deploy.yml`). The Pages
site is public even though the repo is private, so "Home" is the entrance to the estate, not a particular house.
For a phone on the same Wi-Fi during development, run `npm run dev -- --host` and open the address it prints.

## How the map is made

`data/kilcullen-osm.txt` is an OpenStreetMap pull (roads, buildings, the Liffey and streams, parks and pitches,
and the named places), converted to metres around Kilcullen bridge. `node tools/build-world.mjs` turns it into
`src/data/world.json`:

- **Squeezed**: the real trip is about 18 km, so the countryside is squeezed to about an eighth while Kilcullen keeps
  80% of its size. Kilashee, home and the Naas roundabout each get a magnifying lens so they stay roomy. Road
  widths are never squeezed, and buildings that end up on a road are shrunk back off it.
- **Roads** become a graph (junctions and the roads between them) for the self-steering car, the traffic and the
  route planner.

Everything else (houses, shopfronts, hedges, trees, cows and sheep, the Naas edge houses and the country
bungalows) is built in code at load time. Only the Garda i40 model comes from a file, copied from Dublin Drive
(`public/models/garda.glb`), along with its livery code and the engine and siren sounds.

## Layout

```
src/
  main.js              scene, camera, game loop, arrivals
  data/world.json      generated map (don't edit by hand; rerun tools/build-world.mjs)
  game/graph.js        road graph: sampling, junction options, nearest road, route planning
  game/driver.js       the road-following car (player and traffic)
  game/traffic.js      friendly traffic: cars, a van, a tractor
  game/guide.js        chevrons, junction arrows, collectable stars
  game/audio.js        engine, siren, horn, chimes, speech
  game/models.js ...   Garda car loading and livery (from Dublin Drive)
  world/world.js       ground, roads, river, buildings, hedges, trees, lamps, animals
  world/landmarks.js   signs and hand-built landmarks
  world/places.js      destinations and shop signs (names, colours)
  ui/                  buttons, picker, mini map, styles
```

Map data © OpenStreetMap contributors, ODbL. Sounds are CC0 (see `public/audio/CREDITS.md`).
