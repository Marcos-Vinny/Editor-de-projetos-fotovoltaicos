import { useState, useRef, useCallback, useMemo, useEffect, memo } from 'react'
import { Stage, Layer, Image as KonvaImage, Line, Group, Rect, Circle, Text } from 'react-konva'
import useImage from 'use-image'
import * as S from './solar.js'

// ---------- constantes ----------

const MODES = { IDLE: 'idle', CALIBRATE: 'calibrate', DRAW_ROOF: 'draw_roof', DRAW_OBST: 'draw_obst' }
const MONO = 'IBM Plex Mono, monospace'

let _idCounter = 0
const uid = () => `p${Date.now().toString(36)}${(_idCounter++).toString(36)}`

const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—')

function fitView(img, size, cap = 1.5) {
  if (!img || !size.w || !size.h) return { x: 0, y: 0, scale: 1 }
  const scale = Math.min(size.w / img.width, size.h / img.height, cap) * 0.96
  return { scale, x: (size.w - img.width * scale) / 2, y: (size.h - img.height * scale) / 2 }
}

// ---------- camada de imagem ----------

function BackgroundImage({ image, opacity }) {
  if (!image) return null
  return <KonvaImage image={image} opacity={opacity} listening={false} />
}

// ---------- módulo (placa) ----------

const SolarPanel = memo(function SolarPanel({ panel, ppm, selected, invalid, draggable, onSelect, onDragStart, onChange }) {
  const w = panel.wM * ppm
  const h = panel.hM * ppm
  const portrait = panel.orient === 'portrait'
  const cols = portrait ? 6 : 12
  const rows = portrait ? 12 : 6
  const lines = []
  for (let c = 1; c < cols; c++) {
    const x = -w / 2 + (w / cols) * c
    lines.push(<Line key={`c${c}`} points={[x, -h / 2, x, h / 2]} stroke="#0b1e33" strokeWidth={1} strokeScaleEnabled={false} listening={false} />)
  }
  for (let r = 1; r < rows; r++) {
    const y = -h / 2 + (h / rows) * r
    lines.push(<Line key={`r${r}`} points={[-w / 2, y, w / 2, y]} stroke="#0b1e33" strokeWidth={1} strokeScaleEnabled={false} listening={false} />)
  }
  const stroke = invalid ? '#e0554a' : selected ? '#f5a623' : '#4a7bb0'
  return (
    <Group
      x={panel.x}
      y={panel.y}
      rotation={panel.rot}
      listening={draggable}
      draggable={draggable}
      onClick={(e) => { e.cancelBubble = true; onSelect(panel.id) }}
      onTap={(e) => { e.cancelBubble = true; onSelect(panel.id) }}
      onDragStart={(e) => { e.cancelBubble = true; onSelect(panel.id); onDragStart() }}
      onDragMove={(e) => { e.cancelBubble = true }}
      onDragEnd={(e) => { e.cancelBubble = true; onChange(panel.id, { x: e.target.x(), y: e.target.y() }) }}
    >
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill={invalid ? '#4a1f24' : '#14314f'}
        stroke={stroke}
        strokeWidth={selected || invalid ? 2.5 : 1.25}
        strokeScaleEnabled={false}
        cornerRadius={1}
      />
      {lines}
    </Group>
  )
})

// ---------- campos ----------

