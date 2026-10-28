// Búcsú a cigitől: home screen widget for Scriptable (medium size)
// Keep START and TARGET the same as in index.html so the widget matches the page.
//
// OPTIONAL EXTRA: weather and seasonal sky. This is OFF unless she turns it on.
// To turn it on or off, open Scriptable and tap this script: a menu explains what
// it does and asks first. While it's off, her location is never requested, stored
// or sent anywhere, and the widget uses a fixed daily sky schedule.

const PAGE_URL = "https://j-dul.github.io/smokingcountdown/"
const START  = new Date(2026, 9, 14)  // 14 Oct 2026 (months count from 0, so 9 = October)
const TARGET = new Date(2028, 0, 2)   // 2 Jan 2028, midnight local time

// Cigarette colours from the page. Text colours are set further down,
// once we know how light or dark the sky behind them is.
const C = {
  paper:     new Color("#fbfbf8"),
  edge:      new Color("#b9c0c5"),
  filter:    new Color("#d9a066"),
  filterDot: new Color("#c48a4f"),
  ember:     new Color("#e4572e"),
  ash:       new Color("#8e959b"),
  smoke:     new Color("#8e959b", 0.55),
}

const DAY = 86400000
const now = new Date()  // the phone's own clock and time zone
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
const daysLeft = Math.round((TARGET - today) / DAY)  // round() absorbs daylight-saving shifts
const quit = daysLeft <= 0

// How much paper is left: 1 on START, 0 on TARGET
const fraction = Math.min(1, Math.max(0, (TARGET - now) / (TARGET - START)))


// =====================================================================
// Settings, stored only on this phone
// =====================================================================
const fm = FileManager.local()
const SETTINGS_PATH = fm.joinPath(fm.documentsDirectory(), "bucsu-settings.json")

function loadSettings() {
  try {
    if (fm.fileExists(SETTINGS_PATH)) return JSON.parse(fm.readString(SETTINGS_PATH))
  } catch (e) {}
  return { locationModule: false }
}
function saveSettings(s) { fm.writeString(SETTINGS_PATH, JSON.stringify(s)) }

let settings = loadSettings()
let showPreview = true


// =====================================================================
// Menu shown when the script is tapped inside the Scriptable app
// (never shown in the widget itself)
// =====================================================================
async function notice(title, message) {
  const a = new Alert()
  a.title = title
  a.message = message
  a.addAction("OK")
  await a.present()
}

const round1 = n => Math.round(n * 10) / 10  // about 10 km: enough for weather and sun times

// Ask the phone where it is, but give up after a few seconds so the widget never hangs
function withTimeout(promise, ms) {
  if (typeof Timer === "undefined") return promise
  return new Promise((resolve, reject) => {
    const t = Timer.schedule(ms, false, () => reject(new Error("Location timed out")))
    promise.then(v => { t.invalidate(); resolve(v) }, e => { t.invalidate(); reject(e) })
  })
}

async function enableLocation(s) {
  try {
    Location.setAccuracyToThreeKilometers()
    const loc = await Location.current()
    const next = { locationModule: true, lat: round1(loc.latitude), lon: round1(loc.longitude), locTime: now.getTime(), weather: null }
    saveSettings(next)
    await notice("Turned on",
      "Weather and seasonal sky are on. The widget keeps your location up to date by itself, so there's nothing else to do, even when you travel.")
    return next
  } catch (e) {
    await notice("Location not shared",
      "iOS didn't share your location, so this stays off. You can allow location for Scriptable in the Settings app and try again.")
    return s
  }
}

// Runs automatically in the widget: checks the location every couple of hours.
// If iOS doesn't answer in time, the widget quietly keeps the last known location.
async function refreshLocation(s) {
  if (s.locTime && now - s.locTime < 2 * 3600000) return s
  try {
    Location.setAccuracyToThreeKilometers()
    const loc = await withTimeout(Location.current(), 8000)
    const lat = round1(loc.latitude), lon = round1(loc.longitude)
    if (lat !== s.lat || lon !== s.lon) s.weather = null  // she's moved: fetch fresh weather
    s.lat = lat
    s.lon = lon
    s.locTime = now.getTime()
    saveSettings(s)
  } catch (e) {}
  return s
}

async function showMenu(s) {
  const a = new Alert()
  a.title = "Búcsú a cigitől"
  if (s.locationModule) {
    a.message = "Optional weather and seasonal sky: ON\n\n" +
      "The widget uses your approximate location (to about 10 km) to match sunrise and sunset to the season and to show the current weather. " +
      "It updates by itself every couple of hours, including when you travel. " +
      "The location is kept only on this phone and is sent only to Open-Meteo, a free weather service, to look up the weather."
    a.addAction("Preview widget")                                // 0
    a.addDestructiveAction("Turn off and delete my location")    // 1
  } else {
    a.message = "Optional extra: weather and seasonal sky (OFF)\n\n" +
      "If you turn this on, iOS will ask to share your approximate location (to about 10 km). " +
      "The widget then matches sunrise and sunset to the season where you are and shows the current weather in the sky. " +
      "Your location is kept only on this phone and is sent only to Open-Meteo, a free weather service. You can turn it off here at any time.\n\n" +
      "The countdown works exactly the same either way."
    a.addAction("Preview widget")                                // 0
    a.addAction("Turn on weather & seasonal sky")                // 1
  }
  a.addCancelAction("Close")
  const choice = await a.presentSheet()

  if (choice === -1) { showPreview = false; return s }
  if (choice === 1 && !s.locationModule) return await enableLocation(s)
  if (choice === 1 && s.locationModule) {
    const off = { locationModule: false }
    saveSettings(off)
    await notice("Turned off", "Your saved location and weather have been deleted. The widget is back to the standard sky.")
    return off
  }
  return s
}

