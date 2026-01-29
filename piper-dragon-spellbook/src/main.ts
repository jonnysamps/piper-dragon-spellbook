import './style.css'

type Point = { x: number; y: number; t: number }

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="layout">
    <header class="topbar">
      <div class="title">🐉 Dragon Spellbook</div>
      <div class="prompt" id="prompt">Draw: <b>circle</b></div>
      <div class="actions">
        <button id="undo" type="button">Undo</button>
        <button id="clear" type="button">Clear</button>
        <button id="cast" type="button" class="primary">Cast ✨</button>
      </div>
    </header>

    <main class="stage">
      <canvas id="c" class="canvas"></canvas>
      <div id="toast" class="toast" aria-live="polite"></div>
    </main>

    <footer class="bottombar">
      <div class="hint" id="hint">Tip: use one finger. Big shapes work best.</div>
      <div class="progress" id="progress">0 / 6 spells</div>
    </footer>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#c')!
const ctx = canvas.getContext('2d', { alpha: false })!

const toastEl = document.querySelector<HTMLDivElement>('#toast')!
const promptEl = document.querySelector<HTMLDivElement>('#prompt')!
const progressEl = document.querySelector<HTMLDivElement>('#progress')!

const undoBtn = document.querySelector<HTMLButtonElement>('#undo')!
const clearBtn = document.querySelector<HTMLButtonElement>('#clear')!
const castBtn = document.querySelector<HTMLButtonElement>('#cast')!

const bgColors = ['#0b1026', '#14213d', '#2b2d42', '#1b263b']
const inkColors = ['#ff4d6d', '#f9c74f', '#90be6d', '#4cc9f0', '#b517ff']

let dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
let strokes: Point[][] = []
let current: Point[] | null = null
let ink = inkColors[0]!

const spells = [
  { id: 'circle', label: 'circle', total: 6 },
  { id: 'line', label: 'line', total: 6 },
  { id: 'zigzag', label: 'zigzag', total: 6 },
  { id: 'triangle', label: 'triangle', total: 6 },
  { id: 'c-curve', label: 'C curve', total: 6 },
  { id: 's-curve', label: 'S curve', total: 6 },
] as const

let spellIndex = 0
let successes = 0

function setToast(text: string) {
  toastEl.textContent = text
  toastEl.classList.add('show')
  window.setTimeout(() => toastEl.classList.remove('show'), 1200)
}

function setSpell(i: number) {
  spellIndex = i
  const s = spells[spellIndex]!
  promptEl.innerHTML = `Draw: <b>${s.label}</b>`
  progressEl.textContent = `${successes} / ${spells.length} spells`
  ink = inkColors[spellIndex % inkColors.length]!
  render()
}

function resize() {
  dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
  const rect = canvas.getBoundingClientRect()
  canvas.width = Math.max(1, Math.floor(rect.width * dpr))
  canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)
  render()
}

function drawBackground() {
  const rect = canvas.getBoundingClientRect()
  const w = rect.width
  const h = rect.height
  const g = ctx.createLinearGradient(0, 0, w, h)
  const c1 = bgColors[(spellIndex + 0) % bgColors.length]!
  const c2 = bgColors[(spellIndex + 1) % bgColors.length]!
  g.addColorStop(0, c1)
  g.addColorStop(1, c2)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // subtle stars
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  for (let i = 0; i < 80; i++) {
    const x = (i * 97) % w
    const y = (i * 57) % h
    ctx.fillRect(x, y, 2, 2)
  }
}

function drawStroke(points: Point[], color: string) {
  if (points.length < 2) return
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.lineWidth = 10

  ctx.beginPath()
  ctx.moveTo(points[0]!.x, points[0]!.y)
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x, points[i]!.y)
  ctx.stroke()

  // glow
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 18
  ctx.stroke()
}

function render() {
  drawBackground()
  for (let i = 0; i < strokes.length; i++) drawStroke(strokes[i]!, ink)
  if (current) drawStroke(current, ink)

  // guide ring
  const rect = canvas.getBoundingClientRect()
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(rect.width / 2, rect.height / 2, Math.min(rect.width, rect.height) * 0.28, 0, Math.PI * 2)
  ctx.stroke()
}

function canvasPointFromEvent(e: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect()
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    t: performance.now(),
  }
}

function startStroke(p: Point) {
  current = [p]
  render()
}

