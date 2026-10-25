import type { BeadColor } from '~/types'
import { BEAD_CRISP_GAP, BEAD_GAP_MIN_CELL, calcBeadLineMetrics } from './bead-canvas'

/**
 * 拼豆图纸转换（纯计算，与平台无关；取像素在文件末尾按 H5 / 小程序分别实现）。
 *
 * 流水线与各步解决的问题（均有实测数据，改动前先读本段）：
 *   1. 降采样（风格决定）：`weighted` 边缘/对比度加权 + 线稿层 + 簇内 medoid（默认）；
 *      `soft` 真均值 + 强对比混合格回落真实颜色簇（平滑自然）；`dominant` / `median` 备选。
 *      —— 纯平均会把小特征混成中间色，这就是 weightd/soft 存在的理由。
 *   2. 逐格配色：最近色号。距离用 Lab（ΔE76）。
 *   3. 降噪：BFS 清小簇 + 连通区域合并 + 近似色号合并。
 *   4. 误差扩散抖动（ditherPattern，仅 `photo` 档）：治「渐变被量化成硬边界」——
 *      只在局部有缓变的格子做 Floyd–Steinberg，色号池取本图纸自己的色号（色号数不涨）。
 *   5. 小特征回贴（detectSmallFeatures / restampFeatures）：眼睛、鼻子这类小块按面积定格数、
 *      连通生长落色 —— 逐格判定的盲区是「格边界相位差能让同样大的左右眼差一倍格数」。
 *   6. 镜像对称校正（symmetrizeFeatures）：特征互投票找轴，残缺的一侧按好侧镜像补齐。
 *
 * 关键实测结论（踩过的坑）：
 *   - 距离必须用 Lab：RGB 欧氏把纯色背景条带打散成 17~20 个色号、黑描边匹成褐色；
 *     ΔE00 与 ΔE76 数值不等价（同阈值多圈 2.7~2.9 倍色号），换算法必须同步重标阈值。
 *   - `denoiseThreshold` 传 1 等于不降噪（没有「小于 1 格」的连通块），日常用 `denoiseLevel`。
 *   - 网格边界用 gridBoundary（镜像取整）：floor 会让 52 格里 48 格的左右边界不对镜，
 *     鼻孔这类 1~2 格结构左右对不上。
 *   - 线稿是否整格落色：主判据 = 格内线稿像素**加权**占比 ≥ LINE_FORCE_SHARE；
 *     补充判据要求线**直穿本格**（一向跨满、另一向窄），斜线与拐角不触发。
 *   - 图纸宽度现为 52~200：低宽度下「描边断成点」的补救逻辑（面积补充闸门）已收紧成只救直穿线。
 *   - **线稿层不能关（目视回归的教训，比指标更可信）**：关掉它逐格 ΔE 会全面"变好"
 *     （6 张素材 × 52~200 平均 −0.3~−1.0），但那是因为深色描边被判成了误差。观感上立刻坏事：
 *     1024px 的牛图缩到 52 格时每格要覆盖 20px 源像素，4px 的描边在格内只占两成，
 *     没有线稿层就被平均成背景色 —— 描边碎成一串黑点、面部暗部（眼鼻嘴）散成花格。
 *     判据是「每格源像素 / 线宽」，不是「是不是卡通」。
 *   - **逐格 ΔE 与肉眼观感会分裂**：量化把渐变切成一圈圈硬边时逐格 ΔE 可能很好、
 *     整片看起来却是一块块。评估要看 3×3 平滑后的 ΔE（prod.ts / vis.ts 都有），
 *     并且**线连不连、形还在不在必须靠眼睛**，指标只用来排序候选。
 */

export interface RgbColor {
  r: number
  g: number
  b: number
}

export interface PaletteColor {
  code: string
  name?: string
  hex: string
  r: number
  g: number
  b: number
  /** 系列/分组（A、P、ZG、S、SP…），来自色板数据，可空 */
  series?: string | null
  /** 质感/特效：NORMAL / PEARL / NEON / THERMO / JELLY / TRANSPARENT / GLOW / UV */
  finish?: string
}

export interface ColorStat {
  colorCode: string
  count: number
  hex: string
  name: string
}

export interface ConvertResult {
  pattern: string[][]
  stats: ColorStat[]
  totalBeads: number
  /** 混合格数量（格内有两个明显颜色簇）：只由加权量化统计，UI 可据此提示「宽度调大一点」 */
  mixedCells?: number
  /** 线稿层格子数（自检线稿分层有没有生效） */
  lineCells?: number
  /** 小特征回贴改动的格子数（见 restampFeatures） */
  restampedCells?: number
  /** 镜像对称校正改动的格子数（见 symmetrizeFeatures） */
  symmetrizedCells?: number
  /** 误差扩散抖动改动的格子数（见 ditherPattern），用于自检抖动有没有生效 */
  ditheredCells?: number
  /** 轮廓还原补出的格子数（见 restoreOutline） */
  outlineCells?: number
  /** 暗点清理并入的格子数（见 cleanDarkSpots），0 = 没触发 */
  darkSpotsCleaned?: number
  /** 色号数上限并掉的色号个数（见 limitColorCount），0 = 没触发上限 */
  mergedColors?: number
}

export interface CropBox {
  x: number
  y: number
  w: number
  h: number
}

export interface ConvertOptions {
  pixels: Uint8ClampedArray
  width: number
  height: number
  palette: PaletteColor[]
  removeBg?: boolean
  /** 降噪强度 0~3（0 = 不降噪）。日常用这个；强度 2 起会啃掉 1~2 格的细描边与高光，细节多用 1 */
  denoiseLevel?: number
  /**
   * 降噪阈值的原始值：小于这个格数的同色连通块并入邻域主色。
   * ⚠️ **传 1 等于不降噪**（没有 0 格的连通块）——想弱降噪要传 2。除非精确控制，请用 denoiseLevel
   */
  denoiseThreshold?: number
  /**
   * 降噪的色差闸门（ΔE，默认 8）：小簇与邻域主色的色差超过它就当细节保留，不合并。
   * 有了它才敢把阈值调大；传 `null` = 不设闸门，纯按大小清理（会吃细节）
   */
  denoiseMaxDeltaE?: number | null
  /** 颜色距离算法，默认 `lab`（见文件顶部三种距离的实测对比） */
  algorithm?: DistanceAlgorithm
  /**
   * 逐格配色用的距离算法（不传则跟随 `algorithm`）。与 `algorithm` 分开的意义见
   * WeightedDownscaleOptions.matchAlgorithm：阈值口径按 ΔE76 标定，只换匹配判据不会失准
   */
  matchAlgorithm?: DistanceAlgorithm
  /**
   * BFS 连通区域颜色合并的色差阈值（ΔE）：只在**空间连通**范围内归并杂色，
   * 不会把画面另一头的相近色拉下水（区别于 mergeDeltaE 的全局归并）。不传 / 0 = 不合并
   */
  regionMergeDeltaE?: number
  /** 配色 + 降噪之后，把色差小于这个值的近似色号并掉（ΔE）。不传 / 0 = 不合并（见 mergeSimilarCodes） */
  mergeDeltaE?: number
  bgReplaceColor?: string
}

// ==================== 颜色距离 ====================
// 量化 = 每像素挑最近色号，距离决定观感（实测见文件头）：
//   - `euclidean`：快，但纯色背景会被打散成十几个色号、黑描边匹成褐色。只留给极端性能场景。
//   - `lab`（ΔE76）：默认。背景收敛到一个色号、描边正确落黑。
//   - `ciede2000`：公式更精细（Sharma 测试集 11 组吻合），但对高彩度/明度两端更宽容 ——
//     同数值阈值会多圈 2.7~2.9 倍色号，显式启用必须同步重标阈值（24 → 12~18、16 → 8~12、8 → 4~6），
//     所以不做默认。

interface LabColor {
  l: number
  a: number
  b: number
}

export type DistanceAlgorithm = 'euclidean' | 'lab' | 'ciede2000'

function rgbToLab(rgb: RgbColor): LabColor {
  let r = rgb.r / 255
  let g = rgb.g / 255
  let b = rgb.b / 255
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92
  const x = r * 0.4124 + g * 0.3576 + b * 0.1805
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505
  const xn = 0.95047
  const yn = 1.0
  const zn = 1.08883
  const fx = x / xn > 0.008856 ? Math.cbrt(x / xn) : 7.787 * (x / xn) + 16 / 116
  const fy = y / yn > 0.008856 ? Math.cbrt(y / yn) : 7.787 * (y / yn) + 16 / 116
  const fz = z / zn > 0.008856 ? Math.cbrt(z / zn) : 7.787 * (z / zn) + 16 / 116
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

const RAD = Math.PI / 180
const POW25_7 = 6103515625 // 25^7，CIEDE2000 的旋转项要用

/** CIEDE2000 色差（kL=kC=kH=1）：对高彩度/明度两端更宽容，同数值阈值会多圈 2.7~2.9 倍色号 */
function deltaE2000(lab1: LabColor, lab2: LabColor): number {
  const { l: l1, a: a1, b: b1 } = lab1
  const { l: l2, a: a2, b: b2 } = lab2

  const c1 = Math.sqrt(a1 * a1 + b1 * b1)
  const c2 = Math.sqrt(a2 * a2 + b2 * b2)
  const cBar = (c1 + c2) / 2

  const cBar7 = Math.pow(cBar, 7)
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW25_7)))

  const a1p = (1 + g) * a1
  const a2p = (1 + g) * a2
  const c1p = Math.sqrt(a1p * a1p + b1 * b1)
  const c2p = Math.sqrt(a2p * a2p + b2 * b2)

  const h1p = c1p === 0 ? 0 : (Math.atan2(b1, a1p) / RAD + 360) % 360
  const h2p = c2p === 0 ? 0 : (Math.atan2(b2, a2p) / RAD + 360) % 360

  const dLp = l2 - l1
  const dCp = c2p - c1p

  let dhp = 0
  if (c1p * c2p !== 0) {
    dhp = h2p - h1p
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp / 2) * RAD)

  const lBarP = (l1 + l2) / 2
  const cBarP = (c1p + c2p) / 2

  let hBarP = h1p + h2p
  if (c1p * c2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hBarP = (h1p + h2p + 360) / 2
    else hBarP = (h1p + h2p) / 2
  }

  const t =
    1 -
    0.17 * Math.cos((hBarP - 30) * RAD) +
    0.24 * Math.cos(2 * hBarP * RAD) +
    0.32 * Math.cos((3 * hBarP + 6) * RAD) -
    0.2 * Math.cos((4 * hBarP - 63) * RAD)

  const lBarP50 = (lBarP - 50) * (lBarP - 50)
  const sL = 1 + (0.015 * lBarP50) / Math.sqrt(20 + lBarP50)
  const sC = 1 + 0.045 * cBarP
  const sH = 1 + 0.015 * cBarP * t

  const dTheta = 30 * Math.exp(-Math.pow((hBarP - 275) / 25, 2))
  const cBarP7 = Math.pow(cBarP, 7)
  const rC = 2 * Math.sqrt(cBarP7 / (cBarP7 + POW25_7))
  const rT = -rC * Math.sin(2 * dTheta * RAD)

  const termL = dLp / sL
  const termC = dCp / sC
  const termH = dHp / sH
  return Math.sqrt(termL * termL + termC * termC + termH * termH + rT * termC * termH)
}

/** Lab 欧氏距离（ΔE76）：比 CIEDE2000 快得多，精度介于它与 RGB 之间 */
function labDistance(lab1: LabColor, lab2: LabColor): number {
  const dl = lab1.l - lab2.l
  const da = lab1.a - lab2.a
  const db = lab1.b - lab2.b
  return dl * dl + da * da + db * db
}

/**
 * 造「像素 → 色号」匹配器：色板 Lab 只算一次、源像素按 RGB 去重缓存（纯色背景命中率极高）、
 * 距离函数闭包外选定。一次 52×63 转换要做 ~70 万次色差计算，不做这三件事手机上直接卡住。
 */
function createColorMatcher(palette: PaletteColor[], algorithm?: DistanceAlgorithm | string) {
  const mode: DistanceAlgorithm =
    algorithm === 'euclidean' ? 'euclidean' : algorithm === 'ciede2000' ? 'ciede2000' : 'lab'
  const paletteLab = palette.map((c) => rgbToLab({ r: c.r, g: c.g, b: c.b }))
  const cache = new Map<number, string>()

  return function match(r: number, g: number, b: number): string {
    const key = (r << 16) | (g << 8) | b
    const hit = cache.get(key)
    if (hit !== undefined) return hit

    let best = 0
    let bestDist = Infinity

    if (mode === 'euclidean') {
      // 平方距离比较即可，省掉每轮的 Math.sqrt
      for (let i = 0; i < palette.length; i++) {
        const c = palette[i]
        const dr = r - c.r
        const dg = g - c.g
        const db = b - c.b
        const d = dr * dr + dg * dg + db * db
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      }
    } else {
      const lab = rgbToLab({ r, g, b })
      for (let i = 0; i < palette.length; i++) {
        const d =
          mode === 'ciede2000' ? deltaE2000(lab, paletteLab[i]) : labDistance(lab, paletteLab[i])
        if (d < bestDist) {
          bestDist = d
          best = i
        }
      }
    }

    const code = palette[best].code
    cache.set(key, code)
    return code
  }
}

export function findNearestColor(
  target: RgbColor,
  palette: PaletteColor[],
  algorithm?: DistanceAlgorithm | string
): PaletteColor | null {
  if (!palette || palette.length === 0) return null
  const match = createColorMatcher(palette, algorithm)
  const code = match(target.r, target.g, target.b)
  for (const c of palette) if (c.code === code) return c
  return null
}

// ==================== 小簇降噪 ====================
/**
 * 降噪：把「小于 threshold 格的同色连通块」并进邻域里出现最多的颜色。
 * 实测 8×20 的纯色背景条带会被微噪点打散成 58 种色号 —— 距离公式修不好（它们本来就都「最近」），
 * 只能按形态清。阈值别大：threshold 到 3 就开始啃 1~2 格的描边与高光。
 */
const DENOISE_MAX_PASSES = 4
/** 色差闸门默认值：噪点与邻域只差「量化翻色」（ΔE 2~5），真细节是描边 40+ / 高光 20+ —— 靠色差分开 */
const DEFAULT_MERGE_DELTA_E = 8
const NEIGHBOR4 = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0]
]
const NEIGHBOR8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1]
]

/**
 * 由「图案里实际用到的色号」建一张色号 → Lab 的表。
 *
 * 只为用得上的色号算 Lab（而不是整个色板），降噪每轮都要查色差，这样能省掉大半计算。
 */
function buildCodeLabMap(pattern: string[][], palette: PaletteColor[]): Map<string, LabColor> {
  const used = new Set<string>()
  for (const row of pattern) {
    for (const code of row) if (code && code !== 'TRANSPARENT') used.add(code)
  }
  const map = new Map<string, LabColor>()
  for (const c of palette) {
    if (used.has(c.code)) map.set(c.code, rgbToLab({ r: c.r, g: c.g, b: c.b }))
  }
  return map
}

function denoisePass(
  pattern: string[][],
  threshold: number,
  labMap: Map<string, LabColor>,
  /** 色差闸门（Lab 平方距离）。null 表示不设闸门，一律按大小清理 */
  maxDeltaE2: number | null
): string[][] {
  const rows = pattern.length
  const cols = pattern[0].length
  const result = pattern.map((row) => [...row])
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false))

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (visited[y][x]) continue
      const color = pattern[y][x]
      // 用数组当栈（pop）而不是队列（shift）：shift 是 O(n)，
      // 几百格的大色块反复 shift 会把整体拖慢一个量级
      const cluster: number[][] = []
      const stack: number[][] = [[y, x]]
      visited[y][x] = true

      while (stack.length > 0) {
        const [cy, cx] = stack.pop() as number[]
        cluster.push([cy, cx])
        for (const [dy, dx] of NEIGHBOR4) {
          const ny = cy + dy
          const nx = cx + dx
          if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && !visited[ny][nx] && pattern[ny][nx] === color) {
            visited[ny][nx] = true
            stack.push([ny, nx])
          }
        }
      }

      if (cluster.length >= threshold) continue
      // 完全透明的区域不动：那是「不拼珠」的空洞，被邻居填上反而是错的
      if (color === 'TRANSPARENT') continue

      for (const [cy, cx] of cluster) {
        // 八邻域投票：四邻域遇到斜向噪点会投不出结果，要多跑好几轮才收敛
        const votes = new Map<string, number>()
        for (const [dy, dx] of NEIGHBOR8) {
          const ny = cy + dy
          const nx = cx + dx
          if (ny < 0 || ny >= rows || nx < 0 || nx >= cols) continue
          const nc = pattern[ny][nx]
          if (nc === color) continue
          votes.set(nc, (votes.get(nc) || 0) + 1)
        }
        let replacement = color
        let maxCount = 0
        votes.forEach((count, c) => {
          // 平票时按色号字典序取小者：裁决只跟「邻域里有哪些色号」有关，与投票的遍历顺序无关 ——
          // 镜像两侧的邻域色号集合相同，于是必然得到同一个赢家（「先扫到的胜出」做不到这点）。
          if (count > maxCount || (count === maxCount && c < replacement)) {
            maxCount = count
            replacement = c
          }
        })
        if (replacement === color) continue

        // 色差闸门：**只有跟周围几乎同色的小簇才当噪点合并**。
        // 颜色明显不同的小格是真细节 —— 描边的一个点、眼睛高光、小装饰 —— 必须留下。
        // 不分颜色地按大小清理，正是「孤立点没了、细节也没了」的根源。
        // 查不到 Lab（色号不在色板里，只会出现在手工构造的图案上）时退回「按大小清理」，
        // 与旧行为一致，不去猜颜色。Bead Studio 侧同一处逻辑保持一致。
        if (maxDeltaE2 !== null) {
          const a = labMap.get(color)
          const b = labMap.get(replacement)
          if (a && b && labDistance(a, b) > maxDeltaE2) continue
        }
        result[cy][cx] = replacement
      }
    }
  }
  return result
}

/** 迭代降噪到稳定：被替换格周围会露出新小簇，实测 2~3 轮收敛，收敛即停 */
export function bfsDenoise(
  pattern: string[][],
  threshold: number,
  labMap: Map<string, LabColor>,
  maxDeltaE: number | null = DEFAULT_MERGE_DELTA_E
): string[][] {
  if (!pattern.length || !pattern[0].length || threshold <= 0) return pattern
  // 传 null = 不设闸门，退化成纯按大小清理（会吃掉单格细节，一般不这么用）
  // 上限 100：Lab 的 ΔE 理论上能到 375 左右，但超过 100 时「任何两个颜色都算接近」，
  // 闸门就失去意义了 —— 所以这里夹一个上界，避免误传极大值导致整图被抹平。
  const gate = maxDeltaE === null ? null : Math.max(0, Math.min(100, maxDeltaE))
  const gate2 = gate === null ? null : gate * gate
  let current = pattern.map((row) => [...row])
  for (let pass = 0; pass < DENOISE_MAX_PASSES; pass++) {
    const next = denoisePass(current, threshold, labMap, gate2)
    let changed = false
    for (let y = 0; y < next.length && !changed; y++) {
      for (let x = 0; x < next[y].length; x++) {
        if (next[y][x] !== current[y][x]) {
          changed = true
          break
        }
      }
    }
    current = next
    if (!changed) break
  }
  return current
}

/**
 * BFS 连通区域颜色合并：把「空间连通 + 颜色相近」的格子归并成区域内票数最多的色号。
 * 补上 bfsDenoise（只看大小）与 mergeSimilarCodes（只看颜色、不管空间）之间的空档 ——
 * 棋盘状杂点色差小、面积不小，只有这条规则清得掉。
 * 判相近以**区域种子色**为基准而不是上一个格子：跟邻居比会沿渐变一路吞，整片渐变被抹平。
 * TRANSPARENT 既不当成员也不穿越；区域主色平票按色号字典序取小（与扫描顺序无关，保证镜像一致）。
 */
export function mergeConnectedRegions(
  pattern: string[][],
  palette: PaletteColor[],
  maxDeltaE: number
): string[][] {
  const rows = pattern.length
  if (!rows || !pattern[0]?.length || !(maxDeltaE > 0)) return pattern
  const cols = pattern[0].length
  const labMap = buildCodeLabMap(pattern, palette)
  const limit2 = maxDeltaE * maxDeltaE
  // 色号对的「是否相近」缓存：同一对色号在整图会被反复问到，Lab 距离不必每次重算
  const similarCache = new Map<string, boolean>()
  const isSimilar = (a: string, b: string): boolean => {
    if (a === b) return true
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    const cached = similarCache.get(key)
    if (cached !== undefined) return cached
    const la = labMap.get(a)
    const lb = labMap.get(b)
    // 查不到 Lab（色号不在色板里，只会出现在手工构造的图案上）：不当相近，保持原样
    const ok = !!la && !!lb && labDistance(la, lb) <= limit2
    similarCache.set(key, ok)
    return ok
  }

  const result = pattern.map((row) => [...row])
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false))

  for (let y0 = 0; y0 < rows; y0++) {
    for (let x0 = 0; x0 < cols; x0++) {
      const seed = pattern[y0][x0]
      if (visited[y0][x0] || !seed || seed === 'TRANSPARENT') continue
      visited[y0][x0] = true
      const region: number[][] = []
      const counts = new Map<string, number>()
      // 用数组当栈（pop）：这里动辄几千格，shift 是 O(n)，会把整体拖慢一个量级
      const stack: number[][] = [[y0, x0]]

      while (stack.length > 0) {
        const [cy, cx] = stack.pop() as number[]
        region.push([cy, cx])
        const code = pattern[cy][cx]
        counts.set(code, (counts.get(code) || 0) + 1)
        for (const [dy, dx] of NEIGHBOR4) {
          const ny = cy + dy
          const nx = cx + dx
          if (ny < 0 || ny >= rows || nx < 0 || nx >= cols || visited[ny][nx]) continue
          const next = pattern[ny][nx]
          if (!next || next === 'TRANSPARENT') continue
          if (!isSimilar(next, seed)) continue
          visited[ny][nx] = true
          stack.push([ny, nx])
        }
      }

      if (counts.size === 1) continue // 整块本来就一种色号，无事可做
      // 区域主色 = 票数最多的色号（平票时按色号字典序取小者：只与区域内容有关，
      // 与连通区域的生长顺序/扫描顺序无关，镜像两侧因此合并到同一个色号）
      let keep = seed
      let keepCount = -1
      counts.forEach((n, code) => {
        if (n > keepCount || (n === keepCount && code < keep)) {
          keepCount = n
          keep = code
        }
      })
      for (const [cy, cx] of region) {
        const code = pattern[cy][cx]
        if (code === keep) continue
        // 只动「跟主色也相近」的格子：区域是绕种子长出来的，边缘格子可能已离主色超出阈值
        if (isSimilar(code, keep)) result[cy][cx] = keep
      }
    }
  }
  return result
}

// ==================== 背景检测（四角 flood-fill） ====================
/**
 * 背景移除：四角取平均色当背景色，从四个角点洪水填充，只抠「与背景色相近**且与画面边缘
 * 连通**」的那片 —— 角色身上跟背景同色的色块（白衣服）不会被误抠。
 * 遮罩由调用方处理：背景格落 TRANSPARENT，或填 bgReplaceColor 指定的色号。
 */
export function detectBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 30
): boolean[][] {
  const corners = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1]
  ]
  const cornerColors: number[][] = []
  for (const [cx, cy] of corners) {
    const idx = (cy * width + cx) * 4
    cornerColors.push([pixels[idx], pixels[idx + 1], pixels[idx + 2]])
  }
  const bgColor = [
    Math.round(cornerColors.reduce((s, c) => s + c[0], 0) / cornerColors.length),
    Math.round(cornerColors.reduce((s, c) => s + c[1], 0) / cornerColors.length),
    Math.round(cornerColors.reduce((s, c) => s + c[2], 0) / cornerColors.length)
  ]

  const background: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false))
  const visited: boolean[][] = Array.from({ length: height }, () => Array(width).fill(false))
  const queue: number[][] = []
  for (const [cx, cy] of corners) {
    queue.push([cy, cx])
    visited[cy][cx] = true
  }
  const directions = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0]
  ]

  // 用队首指针代替 `queue.shift()`：shift 是 O(n)，一张 150×150 的图案会把队列搬移上百万次
  let head = 0
  while (head < queue.length) {
    const [y, x] = queue[head++]
    background[y][x] = true
    for (const [dy, dx] of directions) {
      const ny = y + dy
      const nx = x + dx
      if (ny >= 0 && ny < height && nx >= 0 && nx < width && !visited[ny][nx]) {
        visited[ny][nx] = true
        const idx = (ny * width + nx) * 4
        const dist = Math.sqrt(
          Math.pow(pixels[idx] - bgColor[0], 2) +
            Math.pow(pixels[idx + 1] - bgColor[1], 2) +
            Math.pow(pixels[idx + 2] - bgColor[2], 2)
        )
        if (dist < threshold) queue.push([ny, nx])
      }
    }
  }
  return background
}

