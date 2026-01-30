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

type DragonMood = 'idle' | 'happy' | 'oops' | 'hit'
let dragonMood: DragonMood = 'idle'
let dragonMoodUntil = 0

let enemyMood: DragonMood = 'idle'
let enemyMoodUntil = 0

let animUntil = 0

type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string }
let particles: Particle[] = []

type Bolt = { x0: number; y0: number; x1: number; y1: number; life: number; total: number; color: string }
let bolts: Bolt[] = []

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
  window.setTimeout(() => toastEl.classList.remove('show'), 1400)
}

function setDragonMood(mood: DragonMood, ms = 900) {
  dragonMood = mood
  dragonMoodUntil = performance.now() + ms
  animUntil = Math.max(animUntil, dragonMoodUntil)
}

function setEnemyMood(mood: DragonMood, ms = 900) {
  enemyMood = mood
  enemyMoodUntil = performance.now() + ms
  animUntil = Math.max(animUntil, enemyMoodUntil)
}

function spawnBolt(x0: number, y0: number, x1: number, y1: number) {
  const total = 520
  bolts.push({ x0, y0, x1, y1, life: total, total, color: ink })
  animUntil = Math.max(animUntil, performance.now() + total + 120)
}

function spawnBurst(x: number, y: number) {
  const colors = ['#ff4d6d', '#f9c74f', '#4cc9f0', '#b517ff', '#90be6d']
  for (let i = 0; i < 42; i++) {
    const a = (i / 42) * Math.PI * 2
    const s = 60 + Math.random() * 220
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 40,
      life: 650 + Math.random() * 300,
      color: colors[i % colors.length]!,
    })
  }
  animUntil = Math.max(animUntil, performance.now() + 1000)
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

function drawBolts(dtMs: number) {
  for (const b of bolts) b.life -= dtMs
  bolts = bolts.filter((b) => b.life > 0)

  for (const b of bolts) {
    const p = 1 - b.life / b.total
    // easeOut
    const e = 1 - Math.pow(1 - p, 3)
    const x = b.x0 + (b.x1 - b.x0) * e
    const y = b.y0 + (b.y1 - b.y0) * e

    ctx.strokeStyle = b.color
    ctx.lineWidth = 10
    ctx.lineCap = 'round'

    ctx.beginPath()
    ctx.moveTo(b.x0, b.y0)
    // little jag to feel magical
    const mx = (b.x0 + x) / 2 + Math.sin(p * 18) * 10
    const my = (b.y0 + y) / 2 + Math.cos(p * 16) * 10
    ctx.quadraticCurveTo(mx, my, x, y)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 18
    ctx.stroke()
  }
}

