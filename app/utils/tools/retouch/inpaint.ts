/**
 * 消除：PatchMatch 样本块修补（纯函数，在 Web Worker 中运行）
 *
 * 思路（Wexler 等的期望最大化填补 + Barnes 等的 PatchMatch 近邻搜索）：
 * 1. 建图像金字塔，在最小的一层先用周围颜色扩散出初始填充；
 * 2. 每一层反复做：为洞里每个像素找最相似的「完整的外部图块」（传播 + 随机搜索），
 *    再把所有覆盖该像素的图块颜色平均作为新值；
 * 3. 逐层放大，用上一层的匹配结果作为初值。
 * 不需要 AI 模型；适合草地、墙面、天空等纹理背景。
 */

export interface InpaintOptions {
  /** 图块边长（奇数） */
  patchSize?: number
  /** 每层迭代次数 */
  iterations?: number
  /** 随机种子（便于测试复现） */
  seed?: number
}

/** 确定性随机数（mulberry32） */
function random(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Level {
  width: number
  height: number
  /** 3 通道浮点颜色 */
  color: Float32Array
  /** 1 = 洞 */
  hole: Uint8Array
}

/** 缩小一半：只用已知像素求平均；2×2 中有洞就算洞（保守，保证洞完整覆盖） */
function downsample(level: Level): Level {
  const width = Math.max(1, Math.floor(level.width / 2))
  const height = Math.max(1, Math.floor(level.height / 2))
  const color = new Float32Array(width * height * 3)
  const hole = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let n = 0
      let r = 0
      let g = 0
      let b = 0
      let anyHole = 0
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(level.width - 1, x * 2 + dx)
          const sy = Math.min(level.height - 1, y * 2 + dy)
          const i = sy * level.width + sx
          if (level.hole[i]) {
            anyHole = 1
            continue
          }
          r += level.color[i * 3]!
          g += level.color[i * 3 + 1]!
          b += level.color[i * 3 + 2]!
          n++
        }
      }
      const o = y * width + x
      hole[o] = anyHole
      if (n) {
        color[o * 3] = r / n
        color[o * 3 + 1] = g / n
        color[o * 3 + 2] = b / n
      }
    }
  }
  return { width, height, color, hole }
}

/** 由外向内扩散填充洞（作为最粗一层的初值） */
function diffuseFill(level: Level): void {
  const { width, height, color, hole } = level
  const known = new Uint8Array(hole.length)
  for (let i = 0; i < hole.length; i++) known[i] = hole[i] ? 0 : 1
  let remaining = hole.reduce((s, v) => s + v, 0)
  let guard = width + height
  while (remaining > 0 && guard-- > 0) {
    const next: number[] = []
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        if (known[i]) continue
        let n = 0
        let r = 0
        let g = 0
        let b = 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const j = ny * width + nx
          if (!known[j]) continue
          r += color[j * 3]!
          g += color[j * 3 + 1]!
          b += color[j * 3 + 2]!
          n++
        }
        if (n) {
          color[i * 3] = r / n
          color[i * 3 + 1] = g / n
          color[i * 3 + 2] = b / n
          next.push(i)
        }
      }
    }
    if (!next.length) break
    for (const i of next) known[i] = 1
    remaining -= next.length
  }
}

/**
 * 修补图片中的洞。
 * rgba：区域图像；hole：与区域等大，1 表示需要填补。返回新的 RGBA（洞外像素保持不变）。
 */