// ==================== 核心转换 ====================
/**
 * 格子级转换（规则按执行顺序）：逐格配色（半透明先与白底合成，见循环内注释）→
 * 降噪（按大小）→ 连通区域合并（按空间）→ 近似色号合并（按颜色）。
 * 三个清理口径互补：只按大小会留下「色差小但面积不小」的杂色；只按颜色会跨空间误并。
 */
export function convertPixelsToPattern(options: ConvertOptions): ConvertResult {
  const {
    pixels,
    width,
    height,
    palette,
    removeBg,
    denoiseLevel,
    denoiseThreshold,
    denoiseMaxDeltaE,
    algorithm,
    bgReplaceColor
  } = options

  if (!palette || palette.length === 0) {
    throw new Error('色板为空')
  }

  const bgMask = removeBg ? detectBackground(pixels, width, height, 30) : null
  // 匹配器在外面建一次：色板 Lab 与像素去重缓存都在它里面，放进双层循环会被反复重建。
  // 距离用 matchAlgorithm（不传跟随 algorithm）—— 它只决定「挑哪个色号」；
  // 下面降噪/区域合并/色号合并的 ΔE 阈值仍走各自的 ΔE76 口径
  const match = createColorMatcher(palette, options.matchAlgorithm ?? algorithm)

  const pattern: string[][] = []

  // 背景格默认落 TRANSPARENT（该格不拼珠）：既然叫「背景移除」就该是真移除，而不是换个白珠子。
  // 只有调用方显式传了 bgReplaceColor 才把背景填成某个色号（想要白底图纸时用）。
  let bgColorCode = 'TRANSPARENT'
  if (removeBg && bgReplaceColor) {
    const bgColor = palette.find((c) => c.code === bgReplaceColor)
    if (bgColor) bgColorCode = bgColor.code
  }

  for (let y = 0; y < height; y++) {
    const row: string[] = []
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const a = pixels[idx + 3]

      // 完全透明 → 该格不拼珠
      if (a < 8) {
        row.push('TRANSPARENT')
        continue
      }

      if (removeBg) {
        if (bgMask && bgMask[y][x]) {
          row.push(bgColorCode)
          continue
        }
        if (a < 128) {
          row.push(bgColorCode)
          continue
        }
      }

      // 按 alpha 与白底合成后再配色：抠图 PNG 的半透明边缘 RGB 常是被归零的黑色，
      // 直接匹配会把整张图的抠图边缘判成黑珠；白底合成还原成用户看到的观感色
      const alpha = a / 255
      const r = Math.round(pixels[idx] * alpha + 255 * (1 - alpha))
      const g = Math.round(pixels[idx + 1] * alpha + 255 * (1 - alpha))
      const b = Math.round(pixels[idx + 2] * alpha + 255 * (1 - alpha))

      row.push(match(r, g, b))
    }
    pattern.push(row)
  }

  // 有强度档就用强度档换算；注意 `=== undefined` 而不是 `??` —— 显式传 null 是想关掉闸门
  const denoise = denoiseLevel !== undefined ? denoiseThresholdOf(denoiseLevel) : denoiseThreshold || 0
  const gate = denoiseMaxDeltaE === undefined ? DEFAULT_MERGE_DELTA_E : denoiseMaxDeltaE
  let finalPattern =
    denoise > 0 ? bfsDenoise(pattern, denoise, buildCodeLabMap(pattern, palette), gate) : pattern
  if (options.regionMergeDeltaE && options.regionMergeDeltaE > 0) {
    finalPattern = mergeConnectedRegions(finalPattern, palette, options.regionMergeDeltaE)
  }
  if (options.mergeDeltaE && options.mergeDeltaE > 0) {
    finalPattern = mergeSimilarCodes(finalPattern, palette, options.mergeDeltaE)
  }

  const { stats, totalBeads } = countPatternStats(finalPattern, palette)

  return { pattern: finalPattern, stats, totalBeads }
}

/** 色号颗数统计（不含 TRANSPARENT）。转换、成品图、详情页共用同一口径，避免各算各的 */
export function countPatternStats(
  pattern: string[][],
  palette: PaletteColor[]
): { stats: ColorStat[]; totalBeads: number } {
  const counts = new Map<string, number>()
  for (const row of pattern || []) {
    for (const code of row) {
      if (!code || code === 'TRANSPARENT') continue
      counts.set(code, (counts.get(code) || 0) + 1)
    }
  }

  const colorMap = new Map((palette || []).map((c) => [c.code, c]))
  const stats: ColorStat[] = Array.from(counts.entries())
    .map(([colorCode, count]) => {
      const color = colorMap.get(colorCode)
      return {
        colorCode,
        count,
        hex: color ? color.hex : '#FFFFFF',
        name: color ? color.name || colorCode : colorCode
      }
    })
    .sort((a, b) => b.count - a.count)

  const totalBeads = stats.reduce((sum, s) => sum + s.count, 0)
  return { stats, totalBeads }
}

interface PixelData {
  data: Uint8ClampedArray
  width: number
  height: number
}

/**
 * 降采样方式：一格往往压着多种源色，怎么定「这一格是什么颜色」是它们的全部差别。
 *   - `weighted`（默认）：加权误差取最小 —— 描边/眼睛等少数派不会被多数背景吞掉。
 *   - `dominant`：像素投票取票王 —— 已被 weighted 取代，只作对照保留。
 *   - `median`：逐通道中位数 —— 格内 ≥3 色时会拼出原图没有的颜色（实测拼出品红），慎用。
 *   - `box`：真均值 + 强对比混合格回落真实颜色簇（softDownscale）—— 过渡最柔和。
 */
export type SamplingMode = 'weighted' | 'dominant' | 'median' | 'box'

/** 抖动默认强度：满强度（1.0）在平缓渐变上会有明显噪点感，0.6 是实测的观感/保真折中 */
const DITHER_STRENGTH = 0.6
/**
 * 默认梯度选通区间（ΔE76）：
 *   - 下限 6：低于它是「几乎平色」的格子（卡通色块、纯色背景，含 JPEG 的轻微噪声）。
 *     实测下限 1.5 时，卡通衣服那层 2~4 ΔE 的压缩噪声会过闸，整片平色被抖出细条纹；
 *     抬到 6 之后平色区彻底不抖，而照片的缓变渐变（普遍 6~20 ΔE）仍能全部吃到抖动
 *   - 上限 25：高于它是硬边/描边，抖它会把线糊掉
 */
const DITHER_GATE_MIN = 6
const DITHER_GATE_MAX = 25

/** 图纸风格预设（页面「图纸风格」选择器直接取这几组参数）：
 *   - flat 扁平简洁：weighted + 降噪 2 + 空间/色号合并 —— 色号最少、边界最干净（默认）
 *   - detail 细节优先：weighted + 降噪 1 —— 取色准，保留小色块
 *   - smooth 平滑自然：softDownscale + 降噪 0 —— 过渡柔和，代价是杂点不清理
 *   - photo 照片写实：softDownscale + 误差扩散抖动 —— 渐变最贴原图，色号数最高
 *
 * **线稿层（lineArt）必须开**，这是目视回归得出的结论：它按「格内线稿像素占比」整格落色，
 * 是**描边能不能连成线**的关键。曾经因为它让逐格 ΔE 变差（6 张素材全部下降 0.3~1.0）
 * 而全局关掉，结果卡通/logo 上立刻出问题：1024px 的牛图缩到 52 格时每格要覆盖 20px 源像素，
 * 4px 的描边在格内只占两成，没有线稿层就被平均成背景色 —— 描边碎成一串黑点、
 * 面部暗部（眼睛、鼻子、嘴）散成花格。而逐格 ΔE 反而"变好"只是因为深色描边被判为误差。
 * **指标看不见观感**：评估图上「线连着没有、形还在不在」必须靠眼睛。
 *
 * **匹配判据用 CIEDE2000，阈值口径用 ΔE76**（两者靠 matchAlgorithm 分开）：ΔE76 在暗部
 * 会高估色差，把深紫灰判成"离纯黑更近" —— 猴子的紫色衣服因此被描成一圈黑。换成 CIEDE2000
 * 匹配后深色保住紫调，肉眼更贴近原图。评估指标也一并改成 CIEDE2000 才能反映这一点
 * （用 ΔE76 评估时它反而"变差"，是评估本身的偏差）。四档预设统一 matchAlgorithm: 'ciede2000'。
 */
export const PATTERN_STYLES = {
  // flat：regionMergeDeltaE=4 不能省 —— 它是唯一按空间连通合并的规则，棋盘状杂点只有它清得掉；
  // 别放大到 16（那是全局合并的口径，会把渐变抹平）。mergeDeltaE=16 是甜点位
  //（18 才会把脸的米色并进白毛）。
  flat: {
    label: '扁平简洁',
    sampling: 'weighted' as SamplingMode,
    algorithm: 'lab' as DistanceAlgorithm,
    denoiseLevel: 2,
    denoiseMaxDeltaE: 24,
    regionMergeDeltaE: 4,
    mergeDeltaE: 16,
    matchAlgorithm: 'ciede2000' as DistanceAlgorithm,
    /** 色号数上限（见 limitColorCount）：卡通色块平、本色号就少，24 足够，边界最干净 */
    maxColors: 24,
    /** 斜线补充判据：卡通/动漫的斜轮廓靠它才连成线（见 WeightedDownscaleOptions.diagonalLine） */
    diagonalLine: true,
    /** 轮廓还原：低格数下把断开的黑色描边补成完整连续的线，卡通档必开 */
    outlineRestore: true,
    /** 特征回贴：卡通的眼睛/鼻子靠它保持形状 */
    featureRestamp: true
  },
  // detail：denoiseMaxDeltaE=24 的实测曲线（孤立点按与邻居的色差分桶）：
  // 闸门 24 → [≤8]=14 [8~16]=83 [16~24]=58 [>24]=201 —— 不碰 [>24]（真细节）的最干净一档；
  // 再往上（>30）开始吃掉真细节。
  detail: {
    label: '细节优先',
    sampling: 'weighted' as SamplingMode,
    algorithm: 'lab' as DistanceAlgorithm,
    denoiseLevel: 1,
    denoiseMaxDeltaE: 24,
    regionMergeDeltaE: 8,
    matchAlgorithm: 'ciede2000' as DistanceAlgorithm,
    /** 色号数上限：保留小色块，上限比 flat 松一档 */
    maxColors: 36,
    /** 斜线补充判据：卡通/动漫的斜轮廓靠它才连成线 */
    diagonalLine: true,
    /** 轮廓还原：低格数下把断开的黑色描边补成完整连续的线 */
    outlineRestore: true,
    /** 特征回贴：卡通的眼睛/鼻子靠它保持形状 */
    featureRestamp: true
  },
  // smooth：平均采样本身最贴原图，但量化会把渐变切成一圈圈硬边；抖动留给 photo 档
  smooth: {
    label: '平滑自然',
    sampling: 'box' as SamplingMode,
    algorithm: 'lab' as DistanceAlgorithm,
    denoiseLevel: 0,
    denoiseMaxDeltaE: 24,
    matchAlgorithm: 'ciede2000' as DistanceAlgorithm,
    /** 色号数上限：过渡柔和靠的是一圈圈相近色，上限最松 */
    maxColors: 48,
    /** 照片类不补斜线：没有"描边"这回事，补了只会多出杂点 */
    diagonalLine: false,
    /** 照片类不做轮廓还原 */
    outlineRestore: false,
    /** 照片类不做特征回贴：detectSmallFeatures 会把阴影暗部当「眼睛」回贴成黑点 */
    featureRestamp: false,
    /** 暗点清理：denoiseLevel=0 不清杂点，暗部会散成黑点，单独清「真黑的小簇」 */
    darkSpotCells: 2
  },
  // photo 照片写实：与 smooth 同源 + 误差扩散抖动。抖动只在「局部有缓变梯度」的格子上做
  //（梯度选通见 DITHER_GATE_MIN/MAX），色号池取本图纸自己的色号（色号数不涨）。
  // 实测（6 张素材 × 52/200）：3×3 平滑 ΔE 4.91→4.77 / 3.09→3.02，逐格 ΔE 基本持平
  photo: {
    label: '照片写实',
    sampling: 'box' as SamplingMode,
    algorithm: 'lab' as DistanceAlgorithm,
    denoiseLevel: 0,
    denoiseMaxDeltaE: 24,
    matchAlgorithm: 'ciede2000' as DistanceAlgorithm,
    dither: DITHER_STRENGTH,
    ditherGate: [DITHER_GATE_MIN, DITHER_GATE_MAX] as [number, number],
    /** 照片类不补斜线 */
    diagonalLine: false,
    /** 照片类不做轮廓还原 */
    outlineRestore: false,
    /** 照片类不做特征回贴：detectSmallFeatures 会把阴影暗部当「眼睛」回贴成黑点 */
    featureRestamp: false,
    /** 暗点清理：denoiseLevel=0 不清杂点，暗部会散成黑点，单独清「真黑的小簇」 */
    darkSpotCells: 2
  }
} as const

export type PatternStyleKey = keyof typeof PATTERN_STYLES

/**
 * 源图统计分辨率的上限（像素）。超过就先缩一档，避免手机端一次性读入几十 MB 像素数据
 * （源 RGBA + 权重图 ≈ 11 字节/像素，400 万 ≈ 44MB；1200 万会到 130MB，手机上会 OOM）。
 *
 * ⚠️ **别把它调回 120 万**。这道缩放是保真度最大的单点损失，比「最近邻还是平滑」重要得多：
 * 52 格图纸缩到 120 万后每格只剩 ~444 个源像素（采样预算 1024 的 43%），白白挨一次二次平均，
 * 细描边的 Sobel 响应被摊平 → 线稿判定反而把线判粗（线稿格数虚高）。
 * 实测（52 格，flat/detail，均ΔE / 线稿格）：
 *   1920×1920 卡通：120 万 4.92/118 → 400 万（不缩）4.45/106
 *   1634×1920 动漫：120 万 12.54/574 → 400 万（不缩）10.79/513
 *   1527×1920 动漫：120 万 11.40/391 → 400 万（不缩）10.60/282
 * 400 万已让本目录全部素材（最大 1920×1920 = 368 万）不再触发缩放；更大的图才走下面的平滑缩放。
 */
const MAX_SOURCE_PIXELS = 4000000
/** 每个目标格最多取 7x7 个样本做中位数 */
const MEDIAN_SAMPLES = 7

/**
 * 目标格在源图上的边界（左闭右开），**左右镜像恒成立**：b(dst−d) === src − b(d)。
 * floor 是左对齐切分（实测 sw=1024/dw=52 时 48 格不镜像，鼻孔左右对不上）；
 * 各自 round 又不满足 round(t)+round(src−t)=src。这里左半 round、右半由左半镜像得到。
 */
function gridBoundary(d: number, src: number, dst: number): number {
  if (d * 2 <= dst) return Math.round((d * src) / dst)
  return src - Math.round(((dst - d) * src) / dst)
}

/**
 * 「对称于格中心」的一维采样偏移表（降采样撒点用）。
 * 从左上角起步的等距格点不满足 k ↔ size−1−k 镜像 —— 镜像结构转成拼豆后左右不一致的
 * 第二个来源（第一个是网格边界，见 gridBoundary）。这里从格中心向两侧铺开，结果缓存复用。
 */
const centeredOffsetCache = new Map<string, Int32Array>()
function centeredOffsets(size: number, stride: number): Int32Array {
  const key = size + ':' + stride
  const hit = centeredOffsetCache.get(key)
  if (hit) return hit
  const out: number[] = []
  const lo = (size - 1) >> 1
  const hi = size - 1 - lo
  for (let i = 0; ; i++) {
    const a = lo - i * stride
    const b = hi + i * stride
    if (a < 0 && b >= size) break
    if (a === b) {
      if (a >= 0) out.push(a)
    } else {
      if (a >= 0) out.push(a)
      if (b < size) out.push(b)
    }
  }
  const arr = Int32Array.from(out)
  // 缓存上限：格宽种类本来就少，超过就整体丢弃重建，避免极端参数下无限增长
  if (centeredOffsetCache.size >= 512) centeredOffsetCache.clear()
  centeredOffsetCache.set(key, arr)
  return arr
}

/**
 * 中位数降采样：每格均匀撒点、逐通道取中位数。边界保持干脆、噪点被吃掉。
 * ⚠️ 局限（新代码优先用 dominant/weighted）：逐通道取值可能拼出原图没有的颜色；
 * 每格只撒 7×7 点，细描边可能整条落在采样缝隙里。
 */
/**
 * 降噪强度（0~3）→ 内部阈值换算。阈值 =「小于几格的连通块算噪点」，传 1 等于不降噪
 *（不存在这样的簇）——所以对外只暴露强度档：0 = 不降噪；1/2/3 = 清 1/1~2/1~3 格
 */
export function denoiseThresholdOf(level: number): number {
  const lv = Math.max(0, Math.min(3, Math.round(Number(level) || 0)))
  return lv === 0 ? 0 : lv + 1
}

export function medianDownscale(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): PixelData {
  const out = new Uint8ClampedArray(dw * dh * 4)
  // 每轴最多 MEDIAN_SAMPLES + 1 个采样点（见 centeredOffsets），留 2 的余量
  const cap = (MEDIAN_SAMPLES + 2) * (MEDIAN_SAMPLES + 2)
  const chR = new Array<number>(cap)
  const chG = new Array<number>(cap)
  const chB = new Array<number>(cap)
  const chA = new Array<number>(cap)

  for (let dy = 0; dy < dh; dy++) {
    const y0 = gridBoundary(dy, sh, dh)
    const y1 = Math.max(y0 + 1, gridBoundary(dy + 1, sh, dh))
    const offY = centeredOffsets(y1 - y0, Math.max(1, Math.ceil((y1 - y0) / MEDIAN_SAMPLES)))
    for (let dx = 0; dx < dw; dx++) {
      const x0 = gridBoundary(dx, sw, dw)
      const x1 = Math.max(x0 + 1, gridBoundary(dx + 1, sw, dw))
      const offX = centeredOffsets(x1 - x0, Math.max(1, Math.ceil((x1 - x0) / MEDIAN_SAMPLES)))

      // 在格子里撒点取样：格子可能覆盖几百个源像素，全取再排序太慢，7×7 左右已足够稳。
      // 撒点位置关于格中心镜像（见 centeredOffsets），镜像格采到的像素位置因此互为镜像
      let n = 0
      for (let j = 0; j < offY.length; j++) {
        const rowBase = (y0 + offY[j]) * sw
        for (let i = 0; i < offX.length; i++) {
          const p = (rowBase + x0 + offX[i]) * 4
          chR[n] = src[p]
          chG[n] = src[p + 1]
          chB[n] = src[p + 2]
          chA[n] = src[p + 3]
          n++
        }
      }

      const sorted = [
        chR.slice(0, n).sort((a, b) => a - b),
        chG.slice(0, n).sort((a, b) => a - b),
        chB.slice(0, n).sort((a, b) => a - b),
        chA.slice(0, n).sort((a, b) => a - b)
      ]
      const mid = n >> 1
      const o = (dy * dw + dx) * 4
      out[o] = sorted[0][mid]
      out[o + 1] = sorted[1][mid]
      out[o + 2] = sorted[2][mid]
      out[o + 3] = sorted[3][mid]
    }
  }
  return { data: out, width: dw, height: dh }
}

/** 主色投票的量化位数（每通道）。5 位 = 32768 个桶，够细又能用定长数组计数 */
const VOTE_BITS = 5
const VOTE_SHIFT = 8 - VOTE_BITS
const VOTE_SIZE = 1 << (VOTE_BITS * 3)
/** 每格最多参与投票的像素数，超过就等步长抽样（超大源图才不会把主线程堵死） */
const VOTE_MAX_SAMPLES = 1024
/**
 * 参与候选与点集的 top 桶数（按加权票数降序取前几名）。
 * 桶在这里只是「像素分组」用的粗格子：候选色号一律取桶的**真实代表像素色**去匹配色板
 * （见 weightedDownscale 的候选集），所以候选永远落在「格内真实存在的颜色」上。
 */
const VOTE_CAND_BUCKETS = 8
/** `dominant` 档「票数最高的 K 个桶」口径（按**像素计数**取前几名，与该档的投票定色绑定） */
const VOTE_TOP_K = 4

// ==================== 平滑档的软降采样（`box`） ====================

/** 两簇均值差（ΔE00）达到它才算强对比格：描边/鼻子对白底 60+，渐变 <20。再低照片会一格格发硬 */
const SOFT_CONTRAST_MIN = 40
/**
 * 少数派簇占比达到它、且更深/更艳时整格按少数派落色（保眼睛/鼻子的形状），
 * 代价是深色边缘外扩半格。别降到 0.2：抗锯齿边占 10%~20%，整圈边界会外涨一格
 */
const SOFT_FEATURE_SHARE = 0.3
/** 少数派算「特征色」的亮度差：比多数派暗这么多以上（眼睛、描边走这条） */
const SOFT_FEATURE_LUMA_MIN = 25
/** 少数派算「特征色」的饱和度差（max−min）：比多数派艳这么多以上（黄鼻子、红花朵走这条） */
const SOFT_FEATURE_CHROMA_MIN = 40
/** 判定「离第一簇足够远」的 RGB 欧氏距离平方：用来给第二簇找种子（48 ≈ 抗锯齿中间值到两端的距离） */
const SOFT_SPLIT_DIST2 = 48 * 48
/** 少数派占比低于这个值不当作「第二簇」（JPEG 孤点 / 噪声不值得为它改判整格） */
const SOFT_CLUSTER_MIN_SHARE = 0.05

/**
 * 平滑档降采样（`box`）：默认输出全量像素的白底合成均值（保渐变柔和）；
 * 格内聚出两簇、均值差 ≥ SOFT_CONTRAST_MIN 时均值必是混色，改落两簇之一 ——
 * 少数派占比够且更深/更艳（眼睛/鼻子/描边）落少数派，否则落大份额簇。中间灰无从产生。
 * 聚类 = top 桶种子 + 一次 Voronoi 重分；alpha 取格内平均，RGB 统一白底合成口径。
 */
