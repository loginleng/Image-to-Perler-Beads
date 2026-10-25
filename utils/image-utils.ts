// 图片与 ImageData 互转工具（用于保存/恢复编辑工作图）

// ImageData → 压缩后的 base64 DataURL（WebP）。maxSide 限制最长边，保证体积可控。
export function imageDataToDataUrl(imageData: ImageData, maxSide = 512, quality = 0.9): Promise<string> {
  return new Promise((resolve) => {
    const scale = Math.min(1, maxSide / Math.max(imageData.width, imageData.height))
    const w = Math.max(1, Math.round(imageData.width * scale))
    const h = Math.max(1, Math.round(imageData.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    if (scale >= 1) {
      ctx.putImageData(imageData, 0, 0)
    } else {
      // 先写入原始尺寸画布，再整体缩放到目标尺寸
      const temp = document.createElement('canvas')
      temp.width = imageData.width
      temp.height = imageData.height
      temp.getContext('2d')!.putImageData(imageData, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(temp, 0, 0, w, h)
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve('')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    }, 'image/webp', quality)
  })
}

// base64 DataURL → ImageData（用于编辑时恢复工作图）
export function dataUrlToImageData(dataUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height))
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

// sourceImage 兼容加载：base64 DataURL 与 http(s) URL 均可。
// 旧项目 data.sourceImage 是 base64；R2 方案后存公开 URL。跨域图片需对象存储允许 CORS。
export async function loadSourceImage(src: string): Promise<ImageData> {
  if (!src) throw new Error('Empty source image')
  if (src.startsWith('data:')) {
    return dataUrlToImageData(src)
  }
  const res = await fetch(src)
  if (!res.ok) throw new Error(`Failed to fetch source image: ${res.status}`)
  const blob = await res.blob()
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
  return dataUrlToImageData(dataUrl)
}