if (!config.runsInWidget) settings = await showMenu(settings)


// =====================================================================
// Sky colours through the day
// =====================================================================
// [top of the sky, horizon]. A clear sky is blue overhead and paler near the horizon;
// warm colours only appear low down, in roughly the hour either side of sunrise and sunset.
const NIGHT   = ["#0b1424", "#18263d"]
const PREDAWN = ["#121d36", "#2e3a63"]
const DAWN    = ["#9db4da", "#f3bf9e"]
const MORNING = ["#b5d6ee", "#e2edf3"]
const MIDDAY  = ["#a9d1ee", "#dcecf6"]
const GOLDEN  = ["#9fc3e2", "#f5d3a4"]
const SUNSET  = ["#6c80b3", "#f2925f"]
const DUSK    = ["#232b52", "#4b3d68"]

// Without location: a fixed schedule (sunrise 6:00, sunset 19:30).
// With location: the same colours, anchored to that day's real sunrise and sunset.
const DEFAULT_SUN = { sunrise: 6, sunset: 19.5 }

function skyKeyframes(sun) {
  const { sunrise, sunset } = sun
  const pts = [
    [0, NIGHT],
    [sunrise - 1, PREDAWN],
    [sunrise, DAWN],
    [sunrise + 1, MORNING],
    [(sunrise + sunset) / 2, MIDDAY],
    [sunset - 2, MIDDAY],       // stays blue through the afternoon
    [sunset - 0.75, GOLDEN],
    [sunset, SUNSET],
    [sunset + 1, DUSK],
    [24, NIGHT],
  ]
  // Keep the points in order even for very short or very long days
  for (let i = 1; i < pts.length - 1; i++) {
    pts[i][0] = Math.min(Math.max(pts[i][0], pts[i - 1][0] + 0.1), 24 - (pts.length - 1 - i) * 0.1)
  }
  return pts
}

const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const rgbToHex = c => "#" + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")
const mix = (a, b, t) => { const B = hexToRgb(b); return hexToRgb(a).map((v, i) => v + (B[i] - v) * t) }

function skyAt(date, frames) {
  const h = date.getHours() + date.getMinutes() / 60
  let i = 0
  while (h >= frames[i + 1][0]) i++
  const [h0, [top0, bot0]] = frames[i], [h1, [top1, bot1]] = frames[i + 1]
  const t = (h - h0) / (h1 - h0)
  return [rgbToHex(mix(top0, top1, t)), rgbToHex(mix(bot0, bot1, t))]
}

// Approximate sunrise and sunset (within a few minutes) from latitude, longitude and date.
// Times come back in the phone's local time zone.
function sunTimes(date, lat, lon) {
  const rad = Math.PI / 180
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate()
  const N = Math.round((Date.UTC(y, m, d) - Date.UTC(y, 0, 0)) / DAY)          // day of the year
  const decl = -23.44 * Math.cos(2 * Math.PI / 365 * (N + 10)) * rad           // sun's declination
  const B = 2 * Math.PI * (N - 81) / 364
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B) // equation of time, minutes
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl))
  if (cosH <= -1 || cosH >= 1) return null  // midnight sun or polar night: use the fixed schedule
  const halfDay = Math.acos(cosH) / rad / 15                                   // hours from solar noon
  const noonUTC = 12 - lon / 15 - eot / 60
  const toLocal = h => { const t = new Date(Date.UTC(y, m, d) + h * 3600000); return t.getHours() + t.getMinutes() / 60 }
  return { sunrise: toLocal(noonUTC - halfDay), sunset: toLocal(noonUTC + halfDay) }
}