function NumField({ value, onChange, min, max, style }) {
  const [txt, setTxt] = useState(String(value))
  useEffect(() => {
    const parsed = parseFloat(String(txt).replace(',', '.'))
    if (parsed !== value) setTxt(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      type="text"
      inputMode="decimal"
      value={txt}
      style={{ ...inputStyle, ...style }}
      onChange={(e) => {
        setTxt(e.target.value)
        let v = parseFloat(e.target.value.replace(',', '.'))
        if (Number.isNaN(v)) return
        if (min !== undefined) v = Math.max(min, v)
        if (max !== undefined) v = Math.min(max, v)
        onChange(v)
      }}
      onBlur={() => setTxt(String(value))}
    />
  )
}

// ---------- app ----------

export default function App() {
  // imagem / vista
  const [imageSrc, setImageSrc] = useState(null)
  const [image] = useImage(imageSrc || '')
  const img = imageSrc ? image : null
  const [imgOpacity, setImgOpacity] = useState(0.9)
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [stageSize, setStageSize] = useState({ w: 900, h: 700 })
  const [cursor, setCursor] = useState(null)
  const [exporting, setExporting] = useState(false)

  // modo / desenho
  const [mode, setMode] = useState(MODES.IDLE)
  const [ppm, setPpm] = useState(null) // pixels por metro
  const [calibPoints, setCalibPoints] = useState([])
  const [calibLength, setCalibLength] = useState('')
  const [roofPoints, setRoofPoints] = useState([])
  const [roofClosed, setRoofClosed] = useState(false)
  const [obstacles, setObstacles] = useState([])
  const [obstPoints, setObstPoints] = useState([])

  // cobertura
  const [roofType, setRoofType] = useState('pitched') // pitched | tilted
  const [roofSlope, setRoofSlope] = useState(20)
  const [tilt, setTilt] = useState(15)
  const [lat, setLat] = useState(-23.5)
  const [criterion, setCriterion] = useState('9to15')
  const [northAngle, setNorthAngle] = useState(0)
  const [gridAngle, setGridAngle] = useState(0)

  // módulo
  const [presetId, setPresetId] = useState('p550')
  const [longM, setLongM] = useState(2.278)
  const [shortM, setShortM] = useState(1.134)
  const [wp, setWp] = useState(550)
  const [orientation, setOrientation] = useState('auto') // auto | portrait | landscape

  // afastamentos
  const [marginM, setMarginM] = useState(0.5)
  const [obstMarginM, setObstMarginM] = useState(0.3)
  const [gapCm, setGapCm] = useState(2)
  const [corrEveryM, setCorrEveryM] = useState(0)
  const [corrWidthM, setCorrWidthM] = useState(2)

  // geração
  const [hsp, setHsp] = useState(4.8)
  const [pr, setPr] = useState(0.8)

  // placas
  const [panels, setPanels] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [history, setHistory] = useState([])
  const [notice, setNotice] = useState('')

  const stageRef = useRef(null)
  const mainRef = useRef(null)
  const fileInputRef = useRef(null)
  const panelsRef = useRef(panels)
  panelsRef.current = panels

  // ---------- tamanho do palco ----------
  useEffect(() => {
    const el = mainRef.current
    if (!el) return
    const update = () => setStageSize({ w: Math.max(200, el.clientWidth), h: Math.max(200, el.clientHeight) })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // enquadra a imagem quando carrega
  useEffect(() => {
    if (img) setView(fitView(img, stageSize))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img])

  // ---------- histórico ----------
  const pushHistory = useCallback(() => {
    const snapshot = panelsRef.current // lido AQUI (no evento), não dentro do updater
    setHistory((h) => [...h.slice(-49), snapshot])
  }, [])

  const commitPanels = useCallback((next) => {
    pushHistory()
    setPanels(next)
  }, [pushHistory])

  // ---------- imagem ----------
  const loadFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return
    setImageSrc((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(file)
    })
    setPpm(null)
    setCalibPoints([])
    setRoofPoints([])
    setRoofClosed(false)
    setObstacles([])
    setObstPoints([])
    setPanels([])
    setHistory([])
    setSelectedId(null)
    setMode(MODES.IDLE)
    setNotice('')
  }, [])

  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'))
      if (item) loadFile(item.getAsFile())
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [loadFile])

  // ---------- derivados ----------
  const slopeDeg = roofType === 'tilted' ? tilt : roofSlope

  const sizeFor = useCallback(
    (orient) => S.modulePlanSize({ longM, shortM, orientation: orient, slopeDeg }),
    [longM, shortM, slopeDeg]
  )

  const pitchInfo = useMemo(() => {
    if (roofType !== 'tilted') return null
    const o = orientation === 'landscape' ? 'landscape' : 'portrait'
    const sz = S.modulePlanSize({ longM, shortM, orientation: o, slopeDeg: 0 })
    return {
      ...S.rowPitch({ slopeLengthM: o === 'portrait' ? longM : shortM, tiltDeg: tilt, latDeg: lat, criterion }),
      altitude: S.noonWinterAltitude(lat),
      orient: o,
      slopeLen: sz.hM,
    }
  }, [roofType, orientation, longM, shortM, tilt, lat, criterion])

  const roofEdges = useMemo(() => {
    if (!ppm || roofPoints.length < 2) return []
    const n = roofClosed ? roofPoints.length : roofPoints.length - 1
    return Array.from({ length: n }, (_, i) => {
      const a = roofPoints[i]
      const b = roofPoints[(i + 1) % roofPoints.length]
      return { a, b, lenM: Math.hypot(b.x - a.x, b.y - a.y) / ppm, angle: S.edgeAngle(a, b) }
    })
  }, [roofPoints, roofClosed, ppm])

  const roofPlanAreaM2 = useMemo(() => {
    if (!ppm || !roofClosed || roofPoints.length < 3) return null
    return S.polygonArea(roofPoints) / (ppm * ppm)
  }, [roofPoints, roofClosed, ppm])

  // em telhado inclinado a foto mostra a projeção; a superfície real é maior
  const roofRealAreaM2 = roofPlanAreaM2 && roofType === 'pitched' ? roofPlanAreaM2 / Math.cos((roofSlope * Math.PI) / 180) : roofPlanAreaM2

  // placas com problema (fora do contorno, sobrepostas ou em obstáculo)
  const invalidIds = useMemo(() => {
    const bad = new Set()
    if (!ppm || panels.length === 0) return bad
    const shrink = 1.5
    const corners = panels.map((p) => S.rectCorners(p.x, p.y, p.wM * ppm - shrink, p.hM * ppm - shrink, p.rot))
    panels.forEach((p, i) => {
      if (roofClosed && !S.rectInsidePolygon(corners[i], roofPoints)) bad.add(p.id)
      for (const o of obstacles) if (S.rectTouchesPolygon(corners[i], o)) bad.add(p.id)
    })
    for (let i = 0; i < panels.length; i++) {
      for (let j = i + 1; j < panels.length; j++) {
        const reach = (Math.hypot(panels[i].wM, panels[i].hM) + Math.hypot(panels[j].wM, panels[j].hM)) * ppm * 0.5
        if (Math.hypot(panels[i].x - panels[j].x, panels[i].y - panels[j].y) > reach) continue
        if (S.convexOverlap(corners[i], corners[j], 1)) { bad.add(panels[i].id); bad.add(panels[j].id) }
      }
    }
    return bad
  }, [panels, ppm, roofClosed, roofPoints, obstacles])

  const stats = useMemo(() => {
    const count = panels.length
    const kWp = (count * wp) / 1000
    const realArea = count * longM * shortM
    const kwhMonth = S.monthlyGeneration({ kWp, hsp, pr })
    return { count, kWp, realArea, kwhMonth }
  }, [panels, wp, longM, shortM, hsp, pr])

  // ---------- escala ----------
  const confirmCalibration = () => {
    const meters = parseFloat(calibLength.replace(',', '.'))
    if (calibPoints.length < 2) return
    const px = Math.hypot(calibPoints[1].x - calibPoints[0].x, calibPoints[1].y - calibPoints[0].y)
    if (!(meters > 0) || px < 5) { setNotice('Informe a distância real em metros (maior que zero) e marque 2 pontos distantes.'); return }
    const next = px / meters
    if (panels.length && ppm && Math.abs(next - ppm) / ppm > 0.001) {
      commitPanels([])
      setSelectedId(null)
      setNotice('Escala alterada: as placas foram removidas (use Ctrl+Z para voltar). Refaça o preenchimento.')
    } else setNotice('')
    setPpm(next)
    setMode(MODES.IDLE)
    setCalibPoints([])
    setCalibLength('')
  }

  const cancelCalibration = () => { setCalibPoints([]); setCalibLength(''); setMode(MODES.IDLE) }

  // ---------- contorno / obstáculos ----------
  const closeRoof = useCallback((pts) => {
    if (pts.length < 3) return
    setRoofClosed(true)
    setMode(MODES.IDLE)
    setGridAngle(Math.round(S.longestEdge(pts).angle * 10) / 10)
  }, [])

  const startRoof = () => { setRoofPoints([]); setRoofClosed(false); setMode(MODES.DRAW_ROOF); setCursor(null) }
  const startObstacle = () => { setObstPoints([]); setMode(MODES.DRAW_OBST); setCursor(null) }
  const closeObstacle = useCallback((pts) => {
    if (pts.length >= 3) setObstacles((o) => [...o, pts])
    setObstPoints([])
    setMode(MODES.IDLE)
  }, [])

  // ---------- cliques no palco ----------
  const handleStageClick = (e) => {
    const stage = stageRef.current
    const pos = stage.getRelativePointerPosition()
    if (!pos) return
    const closeDist = 12 / view.scale

    if (mode === MODES.CALIBRATE) {
      if (calibPoints.length < 2) setCalibPoints([...calibPoints, pos])
      return
    }
    if (mode === MODES.DRAW_ROOF) {
      if (roofPoints.length >= 3 && Math.hypot(pos.x - roofPoints[0].x, pos.y - roofPoints[0].y) < closeDist) {
        closeRoof(roofPoints)
        return
      }
      setRoofPoints([...roofPoints, pos])
      return
    }
    if (mode === MODES.DRAW_OBST) {
      if (obstPoints.length >= 3 && Math.hypot(pos.x - obstPoints[0].x, pos.y - obstPoints[0].y) < closeDist) {
        closeObstacle(obstPoints)
        return
      }
      setObstPoints([...obstPoints, pos])
      return
    }
    if (e.target === stage) setSelectedId(null)
  }

  const handleMouseMove = () => {
    if (mode === MODES.IDLE) return
    const p = stageRef.current?.getRelativePointerPosition()
    if (p) setCursor(p)
  }

  const handleWheel = (e) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    const pointer = stage.getPointerPosition()
    const old = view.scale
    const factor = e.evt.deltaY > 0 ? 1 / 1.12 : 1.12
    const scale = Math.min(30, Math.max(0.03, old * factor))
    const anchor = { x: (pointer.x - view.x) / old, y: (pointer.y - view.y) / old }
    setView({ scale, x: pointer.x - anchor.x * scale, y: pointer.y - anchor.y * scale })
  }

  const zoomBy = (f) => {
    const cx = stageSize.w / 2, cy = stageSize.h / 2
    const scale = Math.min(30, Math.max(0.03, view.scale * f))
    const anchor = { x: (cx - view.x) / view.scale, y: (cy - view.y) / view.scale }
    setView({ scale, x: cx - anchor.x * scale, y: cy - anchor.y * scale })
  }

  // ---------- placas ----------
  const makePanel = useCallback((x, y, rotDeg, orient) => {
    const sz = S.modulePlanSize({ longM, shortM, orientation: orient, slopeDeg })
    return { id: uid(), x, y, rot: rotDeg, orient, wM: sz.wM, hM: sz.hM, longM, shortM, slopeDeg }
  }, [longM, shortM, slopeDeg])

  const effectiveAngle = roofType === 'tilted' ? northAngle : gridAngle

  const addSinglePanel = () => {
    if (!ppm) return
    const cx = (stageSize.w / 2 - view.x) / view.scale
    const cy = (stageSize.h / 2 - view.y) / view.scale
    const orient = orientation === 'landscape' ? 'landscape' : 'portrait'
    const p = makePanel(cx, cy, effectiveAngle, orient)
    commitPanels([...panels, p])
    setSelectedId(p.id)
  }

  const autoFill = () => {
    if (!ppm || !roofClosed) return
    if (!(longM > 0 && shortM > 0)) { setNotice('Preencha as medidas do módulo.'); return }
    const gapM = gapCm / 100
    const orients = orientation === 'auto' ? ['portrait', 'landscape'] : [orientation]
    let best = null
    for (const orient of orients) {
      const sz = sizeFor(orient)
      let gapYM = gapM
      if (roofType === 'tilted') {
        const rp = S.rowPitch({ slopeLengthM: sz.realDepthM, tiltDeg: tilt, latDeg: lat, criterion })
        gapYM = Math.max(gapM, rp.pitchM - sz.hM)
      }
      const res = S.fillPolygon({
        roof: roofPoints,
        obstacles,
        angleDeg: effectiveAngle,
        wPx: sz.wM * ppm,
        hPx: sz.hM * ppm,
        gapXPx: gapM * ppm,
        gapYPx: gapYM * ppm,
        marginPx: marginM * ppm,
        obstMarginPx: obstMarginM * ppm,
        corridor: corrEveryM > 0 ? { everyPx: corrEveryM * ppm, widthPx: corrWidthM * ppm } : null,
      })
      if (!best || res.length > best.res.length) best = { res, orient }
    }
    const next = best.res.map((r) => makePanel(r.x, r.y, r.rot, best.orient))
    commitPanels(next)
    setSelectedId(null)
    setNotice(
      next.length
        ? `${next.length} módulos em ${best.orient === 'portrait' ? 'retrato' : 'paisagem'}.`
        : 'Nenhum módulo coube. Reduza os afastamentos, confira a escala ou o contorno.'
    )
  }

  const updatePanel = useCallback((id, attrs) => {
    setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, ...attrs } : p)))
  }, [])

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    commitPanels(panelsRef.current.filter((p) => p.id !== selectedId))
    setSelectedId(null)
  }, [selectedId, commitPanels])

  const rotateSelected = useCallback(() => {
    if (!selectedId) return
    pushHistory()
    setPanels((prev) =>
      prev.map((p) => {
        if (p.id !== selectedId) return p
        const orient = p.orient === 'portrait' ? 'landscape' : 'portrait'
        const sz = S.modulePlanSize({ longM: p.longM, shortM: p.shortM, orientation: orient, slopeDeg: p.slopeDeg })
        return { ...p, orient, wM: sz.wM, hM: sz.hM }
      })
    )
  }, [selectedId, pushHistory])

  const nudgeSelected = useCallback((dxM, dyM) => {
    if (!selectedId || !ppm) return
    pushHistory()
    setPanels((prev) => prev.map((p) => (p.id === selectedId ? { ...p, x: p.x + dxM * ppm, y: p.y + dyM * ppm } : p)))
  }, [selectedId, ppm, pushHistory])

  const undo = useCallback(() => {
    if (mode === MODES.DRAW_ROOF && roofPoints.length) { setRoofPoints((p) => p.slice(0, -1)); return }
    if (mode === MODES.DRAW_OBST && obstPoints.length) { setObstPoints((p) => p.slice(0, -1)); return }
    if (mode === MODES.CALIBRATE && calibPoints.length) { setCalibPoints((p) => p.slice(0, -1)); return }
    if (!history.length) return
    setPanels(history[history.length - 1])
    setHistory(history.slice(0, -1))
    setSelectedId(null)
  }, [mode, roofPoints.length, obstPoints.length, calibPoints.length, history])

  // ---------- teclado ----------
  const keyRef = useRef(null)
  keyRef.current = (e) => {
    const tag = e.target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
    const k = e.key.toLowerCase()
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); return }
    if (k === 'escape') {
      if (mode === MODES.CALIBRATE) cancelCalibration()
      else if (mode === MODES.DRAW_ROOF) { setMode(MODES.IDLE); if (!roofClosed) setRoofPoints([]) }
      else if (mode === MODES.DRAW_OBST) { setObstPoints([]); setMode(MODES.IDLE) }
      else setSelectedId(null)
      return
    }
    if (k === 'enter') {
      if (mode === MODES.DRAW_ROOF) closeRoof(roofPoints)
      if (mode === MODES.DRAW_OBST) closeObstacle(obstPoints)
      return
    }
    if (mode !== MODES.IDLE) return
    if (k === 'delete' || k === 'backspace') { if (selectedId) { e.preventDefault(); deleteSelected() } return }
    if (k === 'r') { rotateSelected(); return }
    const step = e.shiftKey ? 0.25 : 0.05
    if (k === 'arrowleft') { e.preventDefault(); nudgeSelected(-step, 0) }
    if (k === 'arrowright') { e.preventDefault(); nudgeSelected(step, 0) }
    if (k === 'arrowup') { e.preventDefault(); nudgeSelected(0, -step) }
    if (k === 'arrowdown') { e.preventDefault(); nudgeSelected(0, step) }
  }
  useEffect(() => {
    const fn = (e) => keyRef.current && keyRef.current(e)
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  // ---------- exportar ----------
  const exportPNG = () => {
    if (!img) return
    const prev = view
    const fit = fitView(img, stageSize, 100)
    setSelectedId(null)
    setView(fit)
    setExporting(true)
    setTimeout(() => {
      const stage = stageRef.current
      const uri = stage.toDataURL({
        x: fit.x, y: fit.y, width: img.width * fit.scale, height: img.height * fit.scale,
        pixelRatio: Math.min(4, Math.max(1, 1 / fit.scale)),
      })
      const a = document.createElement('a')
      a.download = 'projeto-solar.png'
      a.href = uri
      a.click()
      setExporting(false)
      setView(prev)
    }, 150)
  }

  // ---------- selecionada ----------
  const selected = panels.find((p) => p.id === selectedId) || null

  // dica contextual
  const hint = !img
    ? 'Carregue (ou cole com Ctrl+V) uma imagem de satélite do telhado.'
    : mode === MODES.CALIBRATE
    ? `Calibrar: clique em 2 pontos de uma medida conhecida (${calibPoints.length}/2).`
    : mode === MODES.DRAW_ROOF
    ? 'Clique em cada canto do telhado. Clique no 1º ponto ou Enter para fechar · Ctrl+Z desfaz o último ponto · Esc cancela.'
    : mode === MODES.DRAW_OBST
    ? 'Clique nos cantos do obstáculo (chaminé, caixa d’água, claraboia…). Clique no 1º ponto ou Enter para fechar.'
    : !ppm
    ? 'Passo 2: calibre a escala para as medidas ficarem corretas.'
    : !roofClosed
    ? 'Passo 3: desenhe o contorno da área útil do telhado.'
    : ''

  // barra de escala (tela)
  const scaleBar = useMemo(() => {
    if (!ppm) return null
    const targetM = 110 / (ppm * view.scale)
    const m = S.niceLength(targetM)
    return { m, px: m * ppm * view.scale }
  }, [ppm, view.scale])

  const drawing = mode === MODES.DRAW_ROOF || mode === MODES.DRAW_OBST
  const livePts = mode === MODES.DRAW_ROOF ? roofPoints : mode === MODES.DRAW_OBST ? obstPoints : []
  const inv = 1 / view.scale // para manter tamanho de texto/alças constante na tela

  // ---------- render ----------
  return (
    <div className="app-shell">
      <aside style={asideStyle('right')} className="scrollbar-thin">
        <header style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--bp-amber)', letterSpacing: 2 }}>SOLAR·LAYOUT</div>
          <div style={{ fontSize: 13, color: 'var(--bp-gray)', marginTop: 4 }}>Editor de projetos fotovoltaicos</div>
        </header>

        <Section title="01 — Imagem do telhado">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = '' }} style={{ display: 'none' }} />
          <ToolButton onClick={() => fileInputRef.current.click()}>{imageSrc ? 'Trocar imagem' : 'Carregar imagem'}</ToolButton>
          {img && (
            <label style={{ ...labelStyle, marginTop: 10 }}>
              Opacidade da imagem
              <input type="range" min={0.2} max={1} step={0.05} value={imgOpacity} onChange={(e) => setImgOpacity(parseFloat(e.target.value))} style={{ width: '100%' }} />
            </label>
          )}
          <Small>Dica: Ctrl+V cola um print direto. Use foto de cima (satélite), de preferência com o telhado centralizado.</Small>
        </Section>

        <Section title="02 — Escala real">
          {mode === MODES.CALIBRATE ? (
            <div>
              <Small>Clique em 2 pontos de uma medida que você conhece (parede, cumeeira, lote). Quanto mais longa a medida, mais precisa a escala.</Small>
              <div style={{ fontSize: 12, color: 'var(--bp-amber)', margin: '6px 0' }}>{calibPoints.length}/2 pontos</div>
              {calibPoints.length === 2 && (
                <>
                  <label style={labelStyle}>
                    Distância real entre os pontos (m)
                    <input
                      autoFocus
                      type="text"
                      inputMode="decimal"
                      placeholder="ex.: 12,5"
                      value={calibLength}
                      onChange={(e) => setCalibLength(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && confirmCalibration()}
                      style={inputStyle}
                    />
                  </label>
                  <ToolButton accent onClick={confirmCalibration}>Confirmar escala</ToolButton>
                </>
              )}
              <ToolButton subtle onClick={cancelCalibration}>Cancelar</ToolButton>
            </div>
          ) : ppm ? (
            <div style={{ fontSize: 12, color: 'var(--bp-gray)', fontFamily: 'var(--font-mono)' }}>
              ✓ {fmt(ppm, 1)} px/m
              <ToolButton small onClick={() => setMode(MODES.CALIBRATE)}>Recalibrar</ToolButton>
            </div>
          ) : (
            <ToolButton disabled={!img} onClick={() => setMode(MODES.CALIBRATE)}>Calibrar escala</ToolButton>
          )}
        </Section>

        <Section title="03 — Contorno e obstáculos">
          {mode === MODES.DRAW_ROOF ? (
            <>
              <ToolButton onClick={() => closeRoof(roofPoints)} disabled={roofPoints.length < 3}>Fechar contorno (Enter)</ToolButton>
              <ToolButton subtle onClick={() => { setMode(MODES.IDLE); if (!roofClosed) setRoofPoints([]) }}>Cancelar</ToolButton>
            </>
          ) : (
            <ToolButton disabled={!ppm} onClick={startRoof}>{roofClosed ? 'Redesenhar contorno' : 'Desenhar contorno'}</ToolButton>
          )}
          {mode === MODES.DRAW_OBST ? (
            <>
              <ToolButton onClick={() => closeObstacle(obstPoints)} disabled={obstPoints.length < 3}>Fechar obstáculo (Enter)</ToolButton>
              <ToolButton subtle onClick={() => { setObstPoints([]); setMode(MODES.IDLE) }}>Cancelar</ToolButton>
            </>
          ) : (
            <ToolButton disabled={!ppm || !roofClosed} onClick={startObstacle}>+ Obstáculo (chaminé, caixa d’água…)</ToolButton>
          )}
          {obstacles.map((o, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--bp-gray)', marginTop: 6 }}>
              <span>Obstáculo {i + 1}</span>
              <button style={miniBtn} onClick={() => setObstacles((arr) => arr.filter((_, j) => j !== i))}>remover</button>
            </div>
          ))}
          {roofClosed && <Small>Arraste as bolinhas brancas para ajustar os cantos. As medidas dos lados aparecem na tela.</Small>}
        </Section>

        <Section title="04 — Tipo de cobertura">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <ToggleBtn active={roofType === 'pitched'} onClick={() => setRoofType('pitched')}>Telhado inclinado</ToggleBtn>
            <ToggleBtn active={roofType === 'tilted'} onClick={() => setRoofType('tilted')}>Laje / plano</ToggleBtn>
          </div>
          {roofType === 'pitched' ? (
            <>
              <label style={{ ...labelStyle, marginTop: 10 }}>
                Inclinação do telhado (°)
                <NumField value={roofSlope} min={0} max={60} onChange={setRoofSlope} />
              </label>
              <Small>Módulos rente ao telhado. A foto mostra o telhado “achatado”: o programa corrige o tamanho dos módulos pela inclinação (cos). Porcentagem → graus: 30% ≈ 16,7°, 40% ≈ 21,8°, 100% = 45°.</Small>
              <label style={labelStyle}>
                Ângulo das fileiras (°)
                <NumField value={gridAngle} min={-90} max={90} onChange={setGridAngle} />
              </label>
              {roofEdges.length > 0 && roofClosed && (
                <select
                  value=""
                  onChange={(e) => e.target.value !== '' && setGridAngle(Math.round(roofEdges[+e.target.value].angle * 10) / 10)}
                  style={inputStyle}
                >
                  <option value="">Alinhar com a aresta…</option>
                  {roofEdges.map((ed, i) => <option key={i} value={i}>Aresta {i + 1} — {fmt(ed.lenM)} m</option>)}
                </select>
              )}
            </>
          ) : (
            <>
              <label style={{ ...labelStyle, marginTop: 10 }}>
                Inclinação dos módulos (°)
                <NumField value={tilt} min={0} max={60} onChange={setTilt} />
              </label>
              <label style={labelStyle}>
                Latitude do local (°) <span style={{ opacity: 0.7 }}>(negativa no Sul)</span>
                <NumField value={lat} min={-60} max={60} onChange={setLat} />
              </label>
              <label style={labelStyle}>
                Critério de sombra
                <select value={criterion} onChange={(e) => setCriterion(e.target.value)} style={inputStyle}>
                  <option value="9to15">Pior caso 9h–15h (solstício de inverno)</option>
                  <option value="noon">Meio-dia (solstício de inverno)</option>
                </select>
              </label>
              <label style={labelStyle}>
                Giro do Norte na imagem (°, horário)
                <NumField value={northAngle} min={-90} max={90} onChange={setNorthAngle} />
              </label>
              {pitchInfo && (
                <div style={infoBox}>
                  Altitude solar (meio-dia, inverno): <b>{fmt(pitchInfo.altitude)}°</b><br />
                  Sombra de uma fileira: <b>{fmt(pitchInfo.shadowM, 2)} m</b><br />
                  Passo entre fileiras: <b>{fmt(pitchInfo.pitchM, 2)} m</b>
                  <div style={{ opacity: 0.7, marginTop: 4 }}>Módulos voltados para o {lat < 0 ? 'Norte' : 'Sul'}. Fileiras no sentido Leste–Oeste.</div>
                </div>
              )}
            </>
          )}
        </Section>

        <Section title="05 — Módulo">
          <label style={labelStyle}>
            Modelo
            <select
              value={presetId}
              onChange={(e) => {
                const p = S.MODULE_PRESETS.find((x) => x.id === e.target.value)
                setPresetId(p.id)
                if (p.longM) { setLongM(p.longM); setShortM(p.shortM); setWp(p.wp) }
              }}
              style={inputStyle}
            >
              {S.MODULE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={labelStyle}>Lado longo (m)<NumField value={longM} min={0.3} onChange={(v) => { setLongM(v); setPresetId('custom') }} /></label>
            <label style={labelStyle}>Lado curto (m)<NumField value={shortM} min={0.3} onChange={(v) => { setShortM(v); setPresetId('custom') }} /></label>
          </div>
          <label style={labelStyle}>Potência por módulo (Wp)<NumField value={wp} min={1} onChange={(v) => { setWp(v); setPresetId('custom') }} /></label>
          <label style={labelStyle}>
            Orientação
            <select value={orientation} onChange={(e) => setOrientation(e.target.value)} style={inputStyle}>
              <option value="auto">Automática (a que couber mais)</option>
              <option value="portrait">Retrato</option>
              <option value="landscape">Paisagem</option>
            </select>
          </label>
          <Small>Medidas variam entre fabricantes — confirme no datasheet do módulo que você vai instalar.</Small>
        </Section>

        <Section title="06 — Afastamentos">
          <label style={labelStyle}>Da borda do telhado (m)<NumField value={marginM} min={0} onChange={setMarginM} /></label>
          <label style={labelStyle}>De obstáculos (m)<NumField value={obstMarginM} min={0} onChange={setObstMarginM} /></label>
          <label style={labelStyle}>Folga entre módulos (cm)<NumField value={gapCm} min={0} onChange={setGapCm} /></label>
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 11, color: 'var(--bp-gray)', cursor: 'pointer' }}>Corredor livre (opcional, p/ bombeiros)</summary>
            <label style={{ ...labelStyle, marginTop: 8 }}>Deixar corredor a cada (m, 0 = desligado)<NumField value={corrEveryM} min={0} onChange={setCorrEveryM} /></label>
            <label style={labelStyle}>Largura do corredor (m)<NumField value={corrWidthM} min={0} onChange={setCorrWidthM} /></label>
            <Small>Ex.: a norma do CBMRS (RTCBMRS 23/2025, A.3.1 d) fala em vão livre de 2 m a cada 16 m de módulos. Não há valor nacional único para telhados: confirme na norma do corpo de bombeiros do seu estado e na ABNT NBR 16690.</Small>
          </details>
        </Section>

        <Section title="07 — Módulos">
          <ToolButton accent disabled={!ppm || !roofClosed} onClick={autoFill}>⚡ Preencher automaticamente</ToolButton>
          <ToolButton disabled={!ppm} onClick={addSinglePanel}>+ Adicionar 1 módulo</ToolButton>
          <ToolButton subtle disabled={panels.length === 0} onClick={() => { commitPanels([]); setSelectedId(null) }}>Limpar módulos</ToolButton>
          <ToolButton subtle disabled={history.length === 0} onClick={undo}>↶ Desfazer (Ctrl+Z)</ToolButton>
        </Section>

        <Section title="08 — Exportar">
          <ToolButton disabled={!img} onClick={exportPNG}>Exportar PNG</ToolButton>
        </Section>

        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--bp-gray)', lineHeight: 1.7, opacity: 0.8 }}>
          <b>R</b> gira · <b>Del</b> remove · <b>setas</b> movem 5 cm (Shift = 25 cm) · <b>Ctrl+Z</b> desfaz · <b>Esc</b> cancela · roda do mouse dá zoom · arraste o fundo p/ mover.
        </div>
      </aside>

      <main ref={mainRef} style={{ position: 'relative', overflow: 'hidden', minWidth: 0 }}>
        <Stage
          ref={stageRef}
          width={stageSize.w}
          height={stageSize.h}
          x={view.x}
          y={view.y}
          scaleX={view.scale}
          scaleY={view.scale}
          draggable
          onWheel={handleWheel}
          onClick={handleStageClick}
          onTap={handleStageClick}
          onMouseMove={handleMouseMove}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }))
          }}
          style={{ cursor: mode === MODES.IDLE ? 'grab' : 'crosshair' }}
        >
          <Layer>
            <BackgroundImage image={img} opacity={imgOpacity} />
          </Layer>

          <Layer>
            {/* calibração */}
            {calibPoints.map((p, i) => <Circle key={`cp${i}`} x={p.x} y={p.y} radius={5 * inv} fill="#f5a623" listening={false} />)}
            {calibPoints.length === 2 && (
              <Line points={[calibPoints[0].x, calibPoints[0].y, calibPoints[1].x, calibPoints[1].y]} stroke="#f5a623" strokeWidth={2} strokeScaleEnabled={false} dash={[6, 4]} listening={false} />
            )}

            {/* contorno */}
            {roofPoints.length > 0 && (
              <Line
                points={roofPoints.flatMap((p) => [p.x, p.y])}
                stroke="#f5a623"
                strokeWidth={2}
                strokeScaleEnabled={false}
                closed={roofClosed}
                fill={roofClosed ? 'rgba(245,166,35,0.08)' : undefined}
                listening={false}
              />
            )}

            {/* obstáculos */}
            {obstacles.map((o, i) => (
              <Line key={`o${i}`} points={o.flatMap((p) => [p.x, p.y])} closed stroke="#e0554a" strokeWidth={2} strokeScaleEnabled={false} fill="rgba(224,85,74,0.25)" listening={false} />
            ))}
            {obstPoints.length > 0 && (
              <Line points={obstPoints.flatMap((p) => [p.x, p.y])} stroke="#e0554a" strokeWidth={2} strokeScaleEnabled={false} listening={false} />
            )}

            {/* prévia do próximo lado */}
            {drawing && livePts.length > 0 && cursor && (
              <Line points={[livePts[livePts.length - 1].x, livePts[livePts.length - 1].y, cursor.x, cursor.y]} stroke="#eef3f8" strokeWidth={1} strokeScaleEnabled={false} dash={[4, 4]} listening={false} />
            )}
            {mode === MODES.CALIBRATE && calibPoints.length === 1 && cursor && (
              <Line points={[calibPoints[0].x, calibPoints[0].y, cursor.x, cursor.y]} stroke="#eef3f8" strokeWidth={1} strokeScaleEnabled={false} dash={[4, 4]} listening={false} />
            )}

            {/* módulos */}
            {ppm &&
              panels.map((p) => (
                <SolarPanel
                  key={p.id}
                  panel={p}
                  ppm={ppm}
                  selected={p.id === selectedId}
                  invalid={invalidIds.has(p.id)}
                  draggable={mode === MODES.IDLE}
                  onSelect={setSelectedId}
                  onDragStart={pushHistory}
                  onChange={updatePanel}
                />
              ))}

            {/* medidas dos lados */}
            {!exporting && ppm &&
              roofEdges.map((ed, i) => (
                <Text
                  key={`el${i}`}
                  x={(ed.a.x + ed.b.x) / 2 - 40 * inv}
                  y={(ed.a.y + ed.b.y) / 2 - 7 * inv}
                  width={80 * inv}
                  align="center"
                  text={`${fmt(ed.lenM)} m`}
                  fontSize={11 * inv}
                  fontFamily={MONO}
                  fill="#eef3f8"
                  stroke="#071527"
                  strokeWidth={3 * inv}
                  fillAfterStrokeEnabled
                  listening={false}
                />
              ))}
            {drawing && ppm && livePts.length > 0 && cursor && (
              <Text
                x={cursor.x + 12 * inv}
                y={cursor.y + 8 * inv}
                text={`${fmt(Math.hypot(cursor.x - livePts[livePts.length - 1].x, cursor.y - livePts[livePts.length - 1].y) / ppm)} m`}
                fontSize={12 * inv}
                fontFamily={MONO}
                fill="#f5a623"
                stroke="#071527"
                strokeWidth={3 * inv}
                fillAfterStrokeEnabled
                listening={false}
              />
            )}

            {/* alças do contorno e pontos em desenho */}
            {!exporting && roofClosed &&
              mode === MODES.IDLE &&
              roofPoints.map((p, i) => (
                <Circle
                  key={`rv${i}`}
                  x={p.x}
                  y={p.y}
                  radius={5 * inv}
                  fill="#eef3f8"
                  stroke="#f5a623"
                  strokeWidth={1.5}
                  strokeScaleEnabled={false}
                  draggable
                  onDragStart={(e) => { e.cancelBubble = true }}
                  onDragMove={(e) => {
                    e.cancelBubble = true
                    const np = { x: e.target.x(), y: e.target.y() }
                    setRoofPoints((pts) => pts.map((q, j) => (j === i ? np : q)))
                  }}
                  onDragEnd={(e) => { e.cancelBubble = true }}
                  onMouseEnter={(e) => { e.target.getStage().container().style.cursor = 'move' }}
                  onMouseLeave={(e) => { e.target.getStage().container().style.cursor = 'grab' }}
                />
              ))}
            {mode === MODES.DRAW_ROOF && roofPoints.map((p, i) => (
              <Circle key={`rp${i}`} x={p.x} y={p.y} radius={(i === 0 && roofPoints.length >= 3 ? 7 : 4) * inv} fill={i === 0 ? '#f5a623' : '#eef3f8'} listening={false} />
            ))}
            {mode === MODES.DRAW_OBST && obstPoints.map((p, i) => (
              <Circle key={`op${i}`} x={p.x} y={p.y} radius={(i === 0 && obstPoints.length >= 3 ? 7 : 4) * inv} fill={i === 0 ? '#e0554a' : '#eef3f8'} listening={false} />
            ))}
          </Layer>

          {/* legenda só no PNG exportado */}
          {exporting && img && (
            <Layer listening={false}>
              <Rect x={img.width * 0.015} y={img.width * 0.015} width={img.width * 0.3} height={img.width * 0.125} fill="rgba(7,21,39,0.85)" cornerRadius={img.width * 0.004} />
              <Text
                x={img.width * 0.025}
                y={img.width * 0.022}
                width={img.width * 0.28}
                fontFamily={MONO}
                fontSize={img.width * 0.0125}
                lineHeight={1.5}
                fill="#eef3f8"
                text={`${stats.count} módulos × ${wp} Wp = ${fmt(stats.kWp, 2)} kWp\nMódulo ${fmt(longM, 3)} × ${fmt(shortM, 3)} m\nEscala: ${scaleBarForExport(ppm)}`}
              />
              {ppm && (() => {
                const barM = S.niceLength((img.width * 0.26) / ppm)
                return (
                  <Group x={img.width * 0.025} y={img.width * 0.1}>
                    <Rect width={barM * ppm} height={img.width * 0.004} fill="#f5a623" />
                    <Text y={img.width * 0.007} text={`${barM} m`} fontFamily={MONO} fontSize={img.width * 0.011} fill="#f5a623" />
                  </Group>
                )
              })()}
            </Layer>
          )}
        </Stage>

        {/* dica */}
        {hint && <div style={hintStyle}>{hint}</div>}
        {notice && (
          <div style={{ ...hintStyle, top: hint ? 52 : 12, background: 'rgba(28,58,94,0.95)' }} onClick={() => setNotice('')}>{notice}</div>
        )}

        {/* controles de zoom */}
        {img && (
          <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 6 }}>
            <button style={zoomBtn} onClick={() => zoomBy(1.25)} title="Aproximar">+</button>
            <button style={zoomBtn} onClick={() => zoomBy(1 / 1.25)} title="Afastar">−</button>
            <button style={{ ...zoomBtn, width: 'auto', padding: '0 10px' }} onClick={() => setView(fitView(img, stageSize))} title="Enquadrar imagem">Enquadrar</button>
          </div>
        )}

        {/* barra de escala */}
        {scaleBar && (
          <div style={{ position: 'absolute', left: 12, bottom: 12, color: 'var(--bp-white)', fontFamily: 'var(--font-mono)', fontSize: 11, pointerEvents: 'none' }}>
            <div style={{ width: scaleBar.px, height: 6, borderLeft: '2px solid #f5a623', borderRight: '2px solid #f5a623', borderBottom: '2px solid #f5a623' }} />
            <div style={{ textShadow: '0 0 4px #071527' }}>{scaleBar.m} m</div>
          </div>
        )}

        {/* bússola (laje) */}
        {roofType === 'tilted' && img && (
          <div style={{ position: 'absolute', right: 14, top: 14, width: 44, height: 44, borderRadius: '50%', border: '1px solid var(--bp-navy-600)', background: 'rgba(11,30,51,0.85)', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, transform: `rotate(${northAngle}deg)`, display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--bp-amber)' }}>
              <span style={{ marginTop: 2 }}>N</span>
              <span style={{ width: 2, height: 16, background: 'var(--bp-amber)' }} />
            </div>
          </div>
        )}
      </main>

      <aside style={asideStyle('left')} className="scrollbar-thin">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--bp-amber)', letterSpacing: 2, marginBottom: 16 }}>RESUMO DO PROJETO</div>

        <StatRow label="Módulos" value={stats.count} />
        <StatRow label="Potência total" value={`${fmt(stats.kWp, 2)} kWp`} highlight />
        <StatRow label="Área dos módulos" value={`${fmt(stats.realArea)} m²`} />
        {roofRealAreaM2 && (
          <StatRow
            label={roofType === 'pitched' ? 'Área real do telhado (≈)' : 'Área da laje'}
            value={`${fmt(roofRealAreaM2)} m²`}
          />
        )}
        {roofRealAreaM2 && stats.count > 0 && (
          <StatRow label="Módulos / área do telhado" value={`${fmt((stats.realArea / roofRealAreaM2) * 100, 0)}%`} />
        )}

        {stats.count > 0 && (
          <div style={{ marginTop: 6, paddingTop: 14, borderTop: '1px solid var(--bp-navy-700)' }}>
            <div style={{ fontSize: 11, color: 'var(--bp-gray)', marginBottom: 8 }}>ESTIMATIVA DE GERAÇÃO</div>
            <label style={labelStyle}>Irradiação (HSP, kWh/m²/dia)<NumField value={hsp} min={1} max={8} onChange={setHsp} /></label>
            <label style={labelStyle}>Desempenho global (PR)<NumField value={pr} min={0.5} max={0.95} onChange={setPr} /></label>
            <StatRow label="≈ por mês" value={`${fmt(stats.kwhMonth, 0)} kWh`} />
            <Small>Estimativa simples (kWp × HSP × 30 × PR). Use a HSP da sua cidade (Atlas Brasileiro / CRESESB) e considere orientação e sombras reais.</Small>
          </div>
        )}

        {invalidIds.size > 0 && (
          <div style={{ ...infoBox, borderColor: 'var(--bp-danger)', color: '#ffb3ac', marginTop: 14 }}>
            ⚠ {invalidIds.size} módulo(s) em vermelho: fora do contorno, sobrepostos ou em cima de obstáculo.
          </div>
        )}

        {selected && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--bp-navy-700)' }}>
            <div style={{ fontSize: 11, color: 'var(--bp-gray)', marginBottom: 8 }}>MÓDULO SELECIONADO</div>
            <div style={{ fontSize: 11, color: 'var(--bp-gray)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>
              {fmt(selected.wM, 2)} × {fmt(selected.hM, 2)} m (planta)
            </div>
            <label style={labelStyle}>
              Ângulo (°)
              <NumField value={Math.round(selected.rot * 10) / 10} onChange={(v) => { pushHistory(); updatePanel(selected.id, { rot: v }) }} />
            </label>
            <ToolButton small onClick={rotateSelected}>Girar 90° (R)</ToolButton>
            <ToolButton small subtle onClick={deleteSelected}>Remover (Del)</ToolButton>
          </div>
        )}
      </aside>
    </div>
  )
}

