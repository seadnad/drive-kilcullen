# Kilcullen Drive

A gentle driving game for small people. Drive the Garda car from home at Carrighill, along the R418 and
R448 into Kilcullen, over the Liffey bridge on Main Street, and on past Kilashee to the roundabout at the edge of
Naas. Three.js + Vite, same stack as Dublin Drive.

## Playing

```bash
npm install      # only needed once (or copy node_modules from dublin-city)
npm run dev      # then open http://localhost:5173
```

Pick a place from the big picture buttons, then drive: hold **GO**, steer with the arrows. The handling is
Dublin Drive's arcade car made forgiving for a small driver: a gentle top speed, and with the wheel left alone the
car lines itself up with the road and keeps to the left lane, so holding GO follows a road round its bends. It
can run onto the verge but never into a hedge or a house: it is steered back onto the road instead. Blue chevrons
on the road and a green arrow over the next junction show the way (the steering button for that turn glows). 🔄
puts the car back in the middle of the road.

| Laptop | Phone / tablet | |
| --- | --- | --- |
| `↑` / `W` (hold) | **GO** (hold) | drive |
| `↓` / `S` / `Space` (hold) | **STOP** (hold) | brake, then reverse |
| `←` `→` / `A` `D` (hold) | ⬅ ➡ (hold) | steer |
| `R` / `Backspace` | 🔄 | back on the road |
| `H` | 📯 | horn |
| `X` | 🚨 | siren and blue lights (traffic slows down) |
| `C` | 🎥 | camera: behind, high, overhead |
| `V` | 🔊 | sound on or off |
| `M` / `Enter` | 🗺️ Where to? | choose where to go |

Places to drive to: Home, Kidz Akademy, the GAA club, Little Brew, An Tearmann, the playground, the Town Hall,
Kilashee and Naas. Main Street also has signs on The Hideout, The Spout, Bardon's, Eurospar, An Post, the Garda
station, the library, the credit union, River Cafe, O'Connell's, McTernan's, Brennan's Hardware, Woodbine Books,
Nolan's and Centra, with St Brigid's spire, the bridge parapets, the 1798 memorial and the spearhead sculpture.

Every push to `main` builds and publishes the game to GitHub Pages (`.github/workflows/deploy.yml`) at
https://seadnad.github.io/drive-kilcullen/.

## Home

The game starts on our drive in Carrighill Lower. The estate (`src/world/estate.js`) is built to match it: white
dash-rendered bungalows with grey hipped roofs and a gabled porch on white pillars, gravel drives behind beech
hedges, a tree-lined avenue with grass verges, footpaths and grey lamp posts, and the granite gate pillars, name
stone and weeping willow at the entrance off the L8007. Our house has the sunroom at its right-hand end and the
drive that dips down from the road. From Kilcullen it's the R418, left onto the L8007, then left into the estate.
For a phone on the same Wi-Fi during development, run `npm run dev -- --host` and open the address it prints.

## How the map is made

`data/kilcullen-osm.txt` is an OpenStreetMap pull (roads, buildings, the Liffey and streams, parks and pitches,
and the named places), converted to metres around Kilcullen bridge. `node tools/build-world.mjs` turns it into
`src/data/world.json`:

- **Squeezed**: the real trip is about 18 km, so the countryside is squeezed to about an eighth while Kilcullen keeps
  80% of its size. The estate, Kilashee and the Naas roundabout each get a lens that restores them to near true
  shape and size. Road
  widths are never squeezed, and buildings that end up on a road are shrunk back off it.
- **Roads** become a graph (junctions and the roads between them) for the self-steering car, the traffic and the
  route planner.

Everything else (the estate, houses, shopfronts, hedges, trees, cows and sheep, the Naas edge houses and the
country bungalows) is built in code at load time. Only the Garda i40 model comes from a file, copied from Dublin Drive
(`public/models/garda.glb`), along with its livery code and the engine and siren sounds.

## Layout

```
src/
  main.js              scene, camera, game loop, arrivals
  data/world.json      generated map (don't edit by hand; rerun tools/build-world.mjs)
  game/graph.js        road graph: sampling, junction options, nearest road, route planning
  game/car.js          the player's car: forgiving arcade handling, road assist, soft edges
  game/driver.js       the road-following traffic cars
  game/traffic.js      friendly traffic: cars, a van, a tractor
  game/guide.js        chevrons and the junction arrow
  game/audio.js        engine, siren, horn, arrival fanfare
  game/models.js ...   Garda car loading and livery (from Dublin Drive)
  world/world.js       ground, roads, river, buildings, hedges, trees, lamps, animals
  world/landmarks.js   signs and hand-built landmarks
  world/estate.js      Carrighill Lower: the bungalows, our house and its dipping drive, the entrance
  world/places.js      destinations and shop signs (names, colours)
  ui/                  buttons, picker, mini map, styles
```

Map data © OpenStreetMap contributors, ODbL. Sounds are CC0 (see `public/audio/CREDITS.md`).