// =====================================================================
// Weather (only when the optional module is on)
// =====================================================================
async function getWeatherCode(s) {
  const cached = s.weather
  if (cached && now - cached.time < 25 * 60000) return cached.code
  try {
    const req = new Request(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&current=weather_code&timezone=auto`)
    req.timeoutInterval = 10
    const json = await req.loadJSON()
    const code = json.current.weather_code
    s.weather = { code, time: now.getTime() }
    saveSettings(s)
    return code
  } catch (e) {
    // Offline: reuse the last reading if it's under 3 hours old, otherwise show no weather
    return cached && now - cached.time < 3 * 3600000 ? cached.code : null
  }
}

// Open-Meteo uses the standard WMO weather codes
function weatherKind(code) {
  if (code == null) return null
  if (code === 0) return "clear"
  if (code <= 2) return "partly"
  if (code === 3) return "overcast"
  if (code === 45 || code === 48) return "fog"
  if (code >= 51 && code <= 57) return "drizzle"
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain"
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow"
  if (code >= 95) return "storm"
  return null
}

// How much each kind of weather greys out the sky: [desaturate, darken] (negative darken lightens)
const TINT = {
  partly: [0.15, 0], overcast: [0.6, 0.05], fog: [0.65, -0.15], drizzle: [0.55, 0.08],
  rain: [0.65, 0.15], snow: [0.5, -0.1], storm: [0.7, 0.35],
}
function tint(hex, kind) {
  const t = TINT[kind]
  if (!t) return hex
  const [r, g, b] = hexToRgb(hex)
  const grey = 0.3 * r + 0.59 * g + 0.11 * b
  const des = [r, g, b].map(v => v + (grey - v) * t[0])
  return rgbToHex(t[1] >= 0 ? des.map(v => v * (1 - t[1])) : des.map(v => v + (255 - v) * -t[1]))
}

// How the sun and moon show through each kind of weather: [disc opacity, glow strength, glow size].
// Thicker cloud hides the disc and spreads its light into a wider, dimmer glow.
const SKY_LIGHT = {
  clear:    [1,    1,    1],
  partly:   [1,    1,    1],     // clouds drift in front
  fog:      [0.55, 0.25, 0.7],   // a pale, crisp disc with almost no glow
  drizzle:  [0.2,  0.45, 1.6],
  overcast: [0.15, 0.4,  1.8],   // mostly a brighter patch of cloud
  snow:     [0.25, 0.45, 1.5],
  rain:     [0.06, 0.35, 2],
  storm:    [0,    0.18, 2.2],   // just a dim brighter patch behind the storm clouds
}

// Position on the arc across the sky: p = 0 at the left horizon, 1 at the right
function arcPoint(p, W, H, r) {
  const elev = Math.sin(Math.PI * p)                       // 1 at the top, 0 on the horizon
  const horizon = H + r * 0.4, highest = H * 0.13
  return {
    x: W * (0.1 + 0.8 * p),
    y: horizon - elev * (horizon - highest),
    low: 1 - Math.max(0, Math.min(1, elev / 0.45)),        // 0 high up, 1 at the horizon
  }
}

// Glow from stacked faint circles (drawn images can't use gradients), then the disc
function drawLight(ctx, x, y, r, core, kind, rings, ringAlpha, spread) {
  const [disc, glow, size] = SKY_LIGHT[kind] || SKY_LIGHT.clear
  if (kind === "fog") core = rgbToHex(mix(core, "#ffffff", 0.6))
  // Wider glows get more, fainter circles so they stay smooth instead of showing rings
  const n = Math.max(rings, Math.round(rings * size * 2))
  for (let i = n; i >= 1; i--) {
    const rr = r + r * spread * size * i / n
    ctx.setFillColor(new Color(core, ringAlpha * glow * rings / n))
    ctx.fillEllipse(new Rect(x - rr, y - rr, rr * 2, rr * 2))
  }
  if (disc > 0) {
    ctx.setFillColor(new Color(core, disc))
    ctx.fillEllipse(new Rect(x - r, y - r, r * 2, r * 2))
  }
  return disc
}

// The sun, where the page would show it at this moment: it rises at the left, peaks at
// midday and sinks off the bottom at sunset, turning orange as it gets low.
function drawSun(ctx, W, H, kind) {
  const p = (hourNow - sun.sunrise) / (sun.sunset - sun.sunrise)  // 0 at sunrise, 1 at sunset
  if (p < -0.05 || p > 1.05) return
  const r = 14
  const { x, y, low } = arcPoint(p, W, H, r)
  drawLight(ctx, x, y, r, rgbToHex(mix("#fff4d6", "#ff9a5a", low)), kind, 8, 0.07, 3.5)
}

// The moon: the sun's path in reverse. It rises at the left at sunset, peaks in the middle
// of the night and sinks off the bottom at sunrise.
function drawMoon(ctx, W, H, kind) {
  const nightLen = 24 - sun.sunset + sun.sunrise
  let t = hourNow - sun.sunset
  if (t < 0) t += 24
  let p = t / nightLen                       // 0 at sunset, 1 at sunrise
  if (p > 1.05) p = (t - 24) / nightLen      // just before sunset, still below the horizon
  if (p < -0.05 || p > 1.05) return
  const r = 12
  const { x, y, low } = arcPoint(p, W, H, r)
  const disc = drawLight(ctx, x, y, r, rgbToHex(mix("#eef1f6", "#f3d9b5", low)), kind, 6, 0.045, 2.5)
  if (disc > 0) {
    // A few faint darker patches so it reads as the moon rather than a light
    ctx.setFillColor(new Color("#b9c0cc", 0.35 * disc))
    for (const [dx, dy, s] of [[-0.35, -0.25, 0.38], [0.2, 0.15, 0.3], [-0.05, 0.45, 0.2]]) {
      ctx.fillEllipse(new Rect(x + dx * r - s * r, y + dy * r - s * r, s * r * 2, s * r * 2))
    }
  }
}

// =====================================================================
// Special days: a small decoration in the sky and a greeting in place of the title.
// Change NAME or a greeting here; each occasion is one line.
// =====================================================================
const NAME = "Petra"

// Easter Sunday for any year (the standard Gregorian calculation)
function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(y, month - 1, day)
}
// The first Sunday of Advent: four Sundays before Christmas
function firstAdvent(y) {
  const xmas = new Date(y, 11, 25), dow = xmas.getDay()
  return new Date(y, 11, 25 - (dow === 0 ? 7 : dow) - 21)
}
const daysBetween = (a, b) => Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / DAY)

// text: the greeting (null for a decoration with no greeting that day)
function occasionFor(d) {
  const m = d.getMonth() + 1, day = d.getDate(), y = d.getFullYear()
  if (m === 10 && day === 2)  return { key: "nameday",   text: `Boldog névnapot, ${NAME}!` }      // name day
  if (m === 10 && day === 31) return { key: "halloween", text: "Boldog Halloweent!" }
  if (m === 12 && day === 6)  return { key: "mikulas",   text: "Boldog Mikulást!" }               // St Nicholas
  if (m === 12 && day >= 24 && day <= 26) return { key: "christmas", text: "Boldog karácsonyt!" }
  if ((m === 12 && day === 31) || (m === 1 && day === 1)) return { key: "newyear", text: "Boldog új évet!" }
  if (m === 1 && day === 2)   return { key: "birthday",  text: `Boldog születésnapot, ${NAME}!` }
  if (m === 3 && day === 8)   return { key: "nonap",     text: "Boldog nőnapot!" }                // Women's Day
  if (m === 3 && day === 15)  return { key: "march15",   text: "Nemzeti ünnep, március 15." }     // 1848 revolution
  if (m === 8 && day === 20)  return { key: "stephen",   text: "Szent István napja" }             // St Stephen's Day
  const easter = daysBetween(easterSunday(y), d)
  if (easter === 0 || easter === 1) return { key: "easter", text: "Boldog húsvétot!" }           // Sunday and Monday
  const advent = daysBetween(firstAdvent(y), d)
  if (advent >= 0 && !(m === 12 && day > 23)) {                                                   // until Christmas Eve
    // One more candle each Sunday; the greeting only on the Sundays themselves
    return { key: "advent", candles: Math.min(4, 1 + Math.floor(advent / 7)), text: advent % 7 === 0 ? "Békés adventet!" : null }
  }
  return null
}

// Decorations stay in two clear areas of the widget: the strip of sky along the top right
// (right of the title, above the cigarette) and the bottom-right corner (right of the day count).
function wGlow(ctx, cx, cy, r, hex, alpha, rings) {
  for (let i = rings; i >= 1; i--) {
    const rr = r * i / rings
    ctx.setFillColor(new Color(hex, alpha))
    ctx.fillEllipse(new Rect(cx - rr, cy - rr, rr * 2, rr * 2))
  }
}
function wRounded(ctx, x, y, w, h, r, hex) {
  const p = new Path()
  p.addRoundedRect(new Rect(x, y, w, h), r, r)
  ctx.addPath(p)
  ctx.setFillColor(new Color(hex))
  ctx.fillPath()
}
function wPoly(ctx, pts, hex, alpha) {
  const p = new Path()
  p.addLines(pts.map(([x, y]) => new Point(x, y)))
  p.closeSubpath()
  ctx.addPath(p)
  ctx.setFillColor(new Color(hex, alpha == null ? 1 : alpha))
  ctx.fillPath()
}

function drawDecor(ctx, W, H, occ, isNight) {
  if (!occ) return
  const k = occ.key

  if (k === "christmas") {
    // A string of warm lights draped along the top edge
    const span = 91, sag = 8
    const yAt = x => 1 + sag * Math.sin(Math.PI * (((x % span) + span) % span) / span)
    const wire = new Path()
    const pts = []
    for (let x = 0; x <= W; x += 4) pts.push(new Point(x, yAt(x)))
    wire.addLines(pts)
    ctx.addPath(wire)
    ctx.setStrokeColor(new Color("#2f3236", 0.5))
    ctx.setLineWidth(1)
    ctx.strokePath()
    const colors = ["#ffd36e", "#ff8a7a", "#8fd3a8", "#8ec5ff"]
    let i = 0
    for (let x = 11; x < W; x += 22.75, i++) {
      const y = yAt(x) + 4, c = colors[i % 4]
      wGlow(ctx, x, y, 8, c, 0.12, 3)
      ctx.setFillColor(new Color(c))
      ctx.fillEllipse(new Rect(x - 2.4, y - 3.2, 4.8, 6.4))
    }
  }

  if (k === "halloween") {
    // A pumpkin low in the corner, its carved face lit after dark, and a bat in the daytime sky
    const cx = 330, cy = 152, s = 14
    if (isNight) wGlow(ctx, cx, cy, s * 2.6, "#ff9a3c", 0.06, 6)
    for (const [dx, hw, c] of [[-0.5, 0.5, "#c95f1c"], [0.5, 0.5, "#c95f1c"], [-0.2, 0.55, "#e07b2c"], [0.2, 0.55, "#e07b2c"], [0, 0.5, "#ec8a36"]]) {
      ctx.setFillColor(new Color(c))
      ctx.fillEllipse(new Rect(cx + dx * s - hw * s, cy - 0.8 * s, 2 * hw * s, 1.6 * s))
    }
    ctx.setFillColor(new Color("#5b6b3a"))
    ctx.fillRect(new Rect(cx - 0.09 * s, cy - 1.05 * s, 0.18 * s, 0.32 * s))
    if (isNight) {
      const lit = "#ffd36e"
      wPoly(ctx, [[cx - 0.5 * s, cy - 0.05 * s], [cx - 0.2 * s, cy - 0.05 * s], [cx - 0.35 * s, cy - 0.32 * s]], lit)
      wPoly(ctx, [[cx + 0.2 * s, cy - 0.05 * s], [cx + 0.5 * s, cy - 0.05 * s], [cx + 0.35 * s, cy - 0.32 * s]], lit)
      wPoly(ctx, [[cx - 0.5 * s, cy + 0.18 * s], [cx - 0.25 * s, cy + 0.32 * s], [cx, cy + 0.2 * s], [cx + 0.25 * s, cy + 0.32 * s], [cx + 0.5 * s, cy + 0.18 * s], [cx, cy + 0.5 * s]], lit)
    } else {
      const bx = 300, by = 20, bw = 11
      const bat = new Path()
      bat.move(new Point(bx, by))
      bat.addQuadCurve(new Point(bx - bw, by - 3), new Point(bx - bw * 0.5, by - 6))
      bat.addQuadCurve(new Point(bx - bw * 0.55, by + 1), new Point(bx - bw * 0.75, by + 2))
      bat.addQuadCurve(new Point(bx - bw * 0.25, by + 2), new Point(bx - bw * 0.4, by + 4))
      bat.addQuadCurve(new Point(bx, by + 3), new Point(bx - bw * 0.12, by + 5))
      bat.addQuadCurve(new Point(bx + bw * 0.25, by + 2), new Point(bx + bw * 0.12, by + 5))
      bat.addQuadCurve(new Point(bx + bw * 0.55, by + 1), new Point(bx + bw * 0.4, by + 4))
      bat.addQuadCurve(new Point(bx + bw, by - 3), new Point(bx + bw * 0.75, by + 2))
      bat.addQuadCurve(new Point(bx, by), new Point(bx + bw * 0.5, by - 6))
      ctx.addPath(bat)
      ctx.setFillColor(new Color("#14101a", 0.85))
      ctx.fillPath()
    }
  }

  if (k === "mikulas") {
    // Mikulás leaves treats in a boot: a red boot in the corner with a gold sweet peeking out
    const x = 328, y = 148, s = 16
    ctx.setFillColor(new Color("#e9b949"))
    ctx.fillEllipse(new Rect(x + 0.17 * s - 0.2 * s, y - 1.3 * s - 0.2 * s, 0.4 * s, 0.4 * s))
    wRounded(ctx, x - 0.1 * s, y - 0.95 * s, 0.55 * s, 1.25 * s, 0.12 * s, "#c8323a")
    wRounded(ctx, x - 0.75 * s, y + 0.05 * s, 1.2 * s, 0.42 * s, 0.2 * s, "#c8323a")
    wRounded(ctx, x - 0.2 * s, y - 1.1 * s, 0.75 * s, 0.3 * s, 0.14 * s, "#fbf7f2")
  }

  // Fireworks: New Year's Eve night (until sunrise on the 1st), and the evening of 20 August in red, white and green
  const nye = k === "newyear" && ((now.getMonth() === 11 && hourNow > sun.sunset) || (now.getMonth() === 0 && hourNow < sun.sunrise))
  const stephenNight = k === "stephen" && hourNow > sun.sunset
  if (nye || stephenNight) {
    const cols = nye ? ["#ffd36e", "#ff9ab0", "#9fd8ff"] : ["#e8414b", "#ffffff", "#4caf6a"]
    for (const [bx, by, r, ci] of [[262, 18, 13, 0], [306, 30, 16, 1], [346, 14, 11, 2]]) {
      const c = cols[ci]
      const rays = new Path()
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2
        rays.move(new Point(bx + Math.cos(a) * r * 0.35, by + Math.sin(a) * r * 0.35))
        rays.addLine(new Point(bx + Math.cos(a) * r, by + Math.sin(a) * r))
      }
      ctx.addPath(rays)
      ctx.setStrokeColor(new Color(c, 0.8))
      ctx.setLineWidth(1.3)
      ctx.strokePath()
      wGlow(ctx, bx, by, r * 0.5, c, 0.08, 3)
    }
  }

  if (k === "birthday") {
    // Three balloons tied together in the top-right sky
    const knotX = 322, knotY = 42
    const strings = new Path()
    for (const [bx, by] of [[300, 30], [322, 24], [344, 32]]) {
      strings.move(new Point(bx, by))
      strings.addQuadCurve(new Point(knotX, knotY), new Point((bx + knotX) / 2 + 2, (by + knotY) / 2))
    }
    ctx.addPath(strings)
    ctx.setStrokeColor(new Color(isNight ? "#c9cfd8" : "#6b7480", 0.7))
    ctx.setLineWidth(0.8)
    ctx.strokePath()
    for (const [bx, by, c] of [[300, 20, "#f28b82"], [344, 22, "#9ecbf0"], [322, 14, "#fbd36b"]]) {
      ctx.setFillColor(new Color(c))
      ctx.fillEllipse(new Rect(bx - 7, by - 9, 14, 18))
      wPoly(ctx, [[bx - 2, by + 11], [bx + 2, by + 11], [bx, by + 8]], c)
      ctx.setFillColor(new Color("#ffffff", 0.45))
      ctx.fillEllipse(new Rect(bx - 4.5, by - 6, 3, 5))
    }
  }

  if (k === "nameday" || k === "nonap") wBouquet(ctx)
  if (k === "march15" || (k === "stephen" && !stephenNight)) wKokarda(ctx)

  if (k === "easter") {
    // Painted eggs (hímes tojás) in the corner
    for (const [x, y, c, band] of [[312, 157, "#d94b4b", "#fbe3c8"], [341, 158, "#e9b949", "#d94b4b"], [327, 151, "#5b8fd6", "#fbf7f2"]]) {
      ctx.setFillColor(new Color(c))
      ctx.fillEllipse(new Rect(x - 7, y - 9.5, 14, 19))
      const zig = new Path()
      const pts = []
      for (let i = 0; i <= 6; i++) pts.push(new Point(x - 6 + i * 2, y + (i % 2 ? -2 : 1)))
      zig.addLines(pts)
      ctx.addPath(zig)
      ctx.setStrokeColor(new Color(band))
      ctx.setLineWidth(1.4)
      ctx.strokePath()
      ctx.setFillColor(new Color(band))
      for (const dx of [-3, 0, 3]) ctx.fillEllipse(new Rect(x + dx - 0.9, y - 5.5, 1.8, 1.8))
    }
  }

  if (k === "advent") {
    // An Advent wreath: three purple candles and one pink, one more lit each Sunday
    const cx = 327, cy = 158
    ctx.setFillColor(new Color("#3f6b3a"))
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2
      ctx.fillEllipse(new Rect(cx + Math.cos(a) * 18 - 5, cy + Math.sin(a) * 6.5 - 3, 10, 6))
    }
    ctx.setFillColor(new Color("#5d8f52"))
    for (let i = 0; i < 24; i++) {
      const a = (i + 0.5) / 24 * Math.PI * 2
      ctx.fillEllipse(new Rect(cx + Math.cos(a) * 18 - 3.5, cy + Math.sin(a) * 6.5 - 2.5, 7, 5))
    }
    // lit in the order 1, 2, 3 (pink), 4
    const candles = [[-13, -1, "#7b5aa6", 1], [-5, -5, "#7b5aa6", 2], [5, -5, "#e7a1c4", 3], [13, -1, "#7b5aa6", 4]]
    for (const [dx, dy, c, n] of candles) {
      const x = cx + dx, top = cy + dy - 15
      wRounded(ctx, x - 2.2, top, 4.4, 15, 1.2, c)
      if (n <= occ.candles) {
        wGlow(ctx, x, top - 3.5, 7, "#ffd36e", 0.1, 3)
        ctx.setFillColor(new Color("#ffd36e"))
        ctx.fillEllipse(new Rect(x - 1.6, top - 6.5, 3.2, 5.5))
      }
    }
  }
}

function wBouquet(ctx) {
  // A small bouquet in the corner (name day and Women's Day)
  const x = 328, y = 160, s = 16
  const heads = [[-0.75, -1.3, "#f4a6c0"], [0, -1.65, "#fff4f0"], [0.75, -1.25, "#f7b38a"], [-0.3, -0.85, "#fff4f0"], [0.4, -0.8, "#f4a6c0"]]
  const stems = new Path()
  for (const [dx, dy] of heads) {
    stems.move(new Point(x, y))
    stems.addLine(new Point(x + dx * s, y + dy * s))
  }
  ctx.addPath(stems)
  ctx.setStrokeColor(new Color("#5f8f57"))
  ctx.setLineWidth(1.4)
  ctx.strokePath()
  ctx.setFillColor(new Color("#6fa86a"))
  ctx.fillEllipse(new Rect(x - 0.9 * s, y - 0.75 * s, 0.6 * s, 0.32 * s))
  ctx.fillEllipse(new Rect(x + 0.3 * s, y - 0.7 * s, 0.6 * s, 0.32 * s))
  for (const [dx, dy, c] of heads) {
    const fx = x + dx * s, fy = y + dy * s, pr = 0.22 * s
    ctx.setFillColor(new Color(c))
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 - Math.PI / 2
      ctx.fillEllipse(new Rect(fx + Math.cos(a) * pr * 1.1 - pr, fy + Math.sin(a) * pr * 1.1 - pr, pr * 2, pr * 2))
    }
    ctx.setFillColor(new Color("#f6c453"))
    ctx.fillEllipse(new Rect(fx - pr * 0.6, fy - pr * 0.6, pr * 1.2, pr * 1.2))
  }
  wRounded(ctx, x - 0.25 * s, y - 0.25 * s, 0.5 * s, 0.32 * s, 0.1 * s, "#f2c4d0")
}

function wKokarda(ctx) {
  // A kokárda, the red-white-green rosette worn on Hungarian national days
  const x = 328, y = 140
  for (const [dir, base] of [[-1, 0], [1, 0]]) {
    // two ribbon tails, each red, white and green
    ["#ce2939", "#ffffff", "#477050"].forEach((c, i) => {
      const off = (i - 1) * 2.2
      wPoly(ctx, [[x + off, y + 4], [x + off + 2.2, y + 4], [x + dir * 9 + off + 2.2, y + 24], [x + dir * 9 + off, y + 24]], c)
    })
  }
  ctx.setFillColor(new Color("#ce2939")); ctx.fillEllipse(new Rect(x - 11, y - 11, 22, 22))
  ctx.setFillColor(new Color("#ffffff")); ctx.fillEllipse(new Rect(x - 7.5, y - 7.5, 15, 15))
  ctx.setFillColor(new Color("#477050")); ctx.fillEllipse(new Rect(x - 4, y - 4, 8, 8))
}

// Widgets can't animate, so the sky, sun, moon and weather are drawn as a still scene behind everything
function drawSky(top, bottom, kind, isNight) {
  const W = 364, H = 170
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = true
  ctx.respectScreenScale = true

  for (let y = 0; y < H; y++) {
    ctx.setFillColor(new Color(rgbToHex(mix(top, bottom, y / (H - 1)))))
    ctx.fillRect(new Rect(0, y, W, 1.5))
  }

  let seed = 7  // fixed seed so the scene doesn't jump around between refreshes
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const glow = isNight ? 0.5 : 1

  if (isNight && (kind === "clear" || kind === "partly")) {
    for (let i = 0; i < 40; i++) {
      const r = 0.6 + rnd() * 1.1
      ctx.setFillColor(new Color("#ffffff", 0.4 + rnd() * 0.5))
      ctx.fillEllipse(new Rect(rnd() * W, rnd() * H * 0.7, r, r))
    }
  }

  drawSun(ctx, W, H, kind)   // before the clouds, so they pass in front
  drawMoon(ctx, W, H, kind)

  if (kind === "partly" || kind === "overcast") {
    const clouds = kind === "partly" ? [[230, 18, 1], [300, 40, 0.8], [150, 8, 0.7]] : [[40, 10, 1.2], [200, 4, 1.4], [310, 30, 1]]
    // Solid colour (sky blended with white) so overlapping puffs don't show darker seams
    const cloudHex = rgbToHex(mix(rgbToHex(mix(top, bottom, 0.15)), "#ffffff", (kind === "partly" ? 0.35 : 0.15) * glow))
    ctx.setFillColor(new Color(cloudHex))
    for (const [x, y, s] of clouds) {
      for (const [dx, dy, w, h] of [[0, 10, 60, 22], [14, 0, 34, 28], [34, 6, 30, 24]]) {
        ctx.fillEllipse(new Rect(x + dx * s, y + dy * s, w * s, h * s))
      }
    }
  }

  if (kind === "fog") {
    ctx.setFillColor(new Color("#ffffff", 0.14 * glow))
    for (let i = 0; i < 5; i++) {
      const band = new Path()
      band.addRoundedRect(new Rect(-20 + rnd() * 60, 20 + i * 30, W * (0.6 + rnd() * 0.4), 14), 7, 7)
      ctx.addPath(band)
      ctx.fillPath()
    }
  }

  if (kind === "drizzle" || kind === "rain" || kind === "storm") {
    const count = kind === "drizzle" ? 35 : kind === "rain" ? 70 : 90
    const len = kind === "drizzle" ? 7 : 12
    const rain = new Path()
    for (let i = 0; i < count; i++) {
      const x = rnd() * (W + 20), y = rnd() * H
      rain.move(new Point(x, y))
      rain.addLine(new Point(x - len / 3, y + len))
    }
    ctx.addPath(rain)
    ctx.setStrokeColor(new Color("#ffffff", 0.35 * glow))
    ctx.setLineWidth(1.2)
    ctx.strokePath()
  }

  if (kind === "storm") {
    // A new bolt in a new spot each refresh. It stays in the open sky along the top:
    // right of the title and above the cigarette, so it never covers the text or the tip.
    const x0 = 190 + Math.random() * 150, bottom = 34 + Math.random() * 10
    const pts = [new Point(x0, -2)]
    let x = x0
    for (let i = 1; i <= 4; i++) {
      x += (i % 2 ? 1 : -1) * (4 + Math.random() * 6) + (Math.random() - 0.5) * 4
      pts.push(new Point(x, -2 + (bottom + 2) * i / 4))
    }
    const forkFrom = pts[2], forkDir = Math.random() < 0.5 ? -1 : 1
    const stroke = (width, alpha) => {
      const path = new Path()
      path.addLines(pts)
      path.move(forkFrom)
      path.addLine(new Point(forkFrom.x + forkDir * 9, forkFrom.y + 6))
      path.addLine(new Point(forkFrom.x + forkDir * 13, forkFrom.y + 13))
      ctx.addPath(path)
      ctx.setStrokeColor(new Color("#fff2a8", alpha))
      ctx.setLineWidth(width)
      ctx.strokePath()
    }
    stroke(7, 0.2)     // glow
    stroke(2.2, 0.95)  // bolt
  }

  drawDecor(ctx, W, H, occasionFor(now), isNight)

  if (kind === "snow") {
    for (let i = 0; i < 50; i++) {
      const r = 1.5 + rnd() * 2
      ctx.setFillColor(new Color("#ffffff", 0.75 * (isNight ? 0.7 : 1)))
      ctx.fillEllipse(new Rect(rnd() * W, rnd() * H, r, r))
    }
  }

  return ctx.getImage()
}


// =====================================================================
// Work out today's sky
// =====================================================================
let sun = DEFAULT_SUN
let kind = null
let weatherCode = null
if (settings.locationModule) settings = await refreshLocation(settings)
if (settings.locationModule && settings.lat != null) {
  sun = sunTimes(now, settings.lat, settings.lon) || DEFAULT_SUN
  weatherCode = await getWeatherCode(settings)
  kind = weatherKind(weatherCode)
}
const [baseTop, baseBottom] = skyAt(now, skyKeyframes(sun))
const skyTop = tint(baseTop, kind), skyBottom = tint(baseBottom, kind)
const hourNow = now.getHours() + now.getMinutes() / 60
const isNight = hourNow < sun.sunrise || hourNow > sun.sunset

// Pick dark or light text, whichever stays more readable against both ends of the sky
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const DARK_TEXT = "#1b2a3a", LIGHT_TEXT = "#f2f5f8"
const worst = text => Math.min(contrast(luminance(text), luminance(skyTop)), contrast(luminance(text), luminance(skyBottom)))
const textHex = worst(DARK_TEXT) >= worst(LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT
C.ink = new Color(textHex)
C.muted = new Color(textHex, 0.75)


// =====================================================================
// Cigarette drawing
// =====================================================================
function drawCigarette(f) {
  const W = 280, H = 44
  const ctx = new DrawContext()
  ctx.size = new Size(W, H)
  ctx.opaque = false
  ctx.respectScreenScale = true

  const x0 = 2, filterW = 56, tipSpace = 34
  const bodyH = 18, y = 20                  // sits low to leave room for smoke
  const maxPaper = W - x0 - filterW - tipSpace
  const paperStart = x0 + filterW
  const paperEnd = paperStart + maxPaper * f

  // Paper
  if (paperEnd > paperStart) {
    const paperRect = new Rect(paperStart, y, paperEnd - paperStart, bodyH)
    ctx.setFillColor(C.paper)
    ctx.fillRect(paperRect)
    ctx.setStrokeColor(C.edge)
    ctx.setLineWidth(1)
    ctx.strokeRect(paperRect)
  }

  // Ember, then ash at the tip
  ctx.setFillColor(C.ember)
  ctx.fillRect(new Rect(paperEnd, y, 4, bodyH))
  const ash = new Path()
  ash.addRoundedRect(new Rect(paperEnd + 4, y + 1, 6, bodyH - 2), 2, 2)
  ctx.addPath(ash)
  ctx.setFillColor(C.ash)
  ctx.fillPath()

  // Filter with speckles (fixed positions so it doesn't flicker between refreshes)
  const filter = new Path()
  filter.addRoundedRect(new Rect(x0, y, filterW, bodyH), 4, 4)
  ctx.addPath(filter)
  ctx.setFillColor(C.filter)
  ctx.fillPath()
  ctx.setFillColor(C.filterDot)
  for (let i = 0; i < 10; i++) {
    const dx = 6 + (i * 23) % (filterW - 12)
    const dy = 4 + (i * 11) % (bodyH - 8)
    ctx.fillEllipse(new Rect(x0 + dx, y + dy, 2.5, 2.5))
  }

  // Two still wisps of smoke rising from the tip
  const tipX = paperEnd + 10, tipY = y + bodyH / 2
  ctx.setStrokeColor(C.smoke)
  ctx.setLineWidth(2)
  const s1 = new Path()
  s1.move(new Point(tipX, tipY))
  s1.addCurve(new Point(tipX + 12, 2), new Point(tipX + 16, tipY - 6), new Point(tipX, 12))
  ctx.addPath(s1)
  ctx.strokePath()
  ctx.setLineWidth(1.5)
  const s2 = new Path()
  s2.move(new Point(tipX + 2, tipY - 2))
  s2.addCurve(new Point(tipX + 20, 6), new Point(tipX + 6, tipY - 10), new Point(tipX + 22, 14))
  ctx.addPath(s2)
  ctx.strokePath()

  return ctx.getImage()
}

function addCount(stack, number, label, size) {
  stack.bottomAlignContent()
  const n = stack.addText(String(number))
  n.font = Font.heavyRoundedSystemFont(size)
  n.textColor = C.ink
  stack.addSpacer(6)
  const l = stack.addText(label)
  l.font = Font.mediumRoundedSystemFont(15)
  l.textColor = C.muted
  stack.addSpacer()  // pushes the row to the left edge (stacks are centred otherwise)
}


// =====================================================================
// Build the widget
// =====================================================================
const w = new ListWidget()
w.backgroundImage = drawSky(skyTop, skyBottom, kind, isNight)
w.setPadding(14, 16, 12, 16)
// Tapping the widget opens the page. With the optional module on, the rounded location and
// current weather ride along after "#", which stays on the phone and is never sent to GitHub.
// With it off, the link is plain and nothing about her location is included.
let link = PAGE_URL
if (settings.locationModule && settings.lat != null) {
  link += `#lat=${settings.lat}&lon=${settings.lon}` + (weatherCode != null ? `&w=${weatherCode}` : "")
}
w.url = link

const occ = occasionFor(now)
const greeting = occ && occ.text
const title = w.addText(greeting || "Búcsú a cigitől")  // on special days, the greeting takes the title's place
title.font = Font.semiboldRoundedSystemFont(14)
title.textColor = greeting ? C.ink : C.muted
title.lineLimit = 1
title.minimumScaleFactor = 0.8

w.addSpacer()

if (!quit) {
  const img = w.addImage(drawCigarette(fraction))
  img.imageSize = new Size(280, 44)
  img.leftAlignImage()
  w.addSpacer()
  addCount(w.addStack(), daysLeft, "nap van hátra", 34)          // "X days left"
} else {
  const since = -daysLeft
  if (since === 0) {
    const t = w.addText("Az első füstmentes nap")                // "The first smoke-free day"
    t.font = Font.heavyRoundedSystemFont(24)
    t.textColor = C.ink
  } else {
    addCount(w.addStack(), since, "napja füstmentes", 40)       // "smoke-free for X days"
  }
  w.addSpacer()
}

// Ask iOS to refresh every 30 minutes so the sky keeps up, and just after midnight so the
// day count flips. iOS treats this as a request and may refresh less often.
const nextMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 0, 1)
w.refreshAfterDate = new Date(Math.min(nextMidnight.getTime(), now.getTime() + 30 * 60000))

if (config.runsInWidget) {
  Script.setWidget(w)
} else if (showPreview) {
  await w.presentMedium()  // preview when run inside the Scriptable app
}
Script.complete()
