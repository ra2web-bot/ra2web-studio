import type { MixFileData, ResolvedSelectedFile } from './types'

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

export function normalizeFilename(pathLike: string): string {
  const slash = pathLike.lastIndexOf('/')
  return slash >= 0 ? pathLike.substring(slash + 1) : pathLike
}

export function normalizeExtension(pathLike: string): string {
  const name = normalizeFilename(pathLike)
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.substring(dot + 1).toLowerCase()
}

export function replaceExtension(pathLike: string, extensionWithoutDot: string): string {
  const slash = pathLike.lastIndexOf('/')
  const dot = pathLike.lastIndexOf('.')
  if (dot <= slash) return `${pathLike}.${extensionWithoutDot}`
  return `${pathLike.substring(0, dot)}.${extensionWithoutDot}`
}

export function splitSelectedFilePath(
  selectedFile: string,
  mixFiles: MixFileData[],
): ResolvedSelectedFile {
  const slash = selectedFile.indexOf('/')
  if (slash <= 0 || slash >= selectedFile.length - 1) {
    throw new Error('当前文件路径无效，无法导出')
  }
  const mixName = selectedFile.substring(0, slash)
  const innerPath = selectedFile.substring(slash + 1)
  const mix = mixFiles.find((item) => item.info.name === mixName)
  if (!mix) {
    throw new Error(`未找到所属 MIX：${mixName}`)
  }
  return {
    selectedFile,
    mixName,
    innerPath,
    filename: normalizeFilename(innerPath),
    extension: normalizeExtension(innerPath),
    mixFile: mix.file,
  }
}

export function bytesToBlob(bytes: Uint8Array, mimeType: string = 'application/octet-stream'): Blob {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return new Blob([copy.buffer], { type: mimeType })
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 3000)
}

export function parseHexColor(color: string): { r: number; g: number; b: number } {
  const hex = color.trim().replace(/^#/, '')
  if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
    }
  }
  if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    }
  }
  return { r: 0, g: 0, b: 0 }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('画布导出失败：浏览器未返回 Blob'))
        return
      }
      resolve(blob)
    }, mimeType, quality)
  })
}