export function softDownscale(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): DownscaleResult {
  const out = new Uint8ClampedArray(dw * dh * 4)
  const hist = new Uint16Array(VOTE_SIZE)
  let mixedCells = 0

  for (let dy = 0; dy < dh; dy++) {
    const y0 = gridBoundary(dy, sh, dh)
    const y1 = Math.max(y0 + 1, gridBoundary(dy + 1, sh, dh))
    for (let dx = 0; dx < dw; dx++) {
      const x0 = gridBoundary(dx, sw, dw)
      const x1 = Math.max(x0 + 1, gridBoundary(dx + 1, sw, dw))
      const o = (dy * dw + dx) * 4

      // 第 1 遍：白底合成均值 + 5bit 直方图。不撒点 —— 平滑档的卖点就是均值，均值必须是真的
      let n = 0
      let sr = 0, sg = 0, sb = 0, sa = 0
      hist.fill(0)
      for (let y = y0; y < y1; y++) {
        let p = (y * sw + x0) * 4
        for (let x = x0; x < x1; x++, p += 4) {
          const a = src[p + 3]
          if (a < 8) continue
          const f = a / 255
          const r = src[p] * f + 255 * (1 - f)
          const g = src[p + 1] * f + 255 * (1 - f)
          const b = src[p + 2] * f + 255 * (1 - f)
          sr += r; sg += g; sb += b; sa += a
          n++
          hist[((Math.round(r) >> VOTE_SHIFT) << 10) | ((Math.round(g) >> VOTE_SHIFT) << 5) | (Math.round(b) >> VOTE_SHIFT)]++
        }
      }
      if (n === 0) continue // 全透明格：保持 0,0,0,0，convertPixelsToPattern 会落 TRANSPARENT

      const put = (r: number, g: number, b: number) => {
        out[o] = Math.round(r)
        out[o + 1] = Math.round(g)
        out[o + 2] = Math.round(b)
        out[o + 3] = Math.round(sa / n)
      }

      // 占比最高的桶当第一簇种子；整格同桶（纯色）时均值就是它自己
      let top = 0
      let c1 = 0
      for (let i = 0; i < VOTE_SIZE; i++) {
        if (hist[i] > c1) { c1 = hist[i]; top = i }
      }
      if (c1 === n) {
        put(sr / n, sg / n, sb / n)
        continue
      }

      // 第 2 遍：第一簇（top 桶）的白底合成均值
      let k1 = 0
      let r1 = 0, g1 = 0, b1 = 0
      for (let y = y0; y < y1; y++) {
        let p = (y * sw + x0) * 4
        for (let x = x0; x < x1; x++, p += 4) {
          const a = src[p + 3]
          if (a < 8) continue
          const f = a / 255
          const r = src[p] * f + 255 * (1 - f)
          const g = src[p + 1] * f + 255 * (1 - f)
          const b = src[p + 2] * f + 255 * (1 - f)
          const qi = ((Math.round(r) >> VOTE_SHIFT) << 10) | ((Math.round(g) >> VOTE_SHIFT) << 5) | (Math.round(b) >> VOTE_SHIFT)
          if (qi === top) {
            r1 += r; g1 += g; b1 += b
            k1++
          }
        }
      }
      // 直方图与逐像素重算之间不会丢像素（同一张数据、同一个判定），k1 理论上恒等于 c1
      if (k1 === 0) {
        put(sr / n, sg / n, sb / n)
        continue
      }
      r1 /= k1; g1 /= k1; b1 /= k1

      // 第 3 遍：第二簇种子 = 离第一簇均值足够远的像素的均值；一个都没有说明剩下的只是
      // 紧贴第一簇的抗锯齿边缘，均值即可，不必硬拆两簇
      let k2 = 0
      let r2 = 0, g2 = 0, b2 = 0
      for (let y = y0; y < y1; y++) {
        let p = (y * sw + x0) * 4
        for (let x = x0; x < x1; x++, p += 4) {
          const a = src[p + 3]
          if (a < 8) continue
          const f = a / 255
          const r = src[p] * f + 255 * (1 - f)
          const g = src[p + 1] * f + 255 * (1 - f)
          const b = src[p + 2] * f + 255 * (1 - f)
          const dr = r - r1, dg = g - g1, db = b - b1
          if (dr * dr + dg * dg + db * db >= SOFT_SPLIT_DIST2) {
            r2 += r; g2 += g; b2 += b
            k2++
          }
        }
      }
      if (k2 < Math.max(1, Math.round(n * SOFT_CLUSTER_MIN_SHARE))) {
        put(sr / n, sg / n, sb / n)
        continue
      }
      r2 /= k2; g2 /= k2; b2 /= k2

      // 第 4 遍：一次 Voronoi 重分（每像素归到更近的簇均值），抗锯齿中间像素均摊给两簇，
      // 簇均值回到各自核心色 —— 直接拿「种子均值」定色会被边缘像素拖得发灰
      let m1 = 0
      let a1r = 0, a1g = 0, a1b = 0
      let a2r = 0, a2g = 0, a2b = 0
      for (let y = y0; y < y1; y++) {
        let p = (y * sw + x0) * 4
        for (let x = x0; x < x1; x++, p += 4) {
          const a = src[p + 3]
          if (a < 8) continue
          const f = a / 255
          const r = src[p] * f + 255 * (1 - f)
          const g = src[p + 1] * f + 255 * (1 - f)
          const b = src[p + 2] * f + 255 * (1 - f)
          const d1 = (r - r1) * (r - r1) + (g - g1) * (g - g1) + (b - b1) * (b - b1)
          const d2 = (r - r2) * (r - r2) + (g - g2) * (g - g2) + (b - b2) * (b - b2)
          if (d1 <= d2) {
            a1r += r; a1g += g; a1b += b; m1++
          } else {
            a2r += r; a2g += g; a2b += b
          }
        }
      }
      if (m1 === 0 || m1 === n) {
        put(sr / n, sg / n, sb / n)
        continue
      }
      a1r /= m1; a1g /= m1; a1b /= m1
      a2r /= n - m1; a2g /= n - m1; a2b /= n - m1

      // 判定：两簇均值差够大才说明「均值 = 混色」，否则保持均值（渐变、弱过渡原样放行）
      const contrast = deltaE2000(
        rgbToLab({ r: a1r, g: a1g, b: a1b }),
        rgbToLab({ r: a2r, g: a2g, b: a2b })
      )
      if (contrast < SOFT_CONTRAST_MIN) {
        put(sr / n, sg / n, sb / n)
        continue
      }
      mixedCells++

      // 大份额簇在前；少数派占比够且更深/更艳（小特征）→ 落少数派，否则落大份额簇
      let mjR = a1r, mjG = a1g, mjB = a1b, mnR = a2r, mnG = a2g, mnB = a2b
      let mjShare = m1 / n
      if (mjShare < 0.5) {
        mjR = a2r; mjG = a2g; mjB = a2b
        mnR = a1r; mnG = a1g; mnB = a1b
        mjShare = 1 - mjShare
      }
      const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b
      const chroma = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b)
      const keepFeature =
        1 - mjShare >= SOFT_FEATURE_SHARE &&
        (lum(mnR, mnG, mnB) <= lum(mjR, mjG, mjB) - SOFT_FEATURE_LUMA_MIN ||
          chroma(mnR, mnG, mnB) >= chroma(mjR, mjG, mjB) + SOFT_FEATURE_CHROMA_MIN)
      if (keepFeature) put(mnR, mnG, mnB)
      else put(mjR, mjG, mjB)
    }
  }
  return { data: out, width: dw, height: dh, mixedCells, lineCells: 0 }
}

// ==================== 小特征形状回贴（眼睛 / 鼻子这类小色块） ====================
//
// 逐格独立判定（不管 weighted 还是 box）有个共同盲区：格与格之间没有联合决策。
// 同样大小的左右眼落在网格的不同相位上，栅格化结果可以差出一倍格数；
// 跨多格的特征被格边界切得七零八落（散点、瘦一圈、局部消失）。
// 这里在量化之后补一个「特征层」：源分辨率上找出小而对比强的色块（眼睛、鼻子、
// 小装饰点），记录它们的形状与真实颜色，再按「该占几格就占几格、占成连通一团」
// 回贴到图纸上 —— 见 detectSmallFeatures / restampFeatures。
//
// 范围刻意收窄：
//   - 只管**实心小块**（开运算断开 1~2px 细线）。嘴线、胡须这类细线是另一类问题，
//     要按中心线矢量化处理（后续方案），混在一起会把整圈描边误当特征；
//   - 期望占格数超过 FEAT_MAX_CELLS 的大色块不碰，交给正常量化；
//   - 不做语义（不知道哪只是眼睛），左右一致性靠「期望格数由面积决定」间接逼近
//     —— 两眼面积几乎相等时回贴格数自然相等。

/** 暗色特征阈值（luma）：眼睛、深色小装饰走这条 */
const FEAT_LUMA_MAX = 100
/** 饱和小特征阈值（max−min）：白底/浅底上的黄鼻子、红点走这条 */
const FEAT_CHROMA_MIN = 90
/** 连通块面积低于它当噪声跳过（JPEG 孤点、抗锯齿碎屑） */
const FEAT_MIN_AREA = 16
/** 期望占格数超过它就不算「小特征」：大色块交给正常量化，回贴反而会跟量化打架 */
const FEAT_MAX_CELLS = 20
/** 未选中的格子里特征占比低于它、且当前色恰是特征色时，收回成格内其他颜色 */
const FEAT_RELEASE_SHARE = 0.15

/** 一个小特征在源图上的描述：质心、面积、平均色、以及它与目标格的重叠统计 */
export interface BeadFeatureCell {
  gx: number
  gy: number
  /** 格内特征像素数 */
  featN: number
  /** 格内有效像素总数（非全透明） */
  totN: number
  /** 格内**非特征**像素的白底合成均值；r < 0 表示整格都是特征像素 */
  or: number
  og: number
  ob: number
}

export interface BeadFeature {
  /** 质心（源图坐标） */
  cx: number
  cy: number
  /** 特征像素面积 */
  area: number
  /** 特征像素的白底合成均值（回贴落色用这个，而不是格均值） */
  r: number
  g: number
  b: number
  /** 包围盒（源图坐标，闭区间）：「建议宽度」用它换算特征折合几格 */
  minx: number
  miny: number
  maxx: number
  maxy: number
  /** 与目标格的重叠统计（只含有特征像素的格） */
  cells: BeadFeatureCell[]
}

/**
 * 源分辨率小特征检测。
 *
 * 流程：暗色 ∪ 饱和 → 开运算（腐蚀 1px 再膨胀 1px，断开细线）→ 连通块 →
 * 面积过滤 → 逐特征记录质心 / 均色 / 与目标格的重叠（含格内非特征均色，
 * 供回贴时「收回」误占格用）。像素一律先按 alpha 与白底合成，与配色口径一致。
 */
export function detectSmallFeatures(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): BeadFeature[] {
  const n = sw * sh
  // 暗色与饱和**分开两轮检测**：黑描边圈住黄鼻子时两者会连成一个连通块，
  // 均色一混就成了黑 + 黄的脏棕色（实测 Kitty 的鼻子被回贴成棕色）。
  // 暗色优先归类：暗红这类又暗又艳的像素归暗色轮。
  const masks = [new Uint8Array(n), new Uint8Array(n)]
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (src[p + 3] < 8) continue
    const f = src[p + 3] / 255
    const r = src[p] * f + 255 * (1 - f)
    const g = src[p + 1] * f + 255 * (1 - f)
    const b = src[p + 2] * f + 255 * (1 - f)
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    const chroma = Math.max(r, g, b) - Math.min(r, g, b)
    if (luma < FEAT_LUMA_MAX) masks[0][i] = 1
    else if (chroma >= FEAT_CHROMA_MIN) masks[1][i] = 1
  }
  const feats: BeadFeature[] = []
  const label = new Int32Array(n).fill(-1)
  const stack = new Int32Array(n)

  for (const mask of masks) {
    // 开运算：腐蚀（4 邻全 1 才留）→ 膨胀（4 邻任 1 即 1）。1~2px 的细线整条消失，
    // 实心小块（眼睛 ≥3px 厚）只是边缘缩一圈再长回来，面积几乎不变
    const eroded = new Uint8Array(n)
    for (let y = 0; y < sh; y++) {
      const row = y * sw
      for (let x = 0; x < sw; x++) {
        const i = row + x
        if (!mask[i]) continue
        if (
          x > 0 && mask[i - 1] &&
          x < sw - 1 && mask[i + 1] &&
          y > 0 && mask[i - sw] &&
          y < sh - 1 && mask[i + sw]
        ) eroded[i] = 1
      }
    }
    const opened = new Uint8Array(n)
    for (let y = 0; y < sh; y++) {
      const row = y * sw
      for (let x = 0; x < sw; x++) {
        const i = row + x
        if (eroded[i]) {
          opened[i] = 1
          continue
        }
        if (
          (x > 0 && eroded[i - 1]) ||
          (x < sw - 1 && eroded[i + 1]) ||
          (y > 0 && eroded[i - sw]) ||
          (y < sh - 1 && eroded[i + sw])
        ) opened[i] = 1
      }
    }

    // 连通块（4 邻接，BFS）：label / stack 跨两轮复用，每轮先清
    label.fill(-1)
    for (let seed = 0; seed < n; seed++) {
      if (!opened[seed] || label[seed] >= 0) continue
      const id = feats.length
      let top = 0
      stack[top++] = seed
      label[seed] = id
      let area = 0
      let sx = 0, sy = 0, sr = 0, sg = 0, sb = 0
      let minx = sw, maxx = 0, miny = sh, maxy = 0
      while (top > 0) {
        const j = stack[--top]
        const x = j % sw
        const y = (j / sw) | 0
        area++
        sx += x
        sy += y
        if (x < minx) minx = x
        if (x > maxx) maxx = x
        if (y < miny) miny = y
        if (y > maxy) maxy = y
        const p = j * 4
        const a = src[p + 3]
        if (a >= 8) {
          const f = a / 255
          sr += src[p] * f + 255 * (1 - f)
          sg += src[p + 1] * f + 255 * (1 - f)
          sb += src[p + 2] * f + 255 * (1 - f)
        }
        if (x > 0 && opened[j - 1] && label[j - 1] < 0) { label[j - 1] = id; stack[top++] = j - 1 }
        if (x < sw - 1 && opened[j + 1] && label[j + 1] < 0) { label[j + 1] = id; stack[top++] = j + 1 }
        if (y > 0 && opened[j - sw] && label[j - sw] < 0) { label[j - sw] = id; stack[top++] = j - sw }
        if (y < sh - 1 && opened[j + sw] && label[j + sw] < 0) { label[j + sw] = id; stack[top++] = j + sw }
      }
      if (area < FEAT_MIN_AREA) continue

      // 与目标格的重叠统计：候选格 = 包围盒扫过的全部格，**featN / totN / 其他色
      // 一律在同一条 rect 边界口径上重扫**。早期版本用 floor((x+0.5)*dw/sw) 给像素
      // 定格、rect 却按 floor 边界算，两套口径在格边界错位 1px，实测出现
      // featN=81 > totN=72 的怪格（占比 >100%，排序与「收回」全被带歪）
      const gx0 = Math.max(0, Math.floor((minx * dw) / sw))
      const gx1 = Math.min(dw - 1, Math.floor((maxx * dw) / sw))
      const gy0 = Math.max(0, Math.floor((miny * dh) / sh))
      const gy1 = Math.min(dh - 1, Math.floor((maxy * dh) / sh))
      const cells: BeadFeatureCell[] = []
      for (let gy = gy0; gy <= gy1; gy++) {
        const cy0 = Math.floor((gy * sh) / dh)
        const cy1 = Math.max(cy0 + 1, Math.floor(((gy + 1) * sh) / dh))
        for (let gx = gx0; gx <= gx1; gx++) {
          const cx0 = Math.floor((gx * sw) / dw)
          const cx1 = Math.max(cx0 + 1, Math.floor(((gx + 1) * sw) / dw))
          let featN = 0
          let totN = 0
          let on = 0
          let or = 0, og = 0, ob = 0
          for (let y = cy0; y < cy1 && y < sh; y++) {
            for (let x = cx0; x < cx1 && x < sw; x++) {
              const p = (y * sw + x) * 4
              if (src[p + 3] < 8) continue
              totN++
              if (label[y * sw + x] !== id) continue
              featN++
            }
          }
          // 格内非特征像素的均色单独扫（featN==0 的格不进候选）
          if (featN === 0 || totN === 0) continue
          for (let y = cy0; y < cy1 && y < sh; y++) {
            for (let x = cx0; x < cx1 && x < sw; x++) {
              const p = (y * sw + x) * 4
              if (src[p + 3] < 8) continue
              if (label[y * sw + x] === id) continue
              const f = src[p + 3] / 255
              or += src[p] * f + 255 * (1 - f)
              og += src[p + 1] * f + 255 * (1 - f)
              ob += src[p + 2] * f + 255 * (1 - f)
              on++
            }
          }
          cells.push({
            gx, gy, featN, totN,
            or: on > 0 ? or / on : -1,
            og: on > 0 ? og / on : -1,
            ob: on > 0 ? ob / on : -1
          })
        }
      }
      feats.push({
        cx: sx / area,
        cy: sy / area,
        area,
        r: sr / area,
        g: sg / area,
        b: sb / area,
        minx,
        miny,
        maxx,
        maxy,
        cells
      })
    }
  }
  return feats
}

/**
 * 小特征形状回贴：量化 + 降噪之后调用。
 *
 * 每个特征：
 *   1. 期望格数 K = round(面积 / 平均格面积)（夹在 1 ~ FEAT_MAX_CELLS）——
 *      由面积决定 K 正是「左右眼格数一致」的来源：两眼面积几乎相等，K 必然相等；
 *   2. 候选格按「特征占比 ↓、离质心 ↑」排序，从最高名次格出发做**连通生长**
 *      （每次取与已选集合 4 邻接的最好名次格），选出 K 格 —— 连通优先于凑满，
 *      宁可少占一格也不出孤立点；
 *   3. 选中格整格落特征色（特征自身的均值色去配色板，不是格均值 —— 黄鼻子
 *      不会被白底拖淡）；背景格（TRANSPARENT / bgReplaceColor）不回贴；
 *   4. 没选中的格子里，特征占比很低（< FEAT_RELEASE_SHARE）、当前色又恰是
 *      特征色、且不挨着选中格的，收回成格内其他颜色的落点 —— 清掉量化时
 *      溅出去的假特征格。不挨着选中格这条闸是给描边让路：描边穿过格子的
 *      15% 占比也足以让 weighted 按线稿落成黑，收回它会把描边打断。
 *
 * 返回改动格数。直接原地改 pattern，调用方负责事后重算 stats。
 */
/** 特征在目标网格上的「落位」：期望格数、候选格排名与连通生长的选中集（restamp / symmetrize 共用） */
interface FeaturePlacement {
  K: number
  cand: { c: BeadFeatureCell; rank: number; dist2: number }[]
  chosen: { c: BeadFeatureCell; rank: number; dist2: number }[]
  chosenKeys: Set<number>
}

/**
 * 特征落位（restampFeatures / symmetrizeFeatures 共用）：
 *   - 期望格数 K = round(面积 / 平均格面积)；**超过 FEAT_MAX_CELLS 返回 null**
 *     （大色块——整圈描边连成的大连通块、大花案——不归特征层管，交给正常量化。
 *     早期版本 clamp 到上限继续回贴，实测 Kitty 的整圈描边 1.4 万 px 被硬当成
 *     20 格特征乱改一气）；
 *   - 候选格按「特征占比 ↓、离质心 ↑」排序；
 *   - 连通生长：从最高名次格出发，每次取与已选集合 4 邻接的最好名次格 ——
 *     连通优先于凑满 K，宁可少占一格也不出孤立点。
 */
function placeFeature(
  f: BeadFeature,
  dw: number,
  dh: number,
  sw: number,
  sh: number,
  avgCell: number
): FeaturePlacement | null {
  const rawK = Math.round(f.area / avgCell)
  if (rawK > FEAT_MAX_CELLS) return null
  const K = Math.max(1, rawK)
  const cand = f.cells
    .map((c) => {
      const dx = ((c.gx + 0.5) * sw) / dw - f.cx
      const dy = ((c.gy + 0.5) * sh) / dh - f.cy
      return { c, rank: c.featN / c.totN, dist2: dx * dx + dy * dy }
    })
    .sort((a, b) => b.rank - a.rank || a.dist2 - b.dist2)
  if (cand.length === 0) return null

  const chosen: FeaturePlacement['chosen'] = [cand[0]]
  const chosenKeys = new Set<number>([cand[0].c.gy * dw + cand[0].c.gx])
  while (chosen.length < K) {
    let bestIdx = -1
    for (let i = 1; i < cand.length; i++) {
      const { c } = cand[i]
      const key = c.gy * dw + c.gx
      if (chosenKeys.has(key)) continue
      if (
        chosenKeys.has(key - 1) || chosenKeys.has(key + 1) ||
        chosenKeys.has(key - dw) || chosenKeys.has(key + dw)
      ) {
        if (bestIdx < 0) bestIdx = i
      }
    }
    if (bestIdx < 0) break
    chosen.push(cand[bestIdx])
    chosenKeys.add(cand[bestIdx].c.gy * dw + cand[bestIdx].c.gx)
  }
  return { K, cand, chosen, chosenKeys }
}

export function restampFeatures(
  pattern: string[][],
  dw: number,
  dh: number,
  features: BeadFeature[] | undefined,
  sw: number,
  sh: number,
  palette: PaletteColor[],
  algorithm?: DistanceAlgorithm | string,
  bgColorCode = 'TRANSPARENT'
): number {
  if (!features || features.length === 0 || dw <= 0 || dh <= 0 || !palette || palette.length === 0) {
    return 0
  }
  const match = createColorMatcher(palette, algorithm)
  const avgCell = (sw / dw) * (sh / dh)
  const get = (gx: number, gy: number) => {
    const row = pattern[gy]
    return row ? row[gx] : undefined
  }
  const set = (gx: number, gy: number, code: string) => {
    const row = pattern[gy]
    if (!row || gx < 0 || gx >= row.length) return false
    if (row[gx] === code) return false
    row[gx] = code
    return true
  }
  const isBg = (code: string | undefined) =>
    code === undefined || code === 'TRANSPARENT' || code === bgColorCode

  // 大特征先处理：先到先得
  const ordered = [...features].sort((a, b) => b.area - a.area)
  let changed = 0

  for (const f of ordered) {
    const pl = placeFeature(f, dw, dh, sw, sh, avgCell)
    if (!pl) continue
    const { cand, chosen, chosenKeys } = pl

    const featCode = match(f.r, f.g, f.b)
    for (const { c } of chosen) {
      if (isBg(get(c.gx, c.gy))) continue
      if (set(c.gx, c.gy, featCode)) changed++
    }
    for (const { c } of cand) {
      const key = c.gy * dw + c.gx
      if (chosenKeys.has(key)) continue
      if (c.featN / c.totN >= FEAT_RELEASE_SHARE) continue
      if (c.or < 0) continue
      if (get(c.gx, c.gy) !== featCode) continue
      if (
        chosenKeys.has(key - 1) || chosenKeys.has(key + 1) ||
        chosenKeys.has(key - dw) || chosenKeys.has(key + dw)
      ) continue
      if (set(c.gx, c.gy, match(c.or, c.og, c.ob))) changed++
    }
  }
  return changed
}

// ==================== 镜像对称校正（方案 A） ====================
//
// 「左眼正常、右眼奇怪」的根因：同样的特征落在网格的不同相位上，逐格判定的
// 结果可以差出一倍。回贴（B）让两眼格数由面积决定、天然接近，但**形状与位置**
// 仍可能不对称（连通生长停在哪、候选格排序都被相位带偏）。
// 这里补最后一步：找到竖直镜像轴，把左右特征配成对，以形状更完整的一侧为准，
// 把形状镜像到另一侧、收回多余格 —— 两眼从此严格镜像。
//
// 轴**不用整图掩码找**：实测 Kitty 的右侧有大花、掩码轴被带偏到 190（真实轴
// ≈134），配对全部失败。改为「特征互投票」：位置镜像（y 近、颜色近、大小近）
// 的特征对各投一票（轴 = 质心中点），贪心互斥后取最高票 —— 少数不对称的
// 装饰（单侧的花）投不赢成对的五官。照片的纹理碎块会分散投到各个轴上，
// 最高票占比闸门（SYM_SUPPORT_MIN）不过就整个跳过。

/** 最高票轴的支持面积占全部候选配对面积和的比例下限，不过说明轴不可信（照片碎块乱投） */
const SYM_SUPPORT_MIN = 0.5
/** 候选配对的面积比上限：眼睛(246) 配 腮红(388) 这类大小悬殊的不是同一物 */
const SYM_AREA_RATIO_MAX = 1.8
/** 参与对称校正的特征期望格数上限：对称校正服务的是小宽度下的五官点睛，
 * 大色块（粉袖 vs 粉裙这类颜色相近的大块）配成假镜像的破坏力远大于收益 ——
 * 实测 40 宽 Kitty「袖 388px ↔ 裙 616px」配成一对，把裙子形状拷到了手上 */
const FEAT_SYM_MAX_K = 6

/**
 * 镜像对称校正：量化 + 回贴之后调用。
 *
 *   1. 候选配对：y 接近（±8%，歪头图的两眼高度本就不齐）、颜色接近（同轮检测
 *      出来的左右眼 / 左右腮红颜色几乎相同）、面积比 ≤ SYM_AREA_RATIO_MAX 的
 *      特征对，按面积和降序**贪心互斥**选取（一个特征只属于一对 —— 拿嘴去配
 *      已被占用的右眼这类假配对被天然排除），每对给自己投一票：轴 = 质心中点；
 *   2. 取最高票的轴（按支持特征面积计）：支持占比 < SYM_SUPPORT_MIN 说明配对
 *      分散在各个轴上（照片纹理、无对称构图），整个 pass 跳过；
 *   3. 每对里选「更好的一侧」：连通生长选中的格数多者优先（越接近 K 越完整），
 *      平手比选中格的占比和；
 *   4. 把好侧的选中形状**逐格镜像**落到差侧（特征色用好侧自己的均色 —— 同一对
 *      特征颜色本就几乎相同）；目标格被其他特征占用或是背景格则跳过；
 *   5. 差侧没被镜像覆盖到的选中格收回成「格内其他颜色」—— 多出来的那半只眼消失。
 *
 * 返回改动格数。直接原地改 pattern，调用方负责事后重算 stats。
 */
