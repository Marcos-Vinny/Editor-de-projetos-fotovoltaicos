// Lógica pura (sem React) do SolarLayout: geometria, posição solar e preenchimento.
// Tudo aqui é testável em Node (ver test/solar.test.mjs).
//
// Convenção: coordenadas da imagem em pixels (x → direita, y → para baixo).
// Ângulos em graus, sentido horário na tela (eixo y para baixo).

const DEG = Math.PI / 180

// ---------- catálogo de módulos ----------
// Dimensões conferidas em datasheets/lojas (ver README). Variam por fabricante:
// SEMPRE confirme no datasheet do módulo que você vai usar.
export const MODULE_PRESETS = [
  { id: 'p550', label: '550 W · 144 meias-células (2278×1134)', wp: 550, longM: 2.278, shortM: 1.134 },
  { id: 'p555', label: '555 W · 144 meias-células (2278×1134)', wp: 555, longM: 2.278, shortM: 1.134 },
  { id: 'p700', label: '700 W · 132 meias-células (2384×1303)', wp: 700, longM: 2.384, shortM: 1.303 },
  { id: 'p415', label: '415 W · 108 meias-células (≈1722×1134)', wp: 415, longM: 1.722, shortM: 1.134 },
  { id: 'custom', label: 'Personalizado (digitar medidas)', wp: null, longM: null, shortM: null },
]

// ---------- geometria básica ----------

