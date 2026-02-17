import { useEffect } from 'react'
import type { SearchableSelectOption } from '../common/SearchableSelect'

function pickNextIndex(
  currentIndex: number,
  total: number,
  autoIndex: number,
): number {
  if (total <= 1) return 0
  if (currentIndex < 0) {
    return autoIndex >= 0 && autoIndex < total - 1 ? autoIndex + 1 : 0
  }
  if (currentIndex >= total - 1) {
    // Align xcc behavior: next from last wraps to first palette entry, not "auto".
    if (autoIndex === 0 && total > 1) return 1
    return 0
  }
  return currentIndex + 1
}

function pickPrevIndex(
  currentIndex: number,
  autoIndex: number,
): number {
  // Align xcc behavior: previous from "auto" stays at "auto".
  if (currentIndex <= 0 && autoIndex === 0) return 0
  if (currentIndex <= 0) return 0
  return currentIndex - 1
}

export function usePaletteHotkeys(
  options: SearchableSelectOption[],
  currentValue: string,
  onChange: (value: string) => void,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled || options.length === 0) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.altKey) return

      const code = event.code
      const key = event.key
      const isPrev = code === 'BracketLeft' || key === '['
      const isNext = code === 'BracketRight' || key === ']'
      if (!isPrev && !isNext) return

      event.preventDefault()

      const values = options.map((opt) => opt.value)
      const total = values.length
      const autoIndex = values.indexOf('')
      const currentIndex = values.indexOf(currentValue)

      const nextIndex = isPrev
        ? pickPrevIndex(currentIndex, autoIndex)
        : pickNextIndex(currentIndex, total, autoIndex)

      const nextValue = values[nextIndex]
      if (nextValue !== undefined && nextValue !== currentValue) {
        onChange(nextValue)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, options, currentValue, onChange])
}

