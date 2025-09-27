import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import { ShpFile } from '../../data/ShpFile'

type MixFileData = { file: File; info: MixFileInfo }

type Rgb = { r: number; g: number; b: number }

function parseJascPal(text: string): Rgb[] | null {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 4) return null
  if (!lines[0].startsWith('JASC-PAL')) return null
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
  const candidates: Uint8Array[] = []
  if (bytes.length >= 768) {
    candidates.push(bytes.subarray(0, 768))
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

function buildGrayscalePalette(): Rgb[] {
  const colors: Rgb[] = []
  for (let i = 0; i < 256; i++) colors.push({ r: i, g: i, b: i })
  return colors
}

function rgbaFromIndexed(indexData: Uint8Array, width: number, height: number, palette: Rgb[], transparentIndex: number = 0): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let i = 0, p = 0; i < indexData.length && p < rgba.length; i++, p += 4) {
    const idx = indexData[i] | 0
    const c = palette[idx] || { r: 0, g: 0, b: 0 }
    rgba[p] = c.r
    rgba[p + 1] = c.g
    rgba[p + 2] = c.b
    rgba[p + 3] = idx === transparentIndex ? 0 : 255
  }
  return rgba
}

const builtinPaletteGuesses = [
  'unittem.pal', 'uniturb.pal', 'unitdes.pal', 'unitlun.pal',
  'isotem.pal', 'isourb.pal', 'isodes.pal', 'isomoon.pal',
]

const ShpViewer: React.FC<{ selectedFile: string; mixFiles: MixFileData[] }> = ({ selectedFile, mixFiles }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<{ w: number; h: number; frames: number } | null>(null)
  const [frame, setFrame] = useState(0)
  const [palettePath, setPalettePath] = useState<string | null>(null)
  const [paletteList, setPaletteList] = useState<string[]>([])

  const discoverPalettes = useMemo(() => {
    const list: string[] = []
    for (const mix of mixFiles) {
      for (const f of mix.info.files) {
        if (f.extension === 'pal') {
          list.push(`${mix.info.name}/${f.filename}`)
        }
      }
    }
    // prioritize guesses
    list.sort((a, b) => {
      const an = a.split('/').pop() || ''
      const bn = b.split('/').pop() || ''
      const ai = Math.min(...builtinPaletteGuesses.map((n, i) => (n.toLowerCase() === an.toLowerCase() ? i : 9999)))
      const bi = Math.min(...builtinPaletteGuesses.map((n, i) => (n.toLowerCase() === bn.toLowerCase() ? i : 9999)))
      return ai - bi
    })
    return list
  }, [mixFiles])

  useEffect(() => {
    setPaletteList(discoverPalettes)
  }, [discoverPalettes])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setInfo(null)
      try {
        const slash = selectedFile.indexOf('/')
        if (slash <= 0) throw new Error('Invalid path')
        const mixName = selectedFile.substring(0, slash)
        const inner = selectedFile.substring(slash + 1)
        const mix = mixFiles.find(m => m.info.name === mixName)
        if (!mix) throw new Error('MIX not found')

        const vf = await MixParser.extractFile(mix.file, inner)
        if (!vf) throw new Error('File not found in MIX')
        const shp = ShpFile.fromVirtualFile(vf)
        if (!shp || shp.numImages <= 0) throw new Error('Failed to parse SHP')

        // Load palette or fallback to grayscale when none selected
        let palette: Rgb[] | null = null
        if (palettePath) {
          const ps = palettePath.indexOf('/')
          if (ps <= 0) throw new Error('Invalid palette path')
          const pmixName = palettePath.substring(0, ps)
          const pinner = palettePath.substring(ps + 1)
          const pmix = mixFiles.find(m => m.info.name === pmixName)
          if (!pmix) throw new Error('Palette MIX not found')
          const pvf = await MixParser.extractFile(pmix.file, pinner)
          if (!pvf) throw new Error('Palette file not found')

          const palText = pvf.readAsString()
          palette = parseJascPal(palText)
          if (!palette) palette = parseBinaryPal(pvf.getBytes())
          if (!palette) throw new Error('Unsupported PAL format')
        } else {
          palette = buildGrayscalePalette()
        }

        const clampedPalette = palette.slice(0, 256)
        while (clampedPalette.length < 256) clampedPalette.push({ r: 0, g: 0, b: 0 })

        if (cancelled) return
        const canvas = canvasRef.current
        if (!canvas) return

        // Choose canvas size: use logical canvas (shp.width/height) and draw frame at offsets
        const useW = Math.max(shp.width, shp.images[frame]?.x + shp.images[frame]?.width)
        const useH = Math.max(shp.height, shp.images[frame]?.y + shp.images[frame]?.height)
        const safeW = Math.max(1, useW | 0)
        const safeH = Math.max(1, useH | 0)
        canvas.width = safeW
        canvas.height = safeH
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Failed to get 2D context')
        ctx.clearRect(0, 0, safeW, safeH)

        const img = shp.getImage(Math.min(frame, shp.numImages - 1))
        const rgba = rgbaFromIndexed(img.imageData, img.width, img.height, clampedPalette, 0)
        const imageData = new ImageData(rgba, img.width, img.height)
        ctx.putImageData(imageData, img.x, img.y)

        setInfo({ w: safeW, h: safeH, frames: shp.numImages })
      } catch (e: any) {
        setError(e?.message || 'Failed to render SHP')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedFile, mixFiles, frame, palettePath])

  const paletteOptions = useMemo(() => [{ value: '', label: '灰度(无调色板)' }, ...paletteList.map(p => ({ value: p, label: p.split('/').pop() || p }))], [paletteList])

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center gap-3">
        <div>帧: 
          <input
            type="number"
            min={0}
            value={frame}
            onChange={e => setFrame(Math.max(0, parseInt(e.target.value || '0', 10) | 0))}
            className="ml-2 w-16 bg-gray-800 border border-gray-700 rounded px-2 py-0.5"
          />
          {info ? <span className="ml-2">/ {info.frames - 1}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <span>调色板:</span>
          <select
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
            value={palettePath ?? ''}
            onChange={e => setPalettePath(e.target.value || null)}
          >
            {paletteOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        {info && (
          <div className="ml-auto">尺寸: {info.w} × {info.h}，帧数: {info.frames}</div>
        )}
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center relative" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #2d2d2d 0, #2d2d2d 12px, #343434 12px, #343434 24px)' }}>
        <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', maxWidth: '100%', maxHeight: '100%' }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-black/20">加载中...</div>
        )}
        {error && !loading && (
          <div className="absolute top-2 left-2 right-2 p-2 text-red-400 text-xs bg-black/40 rounded">{error}</div>
        )}
      </div>
    </div>
  )
}

export default ShpViewer