export function rot(p, angleDeg, c = { x: 0, y: 0 }) {
  const a = angleDeg * DEG
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

export function pointInPolygon(point, vertices) {
  let inside = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y
    const xj = vertices[j].x, yj = vertices[j].y
    const hit = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

export function polygonArea(vertices) {
  let a = 0
  for (let i = 0; i < vertices.length; i++) {
    const p = vertices[i]
    const q = vertices[(i + 1) % vertices.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

export function polygonCentroidSimple(vertices) {
  const n = vertices.length
  return {
    x: vertices.reduce((s, p) => s + p.x, 0) / n,
    y: vertices.reduce((s, p) => s + p.y, 0) / n,
  }
}

export function polygonBounds(vertices) {
  const xs = vertices.map((p) => p.x)
  const ys = vertices.map((p) => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

// cantos de um retângulo centrado em (cx,cy), w×h, girado `angleDeg`
export function rectCorners(cx, cy, w, h, angleDeg = 0) {
  const hw = w / 2
  const hh = h / 2
  const c = { x: cx, y: cy }
  return [
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
  ].map((p) => (angleDeg ? rot(p, angleDeg, c) : p))
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx
}

// interseção própria de dois segmentos (ignora apenas toque em ponta colinear)
export function segmentsIntersect(p1, p2, p3, p4) {
  const d1 = cross(p4.x - p3.x, p4.y - p3.y, p1.x - p3.x, p1.y - p3.y)
  const d2 = cross(p4.x - p3.x, p4.y - p3.y, p2.x - p3.x, p2.y - p3.y)
  const d3 = cross(p2.x - p1.x, p2.y - p1.y, p3.x - p1.x, p3.y - p1.y)
  const d4 = cross(p2.x - p1.x, p2.y - p1.y, p4.x - p1.x, p4.y - p1.y)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

// retângulo (4 cantos) totalmente dentro do polígono?
export function rectInsidePolygon(corners, polygon) {
  if (!corners.every((c) => pointInPolygon(c, polygon))) return false
  for (let i = 0; i < 4; i++) {
    const a = corners[i]
    const b = corners[(i + 1) % 4]
    for (let j = 0; j < polygon.length; j++) {
      if (segmentsIntersect(a, b, polygon[j], polygon[(j + 1) % polygon.length])) return false
    }
  }
  // vértice do polígono "mordendo" o retângulo (polígono côncavo)
  for (const v of polygon) if (pointInPolygon(v, corners)) return false
  return true
}

// retângulo toca/atravessa o polígono (usado p/ obstáculos)?
export function rectTouchesPolygon(corners, polygon) {
  if (corners.some((c) => pointInPolygon(c, polygon))) return true
  if (polygon.some((v) => pointInPolygon(v, corners))) return true
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < polygon.length; j++) {
      if (segmentsIntersect(corners[i], corners[(i + 1) % 4], polygon[j], polygon[(j + 1) % polygon.length])) return true
    }
  }
  return false
}

// dois retângulos convexos se sobrepõem? (SAT) — `tol` ignora encostar
export function convexOverlap(a, b, tol = 1e-6) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]
      const q = poly[(i + 1) % poly.length]
      const nx = -(q.y - p.y)
      const ny = q.x - p.x
      const len = Math.hypot(nx, ny) || 1
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity
      for (const v of a) { const d = (v.x * nx + v.y * ny) / len; minA = Math.min(minA, d); maxA = Math.max(maxA, d) }
      for (const v of b) { const d = (v.x * nx + v.y * ny) / len; minB = Math.min(minB, d); maxB = Math.max(maxB, d) }
      if (maxA <= minB + tol || maxB <= minA + tol) return false
    }
  }
  return true
}

// ângulo (graus, −90..90] da aresta mais longa — bom palpite p/ alinhar as fileiras
export function longestEdge(vertices) {
  let best = { len: -1, angle: 0, index: 0 }
  vertices.forEach((p, i) => {
    const q = vertices[(i + 1) % vertices.length]
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    if (len > best.len) best = { len, angle: edgeAngle(p, q), index: i }
  })
  return best
}

export function edgeAngle(p, q) {
  let a = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI
  while (a > 90) a -= 180
  while (a <= -90) a += 180
  return a
}

// ---------- módulo ----------

// Dimensões do módulo vistas de CIMA (planta).
//  - mode 'pitched' (telhado inclinado, módulo rente): a medida ao longo da água
//    "encolhe" por cos(inclinação do telhado), porque a foto de satélite mostra a projeção horizontal.
//  - mode 'tilted' (laje/telhado plano com estrutura): a medida ao longo da inclinação
//    do módulo encolhe por cos(inclinação da estrutura).
// `slopeDeg` já é a inclinação relevante (telhado ou estrutura).
export function modulePlanSize({ longM, shortM, orientation, slopeDeg }) {
  const k = Math.cos((slopeDeg || 0) * DEG)
  // retrato: lado longo é a profundidade (eixo y local, ao longo da inclinação)
  // paisagem: lado curto é a profundidade
  if (orientation === 'portrait') return { wM: shortM, hM: longM * k, realDepthM: longM, k }
  return { wM: longM, hM: shortM * k, realDepthM: shortM, k }
}

// ---------- posição solar / espaçamento entre fileiras ----------

// vetor unitário do Sol (leste, norte, cima) — declinação δ, latitude φ, ângulo horário ω (graus)
export function sunVector(latDeg, declDeg, hourAngleDeg) {
  const φ = latDeg * DEG, δ = declDeg * DEG, ω = hourAngleDeg * DEG
  return {
    e: -Math.cos(δ) * Math.sin(ω),
    n: Math.sin(δ) * Math.cos(φ) - Math.cos(δ) * Math.cos(ω) * Math.sin(φ),
    z: Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(ω),
  }
}

// Sombra (m, medida perpendicular às fileiras) projetada por uma aresta de altura h.
// Módulos voltados para o equador (Norte no hemisfério Sul, Sul no Norte).
export function shadowLength(heightM, latDeg, declDeg, hourAngleDeg) {
  const s = sunVector(latDeg, declDeg, hourAngleDeg)
  if (s.z <= 0.02) return Infinity // sol no horizonte
  const faceN = latDeg < 0 ? 1 : -1
  const along = s.n * faceN // componente do sol na direção para onde o módulo "olha"
  if (along <= 0) return 0 // sol atrás do módulo: não sombreia a fileira de trás
  return (heightM * along) / s.z
}

// Passo (pitch) entre fileiras: distância horizontal entre as bordas baixas de fileiras consecutivas.
//   P = L·cosβ + sombra(L·senβ)
// criterio: 'noon'  → meio-dia solar no solstício de inverno (referência clássica)
//           '9to15' → pior caso entre 9h, 12h e 15h solares (mais conservador)
export function rowPitch({ slopeLengthM, tiltDeg, latDeg, criterion = '9to15' }) {
  const β = tiltDeg * DEG
  const h = slopeLengthM * Math.sin(β)
  const base = slopeLengthM * Math.cos(β)
  // solstício de inverno do hemisfério: dez (δ=−23,45°) no Norte; jun (δ=+23,45°) no Sul
  const decl = latDeg < 0 ? 23.45 : -23.45
  const hours = criterion === 'noon' ? [0] : [-45, 0, 45]
  let shadow = 0
  for (const ω of hours) shadow = Math.max(shadow, shadowLength(h, latDeg, decl, ω))
  return { pitchM: base + shadow, shadowM: shadow, baseM: base, heightM: h }
}

// altitude solar ao meio-dia no solstício de inverno (graus) — informativo
export function noonWinterAltitude(latDeg) {
  const decl = latDeg < 0 ? 23.45 : -23.45
  return 90 - Math.abs(latDeg - decl)
}

// ---------- preenchimento automático ----------

/**
 * Preenche o contorno com módulos.
 *  roof       : [{x,y}] polígono (px)
 *  obstacles  : [[{x,y}]] polígonos a evitar (px)
 *  existing   : painéis já existentes a preservar ([{x,y,w,h,rot}] em px) — opcional
 *  angleDeg   : ângulo das fileiras
 *  wPx,hPx    : tamanho do módulo em planta (px)
 *  gapXPx     : folga entre módulos na fileira
 *  gapYPx     : folga entre fileiras (em tilted = pitch − hPx)
 *  marginPx   : afastamento mínimo da borda do telhado
 *  obstMarginPx: afastamento mínimo dos obstáculos
 *  corridor   : { everyPx, widthPx } corredor livre opcional ao longo da fileira
 * Testa várias "fases" da grade e devolve a que acomoda mais módulos.
 */
export function fillPolygon({
  roof, obstacles = [], angleDeg, wPx, hPx, gapXPx, gapYPx, marginPx, obstMarginPx = 0,
  corridor = null, phases = 6,
}) {
  if (!roof || roof.length < 3 || wPx <= 0 || hPx <= 0) return []
  const c = polygonCentroidSimple(roof)
  const roofL = roof.map((p) => rot(p, -angleDeg, c))
  const obstL = obstacles.map((o) => o.map((p) => rot(p, -angleDeg, c)))
  const b = polygonBounds(roofL)
  const stepX = wPx + gapXPx
  const stepY = hPx + gapYPx

  const fits = (cx, cy) => {
    const inflated = rectCornersAxis(cx, cy, wPx + 2 * marginPx, hPx + 2 * marginPx)
    if (!rectInsidePolygon(inflated, roofL)) return false
    if (obstL.length) {
      const infl2 = rectCornersAxis(cx, cy, wPx + 2 * obstMarginPx, hPx + 2 * obstMarginPx)
      for (const o of obstL) if (rectTouchesPolygon(infl2, o)) return false
    }
    return true
  }

  let best = []
  for (let iy = 0; iy < phases; iy++) {
    for (let ix = 0; ix < phases; ix++) {
      const found = []
      const oy = (stepY * iy) / phases
      const ox = (stepX * ix) / phases
      for (let y = b.minY + oy + hPx / 2; y + hPx / 2 <= b.maxY + 1e-6; y += stepY) {
        let run = 0
        let x = b.minX + ox + wPx / 2
        for (; x + wPx / 2 <= b.maxX + 1e-6; x += stepX) {
          if (corridor && corridor.everyPx > 0 && run + wPx > corridor.everyPx) {
            x += corridor.widthPx
            run = 0
            if (x + wPx / 2 > b.maxX + 1e-6) break
          }
          if (fits(x, y)) {
            found.push({ x, y })
            run += stepX
          } else {
            run = 0 // buraco natural (obstáculo/borda) já quebra a sequência
          }
        }
      }
      if (found.length > best.length) best = found
    }
  }
  return best.map((p) => {
    const g = rot(p, angleDeg, c)
    return { x: g.x, y: g.y, rot: angleDeg }
  })
}

function rectCornersAxis(cx, cy, w, h) {
  const hw = w / 2, hh = h / 2
  return [
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
  ]
}

// ---------- estimativa de geração ----------
// kWh/mês ≈ kWp × HSP (kWh/m²/dia) × 30 × PR
export function monthlyGeneration({ kWp, hsp, pr }) {
  return kWp * hsp * 30 * pr
}

// ---------- escala para exibir barra de escala ----------
export function niceLength(meters) {
  const steps = [0.5, 1, 2, 5, 10, 20, 50, 100]
  let best = steps[0]
  for (const s of steps) if (s <= meters) best = s
  return best
}
