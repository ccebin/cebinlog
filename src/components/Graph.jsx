import React, { useEffect, useRef, useState } from 'react'
import { Zap, Search, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { API_BASE } from '../lib/apiBase'

const getHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('nexus_token')}` })

const POSITIONS_KEY = 'graph-positions-v3'

const getAvatarUrl = (person) => {
  if (!person.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png'
  const isGif = person.avatar.startsWith('a_')
  return `https://cdn.discordapp.com/avatars/${person.id}/${person.avatar}.${isGif ? 'gif' : 'png'}?size=64`
}

// ============================================================
// Avatar image cache (paylaşılan)
// ============================================================
const imgCache = new Map()
function loadImage(url, onLoad) {
  if (!url) return null
  let entry = imgCache.get(url)
  if (entry) {
    if (entry.loaded) onLoad?.()
    return entry
  }
  const img = new Image()
  entry = { img, loaded: false, error: false }
  img.onload = () => { entry.loaded = true; onLoad?.() }
  img.onerror = () => { entry.error = true }
  img.src = url
  imgCache.set(url, entry)
  return entry
}

// ============================================================
// Force simulation (d3-force benzeri, dependency yok)
// ============================================================
class Simulation {
  constructor() {
    this.nodes = []
    this.edges = []
    this.alpha = 0
    this.alphaMin = 0.005
    this.alphaDecay = 0.04 // hızlı decay -> ~1.5 sn'de durur
    this.alphaTarget = 0

    this.chargeStrength = -180
    this.chargeMaxDist = 350
    this.linkDist = 95
    this.linkStrength = 0.25
    this.centerStrength = 0.04
    this.collideRadius = 38 // node yarıçapı 16 → 6px görünür boşluk + label payı
    this.velocityDecay = 0.72 // ağır damping -> osilasyon ölür
    this.maxVelocity = 8
    this.boundary = 2200 // çok node varsa cluster sığsın
    this.collidePasses = 3 // çakışmayı her frame 3 kez çöz -> sıkı garanti
    this.onSettled = null
  }

  reheat(target = 0.5) {
    this.alpha = Math.max(this.alpha, target)
    this.alphaTarget = 0
  }

  step() {
    if (this.alpha < this.alphaMin) {
      if (this.alpha > 0) {
        this.alpha = 0
        this.onSettled?.()
      }
      return false
    }
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay

    const a = this.alpha
    const nodes = this.nodes
    const edges = this.edges
    const n = nodes.length

    // 1) Charge (repulsion) – d3-force formülü: vx += dx * strength / d²
    const maxSq = this.chargeMaxDist * this.chargeMaxDist
    for (let i = 0; i < n; i++) {
      const ni = nodes[i]
      for (let j = i + 1; j < n; j++) {
        const nj = nodes[j]
        const dx = nj.x - ni.x
        const dy = nj.y - ni.y
        let d2 = dx * dx + dy * dy
        if (d2 === 0 || d2 > maxSq) continue
        if (d2 < 4) d2 = 4 // çok yakın olunca patlamasın
        const f = (this.chargeStrength * a) / d2
        const fx = dx * f
        const fy = dy * f
        if (!ni.fixed) { ni.vx += fx; ni.vy += fy }
        if (!nj.fixed) { nj.vx -= fx; nj.vy -= fy }
      }
    }

    // 2) Link spring
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i]
      const s = e.source, t = e.target
      if (!s || !t) continue
      const dx = t.x - s.x
      const dy = t.y - s.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const diff = ((d - this.linkDist) / d) * this.linkStrength * a
      const fx = dx * diff
      const fy = dy * diff
      if (!s.fixed) { s.vx += fx; s.vy += fy }
      if (!t.fixed) { t.vx -= fx; t.vy -= fy }
    }

    // 3) Center gravity
    const cs = this.centerStrength * a
    for (let i = 0; i < n; i++) {
      const node = nodes[i]
      if (node.fixed) continue
      node.vx -= node.x * cs
      node.vy -= node.y * cs
    }

    // 4) Integrate (velocity cap + boundary clamp)
    const damp = 1 - this.velocityDecay
    const maxV = this.maxVelocity
    const bound = this.boundary
    for (let i = 0; i < n; i++) {
      const node = nodes[i]
      if (node.fixed) { node.vx = 0; node.vy = 0; continue }
      node.vx *= damp
      node.vy *= damp
      const v2 = node.vx * node.vx + node.vy * node.vy
      if (v2 > maxV * maxV) {
        const v = Math.sqrt(v2)
        node.vx = (node.vx / v) * maxV
        node.vy = (node.vy / v) * maxV
      }
      node.x += node.vx
      node.y += node.vy
      // Hard wall: ekran dışına kaçamasın
      if (node.x > bound) { node.x = bound; node.vx = 0 }
      else if (node.x < -bound) { node.x = -bound; node.vx = 0 }
      if (node.y > bound) { node.y = bound; node.vy = 0 }
      else if (node.y < -bound) { node.y = -bound; node.vy = 0 }
    }

    // 5) Collision (positional) – birden çok pass ile sıkı çözüm
    const cr = this.collideRadius
    const crSq = (cr * 2) * (cr * 2)
    for (let pass = 0; pass < this.collidePasses; pass++) {
      for (let i = 0; i < n; i++) {
        const a_n = nodes[i]
        for (let j = i + 1; j < n; j++) {
          const b_n = nodes[j]
          const dx = b_n.x - a_n.x
          const dy = b_n.y - a_n.y
          const d2 = dx * dx + dy * dy
          if (d2 >= crSq || d2 === 0) continue
          const d = Math.sqrt(d2)
          const overlap = (cr * 2 - d) / 2
          const ox = (dx / d) * overlap
          const oy = (dy / d) * overlap
          if (!a_n.fixed) { a_n.x -= ox; a_n.y -= oy }
          if (!b_n.fixed) { b_n.x += ox; b_n.y += oy }
        }
      }
    }

    return true
  }
}