export function symmetrizeFeatures(
  pattern: string[][],
  dw: number,
  dh: number,
  features: BeadFeature[] | undefined,
  sw: number,
  sh: number,
  palette: PaletteColor[],
  algorithm?: DistanceAlgorithm | string,
  bgColorCode = 'TRANSPARENT'
): number {
  if (
    !features || features.length < 2 ||
    dw <= 0 || dh <= 0 || !palette || palette.length === 0
  ) {
    return 0
  }
  const match = createColorMatcher(palette, algorithm)
  const avgCell = (sw / dw) * (sh / dh)
  const get = (gx: number, gy: number) => {
    const row = pattern[gy]
    return row ? row[gx] : undefined
  }
  const set = (gx: number, gy: number, code: string) => {
    const row = pattern[gy]
    if (!row || gx < 0 || gx >= row.length) return false
    if (row[gx] === code) return false
    row[gx] = code
    return true
  }
  const isBg = (code: string | undefined) =>
    code === undefined || code === 'TRANSPARENT' || code === bgColorCode

  const placements = features.map((f) => placeFeature(f, dw, dh, sw, sh, avgCell))
  // 色号 → Lab：「这格是否已落成特征色」用 Lab 距离判（见 isFeatAt）
  const code2lab = new Map(palette.map((c) => [c.code, rgbToLab({ r: c.r, g: c.g, b: c.b })]))

  // ---- 候选配对 + 贪心互斥 + 轴投票 ----
  const pairTolY = sh * 0.08
  const colorNear = (a: BeadFeature, b: BeadFeature) => {
    const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b
    return dr * dr + dg * dg + db * db < 60 * 60
  }
  const candPairs: { i: number; j: number; axis: number; area: number }[] = []
  for (let i = 0; i < features.length; i++) {
    const pi = placements[i]
    if (!pi || pi.K > FEAT_SYM_MAX_K) continue
    const f = features[i]
    for (let j = i + 1; j < features.length; j++) {
      const pj = placements[j]
      if (!pj || pj.K > FEAT_SYM_MAX_K) continue
      const g = features[j]
      if (Math.abs(f.cy - g.cy) > pairTolY) continue
      if (!colorNear(f, g)) continue
      const ratio = Math.max(f.area, g.area) / Math.min(f.area, g.area)
      if (ratio > SYM_AREA_RATIO_MAX) continue
      const axis = (f.cx + g.cx) / 2
      if (axis < sw * 0.2 || axis > sw * 0.8) continue
      candPairs.push({ i, j, axis, area: f.area + g.area })
    }
  }
  candPairs.sort((a, b) => b.area - a.area)
  const used = new Set<number>()
  const bin = Math.max(1, Math.round(sw / dw)) // 轴票箱宽 = 一格
  const votes = new Map<number, { area: number; sum: number; n: number }>()
  const accepted: { i: number; j: number; axis: number }[] = []
  for (const p of candPairs) {
    if (used.has(p.i) || used.has(p.j)) continue
    used.add(p.i)
    used.add(p.j)
    accepted.push(p)
    const b = Math.round(p.axis / bin)
    const v = votes.get(b) || { area: 0, sum: 0, n: 0 }
    v.area += p.area
    v.sum += p.axis
    v.n++
    votes.set(b, v)
  }
  if (accepted.length === 0) return 0
  let bestBin = -1
  let bestArea = 0
  let totalArea = 0
  for (const [b, v] of votes) {
    totalArea += v.area
    if (v.area > bestArea) {
      bestArea = v.area
      bestBin = b
    }
  }
  if (bestBin < 0 || bestArea / totalArea < SYM_SUPPORT_MIN) return 0
  const bv = votes.get(bestBin)!
  const axis = bv.sum / bv.n
  const axisTol = 1.5 * bin
  const pairs = accepted.filter((p) => Math.abs(p.axis - axis) <= axisTol)
  if (pairs.length === 0) return 0

  // 其他特征的选中格是「保留区」：镜像落格与收回都不许碰
  const reservedByOthers = (ai: number, bi: number) => {
    const s = new Set<number>()
    for (let k = 0; k < features.length; k++) {
      if (k === ai || k === bi) continue
      const pl = placements[k]
      if (!pl) continue
      for (const key of pl.chosenKeys) s.add(key)
    }
    return s
  }

  let changed = 0
  for (const { i: ai, j: bi } of pairs) {
    const pa = placements[ai]
    const pb = placements[bi]
    if (!pa || !pb) continue
    // 特征色按两侧均值定（同一对特征的源图颜色几乎相同），落成判定的口径放宽到
    // ΔE 25：量化/降噪可能把眼睛落成相邻的深灰号，那也算「落成了」，不算残缺
    const mr = (features[ai].r + features[bi].r) / 2
    const mg = (features[ai].g + features[bi].g) / 2
    const mb = (features[ai].b + features[bi].b) / 2
    const featCode = match(mr, mg, mb)
    const featLab = rgbToLab({ r: mr, g: mg, b: mb })
    // 「这一格在图纸上已经落成特征色」**按 pattern 实际状态判** —— chosen 集是
    // 源图统计量，与图纸无关（两眼的源图几乎一样，拿它判定永远「已对称」）
    const isFeatAt = (gx: number, gy: number) => {
      const code = get(gx, gy)
      if (!code || isBg(code)) return false
      const lab = code2lab.get(code)
      return !!lab && labDistance(lab, featLab) < 25
    }
    let filledA = 0
    for (const { c } of pa.cand) if (isFeatAt(c.gx, c.gy)) filledA++
    let filledB = 0
    for (const { c } of pb.cand) if (isFeatAt(c.gx, c.gy)) filledB++
    // 好侧 = 图纸上**实际落色更多**的一侧。不能按源图 share 选：实测抹掉右眼后
    // 源图 share 仍把右眼选成好侧（它的源图簇更「纯」），残缺判定直接失明
    const better = filledB > filledA ? pb : pa
    const worse = better === pa ? pb : pa
    const betterF = better === pa ? features[ai] : features[bi]
    const filledBetter = Math.max(filledA, filledB)
    const filledWorse = Math.min(filledA, filledB)
    // 只救「明显残缺」的一侧：差侧已落特征色的格数只比好侧少 1 格以内时不动 ——
    // 相位差异造成的形状微差去强行互拷会破坏本来合理的结果（实测 52 宽 Kitty
    // 两眼各 7 格、y 错位半格，互拷后右眼被搅成竖条）。差 1 格也补：补的格子
    // 取自源图 chosen 集，位置有源图背书，不会乱跑
    if (filledBetter - filledWorse < 1) continue

    // 好侧形状的镜像格集合；把差侧没落成特征色的格子补上
    const mirrored: { key: number; gy: number }[] = []
    for (const { c } of better.chosen) {
      const sxm = 2 * axis - ((c.gx + 0.5) * sw) / dw
      const mx = Math.min(dw - 1, Math.max(0, Math.floor((sxm * dw) / sw)))
      mirrored.push({ key: c.gy * dw + mx, gy: c.gy })
    }
    const reserved = reservedByOthers(ai, bi)
    for (const { key, gy } of mirrored) {
      const gx = key % dw
      if (isFeatAt(gx, gy)) continue
      if (reserved.has(key)) continue
      if (isBg(get(gx, gy))) continue
      if (set(gx, gy, featCode)) changed++
    }
  }
  return changed
}

// ==================== 边缘感知加权量化（`weighted`）====================
// 不先定代表色，而是对每个候选色号算「格内全部像素的加权误差」取最小 ——
// 少数但关键的像素（描边、眼睛、高光）靠权重翻盘。三类机制：
//   ① Sobel/Laplacian 权重（最高 5×）：30% 描边不会被 70% 背景吞掉；
//   ② 线稿层：深色 + 高对比 + 低饱和像素单独记账，够强就整格按线稿落色；
//   ③ 混合格只允许落到「格内真实存在的颜色」上 —— 落到簇间中间色就是那圈灰边。

/** Sobel/Laplacian 归一化与门槛：满对比直边 ≈ 1020；EDGE_MIN 挡 JPEG 纹理 */
const EDGE_NORM = 1020
const EDGE_WEIGHT = 3
const CONTRAST_WEIGHT = 1
const CONTRAST_NORM = 256
const EDGE_MIN = 90
/** 线稿像素：灰度 <64 无条件算；或 <128 且在边缘上（深色但非纯黑的线条、文字） */
const LINE_SOLID_DARK = 64
const LINE_DARK_MAX = 128
/**
 * 线稿像素的饱和度上限。线条之所以是线条在于**低饱和的暗**：红 #E53935 灰度只有 108、
 * 蓝 #2196F3 只有 126，都在 LINE_DARK_MAX 内 —— 不卡饱和度整圈彩色边界会被当描边。
 */
const LINE_CHROMA_MAX = 80
/** 格内线稿像素加权占比 ≥ 它 → 整格按线稿落色（细线穿过、线宽过半格） */
const LINE_FORCE_SHARE = 0.4
/**
 * 线稿补充闸门：lineShare 是加权口径，低宽度下会被贴边的高权重底色压低
 *（实测 33% 真描边的格 lineShare 只有 38%）→ 用**面积口径**补两条，且要求线**直穿本格**：
 * 跨度（线像素包围盒占格比例）一向 ≥0.9、另一向 ≤ LINE_SPAN_CROSS_MAX —— 斜线/拐角两向都满，不触发。
 * 实测描边留存 47.8%→77.4%（26 宽）、83.9%→91.2%（52）。
 */
const LINE_SPAN_MIN = 0.9
const LINE_SPAN_CROSS_MAX = 0.6
const LINE_AREA_STRONG = 0.35
const LINE_AREA_MIN = 0.08
/** 线稿层候选只在「深色色板」里挑（亮度上限），避免描边匹成浅色 */
const LINE_PALETTE_MAX_LUMA = 110
/**
 * 斜线补充判据的**暗度**闸门（线稿像素的平均亮度上限，面积口径）。
 *
 * 为什么必须有它：`line[]` 把「深色 + 高对比 + 低饱和」的像素都标成线稿像素，
 * 而**色块之间抗锯齿过渡带**（橙→浅黄、白→紫）也满足这个条件 —— 它们的包围盒同样两向满、
 * 面积同样小，几何上跟细线长得一模一样。只用几何判据（lineDiagShape）时会把这些过渡带
 * 判成线，实测某动漫图线稿格 +26%、色块内部冒出零散黑点（观感明显变脏）。
 * 真正的描边是「暗」的（黑/深色），过渡带不暗 —— 用平均亮度把两者分开。
 * 72 取在 LINE_SOLID_DARK(64) 与 LINE_DARK_MAX(128) 之间偏暗端：纯黑线 ≈ 0 稳过，
 * 浅色/彩色过渡带（普遍 100+）被挡下。
 */
const LINE_DIAG_LUMA_MAX = 48

// ==================== 轮廓还原（描边连续性）====================
// 低格数下（52/78/104）一格要覆盖 20~37px 源像素，3px 的卡通描边在格内只占 8~15%，
// 而且常常只是「擦过格的一角」（曲线在格内转弯、从格角进出）—— 逐格判据（面积够不够、
// 跨度满不满、中心有没有压线）无论怎么调都会漏掉这些格，轮廓就断成一串点。
// 实测：合成圆环（1024 源、3px 线）在 52 格下现有链路只落 41 格、21 个碎块；200 格时
// 每格只剩 5px、3px 线占 60%，随便就过闸，所以「200 宽才完整」。
//
// 换一个问法：不问「格内有多少线像素」，而问「这条连续的线有没有经过本格」。
// 做法是在**格网格**上做形态学（几千格，不是几千万像素，所以极快）：
//   ① 逐格统计暗像素占比 → 二值图 dark
//   ② 8 邻域开运算 → block（3+ 格宽的暗色块，如深色头发/衣服）
//   ③ 细线层 = dark && !block（把 ≤2 格宽的细线单独拎出来）
//   ④ 对细线层做 Zhang-Suen 细化 → 1 格宽骨架（2 格宽的线也收敛成 1 格，不会变粗）
//   ⑤ 骨架格落线稿色
// 实测（52 格，黑格 / 连通块 / 端点）：合成圆环 41/21/1 → 154/1/0（完整闭环）；
// pokemon 109/19/14 → 239/2/4；girl 623/49/52 → 878/3/15。
/** 描边像素判定：亮度上限（真黑描边；深棕/深橙这类「暗但有彩」的块靠下一个阈值挡） */
const OUTLINE_LUMA_MAX = 80
/** 描边像素判定：饱和度上限（max−min），排除深棕（≈68）、深红这类色块 */
const OUTLINE_CHROMA_MAX = 70
/** 格内描边像素占比达到它才算「暗格」（格网格二值化阈值，≤60 格即 52 档） */
const OUTLINE_SHARE_MIN = 0.03
/** 78 档（61~90 格）的暗格阈值：收紧一档，内部细节线不再全画 */
const OUTLINE_SHARE_MIN_MID = 0.12
/** 104 档（>90 格）的暗格阈值：更紧 */
const OUTLINE_SHARE_MIN_HIGH = 0.16

/**
 * 暗点清理：只清「真黑」的簇（亮度上限）。60 只覆盖纯黑/近黑（含很深的绿蓝），
 * 深棕、深红这类「暗但有彩」的色块不在范围内，不会被误并。
 */
const DARK_SPOT_LUMA_MAX = 60

/**
 * 轮廓还原的暗格阈值**随图纸宽度放宽**。
 *
 * 为什么：格数越多，一格覆盖的源像素越少，原本在 52 格里混成一团的**内部细节线**
 * （衣服褶皱、发丝、暗部纹理）就被分辨出来了 —— 骨架跟着变长，全画成线会显得乱。
 * 52 格时轮廓全靠这套判据（实测效果好），保持激进；78/104 收紧到只留证据更强的线。
 * 实测（78 格，补齐格数 / 连通块数）：
 *   0.03 → pokemon 219/2、girl 401/2（连得最全但内部线最多）
 *   0.12 → pokemon 167/4、girl 354/4（内部线明显减少，主要轮廓仍在）
 *   0.18 → pokemon 118/22、girl 271/22（连通性开始崩，别再往上）
 */
function outlineShareMin(dw: number): number {
  if (dw <= 60) return OUTLINE_SHARE_MIN
  if (dw <= 90) return OUTLINE_SHARE_MIN_MID
  return OUTLINE_SHARE_MIN_HIGH
}
/**
 * 混合格的统计口径（次要簇最小权重占比）。⚠️ 只喂 mixedCells 提示数，**不参与定色** ——
 * 历史上把它当定色开关时，8%~15% 的描边簇判不达阈值 → 均值落点进候选 → 灰假色成片。
 * **别再把定色规则挂回这个阈值上。**
 */
const MIXED_MIN_SHARE = 0.2
const MIXED_CLUSTER_DELTA_E = 20
const MIXED_BUCKET_MIN_SHARE = 0.06
/**
 * 候选桶额外按**像素计数**取前几名（与按权重的前几名取并集）：
 * 只按加权票数会被 4~5× 的抗锯齿过渡像素反噬，候选池全成中间调
 *（实测 206/2704 格落到与格内真实色 ΔE>20 的灰号）。
 */
const CAND_BY_COUNT = 8
const MAX_CLUSTERS = VOTE_CAND_BUCKETS + CAND_BY_COUNT
/** 过渡簇判定（剔除抗锯齿带，不当真实颜色）：两锚簇间距、离锚距离、共线性余量、面积上限 */
const BRIDGE_MIN_SPAN = 24
const BRIDGE_MIN_SIDE = 14
const BRIDGE_SLACK = 10
const BRIDGE_MAX_SHARE = 0.3
/**
 * 线稿代表色取线稿像素亮度分布的 5% 分位（暗端）：细线的最大桶常是**过渡像素**桶，
 * 取它会得到成片灰描边（实测 385 格里 47 格落灰）。5% 的残留只是孤立暗噪点，代价远小于灰边。
 */
const LINE_CORE_QUANTILE = 0.05
interface WeightMaps {
  /** 逐像素基础权重（1 + 边缘 + 对比度） */
  weight: Float32Array
  /** 逐像素线稿标记（0 / 1） */
  line: Uint8Array
  /** 逐像素灰度（已按白底合成），线稿判定与深色候选都要用 */
  luma: Uint8Array
}

/**
 * 一次性算出全图的像素权重与线稿标记（Sobel 一阶导 + Laplacian 二阶导）。
 *
 * 灰度先按**白底合成**再算：抠图导出的半透明边缘 RGB 会被归零，直接取灰度会把
 * 整圈抠图边缘误判成深色线稿（与 convertPixelsToPattern 的合成口径保持一致）。
 *
 * 边缘用 Sobel（细线两侧各出一个响应，位置比 Laplacian 准），局部对比度用 Laplacian
 * （对「细线 + 平坦背景」更敏感）。两者高度相关是有意的：满对比边缘上它们一起拉满，
 * 单像素权重到 5 倍，正好把「一格里的少数派」抬到能与背景抗衡的量级。
 */
function buildWeightMaps(src: Uint8ClampedArray, sw: number, sh: number): WeightMaps {
  const luma = new Uint8Array(sw * sh)
  // 饱和度（max−min）只在建线稿标记的这一轮用得上，不进 WeightMaps：常驻一份 sw×sh 的
  // Uint8 在大图上就是几 MB，没必要为一次判定留着
  const chroma = new Uint8Array(sw * sh)
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    const a = src[p + 3] / 255
    const r = src[p] * a + 255 * (1 - a)
    const g = src[p + 1] * a + 255 * (1 - a)
    const b = src[p + 2] * a + 255 * (1 - a)
    luma[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0
    chroma[i] = (Math.max(r, g, b) - Math.min(r, g, b)) | 0
  }

  const weight = new Float32Array(sw * sh)
  const line = new Uint8Array(sw * sh)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x
      // 最外一圈没有完整 3×3 邻域：按「非边缘」处理（权重 1），对格内多数像素没有影响
      if (x === 0 || y === 0 || x === sw - 1 || y === sh - 1) {
        weight[i] = 1
        line[i] = luma[i] < LINE_SOLID_DARK ? 1 : 0
        continue
      }
      const tl = luma[i - sw - 1]
      const tc = luma[i - sw]
      const tr = luma[i - sw + 1]
      const cl = luma[i - 1]
      const cr = luma[i + 1]
      const bl = luma[i + sw - 1]
      const bc = luma[i + sw]
      const br = luma[i + sw + 1]
      const gx = tr + 2 * cr + br - (tl + 2 * cl + bl)
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr)
      const edge = Math.sqrt(gx * gx + gy * gy)
      const lap = Math.abs(4 * luma[i] - (tc + bc + cl + cr))
      const en = Math.min(1, edge / EDGE_NORM)
      const cn = Math.min(1, lap / CONTRAST_NORM)
      weight[i] = 1 + EDGE_WEIGHT * en + CONTRAST_WEIGHT * cn
      line[i] =
        luma[i] < LINE_SOLID_DARK ||
        (luma[i] < LINE_DARK_MAX && edge >= EDGE_MIN && chroma[i] <= LINE_CHROMA_MAX)
          ? 1
          : 0
    }
  }
  return { weight, line, luma }
}

/** 加权量化的可调项（由 PATTERN_STYLES / 页面选项下发） */
export interface WeightedDownscaleOptions {
  algorithm?: DistanceAlgorithm | string
  /**
   * 只用于「挑哪个色号最像」的距离算法，不传则跟随 `algorithm`。
   * 与 `algorithm` 分开的理由：阈值（降噪闸门、区域/色号合并）是按 ΔE76 标定的，
   * 只换匹配判据不会让它们失准。CIEDE2000 在暗部与低饱和区更贴近人眼判断，
   * 能把 ΔE76 会匹成纯黑的深紫灰拉回深紫（见 PATTERN_STYLES 里各档的设置）。
   */
  matchAlgorithm?: DistanceAlgorithm | string
  /** 线稿分层：深色高对比像素优先按线稿落色（覆盖色块层）。默认开 */
  lineArt?: boolean
  /** 混合格的统计口径（0~0.5，默认 0.2）：只影响 mixedCells 提示数，不影响定色 */
  mixedMinShare?: number
  /**
   * 斜线补充判据（默认开）：线像素在格内呈对角分布时也整格落线稿色，
   * 治「45° 斜线（头发丝、斜轮廓）在量化后断成一串点」。判据与风险见 weightedDownscale 内注释
   */
  diagonalLine?: boolean
}

export interface DownscaleResult extends PixelData {
  /** 混合格数量（格内有 ≥2 个明显颜色簇）：UI 可据此提示「图纸宽度调大一点」 */
  mixedCells: number
  /** 线稿层格子数（按线稿落色、覆盖了色块层） */
  lineCells: number
  /** 源分辨率上检出的小特征（眼睛 / 鼻子这类小块），供量化后做形状回贴，见 detectSmallFeatures */
  features?: BeadFeature[]
  /** features 对应的源区域尺寸（期望格数 = 面积 / 平均格面积 用它换算），随 features 一起传 */
  featureSrcW?: number
  featureSrcH?: number
  /** 逐格描边统计（只由加权档产出），供量化后做轮廓还原，见 computeOutlineMask / restoreOutline */
  outline?: OutlineMask
}

/**
 * 边缘感知加权量化（`weighted`，默认档）：逐格先定「归哪个颜色区域」，再在该区域的
 * 真实像素集上取加权 medoid。四条规则：
 *   ① 像素权重来自 buildWeightMaps（边缘/对比度，最高 5×）；
 *   ② 占格簇 = 加权票数最大的保留簇；误差**只结在该簇自己的像素上**（簇内结算）——
 *      整格结算等价于「离整格加权均值最近」，黑白双色格必然拼出中间灰绿（实测三例全部回到正确色）；
 *   ③ 候选严格限定为「占格簇里真实存在的像素色」的落点（桶只负责分组，代表色取桶内真实像素，
 *      不是桶心）—— 没有均值/插值进场，「格内没有的颜色」无从产生；Lab/RGB 用 Σw、Σw·色、
 *      Σw·|色|² 三元组精确展开 Σwᵢ·|色ᵢ−c|²，覆盖簇内每个像素（CIEDE2000 不可分解，退化为点集结算）；
 *   ④ 线稿层（深色 + 高对比 + 低饱和）够强就整格按线稿落色，覆盖色块层。
 * 实测（1024→52 卡通牛）：簇内结算后假色 18→1、色号 13→11；2px 竖线 16/16 格保住
 *（dominant/median 全灭）；「源图里没有的灰」0 格。
 * 代价（Node，1000×1000→64×64 噪声，手机 ×2~3）：lab ≈377ms、euclidean ≈145ms、ciede2000 ≈155ms。
 * **别为了提速退回「拿桶心/桶内均值当评分点」** —— 那等于换了 loss，灰边就回来了。
 */
