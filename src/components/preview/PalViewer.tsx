import React, { useEffect, useMemo, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'

type MixFileData = { file: File; info: MixFileInfo }

type Rgb = { r: number; g: number; b: number }

function parseJascPal(text: string): Rgb[] | null {
  // JASC-PAL\n0100\n256\nR G B\n...
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 4) return null
  if (!lines[0].startsWith('JASC-PAL')) return null
  // lines[1] = version, lines[2] = count
  const count = parseInt(lines[2] || '0', 10)
  const result: Rgb[] = []
  for (let i = 3; i < lines.length && result.length < count; i++) {
    const parts = lines[i].split(/\s+/).map(n => parseInt(n, 10))
    if (parts.length >= 3 && parts.every(v => Number.isFinite(v))) {
      result.push({ r: parts[0], g: parts[1], b: parts[2] })
    }
  }
  return result.length ? result : null
}

function parseBinaryPal(bytes: Uint8Array): Rgb[] | null {
  // 常见为 256*3 字节；有些 6-bit 需放大到 8-bit
  const candidates: Uint8Array[] = []
  if (bytes.length >= 768) {
    // 试前 768
    candidates.push(bytes.subarray(0, 768))
    // 也试末尾 768（某些容器可能前部有头）
    candidates.push(bytes.subarray(bytes.length - 768))
  } else if (bytes.length % 3 === 0 && bytes.length >= 3) {
    candidates.push(bytes)
  }
  for (const buf of candidates) {
    const colors: Rgb[] = []
    let maxComp = 0
    for (let i = 0; i + 2 < buf.length; i += 3) {
      const r = buf[i]
      const g = buf[i + 1]
      const b = buf[i + 2]
      maxComp = Math.max(maxComp, r, g, b)
      colors.push({ r, g, b })
    }
    if (colors.length >= 16) {
      // 检测 6-bit 调色板（0..63），放大到 0..255
      const scale = maxComp <= 63 ? 4 : 1
      if (scale !== 1) {
        for (const c of colors) {
          c.r = Math.min(255, c.r * scale)
          c.g = Math.min(255, c.g * scale)
          c.b = Math.min(255, c.b * scale)
        }
      }
      return colors
    }
  }
  return null
}

const PalViewer: React.FC<{ selectedFile: string; mixFiles: MixFileData[] }> = ({ selectedFile, mixFiles }) => {
  const [colors, setColors] = useState<Rgb[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setColors(null)
      try {
        const slash = selectedFile.indexOf('/')
        if (slash <= 0) throw new Error('Invalid path')
        const mixName = selectedFile.substring(0, slash)
        const inner = selectedFile.substring(slash + 1)
        const mix = mixFiles.find(m => m.info.name === mixName)
        if (!mix) throw new Error('MIX not found')
        const vf = await MixParser.extractFile(mix.file, inner)
        if (!vf) throw new Error('File not found in MIX')

        // 尝试 JASC 文本
        const text = vf.readAsString()
        let palette = parseJascPal(text)
        if (!palette) {
          // 二进制
          const bytes = vf.getBytes()
          palette = parseBinaryPal(bytes)
        }
        if (!palette) throw new Error('Unsupported PAL format')
        if (!cancelled) setColors(palette)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load PAL')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedFile, mixFiles])

  const count = colors?.length ?? 0
  const cells = useMemo(() => {
    if (!colors) return []
    const limit = Math.min(colors.length, 256)
    return colors.slice(0, limit)
  }, [colors])

  if (loading) return <div className="h-full w-full flex items-center justify-center text-gray-400">加载中...</div>
  if (error) return <div className="p-3 text-red-400 text-sm">{error}</div>
  if (!colors) return null

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="px-4 py-2 border-b border-gray-700 text-xs text-gray-400">
        调色板颜色数: {count}（显示最多 256）
      </div>
      <div className="p-2">
        <div className="grid grid-cols-16 gap-1">
          {cells.map((c, i) => (
            <div
              key={i}
              className="w-6 h-6 border border-gray-700"
              title={`#${i} rgb(${c.r}, ${c.g}, ${c.b})`}
              style={{ backgroundColor: `rgb(${c.r}, ${c.g}, ${c.b})` }}
              onClick={() => navigator.clipboard.writeText(`#${i} rgb(${c.r}, ${c.g}, ${c.b})`)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default PalViewer