// ============================================================
// React Component
// ============================================================
export default function Graph() {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const simRef = useRef(null)
  const transformRef = useRef({ x: 0, y: 0, k: 1, initialized: false })
  const focusAnimRef = useRef(null)
  const nodeAnimRef = useRef(null)
  const hasFittedRef = useRef(false)

  const stateRef = useRef({
    nodes: [],
    edges: [],
    nodesById: new Map(),
    neighborMap: new Map(), // nodeId -> Set of neighbor node refs
    selected: null,
    hovered: null,
    cursor: 'grab',
    isPanning: false,
    panStart: null,
    isDraggingNode: false,
    dragNode: null,
    dragOffset: { x: 0, y: 0 },
    pointerDownPos: null,
    rafId: null,
    canvasW: 0,
    canvasH: 0,
    dpr: 1
  })

  const [searchTerm, setSearchTerm] = useState('')
  const [nodeCount, setNodeCount] = useState(0)

  const { data: people = [], isPending: isPendingPeople } = useQuery({
    queryKey: ['people'],
    queryFn: () => axios.get(`${API_BASE}/people`, { headers: getHeaders() }).then(res => res.data)
  })

  const { data: connections = [], isPending: isPendingConnections } = useQuery({
    queryKey: ['connections'],
    queryFn: () => axios.get(`${API_BASE}/connections`, { headers: getHeaders() }).then(res => res.data)
  })

  const graphDataPending = isPendingPeople || isPendingConnections

  const savePositions = () => {
    try {
      const out = {}
      for (const n of stateRef.current.nodes) {
        out[n.id] = { x: n.x, y: n.y }
      }
      localStorage.setItem(POSITIONS_KEY, JSON.stringify(out))
    } catch (e) { /* yoksay */ }
  }

  const buildNeighborMap = () => {
    const map = new Map()
    for (const n of stateRef.current.nodes) map.set(n.id, new Set())
    for (const e of stateRef.current.edges) {
      if (!e.source || !e.target) continue
      map.get(e.source.id)?.add(e.target)
      map.get(e.target.id)?.add(e.source)
    }
    stateRef.current.neighborMap = map
  }

  const animateFocus = (targetX, targetY, targetK = 1.4, duration = 500) => {
    const t = transformRef.current
    const cw = stateRef.current.canvasW
    const ch = stateRef.current.canvasH
    const targetTx = cw / 2 - targetX * targetK
    const targetTy = ch / 2 - targetY * targetK

    const startX = t.x, startY = t.y, startK = t.k
    const start = performance.now()

    if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current)

    const step = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
      t.x = startX + (targetTx - startX) * ease
      t.y = startY + (targetTy - startY) * ease
      t.k = startK + (targetK - startK) * ease
      if (p < 1) focusAnimRef.current = requestAnimationFrame(step)
      else focusAnimRef.current = null
    }
    focusAnimRef.current = requestAnimationFrame(step)
  }

  // ============================================================
  // EGO-NETWORK ANIMATION
  // Tıklanan kişiyi merkez yapar, bağlıları çevresine dairesel
  // dizer, alakasızları uzağa iter. Smooth pozisyon animasyonu.
  // ============================================================
  const animateNodesToTargets = (duration = 600, onComplete) => {
    const state = stateRef.current
    if (state.nodes.length === 0) { onComplete?.(); return }

    for (const n of state.nodes) {
      n._sx = n.x
      n._sy = n.y
    }
    const start = performance.now()
    if (nodeAnimRef.current) cancelAnimationFrame(nodeAnimRef.current)

    const step = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
      for (const n of state.nodes) {
        if (n._tx === undefined || n._ty === undefined) continue
        n.x = n._sx + (n._tx - n._sx) * ease
        n.y = n._sy + (n._ty - n._sy) * ease
      }
      if (p < 1) {
        nodeAnimRef.current = requestAnimationFrame(step)
      } else {
        nodeAnimRef.current = null
        onComplete?.()
      }
    }
    nodeAnimRef.current = requestAnimationFrame(step)
  }

  const enterEgoView = (selectedNode) => {
    const state = stateRef.current
    if (!selectedNode) return

    // Fizik motoru sus
    if (simRef.current) simRef.current.alpha = 0

    // Home pozisyonu kaydet (zaten kayıtlıysa bozmadan)
    for (const n of state.nodes) {
      if (n._homeX === undefined) {
        n._homeX = n.x
        n._homeY = n.y
      }
    }

    const neighbors = state.neighborMap.get(selectedNode.id) || new Set()
    const nbArr = [...neighbors]
    const nbSet = new Set(nbArr)
    const cx = selectedNode._homeX
    const cy = selectedNode._homeY

    // Merkez (seçili) yerinde kalır
    selectedNode._tx = cx
    selectedNode._ty = cy

    // Komşular: çok-halkalı sunburst – çakışmasız + random çizgi uzunlukları
    // Her halkanın kapasitesi node yarıçapından hesaplanır → iç içe giremez
    // Halka içinde küçük radyal jitter ile "linear/random length" hissi korunur
    const jitter = (id) => {
      let h = 2166136261 >>> 0
      for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i)
        h = Math.imul(h, 16777619) >>> 0
      }
      return (h % 10000) / 10000 // [0, 1)
    }

    const nodeR = selectedNode.radius || 16
    const minArcSpacing = nodeR * 3.1 // iki node merkezi arasında min mesafe (~50px, label payı)
    const ringStep = nodeR * 3.4 // halkalar arası mesafe (~54px, dikey label payı)
    let ringR = nodeR * 5.8 // ilk halka yarıçapı (~93px)
    let placed = 0
    let ringIdx = 0
    let clusterMaxR = ringR

    while (placed < nbArr.length) {
      const circumference = 2 * Math.PI * ringR
      const capacity = Math.max(3, Math.floor(circumference / minArcSpacing))
      const remaining = nbArr.length - placed
      const inThisRing = Math.min(capacity, remaining)

      // Komşu halkaların açıları üst üste binmesin diye half-step offset
      const ringOffset = ringIdx % 2 === 0
        ? -Math.PI / 2
        : -Math.PI / 2 + Math.PI / inThisRing

      for (let i = 0; i < inThisRing; i++) {
        const n = nbArr[placed]
        const j = jitter(n.id)
        const angle = ringOffset + (i / inThisRing) * Math.PI * 2
        // Radyal jitter halka kalınlığının yarısını aşmaz → komşu halkaya geçemez
        const r = ringR + (j - 0.5) * (ringStep * 0.55)
        if (r > clusterMaxR) clusterMaxR = r
        n._tx = cx + Math.cos(angle) * r
        n._ty = cy + Math.sin(angle) * r
        placed++
      }

      ringR += ringStep
      ringIdx++
    }

    // Alakasızlar: kümeyi rahatsız etmeyecek kadar uzağa
    // (sadece kümeye giriyorlarsa it, geride kalanlar dokunulmasın)
    const minOuterDist = clusterMaxR + 90
    for (const n of state.nodes) {
      if (n === selectedNode || nbSet.has(n)) continue
      const dx = n._homeX - cx
      const dy = n._homeY - cy
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      if (d < minOuterDist) {
        const factor = minOuterDist / d
        n._tx = cx + dx * factor
        n._ty = cy + dy * factor
      } else {
        n._tx = n._homeX
        n._ty = n._homeY
      }
    }

    // ---- POST-PASS: TÜM target pozisyonlarına collision relaxation ----
    // Hiçbir node birbirine değmesin garantisi. Selected sabit kalır.
    // Label genişliği için node çapından geniş tutuyoruz.
    const minDist = nodeR * 3.0 // merkez-merkez minimum mesafe (~48px)
    const minDistSq = minDist * minDist
    const all = state.nodes
    for (let pass = 0; pass < 8; pass++) {
      let anyMoved = false
      for (let i = 0; i < all.length; i++) {
        const a = all[i]
        if (a._tx === undefined) continue
        for (let j = i + 1; j < all.length; j++) {
          const b = all[j]
          if (b._tx === undefined) continue
          const dx = b._tx - a._tx
          const dy = b._ty - a._ty
          const d2 = dx * dx + dy * dy
          if (d2 >= minDistSq) continue
          let d = Math.sqrt(d2)
          let nx, ny
          if (d === 0) {
            // Tam üst üste – rastgele bir yöne it
            const ang = Math.random() * Math.PI * 2
            nx = Math.cos(ang); ny = Math.sin(ang); d = 0.001
          } else {
            nx = dx / d; ny = dy / d
          }
          const overlap = (minDist - d) / 2
          // Selected node sabit kalır, diğerleri itilir
          if (a !== selectedNode) { a._tx -= nx * overlap; a._ty -= ny * overlap }
          else                    { b._tx += nx * overlap * 2; b._ty += ny * overlap * 2; anyMoved = true; continue }
          if (b !== selectedNode) { b._tx += nx * overlap; b._ty += ny * overlap }
          else                    { a._tx -= nx * overlap; a._ty -= ny * overlap }
          anyMoved = true
        }
      }
      if (!anyMoved) break
    }

    animateNodesToTargets(650)

    // Kamera seçili kişiye gitsin – kullanıcı kaybolmasın
    const t = transformRef.current
    const targetK = Math.max(0.9, Math.min(t.k, 1.3))
    animateFocus(cx, cy, targetK, 650)
  }

  const exitEgoView = () => {
    const state = stateRef.current
    let any = false
    for (const n of state.nodes) {
      if (n._homeX === undefined) continue
      n._tx = n._homeX
      n._ty = n._homeY
      any = true
    }
    if (!any) return
    animateNodesToTargets(650, () => {
      for (const n of state.nodes) {
        n._homeX = undefined
        n._homeY = undefined
      }
      savePositions()
    })
  }

  const focusNode = (nodeOrId) => {
    const node = typeof nodeOrId === 'string' ? stateRef.current.nodesById.get(nodeOrId) : nodeOrId
    if (!node) return
    if (stateRef.current.selected !== node) {
      stateRef.current.selected = node
      enterEgoView(node)
    }
    // Kameranı düğüme götür ki kullanıcı kaybetmesin
    animateFocus(node._homeX ?? node.x, node._homeY ?? node.y, 1.2, 600)
  }

  const fitToView = (padding = 60, duration = 700) => {
    const state = stateRef.current
    if (state.nodes.length === 0) return
    if (state.canvasW <= 0 || state.canvasH <= 0) return

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const n of state.nodes) {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue
      if (n.x < minX) minX = n.x
      if (n.x > maxX) maxX = n.x
      if (n.y < minY) minY = n.y
      if (n.y > maxY) maxY = n.y
    }
    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return

    const w = Math.max(1, maxX - minX)
    const h = Math.max(1, maxY - minY)
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    const rawK = Math.min(
      (state.canvasW - padding * 2) / w,
      (state.canvasH - padding * 2) / h,
      1.4
    )
    const k = Math.max(0.4, Math.min(1.4, rawK))
    animateFocus(cx, cy, k, duration)
  }

  // ============================================================
  // INIT: canvas + simulation + render loop + interaction
  // ============================================================
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return

    const canvas = canvasRef.current
    const container = containerRef.current
    const ctx = canvas.getContext('2d', { alpha: true })
    const sim = new Simulation()
    simRef.current = sim
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    stateRef.current.dpr = dpr

    // Sabitleşme tamamlanınca: sadece pozisyonları kaydet, kamera dokunulmaz
    sim.onSettled = () => {
      savePositions()
    }

    const resize = () => {
      const rect = container.getBoundingClientRect()
      stateRef.current.canvasW = rect.width
      stateRef.current.canvasH = rect.height
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      if (!transformRef.current.initialized) {
        transformRef.current.x = rect.width / 2
        transformRef.current.y = rect.height / 2
        transformRef.current.initialized = true
      }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)

    // ---------- Render loop ----------
    const render = (time) => {
      const state = stateRef.current
      const t = transformRef.current

      try {
        sim.step()

        // Sayısal güvenlik: NaN/Infinity tespiti -> sıfırla
        for (let i = 0; i < state.nodes.length; i++) {
          const n = state.nodes[i]
          if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
            n.x = (Math.random() - 0.5) * 100
            n.y = (Math.random() - 0.5) * 100
            n.vx = 0
            n.vy = 0
          }
        }

        // Transform de güvenli olsun
        if (!Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.k) || t.k <= 0) {
          t.x = state.canvasW / 2
          t.y = state.canvasH / 2
          t.k = 1
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, state.canvasW, state.canvasH)

        ctx.save()
        ctx.translate(t.x, t.y)
        ctx.scale(t.k, t.k)

      const selected = state.selected
      const hovered = state.hovered
      const focusNeighbors = selected ? state.neighborMap.get(selected.id) : null

      // ---- Edges ----
      const lw = 1 / t.k

      // Dim edges (when something is selected)
      if (selected) {
        ctx.strokeStyle = 'rgba(63, 63, 70, 0.10)'
        ctx.lineWidth = lw
        ctx.beginPath()
        for (let i = 0; i < state.edges.length; i++) {
          const e = state.edges[i]
          if (!e.source || !e.target) continue
          if (e.source === selected || e.target === selected) continue
          ctx.moveTo(e.source.x, e.source.y)
          ctx.lineTo(e.target.x, e.target.y)
        }
        ctx.stroke()

        // Highlighted edges (connected to selected)
        ctx.strokeStyle = 'rgba(124, 77, 255, 0.85)'
        ctx.lineWidth = 1.6 / t.k
        ctx.beginPath()
        for (let i = 0; i < state.edges.length; i++) {
          const e = state.edges[i]
          if (!e.source || !e.target) continue
          if (e.source === selected || e.target === selected) {
            ctx.moveTo(e.source.x, e.source.y)
            ctx.lineTo(e.target.x, e.target.y)
          }
        }
        ctx.stroke()
      } else {
        ctx.strokeStyle = 'rgba(82, 82, 91, 0.45)'
        ctx.lineWidth = lw
        ctx.beginPath()
        for (let i = 0; i < state.edges.length; i++) {
          const e = state.edges[i]
          if (!e.source || !e.target) continue
          ctx.moveTo(e.source.x, e.source.y)
          ctx.lineTo(e.target.x, e.target.y)
        }
        ctx.stroke()
      }

      // ---- Nodes ----
      // Label görünürlüğü: sadece relevant node'larda → çakışma olmaz
      // - selected/hovered/neighbor: her zaman göster
      // - diğerleri: sadece yüksek zoom'da (k > 1.4) göster
      const highZoom = t.k > 1.4
      for (let i = 0; i < state.nodes.length; i++) {
        const n = state.nodes[i]
        const isSel = n === selected
        const isHov = n === hovered
        const isNbr = focusNeighbors?.has(n)
        const dimmed = selected && !isSel && !isNbr
        const alpha = dimmed ? 0.18 : 1
        const r = isSel ? n.radius * 1.45 : (isHov || isNbr ? n.radius * 1.12 : n.radius)
        const showLabel = isSel || isHov || isNbr || (highZoom && !dimmed)

        drawNode(ctx, n, n.x, n.y, r, alpha, isSel, isHov, t.k, showLabel)
      }

      ctx.restore()
      } catch (err) {
        // Render hatası loop'u öldürmesin
        try { ctx.restore() } catch (e) { /* yoksay */ }
        if (typeof console !== 'undefined') console.warn('graph render error', err)
      } finally {
        state.rafId = requestAnimationFrame(render)
      }
    }
    stateRef.current.rafId = requestAnimationFrame(render)

    // ---------- Pointer interaction ----------
    const screenToWorld = (sx, sy) => {
      const rect = canvas.getBoundingClientRect()
      const t = transformRef.current
      return {
        x: (sx - rect.left - t.x) / t.k,
        y: (sy - rect.top - t.y) / t.k
      }
    }

    const findNodeAt = (wx, wy) => {
      const nodes = stateRef.current.nodes
      // En son çizilen üstte – sondan başa tara
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        const dx = wx - n.x
        const dy = wy - n.y
        const r = n.radius * 1.2
        if (dx * dx + dy * dy <= r * r) return n
      }
      return null
    }

    const onWheel = (ev) => {
      ev.preventDefault()
      const t = transformRef.current
      const rect = canvas.getBoundingClientRect()
      const mx = ev.clientX - rect.left
      const my = ev.clientY - rect.top
      const wx = (mx - t.x) / t.k
      const wy = (my - t.y) / t.k
      const factor = Math.exp(-ev.deltaY * 0.0015)
      const newK = Math.min(4, Math.max(0.15, t.k * factor))
      t.k = newK
      t.x = mx - wx * newK
      t.y = my - wy * newK
    }

    const onPointerDown = (ev) => {
      canvas.setPointerCapture?.(ev.pointerId)
      const w = screenToWorld(ev.clientX, ev.clientY)
      const node = findNodeAt(w.x, w.y)
      stateRef.current.pointerDownPos = { x: ev.clientX, y: ev.clientY }
      if (node) {
        stateRef.current.isDraggingNode = true
        stateRef.current.dragNode = node
        stateRef.current.dragOffset = { x: w.x - node.x, y: w.y - node.y }
        node.fixed = true
        canvas.style.cursor = 'grabbing'
      } else {
        stateRef.current.isPanning = true
        const t = transformRef.current
        stateRef.current.panStart = { x: ev.clientX, y: ev.clientY, tx: t.x, ty: t.y }
        canvas.style.cursor = 'grabbing'
      }
    }

    const onPointerMove = (ev) => {
      const state = stateRef.current
      if (state.isDraggingNode && state.dragNode) {
        const w = screenToWorld(ev.clientX, ev.clientY)
        state.dragNode.x = w.x - state.dragOffset.x
        state.dragNode.y = w.y - state.dragOffset.y
        // Ego view'deyken fizik motoru susturulur; rehetlemeyiz
        if (!state.selected) sim.reheat(0.1)
      } else if (state.isPanning && state.panStart) {
        const t = transformRef.current
        t.x = state.panStart.tx + (ev.clientX - state.panStart.x)
        t.y = state.panStart.ty + (ev.clientY - state.panStart.y)
      } else {
        const w = screenToWorld(ev.clientX, ev.clientY)
        const node = findNodeAt(w.x, w.y)
        state.hovered = node
        canvas.style.cursor = node ? 'pointer' : 'grab'
      }
    }

    const onPointerUp = (ev) => {
      const state = stateRef.current
      const wasDraggingNode = state.isDraggingNode
      const draggedNode = state.dragNode
      const downPos = state.pointerDownPos

      if (state.isDraggingNode && state.dragNode) {
        state.dragNode.fixed = false
        state.dragNode.vx = 0
        state.dragNode.vy = 0
        savePositions()
      }
      state.isDraggingNode = false
      state.dragNode = null
      state.isPanning = false
      state.panStart = null

      // Tıklama mı (kayda değer hareket olmadıysa)
      const moved = downPos ? (Math.abs(ev.clientX - downPos.x) + Math.abs(ev.clientY - downPos.y)) : 999
      if (moved < 4) {
        const w = screenToWorld(ev.clientX, ev.clientY)
        const node = findNodeAt(w.x, w.y)
        if (node) {
          if (state.selected !== node) {
            state.selected = node
            enterEgoView(node)
          }
        } else {
          if (state.selected) {
            state.selected = null
            exitEgoView()
          }
        }
      } else if (wasDraggingNode && draggedNode) {
        state.selected = draggedNode
      }

      state.pointerDownPos = null
      canvas.style.cursor = state.hovered ? 'pointer' : 'grab'
    }

    const onPointerLeave = () => {
      stateRef.current.hovered = null
      canvas.style.cursor = 'grab'
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('pointerleave', onPointerLeave)

    return () => {
      cancelAnimationFrame(stateRef.current.rafId)
      if (focusAnimRef.current) cancelAnimationFrame(focusAnimRef.current)
      if (nodeAnimRef.current) cancelAnimationFrame(nodeAnimRef.current)
      ro.disconnect()
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('pointerleave', onPointerLeave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ============================================================
  // SYNC: people/connections -> simulation nodes/edges (diff)
  // ============================================================
  useEffect(() => {
    const sim = simRef.current
    const state = stateRef.current
    if (!sim) return

    let savedPositions = {}
    try { savedPositions = JSON.parse(localStorage.getItem(POSITIONS_KEY) || '{}') } catch (e) { /* yoksay */ }

    const incomingIds = new Set(people.map(p => p.id))

    // Sil
    state.nodes = state.nodes.filter(n => incomingIds.has(n.id))
    state.nodesById.clear()
    for (const n of state.nodes) state.nodesById.set(n.id, n)

    // ==========================================================
    // Adjacency map ve BFS-tabanlı clustered initial placement
    // Bağlı kişiler komşularının etrafında yerleşir, izole olanlar
    // dış halkaya alınır → çok daha az başlangıç chaos'u
    // ==========================================================
    const adj = new Map()
    for (const p of people) adj.set(p.id, [])
    for (const c of connections) {
      adj.get(c.from_id)?.push(c.to_id)
      adj.get(c.to_id)?.push(c.from_id)
    }

    // İlk yerleşimi hesaplaman gereken yeni id'ler:
    const placedPos = new Map()
    // Önce var olanların ya da kayıtlı olanların pozisyonlarını "yerleşmiş" say
    for (const n of state.nodes) placedPos.set(n.id, { x: n.x, y: n.y })
    for (const p of people) {
      if (!placedPos.has(p.id) && savedPositions[p.id]) {
        placedPos.set(p.id, { x: savedPositions[p.id].x, y: savedPositions[p.id].y })
      }
    }

    const newIds = []
    for (const p of people) {
      if (!state.nodesById.has(p.id) && !savedPositions[p.id]) newIds.push(p.id)
    }

    if (newIds.length > 0) {
      // BFS – bağlantılı bileşenler içinde tohumdan yayılarak yerleştir
      const newSet = new Set(newIds)
      const queue = []

      // Zaten yerleşmiş olanları seed yap
      for (const id of placedPos.keys()) queue.push(id)

      // Hiç seed yoksa: yeni id'lerden derecesi en yüksek olanı orijinde başlat
      if (queue.length === 0) {
        let bestId = newIds[0]
        let bestDeg = -1
        for (const id of newIds) {
          const d = (adj.get(id) || []).length
          if (d > bestDeg) { bestDeg = d; bestId = id }
        }
        placedPos.set(bestId, { x: 0, y: 0 })
        queue.push(bestId)
      }

      while (queue.length > 0) {
        const cid = queue.shift()
        const cpos = placedPos.get(cid)
        const nbs = adj.get(cid) || []
        const unplaced = nbs.filter(nid => newSet.has(nid) && !placedPos.has(nid))
        if (unplaced.length === 0) continue
        for (let i = 0; i < unplaced.length; i++) {
          const nid = unplaced[i]
          const angle = (i / unplaced.length) * Math.PI * 2 + Math.random() * 0.5
          const r = 90 + Math.random() * 30
          placedPos.set(nid, {
            x: cpos.x + Math.cos(angle) * r,
            y: cpos.y + Math.sin(angle) * r
          })
          queue.push(nid)
        }
      }

      // Bağlantısız kalan yeni düğümler: dış halkaya
      let outIdx = 0
      const seedCount = placedPos.size
      const ringRadius = Math.max(300, Math.sqrt(seedCount) * 80)
      for (const nid of newIds) {
        if (!placedPos.has(nid)) {
          const angle = outIdx * 2.39996323
          const r = ringRadius + Math.sqrt(outIdx) * 25
          placedPos.set(nid, { x: Math.cos(angle) * r, y: Math.sin(angle) * r })
          outIdx++
        }
      }
    }

    // Ekle / güncelle
    let addedCount = 0
    const existingNodes = [...state.nodes]
    const newlyAdded = []

    for (const p of people) {
      let node = state.nodesById.get(p.id)
      if (!node) {
        const saved = savedPositions[p.id]
        const placed = placedPos.get(p.id)
        const initX = saved?.x ?? placed?.x ?? 0
        const initY = saved?.y ?? placed?.y ?? 0
        node = {
          id: p.id,
          label: p.display_name,
          username: p.username,
          imgUrl: getAvatarUrl(p),
          radius: 16,
          x: initX,
          y: initY,
          vx: 0,
          vy: 0,
          fixed: false
        }
        state.nodes.push(node)
        state.nodesById.set(p.id, node)
        addedCount++
        if (!saved) newlyAdded.push(node)
        loadImage(node.imgUrl)
      } else {
        node.label = p.display_name
        node.username = p.username
        const newUrl = getAvatarUrl(p)
        if (newUrl !== node.imgUrl) {
          node.imgUrl = newUrl
          loadImage(newUrl)
        }
      }
    }

    // Edges – ref tabanlı yeniden inşa
    state.edges = []
    for (const c of connections) {
      const s = state.nodesById.get(c.from_id)
      const t = state.nodesById.get(c.to_id)
      if (!s || !t) continue
      state.edges.push({ id: `c-${c.id}`, source: s, target: t })
    }

    sim.nodes = state.nodes
    sim.edges = state.edges
    buildNeighborMap()

    setNodeCount(state.nodes.length)

    // Yerleşim mantığı:
    // - İlk yükleme (hiç eski düğüm yok): tam fizikle yerleştir
    // - Yeni biri eklendi (eskiler var): eskileri PIN'le, yeni süzülerek yerleşsin
    // - Sadece güncellemeler: hiçbir şey yapma
    if (addedCount > 0) {
      if (existingNodes.length === 0) {
        sim.reheat(1)
      } else if (newlyAdded.length > 0) {
        for (const n of existingNodes) n.fixed = true
        sim.reheat(0.7)
        const timer = setTimeout(() => {
          for (const n of existingNodes) {
            if (!n) continue
            n.fixed = false
            n.vx = 0
            n.vy = 0
          }
          savePositions()
        }, 2500)
        return () => clearTimeout(timer)
      }
      const saveTimer = setTimeout(savePositions, 4000)
      return () => clearTimeout(saveTimer)
    }
  }, [people, connections])

  // ---------- Toolbar handlers ----------
  const handleZoomBtn = (factor) => {
    const t = transformRef.current
    const cw = stateRef.current.canvasW
    const ch = stateRef.current.canvasH
    const wx = (cw / 2 - t.x) / t.k
    const wy = (ch / 2 - t.y) / t.k
    const newK = Math.min(4, Math.max(0.15, t.k * factor))
    t.k = newK
    t.x = cw / 2 - wx * newK
    t.y = ch / 2 - wy * newK
  }

  const handleReheat = () => {
    if (!simRef.current) return
    simRef.current.reheat(0.6)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (!searchTerm) return
    const term = searchTerm.toLowerCase()
    const target = people.find(p =>
      p.id.toLowerCase() === term ||
      p.username?.toLowerCase() === term ||
      p.display_name?.toLowerCase().includes(term)
    )
    if (target) {
      focusNode(target.id)
      setSearchTerm('')
    }
  }

  const searchResults = React.useMemo(() => {
    if (!searchTerm) return []
    const term = searchTerm.toLowerCase()
    const out = []
    for (const p of people) {
      if (
        p.display_name?.toLowerCase().includes(term) ||
        p.username?.toLowerCase().includes(term) ||
        p.id.toLowerCase() === term
      ) {
        out.push({ id: p.id, label: p.display_name, sub: `@${p.username}`, img: getAvatarUrl(p) })
      }
      if (out.length >= 50) break
    }
    return out
  }, [searchTerm, people])

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] space-y-6">
      <div className="flex justify-between items-end flex-shrink-0">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">İlişki Ağı</h1>
          <p className="text-muted-foreground mt-2">Hedefler arasındaki tüm sosyal ve operational bağlantıları görselleştirin.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReheat}
            className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-xl text-xs font-bold text-primary uppercase tracking-widest hover:bg-primary/20 transition-all"
          >
            <Zap className="w-4 h-4" /> Fizik Motorunu Yenile
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative bg-secondary/5 rounded-[40px] border border-border overflow-hidden shadow-inner">
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#7c4dff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }} />

        {graphDataPending && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background/55 backdrop-blur-[2px]"
          >
            <div className="relative flex h-14 w-14 items-center justify-center">
              <span className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
              <Loader2 className="relative h-6 w-6 text-primary" aria-hidden />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">İlişki ağı yükleniyor...</p>
          </div>
        )}

        {/* Search HUD */}
        <div className="absolute top-8 left-8 z-50">
          <div className="relative group">
            <form onSubmit={handleSearch}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Hedef veya Bağlantı Ara..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64 bg-background/80 backdrop-blur-xl border border-border rounded-2xl px-4 py-3 pl-12 text-sm outline-none focus:border-primary focus:w-96 transition-all shadow-2xl"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
            </form>

            <AnimatePresence>
              {searchResults.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full left-0 right-0 mt-3 bg-background/90 backdrop-blur-2xl border border-border rounded-3xl shadow-2xl overflow-y-auto max-h-[60vh] custom-scrollbar"
                >
                  {searchResults.map(res => (
                    <button
                      key={res.id}
                      onClick={() => { focusNode(res.id); setSearchTerm('') }}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-primary/5 transition-colors border-b border-border/50 last:border-0 group/item"
                    >
                      <img src={res.img} className="w-10 h-10 rounded-full border-2 border-border group-hover/item:border-primary/50 transition-colors" alt="" />
                      <div className="text-left">
                        <div className="text-sm font-bold text-foreground">{res.label}</div>
                        <div className="text-[11px] text-muted-foreground">{res.sub}</div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Node count HUD */}
        <div className="absolute bottom-8 left-8 flex flex-col gap-2 pointer-events-none">
          <div className="px-4 py-2 bg-background/80 backdrop-blur-md border border-border rounded-xl flex items-center gap-3 shadow-2xl">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{nodeCount} Düğüm Aktif</span>
          </div>
        </div>

        {/* Zoom buttons */}
        <div className="absolute top-8 right-8 flex flex-col gap-2">
          <div className="p-2 bg-background/80 backdrop-blur-md border border-border rounded-xl shadow-2xl flex flex-col gap-1">
            <button onClick={() => handleZoomBtn(1.25)} title="Yakınlaştır" className="p-2 hover:bg-secondary rounded-lg transition-colors font-bold text-sm text-muted-foreground">+</button>
            <div className="h-px bg-border mx-1" />
            <button onClick={() => handleZoomBtn(0.8)} title="Uzaklaştır" className="p-2 hover:bg-secondary rounded-lg transition-colors font-bold text-sm text-muted-foreground">−</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Render helpers (canvas)
// ============================================================
function drawNode(ctx, node, x, y, r, alpha, isSelected, isHovered, scale, showLabel = true) {
  ctx.globalAlpha = alpha

  // Glow if selected
  if (isSelected) {
    ctx.shadowColor = '#7c4dff'
    ctx.shadowBlur = 24
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = '#09090b'
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // Avatar (clipped circle)
  const entry = node.imgUrl ? imgCache.get(node.imgUrl) : null
  if (entry && entry.loaded) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(entry.img, x - r, y - r, r * 2, r * 2)
    ctx.restore()
  } else {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = '#1f1f23'
    ctx.fill()
    if (node.label) {
      ctx.fillStyle = '#a1a1aa'
      ctx.font = `bold ${r * 0.9}px Inter, system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText((node.label[0] || '?').toUpperCase(), x, y)
    }
  }

  // Border
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.lineWidth = (isSelected ? 2 : 1) / scale
  ctx.strokeStyle = isSelected
    ? 'rgba(124, 77, 255, 1)'
    : (isHovered ? 'rgba(124, 77, 255, 0.6)' : 'rgba(63, 63, 70, 0.8)')
  ctx.stroke()

  // Label below – sadece showLabel true ise (üst üste binme önleme)
  if (showLabel && scale > 0.55 && node.label) {
    const fs = Math.max(9, 11 / Math.max(scale, 0.6))
    ctx.font = `600 ${fs}px Inter, system-ui`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const labelY = y + r + 4 / scale
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillText(node.label, x + 0.6 / scale, labelY + 0.6 / scale)
    ctx.fillStyle = isSelected ? '#fafafa' : 'rgba(228, 228, 231, 0.85)'
    ctx.fillText(node.label, x, labelY)
  }

  ctx.globalAlpha = 1
}