export function weightedDownscale(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  palette: PaletteColor[],
  options: WeightedDownscaleOptions = {}
): DownscaleResult {
  // 匹配判据可单独指定（见 matchAlgorithm 注释）；下文的 loss 也走同一个判据，
  // 否则「候选打分」与「最终取色」会用两套距离，等于自相矛盾
  const matchAlgo = options.matchAlgorithm ?? options.algorithm
  const match = createColorMatcher(palette, matchAlgo)
  const codeIndex = new Map(palette.map((c, i) => [c.code, i]))
  const useRgb = matchAlgo === 'euclidean'
  const useCiede = matchAlgo === 'ciede2000'
  // 只有 Lab 模式才需要逐像素 Lab 累积（RGB 模式用 RGB 和，CIEDE2000 用点集）
  const labMode = !useRgb && !useCiede
  const lineArt = options.lineArt !== false
  /** 斜线补充判据（见 lineDiagShape）：默认开 */
  const lineDiagonal = options.diagonalLine !== false
  const mixedMinShare = options.mixedMinShare ?? MIXED_MIN_SHARE
  const paletteLab = palette.map((c) => rgbToLab({ r: c.r, g: c.g, b: c.b }))
  const paletteLuma = palette.map((c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b)
  // 线稿色号池：亮度在色板内部相对化取下半段（浅色板整体偏亮，写死绝对阈值会挑不出色）
  const darkestLuma = Math.min(...paletteLuma)
  const lightestLuma = Math.max(...paletteLuma)
  const lineLumaMax = Math.max(LINE_PALETTE_MAX_LUMA, darkestLuma + 24)
  const darkPool = palette
    .map((_, i) => i)
    .filter((i) => paletteLuma[i] <= Math.min(lineLumaMax, (darkestLuma + lightestLuma) / 2))

  const { weight, line, luma } = buildWeightMaps(src, sw, sh)
  // 逐格重建的线稿像素亮度直方图（只用来定管线芯亮度分位，见 LINE_CORE_QUANTILE）：
  // 256 格的直方图，逐格 fill(0) 比「把线稿桶排序」便宜得多，也不会逐格产生垃圾对象
  const lineLumaHist = new Float64Array(256)

  const counts = new Int32Array(VOTE_SIZE)
  const wsum = new Float32Array(VOTE_SIZE)
  const lineW = new Float32Array(VOTE_SIZE)
  const touched: number[] = []
  // 逐桶的精确加权三元组（色分量 + 平方和）—— 定色要结算在**占格簇自己的像素集**上（见 pickClusterMedoid），
  // 而像素是逐桶累加的，所以桶上必须留着这三个分量，才能在聚簇之后按簇求和。
  // 三个分量按模式复用：Lab 存 (L,a,b)，RGB 存 (r,g,b)；CIEDE2000 走点集（见 lossCluster），用不到它们。
  const bSumC1 = new Float64Array(VOTE_SIZE)
  const bSumC2 = new Float64Array(VOTE_SIZE)
  const bSumC3 = new Float64Array(VOTE_SIZE)
  const bSumQ = new Float64Array(VOTE_SIZE)

  // —— 逐格累积量 ——
  // 「精确展开式」是所有评分的基础：W = Σwᵢ、Σwᵢ·色ᵢ、Σwᵢ·|色ᵢ|² 三个量在手，对任意候选 c 就能精确算出
  //   Σwᵢ·|色ᵢ − c|² = W·|c|² − 2·(c · Σwᵢ色ᵢ) + Σwᵢ|色ᵢ|²
  // 逐像素结算、零近似，不需要桶心也不需要均值。**统计范围分两层**：
  //   ① 整格（sumW）：只用于「线稿像素占比」（lineShare）与 mixedCells 的份额口径；
  //   ② 每个颜色簇（clusterC*，由桶上的 bSum* 聚合）：定色结算在这一层（见 pickClusterMedoid）。
  let sumW = 0
  // 线稿层的同一套量（只结在线稿像素上）
  let lineSumW = 0
  let lineSumR = 0
  let lineSumG = 0
  let lineSumB = 0
  let lineSumQRgb = 0
  let lineSumLabL = 0
  let lineSumLabA = 0
  let lineSumLabB = 0
  let lineSumQLab = 0
  // CIEDE2000 下无法精确展开，线稿层退化成「线稿权重最大桶的代表色」单点（仍是真实像素色）
  const lineRepLab = { l: 0, a: 0, b: 0 }

  // 桶的代表像素色：桶内**第一个**真实像素的颜色（真实存在的颜色，不是桶心/均值）。
  // 所有候选色号都由它匹配色板得到 —— 这是「候选严格限定为格内真实颜色」的落点保证。
  const repR = new Uint8Array(VOTE_SIZE)
  const repG = new Uint8Array(VOTE_SIZE)
  const repB = new Uint8Array(VOTE_SIZE)

  const topIdx = new Int32Array(VOTE_CAND_BUCKETS)
  const topW = new Float64Array(VOTE_CAND_BUCKETS)
  // 候选桶还按**像素计数**取前几名（见 CAND_BY_COUNT）：加权票数与计数两个口径取并集进候选池
  const topCntIdx = new Int32Array(CAND_BY_COUNT)
  const topCntVal = new Int32Array(CAND_BY_COUNT)
  /** 本格的候选桶池（两个口径的并集，≤ VOTE_CAND_BUCKETS + CAND_BY_COUNT 个） */
  const pool: number[] = []
  /** 桶 → 簇号（-1 = 不在候选池里），过渡簇剔除要用 */
  const bucketCluster = new Int8Array(VOTE_SIZE)
  // CIEDE2000 的 loss 点集：ΔE2000 分解不成「和 + 平方和」，只能退化成逐点算。点取候选池里
  // 留下的桶的**真实代表像素色**（不是桶心），外加一个长尾点（长尾里权重最大桶的代表色，
  // 权重带长尾总和），点数 ≤ MAX_CLUSTERS + 1。Lab / RGB 模式走精确展开式，用不到这个点集。
  const lossLab = Array.from({ length: MAX_CLUSTERS + 1 }, () => ({ l: 0, a: 0, b: 0 }))
  const lossWeight = new Float64Array(MAX_CLUSTERS + 1)
  /** 每个点属于哪个簇（-1 = 长尾点）：CIEDE2000 下「按簇结算」只能靠点集过滤 */
  const lossCluster = new Int8Array(MAX_CLUSTERS + 1)
  let lossPoints = 0
  // 聚簇（恒用 ΔE76 —— 判「是不是两个颜色」不必挑算法）只需要「簇的加权票数 + 像素计数 + 锚色」。
  // ⚠️ 这里**刻意不存簇的 Lab/RGB 均值**：簇均值是两色之间的中间色，一旦被当候选就会造出假色。
  // 所有候选色都来自「格内真实桶的代表像素色」（见候选集构建处）。
  const clusterW = new Float64Array(MAX_CLUSTERS)
  /** 簇的**像素计数**（面积口径）：过渡簇判定与 mixedCells 都用它，不用会被 5× 权重带偏的加权票数 */
  const clusterCnt = new Float64Array(MAX_CLUSTERS)
  // 簇自己的精确加权三元组（由桶上的 bSum* 聚合而来）：定色的第二步要结算在占格簇自己的像素集上
  const clusterC1 = new Float64Array(MAX_CLUSTERS)
  const clusterC2 = new Float64Array(MAX_CLUSTERS)
  const clusterC3 = new Float64Array(MAX_CLUSTERS)
  const clusterQ = new Float64Array(MAX_CLUSTERS)
  /** 簇锚色（簇内票数最大桶的真实代表像素色的 Lab）—— 是真实颜色，不是簇均值 */
  const clusterLabL = new Float64Array(MAX_CLUSTERS)
  const clusterLabA = new Float64Array(MAX_CLUSTERS)
  const clusterLabB = new Float64Array(MAX_CLUSTERS)
  /** 过渡簇标记（逐格 fill(1)）：0 表示这一簇是「被平均出来的中间色」，它的桶不许进候选 */
  const keepCluster = new Uint8Array(MAX_CLUSTERS)
  /**
   * 桶按像素计数降序；**平票时按键值升序**。簇锚要取「面积最大的那个桶」，先排好序就不用逐次比较。
   * 平票裁决必须只跟**内容**有关：镜像两格的桶集合相同，按键值定序后候选池顺序也完全相同，
   * 逐桶归簇（贪心）与簇锚的选取因此不再依赖「谁先被扫到」。
   */
  const byCountDesc = (a: number, b: number) => counts[b] - counts[a] || a - b
  /**
   * 簇中心按 (L, a, b) 字典序比较。只用在两处「票数完全相同」的裁决上：逐桶归簇时挑最近的簇、
   * 占格簇取加权票数最大者。中心是内容量、与扫描顺序无关，于是镜像两格会选出同一个簇。
   */
  const clusterCenterLess = (a: number, b: number): boolean => {
    if (clusterLabL[a] !== clusterLabL[b]) return clusterLabL[a] < clusterLabL[b]
    if (clusterLabA[a] !== clusterLabA[b]) return clusterLabA[a] < clusterLabA[b]
    return clusterLabB[a] < clusterLabB[b]
  }
  const cand: number[] = []
  /** 候选色号所属的簇（与 cand 平行）：定色只认「占格簇自己的候选」 */
  const candCluster: number[] = []
  const lineCache = new Map<number, number>()

  const out = new Uint8ClampedArray(dw * dh * 4)
  let mixedCells = 0
  let lineCells = 0

  /**
   * 候选色号在「颜色簇自己的像素集」上的加权误差（Lab/RGB 走精确展开式，CIEDE2000 逐点算）。
   * ⚠️ 统计范围必须是「簇」而不是「整格」：整格结算等价于「离整格加权均值最近」，
   * 黑白双色格的加权均值落在两色之间，色板里真有中间调就必然拼出灰。
   */
  const clusterLoss = (c: number, ci: number): number => {
    if (useCiede) {
      const pl = paletteLab[ci]
      let loss = 0
      for (let t = 0; t < lossPoints; t++) {
        if (lossCluster[t] !== c) continue
        const d = deltaE2000(lossLab[t], pl)
        loss += lossWeight[t] * d * d
      }
      return loss
    }
    if (useRgb) {
      const col = palette[ci]
      return (
        clusterW[c] * (col.r * col.r + col.g * col.g + col.b * col.b) -
        2 * (col.r * clusterC1[c] + col.g * clusterC2[c] + col.b * clusterC3[c]) +
        clusterQ[c]
      )
    }
    const pl = paletteLab[ci]
    return (
      clusterW[c] * (pl.l * pl.l + pl.a * pl.a + pl.b * pl.b) -
      2 * (pl.l * clusterC1[c] + pl.a * clusterC2[c] + pl.b * clusterC3[c]) +
      clusterQ[c]
    )
  }

  /** 线稿层的加权误差：与 clusterLoss 同一套精确展开式，但统计量只来自**线稿像素** */
  const lineLoss = (ci: number): number => {
    if (useCiede) {
      const d = deltaE2000(lineRepLab, paletteLab[ci])
      return lineSumW * d * d
    }
    if (useRgb) {
      const c = palette[ci]
      return (
        lineSumW * (c.r * c.r + c.g * c.g + c.b * c.b) -
        2 * (c.r * lineSumR + c.g * lineSumG + c.b * lineSumB) +
        lineSumQRgb
      )
    }
    const pl = paletteLab[ci]
    return (
      lineSumW * (pl.l * pl.l + pl.a * pl.a + pl.b * pl.b) -
      2 * (pl.l * lineSumLabL + pl.a * lineSumLabA + pl.b * lineSumLabB) +
      lineSumQLab
    )
  }

  /**
   * 定色第二步：在占格簇的候选里取该簇自己的加权 medoid。结果必然是
   * 「某个真实颜色区域最有代表性的色号」，不会滑到中间调、也不会被别的区域拉走。
   */
  const pickClusterMedoid = (owner: number, list: number[]): number => {
    let best = -1
    let bestLoss = Infinity
    let bestCode = ''
    for (let i = 0; i < list.length; i++) {
      const ci = list[i]
      const l = clusterLoss(owner, ci)
      const code = palette[ci].code
      // 平票时按色号字典序取小者：裁决只跟候选内容有关，与候选入池顺序无关 ——
      // 镜像两格的候选集合相同，于是必然选出同一个色号并复现。
      // （「同 loss 保留先入者」做不到这点：先入者取决于扫描顺序，镜像两侧并不相同。）
      if (l < bestLoss || (l === bestLoss && code < bestCode)) {
        bestLoss = l
        best = ci
        bestCode = code
      }
    }
    return best
  }

  /** 清掉上一格的桶累加（touched 只记「碰过」的桶，逐格清零比整表 fill 便宜） */
  const clearBuckets = () => {
    for (let t = 0; t < touched.length; t++) {
      const k = touched[t]
      counts[k] = 0
      wsum[k] = 0
      lineW[k] = 0
      bSumC1[k] = 0
      bSumC2[k] = 0
      bSumC3[k] = 0
      bSumQ[k] = 0
      // 簇号一并复位：下一格只有进了候选池的桶才会被重新赋簇号，
      // 留在 -1 才不会被这一格的「过渡簇剔除」误判成上一格的簇
      bucketCluster[k] = -1
    }
    touched.length = 0
  }

  for (let dy = 0; dy < dh; dy++) {
    const y0 = gridBoundary(dy, sh, dh)
    const y1 = Math.max(y0 + 1, gridBoundary(dy + 1, sh, dh))
    for (let dx = 0; dx < dw; dx++) {
      const x0 = gridBoundary(dx, sw, dw)
      const x1 = Math.max(x0 + 1, gridBoundary(dx + 1, sw, dw))
      const stride = Math.max(1, Math.ceil(Math.sqrt(((x1 - x0) * (y1 - y0)) / VOTE_MAX_SAMPLES)))
      // 采样偏移关于格中心镜像（见 centeredOffsets）：镜像格的采样位置互为镜像
      const offX = centeredOffsets(x1 - x0, stride)
      const offY = centeredOffsets(y1 - y0, stride)
      const o = (dy * dw + dx) * 4

      let samples = 0
      let opaqueW = 0
      // 不透明像素数（**全分辨率**面积口径）：线稿面积份额要用它做分母，才不会被抽样偏差带偏
      let opaquePixels = 0
      // 真正进过桶（参与 counts / 聚簇）的像素数：过渡簇的面积份额判据必须用它做分母 ——
      // 线稿像素是全分辨率进桶、其余是抽样进桶，混用会让阈值失真
      let countedPixels = 0
      // **全分辨率**的加权总量：lineShare（线稿像素加权占比）必须拿它做分母。用抽样口径的
      // sumW 当分母会把份额算高（实测深色格从 19% 涨到 35%，全是这么来的虚假触发）
      let sumWFull = 0
      // 线稿像素的**面积口径**统计：计数 + 格内包围盒（跨度与面积都用它，见 LINE_SPAN_MIN）
      let lineN = 0
      let lineMinX = 1e9
      let lineMaxX = -1e9
      let lineMinY = 1e9
      let lineMaxY = -1e9
      // 线稿像素的**面积口径**亮度总和（斜线暗度闸门用，见 LINE_DIAG_LUMA_MAX）
      let lineLumaSum = 0
      // 逐格统计量清零：外层声明只是为了让 clusterLoss / lineLoss 闭包引用（见上方三元组注释）
      sumW = 0
      clusterC1.fill(0)
      clusterC2.fill(0)
      clusterC3.fill(0)
      clusterQ.fill(0)
      lineSumW = 0
      lineSumR = 0
      lineSumG = 0
      lineSumB = 0
      lineSumQRgb = 0
      lineSumLabL = 0
      lineSumLabA = 0
      lineSumLabB = 0
      lineSumQLab = 0
      // 线稿像素亮度直方图逐格清零（线芯分位用，见 LINE_CORE_QUANTILE）
      lineLumaHist.fill(0)
      touched.length = 0
      // ---- 第 0 遍：**全分辨率**扫格子（只做廉价判定）----
      // ① 面积口径（samples / opaqueW / opaquePixels）本就该是全分辨率的；
      // ② 更要紧的是**线稿像素必须全分辨率统计**：格子像素超过 VOTE_MAX_SAMPLES 时下面会退化
      //    成 stride 抽样，而 centeredOffsets 的偏移**同奇偶** —— 落在偶数行/列的 1px 描边在
      //    抽样里可能一个像素都取不到，整条线在统计中压根不存在，线稿层无从触发
      //   （29 宽 + 1024 源图：每格 1225px → stride 2，这就是 29 档描边留存只有 60~67% 的
      //    物理原因，之前被误判成「闸门太严」而去放宽闸门，结果把暗部连成一片）。
      // 代价可控：判定只读 line[]，昂贵的 Lab/分桶只在真正的线稿像素上做（线稿在格内占少数）。
      for (let y = y0; y < y1; y++) {
        const rowBase = y * sw
        for (let x = x0; x < x1; x++) {
          const p = (rowBase + x) * 4
          const wi = rowBase + x
          samples++
          if (src[p + 3] < 8) continue
          const w = weight[wi]
          opaqueW += w
          opaquePixels++
          sumWFull += w
          if (!lineArt || !line[wi]) continue
          // —— 线稿像素：与 convertPixelsToPattern 口径一致，半透明按白底合成后再量化 ——
          const a = src[p + 3] / 255
          const r = src[p] * a + 255 * (1 - a)
          const g = src[p + 1] * a + 255 * (1 - a)
          const b = src[p + 2] * a + 255 * (1 - a)
          // 每像素转一次 Lab，之后对任意候选都能一次乘加精确算出该像素的误差（见 clusterLoss）
          let labL = 0
          let labA = 0
          let labB = 0
          if (labMode) {
            const lab = rgbToLab({ r, g, b })
            labL = lab.l
            labA = lab.a
            labB = lab.b
          }
          const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
          // 只**登记**桶的代表色（线稿层挑代表色要用），不往 counts / wsum 里加：
          // 线稿像素若参与投票，3~5× 的权重会把整格拉黑（实测深色格从 19% 涨到 35%），
          // 那是「膨胀」不是「保线」。统计（lineW / 线稿累加量）仍然全量记。
          if (counts[key] === 0 && lineW[key] === 0) {
            touched.push(key)
            repR[key] = r
            repG[key] = g
            repB[key] = b
          } else if (
            // 代表色必须「内容确定」：取桶内字典序 (r,g,b) 最小的真实像素 ——
            // 「第一个扫到的」在镜像两格里会挑到不同像素，输出就差一个色号
            r < repR[key] ||
            (r === repR[key] && g < repG[key]) ||
            (r === repR[key] && g === repG[key] && b < repB[key])
          ) {
            repR[key] = r
            repG[key] = g
            repB[key] = b
          }
          lineLumaSum += luma[wi]
          lineN++
          if (x < lineMinX) lineMinX = x
          if (x > lineMaxX) lineMaxX = x
          if (y < lineMinY) lineMinY = y
          if (y > lineMaxY) lineMaxY = y
          lineW[key] += w
          lineLumaHist[luma[wi]] += w
          lineSumW += w
          lineSumR += w * r
          lineSumG += w * g
          lineSumB += w * b
          lineSumQRgb += w * (r * r + g * g + b * b)
          if (labMode) {
            lineSumLabL += w * labL
            lineSumLabA += w * labA
            lineSumLabB += w * labB
            lineSumQLab += w * (labL * labL + labA * labA + labB * labB)
          }
        }
      }

      // ---- 第 1 遍：非线稿像素走 stride 抽样（昂贵项只在抽样点上做）----
      // 线稿像素上面已全量处理，这里跳过以免重复计数
      for (let yi = 0; yi < offY.length; yi++) {
        const y = y0 + offY[yi]
        const rowBase = y * sw
        for (let xi = 0; xi < offX.length; xi++) {
          const x = x0 + offX[xi]
          const wi = rowBase + x
          if (lineArt && line[wi]) continue
          const p = (rowBase + x) * 4
          if (src[p + 3] < 8) continue
          const a = src[p + 3] / 255
          // 与 convertPixelsToPattern 口径一致：半透明按白底合成后再量化
          const r = src[p] * a + 255 * (1 - a)
          const g = src[p + 1] * a + 255 * (1 - a)
          const b = src[p + 2] * a + 255 * (1 - a)
          const w = weight[wi]
          // —— 整格加权量：只用于 lineShare 与 mixedCells 的份额口径 ——
          sumW += w
          // 每像素转一次 Lab，之后对任意候选都能一次乘加精确算出该像素的误差（见 clusterLoss）
          let labL = 0
          let labA = 0
          let labB = 0
          if (labMode) {
            const lab = rgbToLab({ r, g, b })
            labL = lab.l
            labA = lab.a
            labB = lab.b
          }
          const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
          // 同一个桶可能已被上面的线稿遍登记过（lineW>0），此时不再重复 push 到 touched
          if (counts[key] === 0 && lineW[key] === 0) {
            touched.push(key)
            repR[key] = r
            repG[key] = g
            repB[key] = b
          } else if (
            // 代表色必须「内容确定」：取桶内字典序 (r,g,b) 最小的真实像素 ——
            // 「第一个扫到的」在镜像两格里会挑到不同像素，输出就差一个色号
            r < repR[key] ||
            (r === repR[key] && g < repG[key]) ||
            (r === repR[key] && g === repG[key] && b < repB[key])
          ) {
            repR[key] = r
            repG[key] = g
            repB[key] = b
          }
          counts[key]++
          countedPixels++
          wsum[key] += w
          // 桶上的精确三元组（Lab 存 L/a/b，RGB 存 r/g/b）：聚簇之后按簇求和，定色就结算在簇上
          if (labMode) {
            bSumC1[key] += w * labL
            bSumC2[key] += w * labA
            bSumC3[key] += w * labB
            bSumQ[key] += w * (labL * labL + labA * labA + labB * labB)
          } else if (!useCiede) {
            bSumC1[key] += w * r
            bSumC2[key] += w * g
            bSumC3[key] += w * b
            bSumQ[key] += w * (r * r + g * g + b * b)
          }
        }
      }

      // 透明判定与 dominant 同口径，只把「计数」换成「加权计数」：贴边的半透明像素权重低，
      // 不容易把格子整体拉成不透明
      if (sumWFull <= 0 || opaqueW * 2 < samples) {
        out[o + 3] = 0
        clearBuckets()
        continue
      }

      // ---- 候选桶池：按加权票数、按像素计数各取前几名取并集（缺一不可）----
      // 只按加权票数会被 4~5× 的抗锯齿过渡像素挤掉底色桶，候选只剩中间调灰（见 CAND_BY_COUNT 实测）；
      // 参与候选的颜色一律取桶的**真实代表像素色**，不取桶心/均值
      topW.fill(0)
      topIdx.fill(-1)
      topCntVal.fill(0)
      topCntIdx.fill(-1)
      for (let t = 0; t < touched.length; t++) {
        const key = touched[t]
        // ① 按加权票数，**平票取桶键小者**（同票时谁的键小谁在前）。
        // 平票裁决只看内容：镜像两格的桶集合相同 ⇒ 取到的前几名和名次都相同，
        // 「先扫到的桶胜出」做不到这点（扫描顺序在镜像位置上是不同的）。
        // 快速拒绝：绝大多数桶连第一个比较都过不了，插排才不会退化成 O(桶数×K)
        const w = wsum[key]
        if (
          w > topW[VOTE_CAND_BUCKETS - 1] ||
          (w === topW[VOTE_CAND_BUCKETS - 1] && key < topIdx[VOTE_CAND_BUCKETS - 1])
        ) {
          let k = VOTE_CAND_BUCKETS - 1
          while (k > 0 && (topW[k - 1] < w || (topW[k - 1] === w && topIdx[k - 1] > key))) {
            topW[k] = topW[k - 1]
            topIdx[k] = topIdx[k - 1]
            k--
          }
          topW[k] = w
          topIdx[k] = key
        }
        // ② 按像素计数（面积口径），同样平票取桶键小者
        const n = counts[key]
        if (
          n > topCntVal[CAND_BY_COUNT - 1] ||
          (n === topCntVal[CAND_BY_COUNT - 1] && key < topCntIdx[CAND_BY_COUNT - 1])
        ) {
          let k = CAND_BY_COUNT - 1
          while (k > 0 && (topCntVal[k - 1] < n || (topCntVal[k - 1] === n && topCntIdx[k - 1] > key))) {
            topCntVal[k] = topCntVal[k - 1]
            topCntIdx[k] = topCntIdx[k - 1]
            k--
          }
          topCntVal[k] = n
          topCntIdx[k] = key
        }
      }
      let topCount = 0
      for (let k = 0; k < VOTE_CAND_BUCKETS; k++) {
        if (topIdx[k] < 0) break
        topCount++
      }
      // 两个口径的并集就是候选桶池；按像素计数降序，于是聚簇时第一个桶就是「面积最大的颜色」，
      // 它天然成为簇锚（锚必须是真实颜色，不能是簇均值 —— 见 MIXED_MIN_SHARE 的历史教训）。
      pool.length = 0
      for (let k = 0; k < topCount; k++) pool.push(topIdx[k])
      for (let k = 0; k < CAND_BY_COUNT; k++) {
        const key = topCntIdx[k]
        if (key < 0) break
        if (!pool.includes(key)) pool.push(key)
      }
      pool.sort(byCountDesc)

      // ---- 逐桶归簇（ΔE76）：既产出 mixedCells 提示数，也用来剔掉「过渡簇」 ----
      // 簇计数器逐格清零（簇号本身只作用于本格；漏掉清零会让上一格的面积累加进来，
      // 「过渡簇」的面积份额判据直接失效 —— 一格也剔不掉）
      clusterW.fill(0)
      clusterCnt.fill(0)
      let clusterCount = 0
      for (let k = 0; k < pool.length; k++) {
        const key = pool[k]
        const lab = rgbToLab({ r: repR[key], g: repG[key], b: repB[key] })
        let best = -1
        let bestD = MIXED_CLUSTER_DELTA_E * MIXED_CLUSTER_DELTA_E
        for (let c = 0; c < clusterCount; c++) {
          const dl = lab.l - clusterLabL[c]
          const da = lab.a - clusterLabA[c]
          const db = lab.b - clusterLabB[c]
          const d = dl * dl + da * da + db * db
          // 同样近（平票）时按簇中心字典序取小者：裁决只跟内容有关，与簇的建立顺序无关
          if (d < bestD || (d === bestD && best >= 0 && clusterCenterLess(c, best))) {
            bestD = d
            best = c
          }
        }
        if (best < 0) {
          best = clusterCount++
          clusterLabL[best] = lab.l
          clusterLabA[best] = lab.a
          clusterLabB[best] = lab.b
        }
        bucketCluster[key] = best
        clusterW[best] += wsum[key]
        clusterCnt[best] += counts[key]
        // 把桶上的精确三元组聚合到簇上：定色的评分就结算在这些量上（见 clusterLoss）
        clusterC1[best] += bSumC1[key]
        clusterC2[best] += bSumC2[key]
        clusterC3[best] += bSumC3[key]
        clusterQ[best] += bSumQ[key]
      }

      // ---- 过渡簇剔除：中间色不许进候选 ----
      // 抗锯齿过渡带聚出的「第三个簇」落在两真实色簇的连线上，加权 loss 的最小值天然偏向
      // 加权均值 → 中间簇必胜 → 整格变灰。四条几何判据同时满足才剔（任一不满足就是真颜色）：
      // 面积份额小、不超过两锚、离两锚都够远（同色另一档不算）、锚色在两锚连线上
      keepCluster.fill(1)
      if (clusterCount >= 3) {
        for (let c = 0; c < clusterCount; c++) {
          if (clusterCnt[c] > countedPixels * BRIDGE_MAX_SHARE) continue
          let drop = false
          for (let a = 0; a < clusterCount && !drop; a++) {
            if (a === c) continue
            for (let b = a + 1; b < clusterCount; b++) {
              if (b === c) continue
              if (clusterCnt[c] > clusterCnt[a] && clusterCnt[c] > clusterCnt[b]) continue
              const dlAB = clusterLabL[a] - clusterLabL[b]
              const daAB = clusterLabA[a] - clusterLabA[b]
              const dbAB = clusterLabB[a] - clusterLabB[b]
              const dAB = Math.sqrt(dlAB * dlAB + daAB * daAB + dbAB * dbAB)
              if (dAB < BRIDGE_MIN_SPAN) continue
              const dlAC = clusterLabL[a] - clusterLabL[c]
              const daAC = clusterLabA[a] - clusterLabA[c]
              const dbAC = clusterLabB[a] - clusterLabB[c]
              const dAC = Math.sqrt(dlAC * dlAC + daAC * daAC + dbAC * dbAC)
              if (dAC < BRIDGE_MIN_SIDE) continue
              const dlCB = clusterLabL[c] - clusterLabL[b]
              const daCB = clusterLabA[c] - clusterLabA[b]
              const dbCB = clusterLabB[c] - clusterLabB[b]
              const dCB = Math.sqrt(dlCB * dlCB + daCB * daCB + dbCB * dbCB)
              if (dCB < BRIDGE_MIN_SIDE) continue
              if (dAC + dCB > dAB + BRIDGE_SLACK) continue
              drop = true
              break
            }
          }
          if (drop) keepCluster[c] = 0
        }
      }

      // ---- 占格簇：这一格「归哪个颜色区域」 ----
      // 判据是**加权票数**（不是像素数）：权重本身就是「谁说了算」的度量，
      // 30% 的高权重描边该压过 70% 的平坦背景（与线稿层的 LINE_FORCE_SHARE 同一条思路）。
      // 过渡簇（keepCluster = 0）不参选：它是抗锯齿带，不是画面里真实存在的一片颜色。
      let owner = -1
      let ownerW = 0
      for (let c = 0; c < clusterCount; c++) {
        if (!keepCluster[c]) continue
        // 平票时按簇中心字典序取小者，理由同归簇：占格簇必须由内容定，不能由建立顺序定
        if (
          owner < 0 ||
          clusterW[c] > ownerW ||
          (clusterW[c] === ownerW && clusterCenterLess(c, owner))
        ) {
          ownerW = clusterW[c]
          owner = c
        }
      }

      // ---- 候选色号：占格簇里「格内真实存在的颜色」的色板落点 ----
      // 非占格簇的桶不参选（别的区域的颜色放进来只会让评分去凑两色平均）；
      // 胜负由该簇像素集上的精确加权 loss 决定（见 clusterLoss）
      cand.length = 0
      const addCand = (ci: number | undefined) => {
        if (ci === undefined || cand.includes(ci)) return
        cand.push(ci)
      }
      for (let k = 0; k < pool.length; k++) {
        const key = pool[k]
        if (bucketCluster[key] !== owner) continue
        addCand(codeIndex.get(match(repR[key], repG[key], repB[key])))
      }

      // ---- CIEDE2000 的评分点集：ΔE2000 分解不成「和 + 平方和」，只能逐点算 ----
      // 点全是格内真实像素色 + 一个长尾点；点带簇标（lossCluster）以支持按簇结算。Lab/RGB 不用它
      lossPoints = 0
      if (useCiede) {
        let keptW = 0
        for (let k = 0; k < pool.length; k++) {
          const key = pool[k]
          const c = bucketCluster[key]
          if (c >= 0 && !keepCluster[c]) continue
          const lab = rgbToLab({ r: repR[key], g: repG[key], b: repB[key] })
          const slot = lossLab[lossPoints]
          slot.l = lab.l
          slot.a = lab.a
          slot.b = lab.b
          lossWeight[lossPoints] = wsum[key]
          lossCluster[lossPoints] = c
          lossPoints++
          keptW += wsum[key]
        }
        const restW = sumW - keptW
        if (restW > 1e-3) {
          let restKey = -1
          let restBestW = 0
          for (let t = 0; t < touched.length; t++) {
            const key = touched[t]
            const c = bucketCluster[key]
            // 已经被当成评分点的桶不再进长尾点（长尾 = 没进候选池 + 进了池但被剔掉的那些像素）
            if (c >= 0 && keepCluster[c]) continue
            if (wsum[key] > restBestW) {
              restBestW = wsum[key]
              restKey = key
            }
          }
          if (restKey >= 0) {
            const lab = rgbToLab({ r: repR[restKey], g: repG[restKey], b: repB[restKey] })
            const slot = lossLab[lossPoints]
            slot.l = lab.l
            slot.a = lab.a
            slot.b = lab.b
            lossWeight[lossPoints] = restW
            // 长尾点不代表任何一个簇（-1）：它是「零散像素」，不参与簇内结算
            lossCluster[lossPoints] = -1
            lossPoints++
          }
        }
      }

      // ---- 线稿层：代表色取「线芯」的真实像素色（线稿像素亮度分布的暗端分位） ----
      const lineShare = sumWFull > 0 ? lineSumW / sumWFull : 0
      const hasLine = lineArt && lineSumW > 0
      let lineRepKey = -1
      if (hasLine) {
        // 线芯亮度 = 线稿像素亮度分布从暗到亮的 LINE_CORE_QUANTILE 分位（见该常量的说明：
        // 不能取「线稿权重最大桶」，那个桶对细线而言是过渡像素，代表色一灰整格描边就成灰的）。
        const target = lineSumW * LINE_CORE_QUANTILE
        let acc = 0
        let coreLuma = 0
        for (let l = 0; l < 256; l++) {
          acc += lineLumaHist[l]
          if (acc >= target) {
            coreLuma = l
            break
          }
        }
        // 在「线稿桶」里挑代表色最接近线芯亮度的那个：仍是格内**真实存在的像素色**，不是均值/插值
        let bestD = Infinity
        for (let t = 0; t < touched.length; t++) {
          const key = touched[t]
          if (lineW[key] <= 0) continue
          const l = 0.299 * repR[key] + 0.587 * repG[key] + 0.114 * repB[key]
          const d = Math.abs(l - coreLuma)
          // 亮度同样接近（平票）时取桶键小者：线稿代表色也只由内容决定
          if (d < bestD || (d === bestD && key < lineRepKey)) {
            bestD = d
            lineRepKey = key
          }
        }
      }
      let lineCi = -1
      if (lineRepKey >= 0) {
        const lr = repR[lineRepKey]
        const lg = repG[lineRepKey]
        const lb = repB[lineRepKey]
        if (useCiede) {
          const ll = rgbToLab({ r: lr, g: lg, b: lb })
          lineRepLab.l = ll.l
          lineRepLab.a = ll.a
          lineRepLab.b = ll.b
        }
        // 线稿色按 5bit 量化缓存：同一支笔的描边颜色在图上高度重复。**只缓存确定性结果**
        // （直接匹配就落进深色池，结果只跟代表色有关）；需要走深色池重挑的极少数格要按本格线稿
        // 像素的加权 loss 现算，不能拿别的格的缓存 —— 那会引入与图像内容无关的近似。
        const key = ((lr >> 3) << 10) | ((lg >> 3) << 5) | (lb >> 3)
        const cached = lineCache.get(key)
        if (cached !== undefined) {
          lineCi = cached
        } else {
          const ci = codeIndex.get(match(lr, lg, lb))
          if (ci !== undefined && paletteLuma[ci] <= lineLumaMax) {
            lineCi = ci
            lineCache.set(key, ci)
          } else {
            // 描边匹成浅色 → 退到深色池，按**线稿像素的加权 loss** 重挑（解在深色池上，点集仍是真实线稿像素）
            lineCi = ci ?? -1
            let best = Infinity
            for (let i = 0; i < darkPool.length; i++) {
              const l = lineLoss(darkPool[i])
              if (l < best) {
                best = l
                lineCi = darkPool[i]
              }
            }
          }
        }
        // 线芯色只在它属于占格簇时参选（认不出簇号 = 该桶没进候选池，仍允许它代表线稿层参赛）——
        // 别的簇的线芯色同样不能把这一格拉过去
        const lineCl = bucketCluster[lineRepKey]
        if (lineCl === owner || lineCl < 0) addCand(lineCi)
      }

      // ---- 混合格：只产出 mixedHint 提示数，不参与定色（见 MIXED_MIN_SHARE 的历史教训）----
      let mixedHint = false
      if (clusterCount >= 2) {
        let major = 0
        let minor = 0
        for (let c = 0; c < clusterCount; c++) {
          const share = clusterW[c] / sumW
          if (share > major) {
            minor = major
            major = share
          } else if (share > minor) {
            minor = share
          }
        }
        mixedHint = minor >= mixedMinShare
      }

      // ---- 线稿补充闸门（面积口径，见 LINE_SPAN_MIN 注释）----
      const lineArea = opaquePixels > 0 ? lineN / opaquePixels : 0
      const spanX = lineN ? (lineMaxX - lineMinX + 1) / (x1 - x0) : 0
      const spanY = lineN ? (lineMaxY - lineMinY + 1) / (y1 - y0) : 0
      const lineSpan = Math.max(spanX, spanY)
      // 「直穿本格」：一个方向跨满、另一个方向明显更窄 —— 斜线与拐角两向都满，被挡下（见 LINE_SPAN_CROSS_MAX）
      const lineCross = lineSpan >= LINE_SPAN_MIN && Math.min(spanX, spanY) <= LINE_SPAN_CROSS_MAX
      // 「斜穿本格」：线像素在格内呈对角分布 —— 两向跨度都满，且面积仍是**细线量级**。
      // 45° 斜线（头发丝、斜轮廓、斜阴影边界）永远过不了 lineCross（两向都满、min(span) 不小），
      // 也够不着 lineShare ≥ 0.4（2px 线在 21px 格里只占 9~13%），于是整条斜线断成一串点。
      // 面积上限（LINE_AREA_STRONG）把「大色块边缘」排除在外，剩下的才可能是细线。
      // 仍需 lineCenterHit：两条平行描边之间的亮缝两向也满，但中心是底色 → 被挡下。
      // 再加暗度闸门（LINE_DIAG_LUMA_MAX）：把「色块抗锯齿过渡带」挡在外面 —— 它几何上
      // 跟细线一样（两向满、面积小），但平均亮度高，不是线。
      const lineDiagShape =
        lineSpan >= LINE_SPAN_MIN &&
        Math.min(spanX, spanY) > LINE_SPAN_CROSS_MAX &&
        lineArea >= LINE_AREA_MIN &&
        lineArea <= LINE_AREA_STRONG &&
        (lineN === 0 || lineLumaSum / lineN <= LINE_DIAG_LUMA_MAX)
      // 格中心是否真的压在线体上（3×3，夹在格内）：两条平行描边之间那条细缝的中心是底色，靠它挡下来
      let lineCenterHit = false
      if (hasLine && (lineCross || lineDiagShape) && lineArea >= LINE_AREA_MIN) {
        const ccx = (x0 + x1) >> 1
        const ccy = (y0 + y1) >> 1
        for (let cy = Math.max(y0, ccy - 1); cy <= Math.min(y1 - 1, ccy + 1) && !lineCenterHit; cy++) {
          const rowBaseC = cy * sw
          for (let cx = Math.max(x0, ccx - 1); cx <= Math.min(x1 - 1, ccx + 1); cx++) {
            if (line[rowBaseC + cx]) {
              lineCenterHit = true
              break
            }
          }
        }
      }
      
      const lineForced =
        hasLine &&
        lineCi >= 0 &&
        (lineShare >= LINE_FORCE_SHARE ||
          (lineCross && (lineArea >= LINE_AREA_STRONG || (lineArea >= LINE_AREA_MIN && lineCenterHit))) ||
          (lineDiagonal && lineDiagShape && lineCenterHit))

      // ---- 定色 ----
      let chosen = -1
      if (lineForced) {
        // 线稿层整格落色（覆盖色块层）：候选限深色、误差只结在线稿像素上 ——
        // 70% 白底 + 30% 黑描边的格子在这里必然选黑，白底没机会把描边平均掉
        chosen = lineCi
        lineCells++
      } else {
        if (mixedHint) mixedCells++
        // 定色两步（见 clusterLoss / pickClusterMedoid）：
        //   ① 占格簇 = 加权票数最大的保留簇（上面已定出 owner）；
        //   ② 只在这个簇的候选里比，误差也只结在这个簇自己的像素上：
        //        Σwᵢ·|色ᵢ − c|² = W_c·|c|² − 2·(c·Σwᵢ色ᵢ) + Σwᵢ|色ᵢ|²   （统计只取该簇的像素）
        // 于是格子的答案必然是「某个真实颜色区域里最有代表性的那个色号」：多簇格（白 + 黑）
        // 不会落进两者之间的灰，也不会被另一个区域（正交的另一种颜色）拉走 —— 中间调的灰边无从产生。
        chosen = owner >= 0 ? pickClusterMedoid(owner, cand) : -1
      }
      if (chosen < 0) {
        // 兜底：占格簇里加权票数最大桶的真实代表色落点（仍是格内真实颜色，不会造出中间色）
        let key = -1
        let keyW = 0
        for (let t = 0; t < touched.length; t++) {
          const k = touched[t]
          if (owner >= 0 && bucketCluster[k] !== owner) continue
          // 平票时取桶键小者，与上面各处的裁决口径一致
          if (key < 0 || wsum[k] > keyW || (wsum[k] === keyW && k < key)) {
            key = k
            keyW = wsum[k]
          }
        }
        if (key < 0) key = topIdx[0] >= 0 ? topIdx[0] : touched[0]
        chosen = codeIndex.get(match(repR[key], repG[key], repB[key])) ?? 0
      }
      const col = palette[chosen]
      out[o] = col.r
      out[o + 1] = col.g
      out[o + 2] = col.b
      out[o + 3] = 255

      clearBuckets()
    }
  }

  return { data: out, width: dw, height: dh, mixedCells, lineCells }
}

/**
 * 区域主色降采样（`dominant`）：格内像素按 5 位/通道分桶 → 票数最高几桶各自匹配色板 →
 * 落到同一色号的票相加取最大。结果必是色板真实颜色，不会像逐通道 median 那样拼出
 * 原图没有的颜色（实测白/红/蓝各 1/3 拼成品红）。逐像素统计（超 VOTE_MAX_SAMPLES 才抽样），
 * 细描边不会落进采样缝隙；不透明像素不过半才判不拼珠。
 * 实测 100 万像素噪声 → 64×64：89ms（median 45ms）；扁平参数下 26 色号 vs median 30，边界更干净。
 */
export function dominantDownscale(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number,
  palette: PaletteColor[],
  algorithm?: DistanceAlgorithm | string
): PixelData {
  const match = createColorMatcher(palette, algorithm)
  const colorByCode = new Map(palette.map((c) => [c.code, c]))
  // 计数器跨格复用：只清 touched 里记过的桶，避免每格 fill 一个 32768 长度的数组。
  // 三个累加数组是为了「一遍扫描就拿到桶内均值」—— 桶内像素数 ≤1024、单通道 ≤255，
  // 累加上限 26 万，Int32 绝不会溢出。
  const counts = new Int32Array(VOTE_SIZE)
  const sumR = new Int32Array(VOTE_SIZE)
  const sumG = new Int32Array(VOTE_SIZE)
  const sumB = new Int32Array(VOTE_SIZE)
  const touched: number[] = []
  const topIdx = new Int32Array(VOTE_TOP_K)
  const topCount = new Int32Array(VOTE_TOP_K)
  const codeVotes = new Map<string, number>()
  const out = new Uint8ClampedArray(dw * dh * 4)

  for (let dy = 0; dy < dh; dy++) {
    const y0 = gridBoundary(dy, sh, dh)
    const y1 = Math.max(y0 + 1, gridBoundary(dy + 1, sh, dh))
    for (let dx = 0; dx < dw; dx++) {
      const x0 = gridBoundary(dx, sw, dw)
      const x1 = Math.max(x0 + 1, gridBoundary(dx + 1, sw, dw))
      const stride = Math.max(
        1,
        Math.ceil(Math.sqrt(((x1 - x0) * (y1 - y0)) / VOTE_MAX_SAMPLES))
      )
      // 采样偏移关于格中心镜像（见 centeredOffsets）：镜像格的采样位置互为镜像
      const offX = centeredOffsets(x1 - x0, stride)
      const offY = centeredOffsets(y1 - y0, stride)

      let opaque = 0
      let total = 0
      touched.length = 0
      for (let yi = 0; yi < offY.length; yi++) {
        const rowBase = (y0 + offY[yi]) * sw
        for (let xi = 0; xi < offX.length; xi++) {
          const p = (rowBase + x0 + offX[xi]) * 4
          total++
          if (src[p + 3] < 8) continue // 透明像素不参与投票
          opaque++
          const key =
            ((src[p] >> VOTE_SHIFT) << (VOTE_BITS * 2)) |
            ((src[p + 1] >> VOTE_SHIFT) << VOTE_BITS) |
            (src[p + 2] >> VOTE_SHIFT)
          if (counts[key] === 0) touched.push(key)
          counts[key]++
          sumR[key] += src[p]
          sumG[key] += src[p + 1]
          sumB[key] += src[p + 2]
        }
      }

      const o = (dy * dw + dx) * 4
      if (opaque === 0 || opaque * 2 < total) {
        // 不透明像素不过半 → 这格不拼珠（与 convertPixelsToPattern 的 a < 8 判透明一致）
        out[o + 3] = 0
      } else {
        // 票数最高的 K 个桶：touched 最多几百项，插排足够
        topCount.fill(-1)
        for (let t = 0; t < touched.length; t++) {
          const key = touched[t]
          const c = counts[key]
          for (let k = 0; k < VOTE_TOP_K; k++) {
            // 平票取桶键小者：裁决只跟内容有关，与「谁先被扫到」无关（见 centeredOffsets 的说明）。
            // topCount[k] === c 时必然 > 0，所以 topIdx[k] 一定是本格刚写入的真桶键，不会是残留值。
            if (c > topCount[k] || (c === topCount[k] && key < topIdx[k])) {
              for (let m = VOTE_TOP_K - 1; m > k; m--) {
                topCount[m] = topCount[m - 1]
                topIdx[m] = topIdx[m - 1]
              }
              topCount[k] = c
              topIdx[k] = key
              break
            }
          }
        }
        /*
         * 代表色用**桶内像素均值**，而不是桶中心。桶中心最多偏 4（5 位量化），而色板里
         * 存在多个几乎同色的色号 —— 实测某色板同时有两个肉眼无差的白色，偏这一点
         * 就会把「白」漂到另一个白上去。桶内均值就是这一桶的真实颜色，不会漂。
         */
        // 落到**同一色号**的票据相加后再比票数（同一片渐变的相邻桶常匹配到同一个色号）
        codeVotes.clear()
        let bestCode = ''
        let bestVotes = -1
        for (let k = 0; k < VOTE_TOP_K; k++) {
          const votesForKey = topCount[k]
          if (votesForKey <= 0) break
          const key = topIdx[k]
          const code = match(
            Math.round(sumR[key] / votesForKey),
            Math.round(sumG[key] / votesForKey),
            Math.round(sumB[key] / votesForKey)
          )
          const votes = (codeVotes.get(code) || 0) + votesForKey
          codeVotes.set(code, votes)
          if (votes > bestVotes) {
            bestVotes = votes
            bestCode = code
          }
        }
        // 输出**色板色的精确 RGB**：后面 convertPixelsToPattern 再匹配一次必然落回同一色号
        const color = colorByCode.get(bestCode)
        if (color) {
          out[o] = color.r
          out[o + 1] = color.g
          out[o + 2] = color.b
        }
        out[o + 3] = 255
      }

      for (let t = 0; t < touched.length; t++) {
        const key = touched[t]
        counts[key] = 0
        sumR[key] = 0
        sumG[key] = 0
        sumB[key] = 0
      }
    }
  }
  return { data: out, width: dw, height: dh }
}

// ==================== 扁平简洁（合并近似色号） ====================

/**
 * 合并近似色号：反复并掉「簇中心最接近」的一对，直到最近距离 > maxDeltaE。
 * 平均链接（中心按计数加权）防止单链沿渐变一路吞；⚠️ 还要**完整性约束**（complete
 * linkage）—— 中心会随成员漂移，实测米色一路并进纯白（原色差 26~29 > 阈值 16）。
 * 有了两两成员对 ≤ 阈值的约束，阈值才重新等于「被替换色号 ↔ 替换色号的色差」。
 */
export function mergeSimilarCodes(
  pattern: string[][],
  palette: PaletteColor[],
  maxDeltaE: number
): string[][] {
  const codeLab = new Map(palette.map((c) => [c.code, rgbToLab({ r: c.r, g: c.g, b: c.b })]))
  interface Cluster {
    l: number
    a: number
    b: number
    count: number
    /** 簇的全部原始成员色号（完整性判据要看两两距离，光有中心不够） */
    members: string[]
  }
  const clusters = new Map<string, Cluster>()
  for (const row of pattern) {
    for (const code of row) {
      if (code === 'TRANSPARENT') continue
      let c = clusters.get(code)
      if (!c) {
        const lab = codeLab.get(code)
        if (!lab) continue
        c = { l: lab.l, a: lab.a, b: lab.b, count: 0, members: [code] }
        clusters.set(code, c)
      }
      c.count++
    }
  }
  if (clusters.size < 2) return pattern

  const remap = new Map<string, string>()
  for (const k of clusters.keys()) remap.set(k, k)
  const resolve = (c: string): string => {
    let x = c
    while (remap.get(x) !== x) x = remap.get(x)!
    return x
  }
  const limit2 = maxDeltaE * maxDeltaE

  for (;;) {
    const keys = Array.from(clusters.keys())
    if (keys.length < 2) break
    let bi = ''
    let bj = ''
    // 候选对的**无序**色号键（平票裁决用）：归一成 (小, 大) 再比，与 (i, j) 的先后无关
    let bLo = ''
    let bHi = ''
    let best = Infinity
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const A = clusters.get(keys[i])!
        const B = clusters.get(keys[j])!
        const d2 = (A.l - B.l) ** 2 + (A.a - B.a) ** 2 + (A.b - B.b) ** 2
        if (d2 > best || d2 > limit2) continue
        // 中心距离并列时按无序色号键的字典序取小者：裁决只跟内容有关，与 clusters 的插入顺序
        // （也就是扫描顺序）无关。两个色号谁在 keys 里靠前并不固定，所以必须先归一成 (小, 大)。
        const lo = keys[i] < keys[j] ? keys[i] : keys[j]
        const hi = keys[i] < keys[j] ? keys[j] : keys[i]
        if (d2 === best && !(lo < bLo || (lo === bLo && hi < bHi))) continue
        // 完整性约束：两簇成员两两之间的 ΔE 都得 ≤ maxDeltaE（见函数头注释）。
        // 中心距离超限 ⇒ 必有成员对超限，所以上面的 d2 > limit2 早退是安全的，不是额外放宽。
        let ok = true
        for (let x = 0; x < A.members.length && ok; x++) {
          const la = codeLab.get(A.members[x])
          if (!la) continue
          for (let y = 0; y < B.members.length; y++) {
            const lb = codeLab.get(B.members[y])
            if (!lb) continue
            if ((la.l - lb.l) ** 2 + (la.a - lb.a) ** 2 + (la.b - lb.b) ** 2 > limit2) {
              ok = false
              break
            }
          }
        }
        if (!ok) continue
        best = d2
        bi = keys[i]
        bj = keys[j]
        bLo = lo
        bHi = hi
      }
    }
    if (!bi) break

    // 小簇并大簇；簇中心按计数加权平均（成对选择仍走平均链接，见函数头注释）。
    // 计数并列时保留**字典序小**的那个色号做替身：否则「扫到谁在前」会决定留下哪个色号，
    // 镜像两侧就会分叉成两个不同的色号。
    const A = clusters.get(bi)!
    const B = clusters.get(bj)!
    const [fromKey, toKey] = A.count < B.count || (A.count === B.count && bi > bj) ? [bi, bj] : [bj, bi]
    const F = clusters.get(fromKey)!
    const T = clusters.get(toKey)!
    const tot = F.count + T.count
    T.members.push(...F.members)
    T.l = (T.l * T.count + F.l * F.count) / tot
    T.a = (T.a * T.count + F.a * F.count) / tot
    T.b = (T.b * T.count + F.b * F.count) / tot
    T.count = tot
    clusters.delete(fromKey)
    remap.set(fromKey, toKey)
  }

  return pattern.map((row) => row.map((c) => (c === 'TRANSPARENT' ? c : resolve(c))))
}