function scaleBarForExport(ppm) {
  return ppm ? `${ppm.toFixed(1)} px/m` : '—'
}

// ---------- componentes visuais pequenos ----------

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: 'var(--bp-gray)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>{title}</div>
      {children}
    </div>
  )
}

function Small({ children }) {
  return <p style={{ fontSize: 11, lineHeight: 1.5, color: 'var(--bp-gray)', opacity: 0.85, margin: '8px 0 4px' }}>{children}</p>
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 6px', fontSize: 12, fontWeight: 600, borderRadius: 4,
        border: `1px solid ${active ? '#f5a623' : 'var(--bp-navy-600)'}`,
        background: active ? 'rgba(245,166,35,0.15)' : 'var(--bp-navy-800)',
        color: active ? '#f5a623' : 'var(--bp-gray)',
      }}
    >
      {children}
    </button>
  )
}

function ToolButton({ children, onClick, disabled, accent, subtle, small }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block', width: '100%', marginTop: small ? 6 : 8,
        padding: small ? '6px 10px' : '10px 12px', fontSize: small ? 12 : 13, fontWeight: 600, borderRadius: 4,
        border: accent ? '1px solid #f5a623' : '1px solid var(--bp-navy-600)',
        background: disabled ? 'var(--bp-navy-800)' : accent ? '#f5a623' : subtle ? 'transparent' : 'var(--bp-navy-700)',
        color: disabled ? 'var(--bp-navy-600)' : accent ? '#0b1e33' : subtle ? 'var(--bp-gray)' : 'var(--bp-white)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function StatRow({ label, value, highlight }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--bp-gray)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: highlight ? 22 : 16, color: highlight ? 'var(--bp-amber)' : 'var(--bp-white)', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

const asideStyle = (side) => ({
  [side === 'right' ? 'borderRight' : 'borderLeft']: '1px solid var(--bp-navy-700)',
  background: 'rgba(11,30,51,0.94)',
  padding: '18px 14px',
  overflowY: 'auto',
  minHeight: 0,
})

const inputStyle = {
  display: 'block', width: '100%', marginTop: 4, padding: '7px 8px', fontSize: 12,
  fontFamily: 'var(--font-mono)', background: 'var(--bp-navy-800)', border: '1px solid var(--bp-navy-600)',
  borderRadius: 3, color: 'var(--bp-white)',
}

const labelStyle = { display: 'block', fontSize: 11, color: 'var(--bp-gray)', marginBottom: 10 }

const infoBox = {
  marginTop: 10, padding: '8px 10px', fontSize: 11, lineHeight: 1.6, color: 'var(--bp-gray)',
  border: '1px solid var(--bp-navy-600)', borderRadius: 4, background: 'rgba(18,44,72,0.6)',
}

const hintStyle = {
  position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', maxWidth: '80%',
  padding: '8px 14px', fontSize: 12, color: 'var(--bp-white)', background: 'rgba(11,30,51,0.92)',
  border: '1px solid var(--bp-amber-dim)', borderRadius: 4, textAlign: 'center', cursor: 'default',
}

const miniBtn = {
  background: 'transparent', border: '1px solid var(--bp-navy-600)', color: 'var(--bp-gray)',
  fontSize: 11, padding: '2px 8px', borderRadius: 3,
}

const zoomBtn = {
  width: 32, height: 32, fontSize: 16, fontWeight: 700, borderRadius: 4,
  border: '1px solid var(--bp-navy-600)', background: 'rgba(11,30,51,0.92)', color: 'var(--bp-white)',
}