function extendStroke(p: Point) {
  if (!current) return
  const last = current[current.length - 1]!
  const dx = p.x - last.x
  const dy = p.y - last.y
  if (dx * dx + dy * dy < 1.5) return
  current.push(p)
  render()
}

function endStroke() {
  if (!current) return
  if (current.length > 2) strokes.push(current)
  current = null
  render()
}

// --- Very simple recognizers (v1): heuristic + forgiving ---
function flatten(sts: Point[][]): Point[] {
  return sts.flat()
}

function bbox(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

function pathLength(points: Point[]) {
  let len = 0
  for (let i = 1; i < points.length; i++) {
    const dx = points[i]!.x - points[i - 1]!.x
    const dy = points[i]!.y - points[i - 1]!.y
    len += Math.hypot(dx, dy)
  }
  return len
}

function isClosed(points: Point[], threshold = 0.18) {
  const b = bbox(points)
  const diag = Math.hypot(b.w, b.h) || 1
  const a = points[0]!
  const z = points[points.length - 1]!
  return Math.hypot(a.x - z.x, a.y - z.y) / diag < threshold
}

function turningCount(points: Point[]) {
  // count direction changes based on angle deltas
  let turns = 0
  for (let i = 2; i < points.length; i++) {
    const a = points[i - 2]!, b = points[i - 1]!, c = points[i]!
    const abx = b.x - a.x, aby = b.y - a.y
    const bcx = c.x - b.x, bcy = c.y - b.y
    const dot = abx * bcx + aby * bcy
    const mag = Math.hypot(abx, aby) * Math.hypot(bcx, bcy) || 1
    const cos = Math.max(-1, Math.min(1, dot / mag))
    const ang = Math.acos(cos)
    if (ang > 0.9) turns++
  }
  return turns
}

function detect(points: Point[]): (typeof spells)[number]['id'] | null {
  if (points.length < 12) return null

  const b = bbox(points)
  const area = b.w * b.h
  if (area < 80 * 80) return null // too small

  const len = pathLength(points)
  const closed = isClosed(points)
  const aspect = b.w / (b.h || 1)
  const turns = turningCount(points)

  // line: long and not many turns
  if (!closed && len > 400 && turns < 10) return 'line'

  // zigzag: many turns, not closed
  if (!closed && turns >= 18) return 'zigzag'

  // triangle: closed-ish + moderate turns + roughly bounded
  if (closed && turns >= 10 && turns <= 30) {
    // if it is very round, treat as circle
    const roundish = Math.abs(1 - aspect) < 0.35 && turns > 18
    if (roundish) return 'circle'
    return 'triangle'
  }

  // circle: closed and fairly round
  if (closed && Math.abs(1 - aspect) < 0.35 && turns > 18) return 'circle'

  // C curve: open, curved, not too many turns
  if (!closed && turns >= 10 && turns <= 22) {
    // crude: if start and end are on the same side-ish (vertical alignment)
    const a = points[0]!, z = points[points.length - 1]!
    if (Math.abs(a.y - z.y) > 40 && Math.abs(a.x - z.x) < b.w * 0.5) return 'c-curve'
  }

  // S curve: open, curvy with more turns
  if (!closed && turns >= 16 && turns <= 32) return 's-curve'

  return null
}

function cast() {
  const points = flatten(strokes)
  const guess = detect(points)
  const target = spells[spellIndex]!.id

  if (guess === target) {
    setToast('✨ Spell cast!')
    successes++
    progressEl.textContent = `${successes} / ${spells.length} spells`
    // next
    strokes = []
    current = null
    if (successes >= spells.length) {
      setToast('🐲 You completed the spellbook!')
      successes = 0
      setSpell(0)
      return
    }
    setSpell((spellIndex + 1) % spells.length)
  } else {
    setToast(guess ? `Not quite — I saw “${guess}”` : `Hmm… try bigger!`)
  }
}

// pointer events
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId)
  const p = canvasPointFromEvent(e)
  startStroke(p)
})
canvas.addEventListener('pointermove', (e) => {
  if (!current) return
  extendStroke(canvasPointFromEvent(e))
})
canvas.addEventListener('pointerup', () => endStroke())
canvas.addEventListener('pointercancel', () => endStroke())

undoBtn.addEventListener('click', () => {
  strokes.pop()
  render()
})
clearBtn.addEventListener('click', () => {
  strokes = []
  current = null
  render()
})
castBtn.addEventListener('click', () => cast())

window.addEventListener('resize', resize)

setSpell(0)
resize()