/**
 * 色号数上限：把用不到的长尾色号并掉，让最终图纸的色号数收敛到 maxColors 以内。
 *
 * 为什么需要：逐格独立取色 + `mergeSimilarCodes`（按 ΔE 阈值）只能保证「相邻色号不超阈值」，
 * **不保证总色号数** —— 渐变多的图能轻松用到 80~150 色（52 格图纸，实测 momagic 那张
 * flat 82 色 / detail 150 色）。指标上「色号越多越像原图」，产品上恰好相反：
 * 拼豆要按色号买珠子，色号数是真实成本也是可读性。所以按风格给一个硬上限。
 *
 * 规则（保守口径，与 mergeSimilarCodes 同源）：
 *   ① 按出现**次数**（像素计数，不是加权）降序保留前 maxColors 个色号；
 *   ② 其余每个色号**整体**并入「保留色号里 ΔE76 最近的那个」。
 * 注意并入的单位是「整个色号」而不是「逐格重挑」—— 逐格重挑会重新引入格内没有的颜色，
 * 那是本文件反复踩过的坑（见 MIXED_MIN_SHARE 的历史教训）。
 *
 * ⚠️ 必须在**所有落色 pass 之后**调用：抖动、特征回贴、对称校正都会引入新色号，
 * 放在它们前面限不住。见 convertImageFileToPattern 的调用位置。
 */