function drawParticles(dtMs: number) {
  const rect = canvas.getBoundingClientRect()
  const w = rect.width
  const h = rect.height
  const gravity = 520

  for (const p of particles) {
    p.life -= dtMs
    p.vy += gravity * (dtMs / 1000)
    p.x += p.vx * (dtMs / 1000)
    p.y += p.vy * (dtMs / 1000)
  }
  particles = particles.filter((p) => p.life > 0 && p.x > -50 && p.x < w + 50 && p.y > -50 && p.y < h + 50)

  for (const p of particles) {
    const a = Math.max(0, Math.min(1, p.life / 900))
    ctx.fillStyle = `rgba(${hexToRgb(p.color)},${a})`
    ctx.beginPath()
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '')
  const n = parseInt(h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `${r},${g},${b}`
}

function drawDragon(now: number) {
  const rect = canvas.getBoundingClientRect()
  const w = rect.width
  const h = rect.height

  const baseX = 110
  const baseY = h - 120

  const mood = now < dragonMoodUntil ? dragonMood : 'idle'
  const t = now / 1000

  let bob = Math.sin(t * 4) * 4
  let shake = 0
  if (mood === 'happy') bob += Math.sin(t * 10) * 6
  if (mood === 'oops') shake = Math.sin(t * 18) * 6

  const x = baseX + shake
  const y = baseY + bob

  // body
  ctx.save()
  ctx.translate(x, y)

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(0, 52, 58, 14, 0, 0, Math.PI * 2)
  ctx.fill()

  // tail
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.lineWidth = 10
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-40, 15)
  ctx.quadraticCurveTo(-85, 25, -92, 0)
  ctx.quadraticCurveTo(-98, -22, -70, -28)
  ctx.stroke()

  // body blob
  ctx.fillStyle = '#5fe37a'
  ctx.beginPath()
  ctx.ellipse(0, 5, 62, 48, 0.1, 0, Math.PI * 2)
  ctx.fill()

  // belly
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.ellipse(10, 18, 32, 24, 0.1, 0, Math.PI * 2)
  ctx.fill()

  // head
  ctx.fillStyle = '#5fe37a'
  ctx.beginPath()
  ctx.ellipse(38, -25, 38, 32, -0.1, 0, Math.PI * 2)
  ctx.fill()

  // horn
  ctx.fillStyle = '#f9c74f'
  ctx.beginPath()
  ctx.moveTo(52, -55)
  ctx.lineTo(66, -72)
  ctx.lineTo(70, -48)
  ctx.closePath()
  ctx.fill()

  // eye
  ctx.fillStyle = '#0b1026'
  ctx.beginPath()
  ctx.arc(52, -30, 6, 0, Math.PI * 2)
  ctx.fill()
  if (mood === 'happy') {
    ctx.strokeStyle = '#0b1026'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(52, -26, 10, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
  }

  // mouth
  ctx.strokeStyle = '#0b1026'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (mood === 'oops') {
    ctx.arc(60, -12, 8, 0, Math.PI * 2)
  } else {
    ctx.arc(62, -12, 12, 0.15 * Math.PI, 0.85 * Math.PI)
  }
  ctx.stroke()

  // little wing
  ctx.fillStyle = '#4cc9f0'
  ctx.beginPath()
  ctx.moveTo(0, -10)
  ctx.quadraticCurveTo(-20, -45, -46, -18)
  ctx.quadraticCurveTo(-24, -12, 0, -10)
  ctx.fill()

  // sparkles for happy
  if (mood === 'happy') {
    ctx.fillStyle = 'rgba(255,255,255,0.65)'
    for (let i = 0; i < 6; i++) {
      const sx = 72 + Math.cos(t * 6 + i) * 18
      const sy = -46 + Math.sin(t * 6 + i) * 12
      ctx.fillRect(sx, sy, 3, 3)
    }
  }

  ctx.restore()

  // label
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = '700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial'
  ctx.fillText('Piper\'s Dragon', 16, h - 14)

  // --- Enemy dragon (right side) ---
  const enemy = now < enemyMoodUntil ? enemyMood : 'idle'
  const ex = w - 120 + (enemy === 'hit' ? Math.sin(t * 26) * 8 : 0)
  const ey = 120 + (enemy === 'hit' ? Math.sin(t * 20) * 6 : Math.sin(t * 3) * 3)

  ctx.save()
  ctx.translate(ex, ey)

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(0, 56, 56, 14, 0, 0, Math.PI * 2)
  ctx.fill()

  // body
  ctx.fillStyle = '#ff4d6d'
  ctx.beginPath()
  ctx.ellipse(0, 10, 58, 46, -0.06, 0, Math.PI * 2)
  ctx.fill()

  // belly
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.ellipse(-8, 22, 30, 22, -0.06, 0, Math.PI * 2)
  ctx.fill()

  // head
  ctx.fillStyle = '#ff4d6d'
  ctx.beginPath()
  ctx.ellipse(-34, -18, 38, 32, 0.14, 0, Math.PI * 2)
  ctx.fill()

  // horn
  ctx.fillStyle = '#f9c74f'
  ctx.beginPath()
  ctx.moveTo(-52, -50)
  ctx.lineTo(-66, -70)
  ctx.lineTo(-70, -44)
  ctx.closePath()
  ctx.fill()

  // eye
  ctx.fillStyle = '#0b1026'
  ctx.beginPath()
  ctx.arc(-46, -22, 6, 0, Math.PI * 2)
  ctx.fill()

  // mouth
  ctx.strokeStyle = '#0b1026'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  if (enemy === 'hit') {
    // X mouth
    ctx.moveTo(-62, -4)
    ctx.lineTo(-52, 6)
    ctx.moveTo(-52, -4)
    ctx.lineTo(-62, 6)
  } else {
    ctx.arc(-58, -6, 12, 1.15 * Math.PI, 1.85 * Math.PI)
  }
  ctx.stroke()

  // wing
  ctx.fillStyle = '#4cc9f0'
  ctx.beginPath()
  ctx.moveTo(4, -8)
  ctx.quadraticCurveTo(26, -42, 50, -12)
  ctx.quadraticCurveTo(26, -6, 4, -8)
  ctx.fill()

  // little sparks
  if (enemy === 'hit') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)'
    for (let i = 0; i < 7; i++) {
      const sx = 60 + Math.cos(t * 8 + i) * 14
      const sy = -26 + Math.sin(t * 8 + i) * 10
      ctx.fillRect(sx, sy, 3, 3)
    }
  }

  ctx.restore()

  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = '700 14px system-ui, -apple-system, Segoe UI, Roboto, Arial'
  ctx.fillText('Grumpy Dragon', w - 140, 24)
}

