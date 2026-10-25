/**
 * 弹窗 / 全屏层滚动锁定（scroll lock）。
 *
 * 传入一个或多个布尔响应源，任一为 true 时锁定整页滚动，
 * 全部为 false 时才恢复滚动——解决移动端弹窗内部滚动"穿透"到整页的问题。
 *
 * 特性：
 * - 支持同一组件多个弹窗（数组形式），也支持不同组件同时持锁；
 * - 使用全局计数，只有所有持锁方都释放后才恢复页面滚动；
 * - 恢复时还原元素原本的内联 overflow / padding，不污染样式；
 * - 组件卸载时自动释放其持有的锁，避免页面被永久锁死。
 *
 * 用法：
 *   useScrollLock(showModal)
 *   useScrollLock([showCropModal, showSaveModal, saveSuccess])
 */
import { watch, onUnmounted, toValue, type WatchSource } from 'vue'

// 全局持锁计数与锁定状态：跨组件叠加时，只有最后一个释放才解锁
let globalLockCount = 0
let isBodyLocked = false
const saved = {
  htmlOverflow: '',
  bodyOverflow: '',
  bodyPaddingRight: '',
}

function applyBodyLock(locked: boolean) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  const body = document.body
  if (locked && !isBodyLocked) {
    isBodyLocked = true
    saved.htmlOverflow = html.style.overflow
    saved.bodyOverflow = body.style.overflow
    saved.bodyPaddingRight = body.style.paddingRight
    const scrollbarWidth = window.innerWidth - html.clientWidth
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    // 锁定后滚动条消失会使内容横向位移（桌面端约 15px），
    // 用 padding-right 补偿，避免 fixed 弹窗居中位置跳动
    if (scrollbarWidth > 0) body.style.paddingRight = scrollbarWidth + 'px'
  } else if (!locked && isBodyLocked) {
    isBodyLocked = false
    html.style.overflow = saved.htmlOverflow
    body.style.overflow = saved.bodyOverflow
    body.style.paddingRight = saved.bodyPaddingRight
  }
}

export function useScrollLock(sources: WatchSource<boolean> | WatchSource<boolean>[]) {
  const list = Array.isArray(sources) ? sources : [sources]
  let holdsLock = false

  const sync = () => {
    if (typeof document === 'undefined') return
    const shouldLock = list.some((s) => toValue(s))
    if (shouldLock && !holdsLock) {
      holdsLock = true
      globalLockCount++
      applyBodyLock(true)
    } else if (!shouldLock && holdsLock) {
      holdsLock = false
      globalLockCount = Math.max(0, globalLockCount - 1)
      if (globalLockCount === 0) applyBodyLock(false)
    }
  }

  watch(list, sync, { immediate: true })

  onUnmounted(() => {
    if (!holdsLock) return
    holdsLock = false
    globalLockCount = Math.max(0, globalLockCount - 1)
    if (globalLockCount === 0) applyBodyLock(false)
  })
}