export function limitColorCount(
  pattern: string[][],
  palette: PaletteColor[],
  maxColors: number
): { pattern: string[][]; merged: number } {
  if (!maxColors || maxColors <= 0) return { pattern, merged: 0 }
  const counts = new Map<string, number>()
  for (const row of pattern) {
    for (const code of row) {
      if (!code || code === 'TRANSPARENT') continue
      counts.set(code, (counts.get(code) || 0) + 1)
    }
  }
  if (counts.size <= maxColors) return { pattern, merged: 0 }

  const codeLab = new Map(palette.map((c) => [c.code, rgbToLab({ r: c.r, g: c.g, b: c.b })]))
  // 次数降序、平票取色号字典序小者：裁决只跟内容有关，与扫描顺序无关（镜像两格必须复现同一结果）
  const ranked = Array.from(counts.entries())
    .filter(([code]) => codeLab.has(code))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  if (ranked.length <= maxColors) return { pattern, merged: 0 }
  const keep = ranked.slice(0, maxColors)
  const drop = ranked.slice(maxColors)

  const remap = new Map<string, string>()
  for (const [code] of drop) {
    const lab = codeLab.get(code)!
    let best = ''
    let bestD = Infinity
    for (const [kc] of keep) {
      const kl = codeLab.get(kc)!
      const d = (lab.l - kl.l) ** 2 + (lab.a - kl.a) ** 2 + (lab.b - kl.b) ** 2
      if (d < bestD || (d === bestD && kc < best)) {
        bestD = d
        best = kc
      }
    }
    if (best) remap.set(code, best)
  }
  if (remap.size === 0) return { pattern, merged: 0 }
  const out = pattern.map((row) => row.map((c) => remap.get(c) || c))
  return { pattern: out, merged: remap.size }
}

/** 轮廓还原用的逐格描边统计（computeOutlineMask 产出，喂给 restoreOutline） */
export interface OutlineMask {
  /** 逐格「暗格」标记（0/1）：格内描边像素占比 ≥ OUTLINE_SHARE_MIN */
  dark: Uint8Array
  /** 每格描边像素的平均色（dw*dh*3，只有 RGB 三段） */
  color: Float32Array
  /** 每格描边像素数（0 = 该格没有描边像素） */
  inkN: Int32Array
  width: number
  height: number
}

/**
 * 源分辨率逐格统计「描边」（低亮度 + 低饱和）像素的占比与平均色。
 * 只遍历一遍源像素、只产出 dw×dh 的小数组（几千格），不保留源像素数据。
 */
export function computeOutlineMask(
  src: Uint8ClampedArray,
  sw: number,
  sh: number,
  dw: number,
  dh: number
): OutlineMask {
  const n = dw * dh
  const inkN = new Int32Array(n)
  const cellN = new Int32Array(n)
  const sumR = new Float32Array(n)
  const sumG = new Float32Array(n)
  const sumB = new Float32Array(n)
  for (let dy = 0; dy < dh; dy++) {
    const y0 = gridBoundary(dy, sh, dh)
    const y1 = Math.max(y0 + 1, gridBoundary(dy + 1, sh, dh))
    for (let dx = 0; dx < dw; dx++) {
      const x0 = gridBoundary(dx, sw, dw)
      const x1 = Math.max(x0 + 1, gridBoundary(dx + 1, sw, dw))
      const g = dy * dw + dx
      for (let y = y0; y < y1; y++) {
        const rowBase = y * sw
        for (let x = x0; x < x1; x++) {
          const p = (rowBase + x) * 4
          // 与 convertPixelsToPattern 口径一致：半透明按白底合成后再判色
          const a = src[p + 3] / 255
          const r = src[p] * a + 255 * (1 - a)
          const gg = src[p + 1] * a + 255 * (1 - a)
          const b = src[p + 2] * a + 255 * (1 - a)
          cellN[g]++
          const luma = 0.299 * r + 0.587 * gg + 0.114 * b
          if (luma > OUTLINE_LUMA_MAX) continue
          if (Math.max(r, gg, b) - Math.min(r, gg, b) > OUTLINE_CHROMA_MAX) continue
          inkN[g]++
          sumR[g] += r
          sumG[g] += gg
          sumB[g] += b
        }
      }
    }
  }
  const dark = new Uint8Array(n)
  const color = new Float32Array(n * 3)
  const shareMin = outlineShareMin(dw)
  for (let i = 0; i < n; i++) {
    if (inkN[i] > 0) {
      color[i * 3] = sumR[i] / inkN[i]
      color[i * 3 + 1] = sumG[i] / inkN[i]
      color[i * 3 + 2] = sumB[i] / inkN[i]
    }
    dark[i] = cellN[i] > 0 && inkN[i] / cellN[i] >= shareMin ? 1 : 0
  }
  return { dark, color, inkN, width: dw, height: dh }
}

/** 8 邻域腐蚀（格网格）：3×3 全为 1 才保留 */
function outlineErode(bin: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let all = 1
      for (let dy = -1; dy <= 1 && all; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || !bin[ny * w + nx]) {
            all = 0
            break
          }
        }
      }
      out[y * w + x] = all
    }
  }
  return out
}

/** 8 邻域膨胀（格网格） */
function outlineDilate(bin: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let any = 0
      for (let dy = -1; dy <= 1 && !any; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx >= 0 && ny >= 0 && nx < w && ny < h && bin[ny * w + nx]) {
            any = 1
            break
          }
        }
      }
      out[y * w + x] = any
    }
  }
  return out
}

/** Zhang-Suen 细化（在格网格上做，几千格，极快） */
function outlineThin(bin: Uint8Array, w: number, h: number): Uint8Array {
  const img = bin.slice()
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x])
  for (let guard = 0; guard < 64; guard++) {
    let changed = false
    for (const step of [0, 1]) {
      const del: number[] = []
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!img[y * w + x]) continue
          const p2 = at(x, y - 1)
          const p3 = at(x + 1, y - 1)
          const p4 = at(x + 1, y)
          const p5 = at(x + 1, y + 1)
          const p6 = at(x, y + 1)
          const p7 = at(x - 1, y + 1)
          const p8 = at(x - 1, y)
          const p9 = at(x - 1, y - 1)
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (b < 2 || b > 6) continue
          const a =
            (p2 === 0 && p3 === 1 ? 1 : 0) + (p3 === 0 && p4 === 1 ? 1 : 0) +
            (p4 === 0 && p5 === 1 ? 1 : 0) + (p5 === 0 && p6 === 1 ? 1 : 0) +
            (p6 === 0 && p7 === 1 ? 1 : 0) + (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) + (p9 === 0 && p2 === 1 ? 1 : 0)
          if (a !== 1) continue
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue
            if (p4 * p6 * p8 !== 0) continue
          } else {
            if (p2 * p4 * p8 !== 0) continue
            if (p2 * p6 * p8 !== 0) continue
          }
          del.push(y * w + x)
        }
      }
      if (del.length) {
        changed = true
        for (const i of del) img[i] = 0
      }
    }
    if (!changed) break
  }
  return img
}

/**
 * 轮廓还原：把「连续的线经过、但逐格判据漏掉」的格补成线稿色。
 * **只补不删** —— 现有 lineArt 与斜线判据的成果全部保留，这里只填空缺。
 * 必须在所有落色 pass（抖动 / 特征回贴 / 对称校正）**之后**跑，否则补完又被覆盖。
 * @returns 被改动的格数
 */
export function restoreOutline(
  pattern: string[][],
  outline: OutlineMask,
  palette: PaletteColor[],
  matchAlgorithm?: DistanceAlgorithm | string
): number {
  const { dark, color, inkN, width: dw, height: dh } = outline
  if (!dark || dw <= 0 || dh <= 0 || !pattern.length) return 0
  // 开运算：腐蚀掉 ≤2 格宽的细线、只留 3+ 格宽的暗色块（深色头发/衣服不当线看）
  const block = outlineDilate(outlineErode(dark, dw, dh), dw, dh)
  const thinLayer = new Uint8Array(dw * dh)
  for (let i = 0; i < dw * dh; i++) thinLayer[i] = dark[i] && !block[i] ? 1 : 0
  const skeleton = outlineThin(thinLayer, dw, dh)
  const match = createColorMatcher(palette, matchAlgorithm)
  let changed = 0
  for (let dy = 0; dy < dh; dy++) {
    const row = pattern[dy]
    if (!row) continue
    for (let dx = 0; dx < dw; dx++) {
      const i = dy * dw + dx
      if (!skeleton[i] || inkN[i] === 0) continue
      const code = match(color[i * 3], color[i * 3 + 1], color[i * 3 + 2])
      if (row[dx] !== code) {
        row[dx] = code
        changed++
      }
    }
  }
  return changed
}

/**
 * 暗点清理：把「真黑的小连通块」（面积 ≤ maxCells）并入邻域的**非深色主色**。
 *
 * 为什么要单独一层：`smooth` / `photo` 档的 denoiseLevel = 0 —— 这两档要的就是柔和过渡，
 * 不做全量降噪（`bfsDenoise` 会把所有色号的小簇都当成杂点）。但照片 / 写实图的暗部
 * （叶片缝隙、阴影纹理）在低格数下会散成不规则黑点，观感很脏。
 * 这里**只动深色这一层**，其它色号的柔和过渡一点不受影响。
 *
 * 实测（momagic 圣诞花环那张，52 格 smooth）：
 *   加降噪 denoiseLevel 1/2 → 孤立黑点只从 16 降到 12/13，而均ΔE 从 10.20 涨到 10.87/11.21；
 *   本函数 maxCells=2 → 孤立黑点 16 → **0**、深色块 45 → 22，均ΔE 只到 10.27。
 * ⚠️ `maxCells` 别调大：4 会把「眼睛」这种 ≤4 格的真实深色特征一起清掉（实测眼睛消失）。
 */
export function cleanDarkSpots(
  pattern: string[][],
  palette: PaletteColor[],
  maxCells: number,
  maxLuma = DARK_SPOT_LUMA_MAX
): number {
  const h = pattern.length
  const w = h > 0 ? pattern[0].length : 0
  if (!w || maxCells <= 0) return 0
  const lumaOf = new Map(palette.map((c) => [c.code, 0.299 * c.r + 0.587 * c.g + 0.114 * c.b]))
  const isDark = (c: string) => (lumaOf.get(c) ?? 255) < maxLuma
  const n = w * h
  const seen = new Uint8Array(n)
  const stack: number[] = []
  let changed = 0
  for (let i = 0; i < n; i++) {
    if (seen[i] || !isDark(pattern[(i / w) | 0][i % w])) continue
    // 收集这一块（8 连通）
    const cells: number[] = []
    stack.length = 0
    stack.push(i)
    seen[i] = 1
    while (stack.length) {
      const j = stack.pop()!
      cells.push(j)
      const cx = j % w
      const cy = (j / w) | 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const k = ny * w + nx
          if (seen[k] || !isDark(pattern[ny][nx])) continue
          seen[k] = 1
          stack.push(k)
        }
      }
    }
    if (cells.length > maxCells) continue
    // 邻域里**非深色**的主色（平票取色号字典序小者：结果只由内容决定，与扫描顺序无关）
    const votes = new Map<string, number>()
    for (const j of cells) {
      const cx = j % w
      const cy = (j / w) | 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const c = pattern[ny][nx]
          if (c === 'TRANSPARENT' || isDark(c)) continue
          votes.set(c, (votes.get(c) || 0) + 1)
        }
      }
    }
    let best = ''
    let bestCount = 0
    votes.forEach((count, code) => {
      if (count > bestCount || (count === bestCount && code < best)) {
        bestCount = count
        best = code
      }
    })
    if (!best) continue
    for (const j of cells) pattern[(j / w) | 0][j % w] = best
    changed += cells.length
  }
  return changed
}

// ==================== 误差扩散抖动（`dither`） ====================
//
// 52 格起步后实测：照片最大的观感问题不是「逐格颜色不准」，而是**渐变被量化成硬边界**
//（脸上一块块、天空一圈圈台阶）。逐格 ΔE 与肉眼观感在这件事上是分裂的 ——
// 「细节优先」逐格 ΔE 6.29，但 3×3 平滑后只有 3.79，好过逐格最准的「平滑自然」(4.29)：
// 前者是「碎的准」，后者是「准但成块」，肉眼更认前者。
//
// 误差扩散（Floyd–Steinberg）把本格取色后的残差按 7/16 : 3/16 : 5/16 : 1/16 摊给右下邻格，
// 整片渐变在肉眼上被拉平。实测（6 张素材 × 52/78/104/200 四档，指标见 vis/sweep 工具）：
//   扁平简洁：均ΔE 6.66 → 5.17，3×3 平滑 ΔE 4.71 → 3.18，色号 21.3 → 19.4（反而更少）
//   平滑自然：均ΔE 5.58 → 3.99，3×3 平滑 ΔE 4.00 → 2.39，色号 61.2 → 31.2
//
// 两条闸门是这个 pass 能用的前提（都是实测踩出来的）：
//   - **梯度选通**：只在「局部有缓变梯度」的格子上扩散。平色区（卡通衣服、纯色背景）
//     抖动会把同色区变成两色棋盘格 —— ΔE 指标说更好，眼睛一眼看出假；硬边/描边抖动
//     则会把描边糊掉，所以梯度很大的格子同样不抖。
//   - **色号池封顶（cap）**：抖动会在相近色号之间来回横跳，不封顶时 6 张素材平均用到 67 色
//     （52 格图纸没法用）。按「风格减色后的高频色号」封顶后，色号数回到风格原有水平。
//
// 语义：**所有非透明格都按像素值重挑色号**（不是只改被抖动的格子）—— 只改抖动格子、
// 保留降噪/合并结果时，那些硬边界原样留着，实测收益几乎归零（均ΔE 6.58 vs 5.17）。

export interface DitherOptions {
  /** 误差扩散强度 0~1，默认 0.6 */
  strength?: number
  /** 抖动色号池上限（按图纸里的出现频次取前 N）；0 / 不传 = 全色板 */
  cap?: number
  /** 参与抖动的参考图局部梯度区间（ΔE76），默认 [1.5, 25] */
  gateMin?: number
  gateMax?: number
}

/**
 * 误差扩散抖动：在「量化 + 降噪 + 减色」**之后**、特征回贴**之前**调用。
 * `pixels` 是降采样后的 dw×dh 像素（抖动目标 = 真实像素值，不是格内均值）。
 * 直接原地改 pattern，返回改动格数。透明格（抠背景）不参与，也不会被扩散污染。
 */
export function ditherPattern(
  pattern: string[][],
  pixels: Uint8ClampedArray,
  dw: number,
  dh: number,
  palette: PaletteColor[],
  algorithm?: DistanceAlgorithm | string,
  opts?: DitherOptions
): number {
  if (!pattern || !palette || palette.length === 0 || dw <= 0 || dh <= 0) return 0
  const strength = opts?.strength ?? DITHER_STRENGTH
  if (strength <= 0) return 0
  const n = dw * dh
  if (pixels.length < n * 4) return 0

  // 色号池 = **这张图纸自己用到的色号**（给了 cap 就只取出现频次前 N 个）：
  // 抖动只在风格已经选定的色号之间横跳，总色号数一分不涨 —— 不封顶而放开全色板时，
  // 实测 6 张素材平均会用到 67 色，52 格图纸没法用
  const freq = new Map<string, number>()
  for (const row of pattern) for (const code of row) freq.set(code, (freq.get(code) || 0) + 1)
  const cap = opts?.cap ?? 0
  const keep = new Set(
    (cap > 0
      ? [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, cap)
      : [...freq.entries()]
    ).map(([code]) => code)
  )
  const pool = palette.filter((c) => keep.has(c.code))
  if (pool.length === 0) return 0
  const match = createColorMatcher(pool, algorithm)
  const poolRgb = new Map(pool.map((c) => [c.code, c]))

  // 逐格 Lab（白底合成口径，与 convertPixelsToPattern 一致）+ 不透明标记 + 累加误差缓冲
  const labArr = new Float32Array(n * 3)
  const acc = new Float32Array(n * 3)
  const opaque = new Uint8Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = pixels[p + 3]
    if (a < 8) continue
    const f = a / 255
    const r = pixels[p] * f + 255 * (1 - f)
    const g = pixels[p + 1] * f + 255 * (1 - f)
    const b = pixels[p + 2] * f + 255 * (1 - f)
    const o = i * 3
    acc[o] = r; acc[o + 1] = g; acc[o + 2] = b
    const lab = rgbToLab({ r, g, b })
    labArr[o] = lab.l; labArr[o + 1] = lab.a; labArr[o + 2] = lab.b
    opaque[i] = 1
  }

  // 梯度选通：格与其 8 邻的最大 ΔE76。平色区 ≈0、缓变渐变中等、硬边/描边很大
  const gateMin = opts?.gateMin ?? DITHER_GATE_MIN
  const gateMax = opts?.gateMax ?? DITHER_GATE_MAX
  const grad = new Float32Array(n)
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const i = y * dw + x
      if (!opaque[i]) continue
      const o = i * 3
      let mx = 0
      for (let yy = Math.max(0, y - 1); yy <= Math.min(dh - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(dw - 1, x + 1); xx++) {
          const j = yy * dw + xx
          if (!opaque[j]) continue
          const q = j * 3
          const d = Math.sqrt(labDistance(
            { l: labArr[o], a: labArr[o + 1], b: labArr[o + 2] },
            { l: labArr[q], a: labArr[q + 1], b: labArr[q + 2] }
          ))
          if (d > mx) mx = d
        }
      }
      grad[i] = mx
    }
  }

  const spread = (x: number, y: number, er: number, eg: number, eb: number) => {
    if (x < 0 || x >= dw || y < 0 || y >= dh) return
    const j = y * dw + x
    if (!opaque[j]) return
    const row = pattern[y]
    if (!row || row[x] === 'TRANSPARENT') return
    const q = j * 3
    acc[q] += er; acc[q + 1] += eg; acc[q + 2] += eb
  }

  let changed = 0
  for (let y = 0; y < dh; y++) {
    const row = pattern[y]
    if (!row) continue
    for (let x = 0; x < dw; x++) {
      const i = y * dw + x
      const cur = row[x]
      if (cur === 'TRANSPARENT' || !opaque[i]) continue
      const o = i * 3
      const g = grad[i]
      const useDither = g >= gateMin && g <= gateMax
      let tr: number, tg: number, tb: number
      if (useDither) {
        tr = acc[o]; tg = acc[o + 1]; tb = acc[o + 2]
      } else {
        // 不抖的格子读**纯净像素值**（不吸收邻格扩散来的误差）：平色区与描边保持干净
        const p = i * 4
        const a = pixels[p + 3] / 255
        tr = pixels[p] * a + 255 * (1 - a)
        tg = pixels[p + 1] * a + 255 * (1 - a)
        tb = pixels[p + 2] * a + 255 * (1 - a)
      }
      const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))
      const code = match(clamp(tr), clamp(tg), clamp(tb))
      if (code !== cur) {
        row[x] = code
        changed++
      }
      if (!useDither) continue
      const pc = poolRgb.get(code)
      if (!pc) continue
      const er = (tr - pc.r) * strength
      const eg = (tg - pc.g) * strength
      const eb = (tb - pc.b) * strength
      spread(x + 1, y, er * (7 / 16), eg * (7 / 16), eb * (7 / 16))
      spread(x - 1, y + 1, er * (3 / 16), eg * (3 / 16), eb * (3 / 16))
      spread(x, y + 1, er * (5 / 16), eg * (5 / 16), eb * (5 / 16))
      spread(x + 1, y + 1, er * (1 / 16), eg * (1 / 16), eb * (1 / 16))
    }
  }
  return changed
}

/**
 * 按源图原始分辨率读出裁剪区域再逐格降采样（「怎么缩」不交给浏览器滤波）。
 * box 档读源图时保持平滑（超限先缩一档取平均正合适）；其余档关平滑保证采到真实像素。
 */
// 计算目标高度（按宽高比自适应）
export function calcTargetHeight(targetWidth: number, sourceWidth: number, sourceHeight: number): number {
  return Math.max(1, Math.round((targetWidth * sourceHeight) / sourceWidth))
}

// ==================== 页面适配层 ====================
// 源图解码在页面侧完成（canvas → ImageData），本模块只吃裸像素，
// 所以入口是同步的 convertImageToBeadPattern：调用方不需要再传文件或 URL。

/** 面积平均降采样（白底合成口径，与全链路一致） */
function areaDownscale(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor((dy * sh) / dh)
    const y1 = Math.max(y0 + 1, Math.floor(((dy + 1) * sh) / dh))
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor((dx * sw) / dw)
      const x1 = Math.max(x0 + 1, Math.floor(((dx + 1) * sw) / dw))
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let y = y0; y < y1; y++) {
        const rowBase = y * sw
        for (let x = x0; x < x1; x++) {
          const p = (rowBase + x) * 4
          const f = src[p + 3] / 255
          r += src[p] * f + 255 * (1 - f)
          g += src[p + 1] * f + 255 * (1 - f)
          b += src[p + 2] * f + 255 * (1 - f)
          a += src[p + 3]
          n++
        }
      }
      const o = (dy * dw + dx) * 4
      out[o] = r / n
      out[o + 1] = g / n
      out[o + 2] = b / n
      out[o + 3] = a / n
    }
  }
  return out
}

