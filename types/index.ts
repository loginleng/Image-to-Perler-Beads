// ==================== 色板 ====================
export interface BeadColor {
  id: string
  code: string
  name: string
  hex: string
  r: number
  g: number
  b: number
  /** 单价（占位字段）：示例色板一律为 null，接入自己的色板时可按需填写 */
  price: number | null
}

export interface PaletteVariant {
  id: string
  label: string
  colorCount: number
  /** 可选：显式色号列表，存在时按此列表过滤颜色（优先于 colorCount 截取） */
  codes?: string[]
}

export interface Palette {
  id: string
  name: string
  brand: string
  colors: BeadColor[]
  variants?: PaletteVariant[]
}
