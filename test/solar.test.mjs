import assert from 'node:assert/strict'
import {
  pointInPolygon, polygonArea, rectInsidePolygon, convexOverlap, rectCorners, longestEdge,
  modulePlanSize, rowPitch, noonWinterAltitude, fillPolygon, shadowLength,
} from '../src/solar.js'

let n = 0
const t = (name, fn) => { fn(); n++; console.log('ok -', name) }
const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} !≈ ${b}`)

t('área de retângulo 10x5', () => {
  near(polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }]), 50)
})

// Exemplo do artigo SurgePV: lat 50°N, W=1,134, β=30°, meio-dia → pitch ≈ 2,890 m
t('pitch: exemplo publicado (50°N, 30°, meio-dia) ≈ 2,89 m', () => {
  const r = rowPitch({ slopeLengthM: 1.134, tiltDeg: 30, latDeg: 50, criterion: 'noon' })
  near(r.pitchM, 2.89, 0.01)
  near(noonWinterAltitude(50), 16.55, 0.01)
})

t('pitch hemisfério sul é simétrico ao norte (meio-dia)', () => {
  const s = rowPitch({ slopeLengthM: 2.278, tiltDeg: 20, latDeg: -23.5, criterion: 'noon' })
  const nn = rowPitch({ slopeLengthM: 2.278, tiltDeg: 20, latDeg: 23.5, criterion: 'noon' })
  near(s.pitchM, nn.pitchM, 1e-6)
  // altura = 2,278·sen20 = 0,779; α = 90−|−23,5−23,45| = 43,05° → sombra ≈ 0,779/tan(43,05°)=0,833
  near(s.shadowM, 0.779 / Math.tan((43.05 * Math.PI) / 180), 0.01)
})

t('9h–15h é ≥ meio-dia (mais conservador)', () => {
  const a = rowPitch({ slopeLengthM: 2.278, tiltDeg: 20, latDeg: -23.5, criterion: 'noon' })
  const b = rowPitch({ slopeLengthM: 2.278, tiltDeg: 20, latDeg: -23.5, criterion: '9to15' })
  assert.ok(b.pitchM >= a.pitchM - 1e-9)
})

t('inclinação 0 → pitch = comprimento do módulo', () => {
  near(rowPitch({ slopeLengthM: 2.278, tiltDeg: 0, latDeg: -23.5 }).pitchM, 2.278)
})

t('sombra com sol atrás do módulo = 0', () => {
  // verão no Sul (δ=-23,45) ao meio-dia em lat -10: sol ao Sul dos módulos (que olham Norte)
  assert.equal(shadowLength(1, -10, -23.45, 0), 0)
})

t('planta do módulo em telhado inclinado 30°: lado ao longo da água × cos30', () => {
  const m = modulePlanSize({ longM: 2.278, shortM: 1.134, orientation: 'portrait', slopeDeg: 30 })
  near(m.wM, 1.134); near(m.hM, 2.278 * Math.cos(Math.PI / 6))
  const l = modulePlanSize({ longM: 2.278, shortM: 1.134, orientation: 'landscape', slopeDeg: 30 })
  near(l.wM, 2.278); near(l.hM, 1.134 * Math.cos(Math.PI / 6))
})

t('retângulo dentro / fora / cruzando', () => {
  const poly = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
  assert.ok(rectInsidePolygon(rectCorners(50, 50, 20, 20), poly))
  assert.ok(!rectInsidePolygon(rectCorners(95, 50, 20, 20), poly))
  assert.ok(!rectInsidePolygon(rectCorners(200, 50, 20, 20), poly))
})

t('polígono côncavo (L): módulo no "vão" é rejeitado', () => {
  const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 }]
  assert.ok(rectInsidePolygon(rectCorners(20, 80, 20, 20), L))
  assert.ok(!rectInsidePolygon(rectCorners(70, 70, 20, 20), L))
  assert.ok(!rectInsidePolygon(rectCorners(40, 40, 30, 30), L)) // quina interna entra no retângulo
})

t('sobreposição (SAT)', () => {
  assert.ok(convexOverlap(rectCorners(0, 0, 10, 10), rectCorners(5, 5, 10, 10)))
  assert.ok(!convexOverlap(rectCorners(0, 0, 10, 10), rectCorners(10, 0, 10, 10))) // só encostam
  assert.ok(!convexOverlap(rectCorners(0, 0, 10, 10), rectCorners(30, 0, 10, 10)))
  assert.ok(convexOverlap(rectCorners(0, 0, 10, 10, 45), rectCorners(9, 0, 10, 10)))
})

t('aresta mais longa', () => {
  const r = longestEdge([{ x: 0, y: 0 }, { x: 100, y: 20 }, { x: 90, y: 60 }, { x: -10, y: 40 }])
  near(r.angle, (Math.atan2(20, 100) * 180) / Math.PI, 0.01)
})

// 10 m × 5 m com 1 m = 100 px, margem 0, módulo 1,134×2,278, sem folga:
// retrato → 8 colunas (9,07 m) × 2 linhas (4,556 m) = 16 módulos
t('preenchimento retângulo 10×5 m retrato = 16', () => {
  const roof = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 }, { x: 0, y: 500 }]
  const r = fillPolygon({ roof, angleDeg: 0, wPx: 113.4, hPx: 227.8, gapXPx: 0, gapYPx: 0, marginPx: 0 })
  assert.equal(r.length, 16)
})

t('margem de 0,5 m reduz a área útil', () => {
  const roof = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 }, { x: 0, y: 500 }]
  const a = fillPolygon({ roof, angleDeg: 0, wPx: 113.4, hPx: 227.8, gapXPx: 0, gapYPx: 0, marginPx: 0 })
  const b = fillPolygon({ roof, angleDeg: 0, wPx: 113.4, hPx: 227.8, gapXPx: 2, gapYPx: 2, marginPx: 50 })
  assert.ok(b.length < a.length)
  // todos respeitam a margem
  for (const p of b) {
    assert.ok(p.x - 113.4 / 2 >= 50 - 1e-6 && p.x + 113.4 / 2 <= 950 + 1e-6)
    assert.ok(p.y - 227.8 / 2 >= 50 - 1e-6 && p.y + 227.8 / 2 <= 450 + 1e-6)
  }
})

t('telhado girado 30°: preenche alinhado e sem sair do contorno', () => {
  const base = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 }, { x: 0, y: 500 }]
  const c = { x: 500, y: 250 }
  const roof = base.map((p) => { const a = Math.PI / 6; const dx = p.x - c.x, dy = p.y - c.y
    return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) } })
  const edge = longestEdge(roof)
  const r = fillPolygon({ roof, angleDeg: edge.angle, wPx: 113.4, hPx: 227.8, gapXPx: 0, gapYPx: 0, marginPx: 0 })
  assert.equal(r.length, 16)
  for (const p of r) assert.ok(rectInsidePolygon(rectCorners(p.x, p.y, 113.4, 227.8, p.rot), roof))
})

t('obstáculo remove módulos que ele toca', () => {
  const roof = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 500 }, { x: 0, y: 500 }]
  const obst = [[{ x: 480, y: 200 }, { x: 520, y: 200 }, { x: 520, y: 240 }, { x: 480, y: 240 }]]
  const a = fillPolygon({ roof, angleDeg: 0, wPx: 113.4, hPx: 227.8, gapXPx: 0, gapYPx: 0, marginPx: 0 })
  const b = fillPolygon({ roof, obstacles: obst, angleDeg: 0, wPx: 113.4, hPx: 227.8, gapXPx: 0, gapYPx: 0, marginPx: 0 })
  assert.ok(b.length < a.length)
  for (const p of b) assert.ok(!convexOverlap(rectCorners(p.x, p.y, 113.4, 227.8, p.rot), obst[0]))
})

t('nenhum módulo gerado se sobrepõe a outro', () => {
  const roof = [{ x: 0, y: 0 }, { x: 900, y: 40 }, { x: 860, y: 520 }, { x: 30, y: 480 }]
  const e = longestEdge(roof)
  const r = fillPolygon({ roof, angleDeg: e.angle, wPx: 113.4, hPx: 227.8, gapXPx: 2, gapYPx: 2, marginPx: 30 })
  for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++)
    assert.ok(!convexOverlap(rectCorners(r[i].x, r[i].y, 113.4, 227.8, r[i].rot), rectCorners(r[j].x, r[j].y, 113.4, 227.8, r[j].rot), 1e-3))
})

t('corredor livre insere vão a cada N px', () => {
  const roof = [{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 300 }, { x: 0, y: 300 }]
  const a = fillPolygon({ roof, angleDeg: 0, wPx: 113.4, hPx: 227.8, gapXPx: 0, gapYPx: 0, marginPx: 0 })
  const b = fillPolygon({ roof, angleDeg: 0, wPx: 113.4, hPx: 227.8, gapXPx: 0, gapYPx: 0, marginPx: 0, corridor: { everyPx: 1600, widthPx: 200 } })
  assert.ok(b.length < a.length)
})

console.log(`\n${n} testes passaram`)