/**
 * 源图超过 MAX_SOURCE_PIXELS 时先缩一档，**分级**（每级 ≤2 倍）做面积平均：
 * 一次大幅平均会把 1~2px 的描边摊平，分级后每级只混相邻两像素，细线保得住
 * （实测结论：分级缩放比一步到位的缩放保留更多描边）。
 */
function fitSourcePixels(src: Uint8ClampedArray, sw: number, sh: number) {
  if (sw * sh <= MAX_SOURCE_PIXELS) return { data: src, w: sw, h: sh }
  const scale = Math.sqrt(MAX_SOURCE_PIXELS / (sw * sh))
  const tw = Math.max(1, Math.round(sw * scale))
  const th = Math.max(1, Math.round(sh * scale))
  let cur = { data: src, w: sw, h: sh }
  while (cur.w > tw * 2 || cur.h > th * 2) {
    const nw = Math.max(tw, Math.ceil(cur.w / 2))
    const nh = Math.max(th, Math.ceil(cur.h / 2))
    cur = { data: areaDownscale(cur.data, cur.w, cur.h, nw, nh), w: nw, h: nh }
  }
  if (cur.w === tw && cur.h === th) return cur
  return { data: areaDownscale(cur.data, cur.w, cur.h, tw, th), w: tw, h: th }
}

export interface ImageConvertOptions {
  imageData: { data: Uint8ClampedArray; width: number; height: number }
  targetWidth: number
  targetHeight: number
  palette: BeadColor[]
  removeBg?: boolean
  /** 降噪强度 0~3（0 = 不降噪），见 denoiseThresholdOf */
  denoiseLevel?: number
  denoiseThreshold?: number
  denoiseMaxDeltaE?: number | null
  algorithm?: DistanceAlgorithm
  matchAlgorithm?: DistanceAlgorithm
  /** 降采样方式，默认 weighted（各种方式的差别见 SamplingMode 说明） */
  sampling?: SamplingMode
  /** 线稿分层（深色高对比像素优先按线稿落色），默认开 */
  lineArt?: boolean
  /** 斜线补充判据，卡通/动漫档开，见 WeightedDownscaleOptions.diagonalLine */
  diagonalLine?: boolean
  /** 轮廓还原，卡通/动漫档开，见 restoreOutline */
  outlineRestore?: boolean
  /** 小特征（眼睛/鼻子）形状回贴，照片档关，见 PATTERN_STYLES.featureRestamp */
  featureRestamp?: boolean
  /** 暗点清理：并入面积 ≤ 该值（格）的真黑小块，照片档用，见 cleanDarkSpots */
  darkSpotCells?: number
  /** 色号数上限，见 limitColorCount */
  maxColors?: number
  regionMergeDeltaE?: number
  mergeDeltaE?: number
  dither?: number
  ditherCap?: number
  ditherGate?: [number, number]
  bgReplaceColor?: string | null
}

/**
 * 生产链路（各步骤的顺序是实测调优的结果，不要随意调换）：
 *   源图降采样（必要时）→ 小特征检测 + 描边统计 → 逐格降采样/配色 → 降噪/合并 →
 *   抖动 → 特征回贴 + 对称校正 → 轮廓还原 → 暗点清理 → 色号数上限 → 统计
 */
export function convertImageToBeadPattern(options: ImageConvertOptions): ConvertResult {
  const { imageData, targetWidth, targetHeight, palette } = options
  if (!palette || palette.length === 0) throw new Error('色板为空')
  const colors = palette as unknown as PaletteColor[]
  const matchAlgo = options.matchAlgorithm ?? options.algorithm
  const sampling: SamplingMode = options.sampling ?? 'weighted'

  const src = fitSourcePixels(imageData.data, imageData.width, imageData.height)

  // 小特征检测与描边统计都用**源分辨率**像素，与降采样方式无关
  const feats = detectSmallFeatures(src.data, src.w, src.h, targetWidth, targetHeight)
  // 轮廓统计只对加权档有意义（平滑/照片档没有「描边」这回事）
  const outline = sampling === 'box' ? undefined
    : computeOutlineMask(src.data, src.w, src.h, targetWidth, targetHeight)

  let down: PixelData
  if (sampling === 'box') {
    down = softDownscale(src.data, src.w, src.h, targetWidth, targetHeight)
  } else if (sampling === 'dominant') {
    down = dominantDownscale(src.data, src.w, src.h, targetWidth, targetHeight, colors, matchAlgo)
  } else if (sampling === 'median') {
    down = medianDownscale(src.data, src.w, src.h, targetWidth, targetHeight)
  } else {
    down = weightedDownscale(src.data, src.w, src.h, targetWidth, targetHeight, colors, {
      algorithm: options.algorithm,
      lineArt: options.lineArt,
      diagonalLine: options.diagonalLine,
      matchAlgorithm: options.matchAlgorithm
    })
  }

  let pattern = convertPixelsToPattern({
    pixels: down.data,
    width: down.width,
    height: down.height,
    palette: colors,
    removeBg: options.removeBg,
    denoiseLevel: options.denoiseLevel,
    denoiseThreshold: options.denoiseThreshold,
    denoiseMaxDeltaE: options.denoiseMaxDeltaE,
    algorithm: options.algorithm,
    matchAlgorithm: options.matchAlgorithm,
    regionMergeDeltaE: options.regionMergeDeltaE,
    mergeDeltaE: options.mergeDeltaE,
    bgReplaceColor: options.bgReplaceColor ?? undefined
  }).pattern

  // 以下后处理顺序是实测调优的结论，任何一步挪位都会破坏效果
  if (options.dither && options.dither > 0) {
    ditherPattern(pattern, down.data, down.width, down.height, colors, matchAlgo, {
      strength: options.dither,
      cap: options.ditherCap,
      gateMin: options.ditherGate?.[0],
      gateMax: options.ditherGate?.[1]
    })
  }
  if (options.featureRestamp !== false && feats.length > 0) {
    restampFeatures(pattern, targetWidth, targetHeight, feats, src.w, src.h, colors, matchAlgo)
    symmetrizeFeatures(pattern, targetWidth, targetHeight, feats, src.w, src.h, colors, matchAlgo)
  }
  if (options.outlineRestore !== false && outline) {
    restoreOutline(pattern, outline, colors, matchAlgo)
  }
  if (options.darkSpotCells && options.darkSpotCells > 0) {
    cleanDarkSpots(pattern, colors, options.darkSpotCells)
  }
  if (options.maxColors && options.maxColors > 0) {
    pattern = limitColorCount(pattern, colors, options.maxColors).pattern
  }

  const { stats, totalBeads } = countPatternStats(pattern, colors)
  return { pattern, stats, totalBeads }
}


function getTextColorForBg(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.5 ? '#000000' : '#FFFFFF'
}

// ==================== 珠子样式与导出/画布工具（Bead Studio 特有） ====================

export type BeadStyle = 'grid-square' | 'grid-round' | 'grid-hollow-round'

export function extractDominantColor(pixels: Uint8ClampedArray): [number, number, number] {
  const bucketSize = 8
  const freqMap = new Map<string, number>()

  for (let i = 0; i < pixels.length; i += 4) {
    const r = Math.floor(pixels[i] / bucketSize) * bucketSize
    const g = Math.floor(pixels[i + 1] / bucketSize) * bucketSize
    const b = Math.floor(pixels[i + 2] / bucketSize) * bucketSize
    const key = `${r},${g},${b}`
    freqMap.set(key, (freqMap.get(key) || 0) + 1)
  }

  let maxFreq = 0
  let dominant: [number, number, number] = [0, 0, 0]
  freqMap.forEach((freq, key) => {
    if (freq > maxFreq) {
      maxFreq = freq
      dominant = key.split(',').map(Number) as [number, number, number]
    }
  })

  return dominant
}

// 色号长度在不同品牌之间差得很远：短色号是 `A1`（2 字符），长色号是 `AB-12345`（8 字符）。
// 字号如果按格子的固定比例写死，长色号会明显溢出格子、压到隔壁 —— 那就是「分不清哪块是哪个色号」。
// 所以字号必须按**实际文本宽度**回缩，宽不下时优先折行（`AB-12345` 这种长色号天生有个断点），
// 而不是让字溢出去。

/** 色号文字左右各留白的比例：留一点呼吸位，字才不会顶到格线、看不出归属 */
const CODE_TEXT_PADDING = 0.08
/** 色号字号上限占格子高度的比例（与旧版一致：短色号观感不变） */
const CODE_FONT_RATIO = 0.32
/** 色号字号下限：按这个上限算出来还放不下，就折行或干脆不画 */
const CODE_FONT_MIN = 7
/** 行距倍数：两行文字的高度约束按这个系数换算 */
const CODE_LINE_HEIGHT = 1.15
/** 会绘制色号的最小格子（旧版写死的阈值） */
export const MIN_CELL_FOR_CODES = 24

/** 图案里最长的色号长度（决定最小可读格子与排版策略） */
export function maxCodeLength(pattern: string[][]): number {
  let max = 0
  for (const row of pattern || []) {
    for (const code of row) {
      if (code && code !== 'TRANSPARENT' && code.length > max) max = code.length
    }
  }
  return max
}

/**
 * 色号能排到「不过度牺牲可读性」所需的最小格子宽度。
 *
 * 原来的阈值 24px 是按 `A1`（2~3 字符）定的；8 字符长色号靠折行也要更大的格子才读得清，
 * 否则大图纸会把格子压到二十几像素、色号被整片省略 —— 那等于白导。
 */
export function minCellForCode(maxLen: number, idealCell = 48): number {
  if (maxLen <= 3) return MIN_CELL_FOR_CODES
  // 长色号靠折行排版，每行约一半字符；按 3 字符/24px 的比例线性放大并封顶到理想格
  return Math.min(idealCell, Math.round((MIN_CELL_FOR_CODES * maxLen) / 3))
}

/**
 * 各珠子样式下文字实际能用的区域（占格子的比例）。
 *
 * 圆珠 / 中空珠是圆的：文字虽然落在方格内，却会戳出圆外压到纸色上。
 * 圆的**内接正方形边长 ≈ 0.707 × 直径**，所以圆形样式要把可用区收窄。
 */
function usableRatio(style: BeadStyle) {
  return style === 'grid-round' || style === 'grid-hollow-round'
    ? { w: 0.68, h: 0.68 }
    : { w: 1 - CODE_TEXT_PADDING * 2, h: 0.94 }
}

/** 单行文本宽度：优先 measureText 实测（不同字体字宽比例不同，靠 0.6em 估算会偏） */
function textWidth(ctx: CanvasRenderingContext2D, text: string, font: number): number {
  if (typeof ctx.measureText === 'function') {
    const w = ctx.measureText(text)?.width
    if (Number.isFinite(w) && w > 0) return w
  }
  return text.length * font * 0.6
}

/**
 * 把色号切成两行。优先在分隔符处断（`AB-12345` → `['AB-', '12345']`），
 * 这是分段式色号（如 `AB-12345`）的天然断点；没有分隔符就从中间切开。
 * 切出来某一半只剩一两个字符时就不切了（那还不如一行硬缩）。
 */
function splitCode(code: string): [string, string] | null {
  if (code.length < 4) return null
  for (const sep of ['-', '_', ' ']) {
    const i = code.indexOf(sep)
    if (i >= 1 && i <= code.length - 3) return [code.slice(0, i + 1), code.slice(i + 1)]
  }
  const mid = Math.ceil(code.length / 2)
  if (mid < 2 || code.length - mid < 2) return null
  return [code.slice(0, mid), code.slice(mid)]
}

/**
 * 给一个色号定排版：返回实际字号与行内容；放不下就返回 null（调用方跳过不画）。
 *
 * 策略从优到劣：
 *   1. 一行放得下 → 用最大字号（短色号走这条，与旧版完全一致）；
 *   2. 放不下但格子够高 → 折两行，字号通常能大一倍以上，这是长色号的主路径；
 *   3. 还是放不下 → 缩到最小可读字号硬排一行；
 *   4. 连最小字号都放不下 → 不画。宁可留白，也不要一个糊成一团、还压到隔壁格子的色号。
 *
 * 注意：返回的 font **不会**帮你写回 ctx.font（内部最后一次设置的是测量用字号），
 * 调用方必须显式 `ctx.font = ...` 后再画。
 */
function layoutCode(
  ctx: CanvasRenderingContext2D,
  code: string,
  cellSize: number,
  ratio: { w: number; h: number }
): { lines: string[]; font: number } | null {
  const maxFont = Math.max(CODE_FONT_MIN, Math.floor(cellSize * CODE_FONT_RATIO))
  const availW = cellSize * ratio.w

  const measure = (text: string, font: number) => {
    ctx.font = `bold ${font}px monospace`
    return textWidth(ctx, text, font)
  }

  // 1) 一行放得下
  if (measure(code, maxFont) <= availW) return { lines: [code], font: maxFont }

  // 2) 折两行（「AB-12345」这类长色号的主路径）
  if (cellSize >= MIN_CELL_FOR_CODES) {
    const parts = splitCode(code)
    if (parts) {
      const longest = parts[0].length >= parts[1].length ? parts[0] : parts[1]
      // 字号上限取两个约束的较小者：两行总高塞得进格子、且不超过原上限的 0.9 倍
      const maxByHeight = Math.floor((cellSize * ratio.h) / (CODE_LINE_HEIGHT * 2))
      let font = Math.min(Math.floor(maxFont * 0.9), maxByHeight)
      if (font >= CODE_FONT_MIN) {
        // 再按最长那行的实际宽度回缩。这里必须「回缩」而不是「一试就放弃」——
        // 否则格子一大反而会因为 0.9 倍字号刚好宽出零点几像素，退化成一行小字。
        const w = measure(longest, font)
        if (w > availW) font = Math.floor((font * availW) / w)
      }
      if (font >= CODE_FONT_MIN) return { lines: parts, font }
    }
  }

  // 3) 一行硬缩到最小可读字号
  const need = measure(code, maxFont)
  const shrunk = Math.floor((maxFont * availW) / need)
  if (shrunk >= CODE_FONT_MIN) return { lines: [code], font: shrunk }

  // 4) 太小了，画上去只是灰块 —— 不画
  return null
}

/**
 * 导出时格子大小的决策：
 *   1) 优先理想格（默认 48px，色号清晰）；
 *   2) 超过画布软上限时按上限回缩；
 *   3) 回缩后色号读不清（低于该色号长度需要的格子）时，在**硬上限内**再放一次；
 *   4) 硬上限也放不下，就取上限允许值，绘制层会自动省略色号。
 *
 * 第 3 步是为长色号准备的：`AB-12345` 这种 8 字符色号要 48px 才排得开，
 * 只按 4500 软上限缩会把它压到二十几像素、色号被整片省略 —— 那等于白导一张图纸。
 */
export function calcExportCellSize(
  rows: number,
  cols: number,
  maxLen: number,
  options: { idealCell?: number; softCap?: number; hardCap?: number; minFloor?: number } = {}
): number {
  const idealCell = options.idealCell ?? 48
  const softCap = options.softCap ?? 4500
  const hardCap = options.hardCap ?? 8192
  const minFloor = options.minFloor ?? 4
  const maxDim = Math.max(1, Math.max(rows, cols))
  const minCell = minCellForCode(maxLen, idealCell)
  const cap = Math.floor(softCap / maxDim)
  const cell = cap < idealCell ? Math.max(minFloor, cap) : idealCell
  if (cell >= minCell) return cell
  return Math.max(minFloor, Math.min(minCell, Math.floor(hardCap / maxDim)))
}

/**
 * 统计区卡片里的色号字号：按可用宽度回缩。
 *
 * 卡片宽度是算出来的（≥84px），短色号 14px 正好；8 字符色号在 14px 下约 67px，
 * 卡住还好，再长就会压到相邻卡片上。
 */
export function fitTextFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxFont: number,
  availW: number
): number {
  ctx.font = `bold ${maxFont}px monospace`
  const w = textWidth(ctx, text, maxFont)
  if (w <= availW) return maxFont
  return Math.max(9, Math.floor((maxFont * availW) / w))
}

export function createBeadCanvas(
  pattern: string[][],
  palette: BeadColor[],
  cellSize: number = 20,
  style: BeadStyle = 'grid-square',
  showCodes: boolean = false,
  /** 导出模式：整数像素对齐绘制，消除半像素抗锯齿造成的模糊 */
  crisp: boolean = false
): HTMLCanvasElement {
  const rows = pattern.length
  const cols = pattern[0].length
  const canvas = document.createElement('canvas')
  canvas.width = cols * cellSize
  canvas.height = rows * cellSize
  const ctx = canvas.getContext('2d')!

  // Pre-build a color lookup map for O(1) per-cell access
  const colorMap = new Map(palette.map(c => [c.code, c]))

  // 珠缝与格线按当前格子尺寸算一次（整帧共用）。
  // 本项目 2D 画布是 1:1 像素绘制，所以像素比传 1。
  const { gap, cellLineWidth } = calcBeadLineMetrics(cellSize, 1)

  // Draw background grid
  ctx.fillStyle = '#F0F0F0'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const colorCode = pattern[y][x]
      // 透明留白格子：不生成珠子，仅保留网格底色
      if (colorCode === 'TRANSPARENT') continue
      const color = colorMap.get(colorCode)
      const hexColor = color ? color.hex : '#FFFFFF'
      const px = x * cellSize
      const py = y * cellSize
      // At tiny cell sizes (large grids zoomed out) the gap would swallow the
      // whole cell, so drop the margin below 4px.
      // 缝隙**按格子等比缩放**（见 utils/bead-canvas.ts）：写死像素的话，格子越小它占的比例越大，
      // 表现就是「越缩小，格子之间的线越显眼」。
      // Crisp 模式（导出）例外：它要保持整数像素边界、消除半像素模糊，所以缝仍是 1px 整数。
      const margin = crisp ? (cellSize >= BEAD_GAP_MIN_CELL ? BEAD_CRISP_GAP : 0) : gap

      if (style === 'grid-round') {
        // Grid round bead: circle with grid gaps
        const radius = cellSize / 2 - margin
        ctx.beginPath()
        ctx.arc(px + cellSize / 2, py + cellSize / 2, radius, 0, Math.PI * 2)
        ctx.fillStyle = hexColor
        ctx.fill()
        // Subtle highlight (per-cell: gradients are anchored in canvas coordinates)
        // 小格子（<10px）下高光属于亚像素细节，肉眼不可见，跳过可大幅降低渲染耗时
        if (cellSize >= 10) {
          const gradient = ctx.createRadialGradient(
            px + cellSize / 3, py + cellSize / 3, 0,
            px + cellSize / 2, py + cellSize / 2, radius
          )
          gradient.addColorStop(0, 'rgba(255,255,255,0.3)')
          gradient.addColorStop(0.5, 'rgba(255,255,255,0.05)')
          gradient.addColorStop(1, 'rgba(0,0,0,0.1)')
          ctx.fillStyle = gradient
          ctx.fill()
        }
      } else if (style === 'grid-hollow-round') {
        // Grid hollow round bead: donut shape showing grid through center
        const outerRadius = cellSize / 2 - margin
        const innerRadius = cellSize / 4

        // Draw outer ring
        ctx.beginPath()
        ctx.arc(px + cellSize / 2, py + cellSize / 2, outerRadius, 0, Math.PI * 2)
        ctx.fillStyle = hexColor
        ctx.fill()

        // Cut out the center hole — 用纸色填充，预览与导出一致，任何查看器都不会发黑
        ctx.beginPath()
        ctx.arc(px + cellSize / 2, py + cellSize / 2, innerRadius, 0, Math.PI * 2)
        ctx.fillStyle = '#F0F0F0'
        ctx.fill()

        // Draw inner ring border
        ctx.beginPath()
        ctx.arc(px + cellSize / 2, py + cellSize / 2, innerRadius, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(0,0,0,0.15)'
        ctx.lineWidth = 0.5
        ctx.stroke()

        // Subtle highlight on outer ring (per-cell: gradients are canvas-anchored)
        // 小格子（<10px）下跳过高光，降低渲染耗时
        if (cellSize >= 10) {
          const gradient = ctx.createRadialGradient(
            px + cellSize / 3, py + cellSize / 3, 0,
            px + cellSize / 2, py + cellSize / 2, outerRadius
          )
          gradient.addColorStop(0, 'rgba(255,255,255,0.2)')
          gradient.addColorStop(0.7, 'rgba(255,255,255,0.05)')
          gradient.addColorStop(1, 'rgba(0,0,0,0.1)')
          ctx.fillStyle = gradient
          // Create a donut clip path and fill the ring with the gradient
          ctx.save()
          ctx.beginPath()
          ctx.arc(px + cellSize / 2, py + cellSize / 2, outerRadius, 0, Math.PI * 2)
          ctx.arc(px + cellSize / 2, py + cellSize / 2, innerRadius, 0, Math.PI * 2, true)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        }

        // Outer border
        ctx.beginPath()
        ctx.arc(px + cellSize / 2, py + cellSize / 2, outerRadius, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      } else {
        // Grid square bead: solid fill with grid lines
        ctx.fillStyle = hexColor
        ctx.fillRect(px + margin, py + margin, cellSize - margin * 2, cellSize - margin * 2)
        // Grid lines (crisp mode draws 1px lines via fillRect, avoiding antialiasing)
        const lineColor = 'rgba(0,0,0,0.12)'
        if (crisp) {
          const w = cellSize - margin * 2
          ctx.fillStyle = lineColor
          ctx.fillRect(px + margin, py + margin, w, 1)
          ctx.fillRect(px + margin, py + cellSize - margin - 1, w, 1)
          ctx.fillRect(px + margin, py + margin, 1, cellSize - margin * 2)
          ctx.fillRect(px + cellSize - margin - 1, py + margin, 1, cellSize - margin * 2)
        } else {
          ctx.strokeStyle = lineColor
          ctx.lineWidth = cellLineWidth
          ctx.strokeRect(px + margin, py + margin, cellSize - margin * 2, cellSize - margin * 2)
        }
      }

      // Render color code text when cell is large enough
      // 色号按实际文本宽度排版：长色号折行，实在放不下才省略（见 layoutCode）
      if (showCodes && colorCode && cellSize >= MIN_CELL_FOR_CODES) {
        // 中空珠中心为浅灰纸色，色号统一用黑色保证清晰
        const textColor = style === 'grid-hollow-round' ? '#000000' : getTextColorForBg(hexColor)
        ctx.fillStyle = textColor
        const laid = layoutCode(ctx, colorCode, cellSize, usableRatio(style))
        if (laid) {
          // 字号必须在这里显式写回：layoutCode 只负责「算」，它内部最后一次设置的是
          // **测量用的字号**，不一定是最终选定的那个（一旦发生回缩就会不一致）。
          ctx.font = `bold ${laid.font}px monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const cx = px + cellSize / 2
          const lineH = laid.font * CODE_LINE_HEIGHT
          const startY = py + cellSize / 2 - ((laid.lines.length - 1) * lineH) / 2
          // 中空珠：文字跨环与孔，加描边保证两种背景下都可读
          if (style === 'grid-hollow-round') {
            ctx.lineWidth = 3
            ctx.lineJoin = 'round'
            ctx.strokeStyle = textColor === '#FFFFFF' ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)'
            for (let i = 0; i < laid.lines.length; i++) {
              ctx.strokeText(laid.lines[i], cx, startY + i * lineH)
            }
          }
          for (let i = 0; i < laid.lines.length; i++) {
            ctx.fillText(laid.lines[i], cx, startY + i * lineH)
          }
        }
      }
    }
  }

  return canvas
}

/**
 * Get the color code at a specific canvas coordinate.
 * Returns the color code (e.g., 'RED') or null if out of bounds.
 */
export function getColorAtCoordinate(
  pattern: string[][],
  canvasX: number,
  canvasY: number,
  cellSize: number
): string | null {
  const cols = pattern[0].length
  const rows = pattern.length
  const gridX = Math.floor(canvasX / cellSize)
  const gridY = Math.floor(canvasY / cellSize)

  if (gridX < 0 || gridX >= cols || gridY < 0 || gridY >= rows) {
    return null
  }

  return pattern[gridY][gridX]
}
