// 图纸参数：把 PATTERN_STYLES 里的预设「摊平成一组可编辑的字段」。
//
// 预设仍然决定默认值（切风格 = 载入那一档的参数），但用户可以逐项改；
// 改过的项数用 paramDiffCount 统计，页面据此显示「自定义 N 项」。
import {
  PATTERN_STYLES,
  type DistanceAlgorithm,
  type PatternStyleKey,
  type SamplingMode
} from './bead-algorithm'

export interface PatternParams {
  /** 降采样方式：一格压多种源色时怎么定色 */
  sampling: SamplingMode
  /** 格内像素聚类的距离算法（影响"归哪个颜色区域"） */
  algorithm: DistanceAlgorithm
  /** 挑色号时用的距离算法（CIEDE2000 更贴近人眼） */
  matchAlgorithm: DistanceAlgorithm
  /** 线稿分层：深色高对比像素整格落线稿色 */
  lineArt: boolean
  /** 降噪强度 0~3（0 = 不降噪） */
  denoiseLevel: number
  /** 降噪闸门（ΔE76） */
  denoiseMaxDeltaE: number
  /** 空间连通合并（0 = 关闭） */
  regionMergeDeltaE: number
  /** 全局色号合并（0 = 关闭） */
  mergeDeltaE: number
  /** 色号数上限（0 = 不限） */
  maxColors: number
  /** 斜线补充判据 */
  diagonalLine: boolean
  /** 轮廓还原 */
  outlineRestore: boolean
  /** 小特征（眼睛/鼻子）回贴 */
  featureRestamp: boolean
  /** 暗点清理：并入面积 ≤ 该值（格）的真黑小块（0 = 关闭） */
  darkSpotCells: number
  /** 误差扩散抖动强度 0~1 */
  dither: number
  /** 抖动色号池上限（0 = 全色板） */
  ditherCap: number
  /** 参与抖动的局部梯度区间（ΔE76） */
  ditherGate: [number, number]
}

export const PARAM_KEYS = [
  'sampling',
  'algorithm',
  'matchAlgorithm',
  'lineArt',
  'denoiseLevel',
  'denoiseMaxDeltaE',
  'regionMergeDeltaE',
  'mergeDeltaE',
  'maxColors',
  'diagonalLine',
  'outlineRestore',
  'featureRestamp',
  'darkSpotCells',
  'dither',
  'ditherCap',
  'ditherGate'
] as const

/**
 * 预设没写的字段用这里的默认值。
 * 关键：所有「0 = 关闭」的项，缺省必须是 0 —— 预设里没写 `mergeDeltaE`（如 detail/photo）
 * 在转换时就是**不合并**，兜底若给个 16 会把不合并的档悄悄合并掉。
 */
const FALLBACK: PatternParams = {
  sampling: 'weighted',
  algorithm: 'lab',
  matchAlgorithm: 'ciede2000',
  lineArt: true,
  denoiseLevel: 1,
  denoiseMaxDeltaE: 24,
  regionMergeDeltaE: 0,
  mergeDeltaE: 0,
  maxColors: 0,
  diagonalLine: true,
  outlineRestore: false,
  featureRestamp: false,
  darkSpotCells: 0,
  dither: 0,
  ditherCap: 0,
  ditherGate: [6, 25]
}

/** 把某个预设摊平成完整的一组参数（缺省项补默认值） */
export function paramsFromStyle(key: PatternStyleKey | string): PatternParams {
  const preset = (PATTERN_STYLES as Record<string, Partial<PatternParams> | undefined>)[key]
  if (!preset) return { ...FALLBACK }
  const merged: PatternParams = {
    ...FALLBACK,
    ...(preset as Partial<PatternParams>),
    // 预设里写的是同一个算法时，匹配判据跟随它
    matchAlgorithm: preset.matchAlgorithm ?? preset.algorithm ?? FALLBACK.matchAlgorithm,
    ditherGate: (preset.ditherGate as [number, number] | undefined) ?? FALLBACK.ditherGate
  }
  return merged
}

/** 与预设相比改了几项（0 = 还是预设原样） */
export function paramDiffCount(params: PatternParams, key: PatternStyleKey | string): number {
  const base = paramsFromStyle(key)
  let n = 0
  for (const k of PARAM_KEYS) {
    const a = params[k]
    const b = base[k]
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) n++
    } else if (a !== b) {
      n++
    }
  }
  return n
}

/** 参数 → 转换函数入参（键名与 ImageConvertOptions 一一对应） */
export function toConvertOptions(params: PatternParams) {
  return { ...params, ditherGate: [...params.ditherGate] as [number, number] }
}