function render(dtMs = 16) {
  const now = performance.now()
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

  drawDragon(now)
  if (bolts.length) drawBolts(dtMs)
  if (particles.length) drawParticles(dtMs)
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
  animUntil = Math.max(animUntil, performance.now() + 200)
  render()
}

function extendStroke(p: Point) {
  if (!current) return
  const last = current[current.length - 1]!
  const dx = p.x - last.x
  const dy = p.y - last.y
  if (dx * dx + dy * dy < 1.5) return
  current.push(p)
  animUntil = Math.max(animUntil, performance.now() + 200)
  render()
}

function endStroke() {
  if (!current) return
  if (current.length > 2) strokes.push(current)
  current = null
  animUntil = Math.max(animUntil, performance.now() + 250)
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

function isClosed(points: Point[], threshold = 0.32) {
  // Threshold is intentionally forgiving for touch input.
  const b = bbox(points)
  const diag = Math.hypot(b.w, b.h) || 1
  const a = points[0]!
  const z = points[points.length - 1]!
  return Math.hypot(a.x - z.x, a.y - z.y) / diag < threshold
}

function centroid(points: Point[]) {
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  const n = Math.max(1, points.length)
  return { x: x / n, y: y / n }
}

function circularity(points: Point[]) {
  // 0 = perfect circle, higher = less circle-ish
  const c = centroid(points)
  const rs: number[] = []
  for (const p of points) rs.push(Math.hypot(p.x - c.x, p.y - c.y))
  const mean = rs.reduce((a, b) => a + b, 0) / Math.max(1, rs.length)
  const variance = rs.reduce((a, r) => a + (r - mean) * (r - mean), 0) / Math.max(1, rs.length)
  const std = Math.sqrt(variance)
  return { meanR: mean, stdR: std, ratio: std / Math.max(1, mean) }
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

type Detection = {
  guess: (typeof spells)[number]['id'] | null
  reason:
    | 'too_few_points'
    | 'too_small'
    | 'not_closed'
    | 'too_straight'
    | 'too_curvy'
    | 'unknown'
    | 'ok'
}

function detect(points: Point[], strokeCount: number): Detection {
  if (points.length < 12) return { guess: null, reason: 'too_few_points' }

  const b = bbox(points)
  const area = b.w * b.h
  if (area < 80 * 80) return { guess: null, reason: 'too_small' }

  const len = pathLength(points)
  // Be extra forgiving about "closing" when there are multiple strokes (kids lift finger a lot).
  const closed = isClosed(points, strokeCount >= 2 ? 0.45 : 0.32)
  const aspect = b.w / (b.h || 1)
  const turns = turningCount(points)

  // line: long and not many turns
  if (!closed && len > 400 && turns < 10) return { guess: 'line', reason: 'ok' }

  // zigzag: forgiving. Touch zigzags may be drawn with fewer sharp corners and/or multiple strokes.
  // We treat it as zigzag if it's open, reasonably long, and has a decent number of turns.
  // (strokeCount helps: multiple strokes usually means multiple corners.)
  const zigzagLike = !closed && len > 260 && (turns >= 12 || (strokeCount >= 2 && turns >= 9))
  if (zigzagLike) return { guess: 'zigzag', reason: 'ok' }

  // circle: closed-ish and round-ish.
  // Heuristic: near-square bbox + low radius variance OR lots of turns.
  const circ = circularity(points)
  const roundBbox = Math.abs(1 - aspect) < 0.55
  const roundR = circ.ratio < 0.55
  const circleLike = closed && (roundBbox && (roundR || turns > 14))
  if (circleLike) return { guess: 'circle', reason: 'ok' }

  // triangle: VERY forgiving.
  // If it's closed-ish and not circle-like, accept a wide range of corner counts.
  // (Touch triangles often look like wonky pyramids.)
  const triangleLike = closed && !circleLike && turns >= 6 && turns <= 40
  if (triangleLike) return { guess: 'triangle', reason: 'ok' }

  // C curve: open, curved, not too many turns
  if (!closed && turns >= 10 && turns <= 22) {
    const a = points[0]!, z = points[points.length - 1]!
    if (Math.abs(a.y - z.y) > 40 && Math.abs(a.x - z.x) < b.w * 0.5) return { guess: 'c-curve', reason: 'ok' }
  }

  // S curve: open, curvy with more turns
  if (!closed && turns >= 16 && turns <= 32) return { guess: 's-curve', reason: 'ok' }

  if (!closed && turns < 10) return { guess: null, reason: 'too_straight' }
  if (!closed && turns > 30) return { guess: null, reason: 'too_curvy' }
  if (!closed) return { guess: null, reason: 'not_closed' }

  return { guess: null, reason: 'unknown' }
}

function helpMessage(target: (typeof spells)[number]['id'], d: Detection): string {
  if (d.reason === 'too_small' || d.reason === 'too_few_points') return 'Try drawing it BIGGER 🙂'

  switch (target) {
    case 'circle':
      return d.reason === 'not_closed' ? 'Try connecting the ends to make a circle!' : 'Try a round shape (like a big O).'
    case 'triangle':
      return d.reason === 'not_closed'
        ? 'Try closing the triangle (make the last line touch the first).'
        : 'Try 3 straight sides with pointy corners.'
    case 'line':
      return 'Try one long straight line across the screen.'
    case 'zigzag':
      return 'Try sharp corners: \/\/\/ like a lightning bolt!'
    case 'c-curve':
      return 'Try a big letter C (open on one side).'
    case 's-curve':
      return 'Try a big squiggly S (two curves).'
  }
}

function cast() {
  const points = flatten(current ? [...strokes, current] : strokes)
  const strokeCount = (current ? [...strokes, current] : strokes).length
  const d = detect(points, strokeCount)
  const target = spells[spellIndex]!.id

  const rect = canvas.getBoundingClientRect()

  // approximate mouths (so bolt originates/lands in a fun place)
  const fromX = 190
  const fromY = rect.height - 150
  const toX = rect.width - 190
  const toY = 120

  if (d.guess === target) {
    setToast('✨ Spell cast!')
    setDragonMood('happy', 1100)
    setEnemyMood('hit', 900)
    spawnBolt(fromX, fromY, toX, toY)
    spawnBurst(toX, toY)

    successes++
    progressEl.textContent = `${successes} / ${spells.length} spells`
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
    setDragonMood('oops', 1000)
    setEnemyMood('idle', 1)
    const guessText = d.guess ? `I thought it was “${d.guess}”. ` : ''
    setToast(guessText + helpMessage(target, d))
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

let lastFrame = performance.now()
function frame(now: number) {
  const dt = Math.min(40, now - lastFrame)
  lastFrame = now

  if (now < animUntil || particles.length || bolts.length) {
    render(dt)
  }
  requestAnimationFrame(frame)
}

setSpell(0)
resize()
requestAnimationFrame(frame)
