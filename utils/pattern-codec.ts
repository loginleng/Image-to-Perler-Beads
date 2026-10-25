// 拼豆图案索引编码：将色号 string[][] 压缩为「去重色号表 + base36 索引数组」。
// - TRANSPARENT 保持字面量（服务端定价/前端渲染只判断该特殊值，无需解码即可计数）
// - 色号表 codes 随每面数据保存，解码自包含，不受色板变更影响
// - 无 DOM 依赖，可同时用于客户端（保存编码）与服务端（返回解码）

export const TRANSPARENT = 'TRANSPARENT'

// 编码：色号数组 -> { 索引数组, 去重色号表 }
// 索引按色号首次出现顺序编号（紧凑；数百色的色板也可覆盖）
export function encodePattern(pattern: string[][]): { pattern: string[][]; codes: string[] } {
  const codes: string[] = []
  const indexByCode = new Map<string, number>()

  const encoded: string[][] = []
  for (const row of pattern) {
    const outRow: string[] = []
    for (const cell of row) {
      if (cell === TRANSPARENT || !cell) {
        outRow.push(TRANSPARENT)
        continue
      }
      let idx = indexByCode.get(cell)
      if (idx === undefined) {
        idx = codes.length
        indexByCode.set(cell, idx)
        codes.push(cell)
      }
      outRow.push(idx.toString(36))
    }
    encoded.push(outRow)
  }

  return { pattern: encoded, codes }
}

// 解码：索引数组 + 色号表 -> 色号数组
export function decodePattern(pattern: string[][], codes: string[]): string[][] {
  return pattern.map((row) =>
    row.map((cell) => {
      if (cell === TRANSPARENT || !cell) return TRANSPARENT
      const idx = parseInt(cell, 36)
      if (Number.isFinite(idx) && idx >= 0 && idx < codes.length) return codes[idx]
      // 非法索引（不应发生），保守回退为原始值
      return cell
    })
  )
}

// 对项目 data 做原地解码（FLAT 的 data.pattern + 3D 的 data.faces[].pattern），
// 解码后移除 codes 字段，减小传输体积。无 codes 的旧数据视为已解码，原样跳过。
export function decodeProjectData(data: Record<string, any> | null | undefined): void {
  if (!data || typeof data !== 'object') return

  if (Array.isArray(data.pattern) && Array.isArray(data.codes) && data.codes.length > 0) {
    data.pattern = decodePattern(data.pattern, data.codes)
    delete data.codes
  }

  if (data.faces && typeof data.faces === 'object') {
    for (const key of Object.keys(data.faces)) {
      const f = data.faces[key]
      if (f && Array.isArray(f.pattern) && Array.isArray(f.codes) && f.codes.length > 0) {
        f.pattern = decodePattern(f.pattern, f.codes)
        delete f.codes
      }
    }
  }
}
