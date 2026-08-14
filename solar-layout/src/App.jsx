import { useState, useRef, useCallback, useMemo } from 'react'
import { Stage, Layer, Image as KonvaImage, Line, Group, Rect, Circle, Text } from 'react-konva'
import useImage from 'use-image'

// ---------- geometry helpers ----------

function pointInPolygon(point, vertices) {
  // ray casting
  let inside = false
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y
    const xj = vertices[j].x, yj = vertices[j].y
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function rectCorners(cx, cy, w, h) {
  const hw = w / 2
  const hh = h / 2
  return [
    { x: cx - hw, y: cy - hh },
    { x: cx + hw, y: cy - hh },
    { x: cx + hw, y: cy + hh },
    { x: cx - hw, y: cy + hh },
  ]
}

function polygonBounds(vertices) {
  const xs = vertices.map((p) => p.x)
  const ys = vertices.map((p) => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

// ---------- background image layer ----------

function BackgroundImage({ src, opacity }) {
  const [img] = useImage(src)
  if (!img) return null
  return <KonvaImage image={img} opacity={opacity} listening={false} />
}

// ---------- panel (solar module) ----------

function SolarPanel({ panel, pxPerMeter, selected, onSelect, onChange, onDelete }) {
  const w = panel.wM * pxPerMeter
  const h = panel.hM * pxPerMeter

  // cell grid lines inside the panel (visual only, mimics real module)
  const cols = panel.orientation === 'portrait' ? 2 : 4
  const rows = panel.orientation === 'portrait' ? 4 : 2
  const cellLines = []
  for (let c = 1; c < cols; c++) {
    const x = -w / 2 + (w / cols) * c
    cellLines.push(<Line key={`c${c}`} points={[x, -h / 2, x, h / 2]} stroke="#0b1e33" strokeWidth={1} listening={false} />)
  }
  for (let r = 1; r < rows; r++) {
    const y = -h / 2 + (h / rows) * r
    cellLines.push(<Line key={`r${r}`} points={[-w / 2, y, w / 2, y]} stroke="#0b1e33" strokeWidth={1} listening={false} />)
  }

  return (
    <Group
      x={panel.x}
      y={panel.y}
      draggable
      onClick={(e) => { e.cancelBubble = true; onSelect(panel.id) }}
      onTap={(e) => { e.cancelBubble = true; onSelect(panel.id) }}
      onDragMove={(e) => onChange(panel.id, { x: e.target.x(), y: e.target.y() })}
      onDragEnd={(e) => onChange(panel.id, { x: e.target.x(), y: e.target.y() })}
    >
      <Rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        fill="#14314f"
        stroke={selected ? 'var(--bp-amber)'.startsWith('var') ? '#f5a623' : '#f5a623' : '#4a7bb0'}
        strokeWidth={selected ? 2.5 : 1.25}
        cornerRadius={2}
        shadowColor="black"
        shadowBlur={selected ? 8 : 0}
        shadowOpacity={0.4}
      />
      {cellLines}
    </Group>
  )
}

// ---------- main app ----------

const MODES = {
  IDLE: 'idle',
  CALIBRATE: 'calibrate',
  DRAW_ROOF: 'draw_roof',
}

export default function App() {
  const [imageSrc, setImageSrc] = useState(null)
  const [imgOpacity, setImgOpacity] = useState(0.85)
  const [mode, setMode] = useState(MODES.IDLE)

  const [pxPerMeter, setPxPerMeter] = useState(null)
  const [calibPoints, setCalibPoints] = useState([])
  const [pendingCalibLength, setPendingCalibLength] = useState('')

  const [roofPoints, setRoofPoints] = useState([]) // array of {x,y}
  const [roofClosed, setRoofClosed] = useState(false)

  const [panels, setPanels] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [panelWp, setPanelWp] = useState(550)
  const [orientation, setOrientation] = useState('portrait') // portrait 1.13x2.28 landscape swapped
  const [rowGapCm, setRowGapCm] = useState(2)
  const [edgeMarginM, setEdgeMarginM] = useState(0.3)

  const stageRef = useRef(null)
  const fileInputRef = useRef(null)

  const PANEL_W_M = 1.134
  const PANEL_H_M = 2.278

  const panelDims = useMemo(() => {
    return orientation === 'portrait'
      ? { wM: PANEL_W_M, hM: PANEL_H_M }
      : { wM: PANEL_H_M, hM: PANEL_W_M }
  }, [orientation])

  // ---------- file upload ----------

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setImageSrc(url)
    setPxPerMeter(null)
    setCalibPoints([])
    setRoofPoints([])
    setRoofClosed(false)
    setPanels([])
  }

  // ---------- stage click routing ----------

  const getRelPointer = () => {
    const stage = stageRef.current
    const pos = stage.getPointerPosition()
    return pos
  }

  const handleStageClick = () => {
    const pos = getRelPointer()
    if (!pos) return

    if (mode === MODES.CALIBRATE) {
      if (calibPoints.length >= 2) return
      const next = [...calibPoints, pos]
      setCalibPoints(next)
      if (next.length === 2) {
        // wait for user to type length in the side panel
      }
      return
    }

    if (mode === MODES.DRAW_ROOF) {
      if (roofClosed) return
      // check if clicking near first point to close
      if (roofPoints.length >= 3) {
        const first = roofPoints[0]
        const dist = Math.hypot(pos.x - first.x, pos.y - first.y)
        if (dist < 12) {
          setRoofClosed(true)
          return
        }
      }
      setRoofPoints([...roofPoints, pos])
      return
    }

    // idle mode: clicking empty canvas deselects
    setSelectedId(null)
  }

  const confirmCalibration = () => {
    const meters = parseFloat(pendingCalibLength.replace(',', '.'))
    if (!meters || meters <= 0 || calibPoints.length < 2) return
    const [a, b] = calibPoints
    const pxDist = Math.hypot(b.x - a.x, b.y - a.y)
    setPxPerMeter(pxDist / meters)
    setMode(MODES.IDLE)
    setCalibPoints([])
    setPendingCalibLength('')
  }

  const cancelCalibration = () => {
    setCalibPoints([])
    setPendingCalibLength('')
    setMode(MODES.IDLE)
  }

  const resetRoof = () => {
    setRoofPoints([])
    setRoofClosed(false)
    setMode(MODES.DRAW_ROOF)
  }

  const finishRoofDrawing = () => {
    if (roofPoints.length >= 3) setRoofClosed(true)
    setMode(MODES.IDLE)
  }

  // ---------- panels ----------

  const addSinglePanel = () => {
    if (!pxPerMeter) return
    const stage = stageRef.current
    const center = { x: stage.width() / 2, y: stage.height() / 2 }
    const id = crypto.randomUUID()
    setPanels((p) => [
      ...p,
      { id, x: center.x, y: center.y, orientation, wM: panelDims.wM, hM: panelDims.hM },
    ])
    setSelectedId(id)
  }

  const autoFillRoof = () => {
    if (!pxPerMeter || !roofClosed || roofPoints.length < 3) return
    const gapPx = (rowGapCm / 100) * pxPerMeter
    const marginPx = edgeMarginM * pxPerMeter
    const wPx = panelDims.wM * pxPerMeter
    const hPx = panelDims.hM * pxPerMeter

    const bounds = polygonBounds(roofPoints)
    const newPanels = []

    let y = bounds.minY + marginPx + hPx / 2
    while (y + hPx / 2 <= bounds.maxY - marginPx) {
      let x = bounds.minX + marginPx + wPx / 2
      while (x + wPx / 2 <= bounds.maxX - marginPx) {
        const corners = rectCorners(x, y, wPx - 2, hPx - 2) // slight inset for containment check
        const allInside = corners.every((c) => pointInPolygon(c, roofPoints))
        if (allInside) {
          newPanels.push({
            id: crypto.randomUUID(),
            x,
            y,
            orientation,
            wM: panelDims.wM,
            hM: panelDims.hM,
          })
        }
        x += wPx + gapPx
      }
      y += hPx + gapPx
    }

    setPanels((prev) => [...prev, ...newPanels])
  }

  const updatePanel = useCallback((id, attrs) => {
    setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, ...attrs } : p)))
  }, [])

  const deleteSelected = () => {
    if (!selectedId) return
    setPanels((prev) => prev.filter((p) => p.id !== selectedId))
    setSelectedId(null)
  }

  const clearPanels = () => {
    setPanels([])
    setSelectedId(null)
  }

  const rotateSelected = () => {
    if (!selectedId) return
    setPanels((prev) =>
      prev.map((p) =>
        p.id === selectedId ? { ...p, wM: p.hM, hM: p.wM } : p
      )
    )
  }

  // keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedId) {
        e.preventDefault()
        deleteSelected()
      }
    }
    if (e.key.toLowerCase() === 'r') rotateSelected()
    if (e.key === 'Escape') {
      if (mode === MODES.CALIBRATE) cancelCalibration()
      if (mode === MODES.DRAW_ROOF) setMode(MODES.IDLE)
    }
  }

  // ---------- stats ----------

  const stats = useMemo(() => {
    const count = panels.length
    const totalWp = count * panelWp
    const totalKwp = totalWp / 1000
    const totalAreaM2 = panels.reduce((acc, p) => acc + p.wM * p.hM, 0)
    return { count, totalKwp, totalAreaM2 }
  }, [panels, panelWp])

  const roofAreaM2 = useMemo(() => {
    if (!pxPerMeter || roofPoints.length < 3) return null
    // shoelace formula in px^2, convert to m^2
    let area = 0
    for (let i = 0; i < roofPoints.length; i++) {
      const a = roofPoints[i]
      const b = roofPoints[(i + 1) % roofPoints.length]
      area += a.x * b.y - b.x * a.y
    }
    area = Math.abs(area) / 2
    return area / (pxPerMeter * pxPerMeter)
  }, [roofPoints, pxPerMeter])

  const exportPNG = () => {
    const stage = stageRef.current
    const prevSelected = selectedId
    setSelectedId(null)
    setTimeout(() => {
      const uri = stage.toDataURL({ pixelRatio: 2 })
      const link = document.createElement('a')
      link.download = 'projeto-solar.png'
      link.href = uri
      link.click()
      setSelectedId(prevSelected)
    }, 50)
  }

  const stageWidth = typeof window !== 'undefined' ? window.innerWidth - 500 : 900
  const stageHeight = typeof window !== 'undefined' ? window.innerHeight : 700

  return (
    <div className="app-shell" tabIndex={0} onKeyDown={handleKeyDown} style={{ outline: 'none' }}>
      {/* ---------- left sidebar: tools ---------- */}
      <aside
        style={{
          borderRight: '1px solid var(--bp-navy-700)',
          background: 'rgba(11,30,51,0.92)',
          padding: '20px 16px',
          overflowY: 'auto',
        }}
        className="scrollbar-thin"
      >
        <header style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--bp-amber)', letterSpacing: 2 }}>
            SOLAR·LAYOUT
          </div>
          <div style={{ fontSize: 13, color: 'var(--bp-gray)', marginTop: 4 }}>
            Editor de projetos fotovoltaicos
          </div>
        </header>

        <Section title="01 — Imagem do telhado">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            style={{ display: 'none' }}
          />
          <ToolButton onClick={() => fileInputRef.current.click()}>
            {imageSrc ? 'Trocar imagem' : 'Carregar imagem'}
          </ToolButton>
          {imageSrc && (
            <label style={{ display: 'block', marginTop: 10, fontSize: 12, color: 'var(--bp-gray)' }}>
              Opacidade
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={imgOpacity}
                onChange={(e) => setImgOpacity(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </label>
          )}
        </Section>

        <Section title="02 — Escala real">
          {pxPerMeter ? (
            <div style={{ fontSize: 12, color: 'var(--bp-gray)', fontFamily: 'var(--font-mono)' }}>
              ✓ {pxPerMeter.toFixed(1)} px/m
              <ToolButton small onClick={() => { setPxPerMeter(null); setMode(MODES.CALIBRATE) }}>
                Recalibrar
              </ToolButton>
            </div>
          ) : mode === MODES.CALIBRATE ? (
            <div>
              <p style={{ fontSize: 12, color: 'var(--bp-gray)' }}>
                Clique 2 pontos sobre uma medida conhecida no telhado (ex: largura de uma telha, parede).
              </p>
              <p style={{ fontSize: 12, color: 'var(--bp-amber)' }}>
                {calibPoints.length}/2 pontos marcados
              </p>
              {calibPoints.length === 2 && (
                <>
                  <input
                    type="text"
                    placeholder="Distância real (m)"
                    value={pendingCalibLength}
                    onChange={(e) => setPendingCalibLength(e.target.value)}
                    style={inputStyle}
                  />
                  <ToolButton onClick={confirmCalibration}>Confirmar escala</ToolButton>
                </>
              )}
              <ToolButton subtle onClick={cancelCalibration}>Cancelar</ToolButton>
            </div>
          ) : (
            <ToolButton disabled={!imageSrc} onClick={() => setMode(MODES.CALIBRATE)}>
              Calibrar escala
            </ToolButton>
          )}
        </Section>

        <Section title="03 — Contorno do telhado">
          {mode === MODES.DRAW_ROOF ? (
            <>
              <p style={{ fontSize: 12, color: 'var(--bp-gray)' }}>
                Clique para marcar cada canto. Clique no primeiro ponto (ou finalize) pra fechar.
              </p>
              <ToolButton onClick={finishRoofDrawing} disabled={roofPoints.length < 3}>
                Finalizar contorno
              </ToolButton>
              <ToolButton subtle onClick={() => setMode(MODES.IDLE)}>Cancelar</ToolButton>
            </>
          ) : (
            <ToolButton disabled={!pxPerMeter} onClick={resetRoof}>
              {roofClosed ? 'Redesenhar contorno' : 'Desenhar contorno'}
            </ToolButton>
          )}
          {roofAreaM2 && (
            <div style={{ fontSize: 12, color: 'var(--bp-gray)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
              Área do telhado: {roofAreaM2.toFixed(1)} m²
            </div>
          )}
        </Section>

        <Section title="04 — Módulos">
          <label style={labelStyle}>
            Orientação
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value)}
              style={inputStyle}
            >
              <option value="portrait">Retrato (1,13 × 2,28 m)</option>
              <option value="landscape">Paisagem (2,28 × 1,13 m)</option>
            </select>
          </label>
          <label style={labelStyle}>
            Potência por placa (Wp)
            <input
              type="number"
              value={panelWp}
              onChange={(e) => setPanelWp(parseFloat(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Afastamento da borda (m)
            <input
              type="number"
              step="0.05"
              value={edgeMarginM}
              onChange={(e) => setEdgeMarginM(parseFloat(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Espaço entre placas (cm)
            <input
              type="number"
              value={rowGapCm}
              onChange={(e) => setRowGapCm(parseFloat(e.target.value) || 0)}
              style={inputStyle}
            />
          </label>

          <ToolButton disabled={!pxPerMeter} onClick={addSinglePanel}>
            + Adicionar 1 placa
          </ToolButton>
          <ToolButton
            accent
            disabled={!pxPerMeter || !roofClosed}
            onClick={autoFillRoof}
          >
            ⚡ Preencher telhado automaticamente
          </ToolButton>
          <ToolButton subtle disabled={panels.length === 0} onClick={clearPanels}>
            Limpar placas
          </ToolButton>
        </Section>

        <Section title="05 — Exportar">
          <ToolButton onClick={exportPNG}>Exportar PNG</ToolButton>
        </Section>

        <div style={{ marginTop: 24, fontSize: 11, color: 'var(--bp-navy-600)', lineHeight: 1.6 }}>
          Atalhos: <b style={{ color: 'var(--bp-gray)' }}>R</b> gira placa selecionada ·{' '}
          <b style={{ color: 'var(--bp-gray)' }}>Del</b> remove ·{' '}
          <b style={{ color: 'var(--bp-gray)' }}>Esc</b> cancela modo atual
        </div>
      </aside>

      {/* ---------- canvas ---------- */}
      <main style={{ position: 'relative', overflow: 'hidden' }}>
        <Stage
          ref={stageRef}
          width={stageWidth}
          height={stageHeight}
          onMouseDown={handleStageClick}
          onTap={handleStageClick}
          style={{ cursor: mode === MODES.DRAW_ROOF || mode === MODES.CALIBRATE ? 'crosshair' : 'default' }}
        >
          <Layer>
            {imageSrc && <BackgroundImage src={imageSrc} opacity={imgOpacity} />}
          </Layer>

          <Layer>
            {/* calibration markers */}
            {calibPoints.map((p, i) => (
              <Circle key={i} x={p.x} y={p.y} radius={5} fill="#f5a623" />
            ))}
            {calibPoints.length === 2 && (
              <Line
                points={[calibPoints[0].x, calibPoints[0].y, calibPoints[1].x, calibPoints[1].y]}
                stroke="#f5a623"
                strokeWidth={2}
                dash={[6, 4]}
              />
            )}

            {/* roof polygon */}
            {roofPoints.length > 0 && (
              <Line
                points={roofPoints.flatMap((p) => [p.x, p.y])}
                stroke="#f5a623"
                strokeWidth={2}
                closed={roofClosed}
                fill={roofClosed ? 'rgba(245,166,35,0.08)' : undefined}
              />
            )}
            {!roofClosed &&
              roofPoints.map((p, i) => (
                <Circle key={i} x={p.x} y={p.y} radius={4} fill="#eef3f8" />
              ))}

            {/* panels */}
            {pxPerMeter &&
              panels.map((panel) => (
                <SolarPanel
                  key={panel.id}
                  panel={panel}
                  pxPerMeter={pxPerMeter}
                  selected={panel.id === selectedId}
                  onSelect={setSelectedId}
                  onChange={updatePanel}
                />
              ))}
          </Layer>
        </Stage>

        {!imageSrc && (
          <div style={emptyStateStyle}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--bp-amber)', marginBottom: 8 }}>
              PASSO 1
            </div>
            <div style={{ fontSize: 15, color: 'var(--bp-gray)' }}>
              Carregue uma imagem ou foto de satélite do telhado pra começar
            </div>
          </div>
        )}
      </main>

      {/* ---------- right sidebar: stats ---------- */}
      <aside
        style={{
          borderLeft: '1px solid var(--bp-navy-700)',
          background: 'rgba(11,30,51,0.92)',
          padding: '20px 16px',
        }}
      >
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--bp-amber)', letterSpacing: 2, marginBottom: 16 }}>
          RESUMO DO PROJETO
        </div>

        <StatRow label="Placas instaladas" value={stats.count} />
        <StatRow label="Potência total" value={`${stats.totalKwp.toFixed(2)} kWp`} highlight />
        <StatRow label="Área ocupada" value={`${stats.totalAreaM2.toFixed(1)} m²`} />
        {roofAreaM2 && <StatRow label="Área do telhado" value={`${roofAreaM2.toFixed(1)} m²`} />}
        {roofAreaM2 && (
          <StatRow
            label="Aproveitamento"
            value={`${((stats.totalAreaM2 / roofAreaM2) * 100).toFixed(0)}%`}
          />
        )}

        {selectedId && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--bp-navy-700)' }}>
            <div style={{ fontSize: 11, color: 'var(--bp-gray)', marginBottom: 8 }}>PLACA SELECIONADA</div>
            <ToolButton small onClick={rotateSelected}>Girar 90°</ToolButton>
            <ToolButton small subtle onClick={deleteSelected}>Remover</ToolButton>
          </div>
        )}
      </aside>
    </div>
  )
}

// ---------- small presentational helpers ----------

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11, color: 'var(--bp-gray)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function ToolButton({ children, onClick, disabled, accent, subtle, small }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block',
        width: '100%',
        marginTop: small ? 6 : 8,
        padding: small ? '6px 10px' : '10px 12px',
        fontSize: small ? 12 : 13,
        fontWeight: 600,
        borderRadius: 4,
        border: accent ? '1px solid #f5a623' : '1px solid var(--bp-navy-600)',
        background: disabled
          ? 'var(--bp-navy-800)'
          : accent
          ? '#f5a623'
          : subtle
          ? 'transparent'
          : 'var(--bp-navy-700)',
        color: disabled ? 'var(--bp-navy-600)' : accent ? '#0b1e33' : subtle ? 'var(--bp-gray)' : 'var(--bp-white)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'filter 0.15s',
      }}
      onMouseEnter={(e) => !disabled && (e.currentTarget.style.filter = 'brightness(1.15)')}
      onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
    >
      {children}
    </button>
  )
}

function StatRow({ label, value, highlight }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--bp-gray)' }}>{label}</div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: highlight ? 22 : 16,
          color: highlight ? 'var(--bp-amber)' : 'var(--bp-white)',
          fontWeight: 600,
        }}
      >
        {value}
      </div>
    </div>
  )
}

const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  padding: '7px 8px',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
  background: 'var(--bp-navy-800)',
  border: '1px solid var(--bp-navy-600)',
  borderRadius: 3,
  color: 'var(--bp-white)',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  color: 'var(--bp-gray)',
  marginBottom: 10,
}

const emptyStateStyle = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  textAlign: 'center',
  pointerEvents: 'none',
}