export function inpaint(rgba: Uint8ClampedArray, width: number, height: number, hole: Uint8Array, options: InpaintOptions = {}): Uint8ClampedArray {
  const patchSize = options.patchSize ?? 7
  const half = (patchSize - 1) >> 1
  const iterations = options.iterations ?? 5
  const rand = random(options.seed ?? 1)

  const holeCount = hole.reduce((s, v) => s + v, 0)
  const out = rgba.slice()
  if (holeCount === 0 || holeCount === hole.length) return out

  // 金字塔：最粗一层的洞不宜太大，也不要把图缩得太小
  const base: Level = { width, height, color: new Float32Array(width * height * 3), hole: hole.slice() }
  for (let i = 0; i < width * height; i++) {
    base.color[i * 3] = rgba[i * 4]!
    base.color[i * 3 + 1] = rgba[i * 4 + 1]!
    base.color[i * 3 + 2] = rgba[i * 4 + 2]!
  }
  const pyramid: Level[] = [base]
  while (pyramid.length < 8) {
    const top = pyramid[pyramid.length - 1]!
    if (Math.min(top.width, top.height) < patchSize * 4) break
    const next = downsample(top)
    if (next.hole.every(v => v === 1)) break
    pyramid.push(next)
  }

  // 每层的近邻场：洞内像素 → 源图块中心（扁平下标）
  let nnf: Int32Array | null = null
  let prev: Level | null = null

  for (let li = pyramid.length - 1; li >= 0; li--) {
    const level = pyramid[li]!
    const { width: w, height: h, color, hole: lh } = level

    // 初值：最粗层扩散填充；其他层从上一层放大
    if (!prev) {
      diffuseFill(level)
    }
    else {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          if (!lh[i]) continue
          const j = Math.min(prev.height - 1, y >> 1) * prev.width + Math.min(prev.width - 1, x >> 1)
          color[i * 3] = prev.color[j * 3]!
          color[i * 3 + 1] = prev.color[j * 3 + 1]!
          color[i * 3 + 2] = prev.color[j * 3 + 2]!
        }
      }
    }

    // 可作为来源的图块中心：图块完全在图内且不含洞
    const holeGrown = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!lh[y * w + x]) continue
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx >= 0 && ny >= 0 && nx < w && ny < h) holeGrown[ny * w + nx] = 1
          }
        }
      }
    }
    const sources: number[] = []
    for (let y = half; y < h - half; y++) {
      for (let x = half; x < w - half; x++) if (!holeGrown[y * w + x]) sources.push(y * w + x)
    }
    // 洞太大、找不到完整图块时，放宽为任意非洞像素
    if (!sources.length) {
      for (let i = 0; i < w * h; i++) if (!lh[i]) sources.push(i)
    }
    if (!sources.length) break
    const isSource = new Uint8Array(w * h)
    for (const s of sources) isSource[s] = 1

    const targets: number[] = []
    for (let i = 0; i < w * h; i++) if (lh[i]) targets.push(i)

    // 近邻场初值
    const field = new Int32Array(w * h).fill(-1)
    for (const t of targets) {
      let s = -1
      if (nnf && prev) {
        const tx = t % w
        const ty = (t - tx) / w
        const pj = Math.min(prev.height - 1, ty >> 1) * prev.width + Math.min(prev.width - 1, tx >> 1)
        const ps = nnf[pj]!
        if (ps >= 0) {
          const psx = ps % prev.width
          const psy = (ps - psx) / prev.width
          const cand = Math.min(h - 1, psy * 2 + (ty & 1)) * w + Math.min(w - 1, psx * 2 + (tx & 1))
          if (isSource[cand]) s = cand
        }
      }
      field[t] = s >= 0 ? s : sources[Math.floor(rand() * sources.length)]!
    }

    /** 目标图块（以 t 为中心）与源图块（以 s 为中心）的差异，越界部分跳过 */
    const distance = (t: number, s: number, limit: number): number => {
      const tx = t % w
      const ty = (t - tx) / w
      const sx = s % w
      const sy = (s - sx) / w
      let d = 0
      let n = 0
      for (let dy = -half; dy <= half; dy++) {
        const ay = ty + dy
        const by = sy + dy
        if (ay < 0 || ay >= h || by < 0 || by >= h) continue
        for (let dx = -half; dx <= half; dx++) {
          const ax = tx + dx
          const bx = sx + dx
          if (ax < 0 || ax >= w || bx < 0 || bx >= w) continue
          const a = (ay * w + ax) * 3
          const b = (by * w + bx) * 3
          const dr = color[a]! - color[b]!
          const dg = color[a + 1]! - color[b + 1]!
          const db = color[a + 2]! - color[b + 2]!
          d += dr * dr + dg * dg + db * db
          n++
        }
        if (d > limit * patchSize * patchSize) return Infinity
      }
      return n ? d / n : Infinity
    }

    const cost = new Float64Array(w * h)
    const iters = li === 0 ? Math.max(2, iterations - 2) : iterations
    for (let iter = 0; iter < iters; iter++) {
      // 1. 近邻搜索
      for (const t of targets) cost[t] = distance(t, field[t]!, Infinity)
      const forward = iter % 2 === 0
      const order = forward ? targets : [...targets].reverse()
      const step = forward ? 1 : -1
      for (const t of order) {
        const tx = t % w
        const ty = (t - tx) / w
        let best = field[t]!
        let bestCost = cost[t]!
        const tryCandidate = (s: number) => {
          if (s < 0 || s >= w * h || !isSource[s] || s === best) return
          const c = distance(t, s, bestCost)
          if (c < bestCost) {
            best = s
            bestCost = c
          }
        }
        // 传播：邻居的匹配平移一格
        for (const [nx, ny] of [[tx - step, ty], [tx, ty - step]] as const) {
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const nb = ny * w + nx
          const ns = field[nb]!
          if (ns < 0) continue
          const sx = (ns % w) + (tx - nx)
          const sy = Math.floor(ns / w) + (ty - ny)
          if (sx >= 0 && sy >= 0 && sx < w && sy < h) tryCandidate(sy * w + sx)
        }
        // 随机搜索：在当前匹配附近逐步缩小范围
        let radius = Math.max(w, h)
        const bx = best % w
        const by = (best - bx) / w
        while (radius >= 1) {
          const sx = Math.round(bx + (rand() * 2 - 1) * radius)
          const sy = Math.round(by + (rand() * 2 - 1) * radius)
          if (sx >= 0 && sy >= 0 && sx < w && sy < h) tryCandidate(sy * w + sx)
          radius = Math.floor(radius / 2)
        }
        field[t] = best
        cost[t] = bestCost
      }

      // 2. 投票：洞内每个像素取所有覆盖它的图块对应颜色的平均
      const acc = new Float32Array(w * h * 3)
      const weight = new Float32Array(w * h)
      for (const t of targets) {
        const s = field[t]!
        const tx = t % w
        const ty = (t - tx) / w
        const sx = s % w
        const sy = (s - sx) / w
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const px = tx + dx
            const py = ty + dy
            const qx = sx + dx
            const qy = sy + dy
            if (px < 0 || py < 0 || px >= w || py >= h || qx < 0 || qy < 0 || qx >= w || qy >= h) continue
            const p = py * w + px
            if (!lh[p]) continue
            const q = (qy * w + qx) * 3
            acc[p * 3] = acc[p * 3]! + color[q]!
            acc[p * 3 + 1] = acc[p * 3 + 1]! + color[q + 1]!
            acc[p * 3 + 2] = acc[p * 3 + 2]! + color[q + 2]!
            weight[p] = weight[p]! + 1
          }
        }
      }
      for (const t of targets) {
        const wgt = weight[t]!
        if (!wgt) continue
        color[t * 3] = acc[t * 3]! / wgt
        color[t * 3 + 1] = acc[t * 3 + 1]! / wgt
        color[t * 3 + 2] = acc[t * 3 + 2]! / wgt
      }
    }

    nnf = field
    prev = level
  }

  // 写回：只改洞内像素
  for (let i = 0; i < width * height; i++) {
    if (!hole[i]) continue
    out[i * 4] = base.color[i * 3]!
    out[i * 4 + 1] = base.color[i * 3 + 1]!
    out[i * 4 + 2] = base.color[i * 3 + 2]!
  }
  return out
}
