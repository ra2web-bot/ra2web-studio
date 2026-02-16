import React, { useEffect, useRef, useState } from 'react'
// 2D frame sampling view (no WebGL)
import { MixParser, MixFileInfo } from '../../services/MixParser'
import { VxlFile } from '../../data/VxlFile'
import { PaletteParser } from '../../services/palette/PaletteParser'
import { PaletteResolver } from '../../services/palette/PaletteResolver'
import { loadPaletteByPath } from '../../services/palette/PaletteLoader'
import type { PaletteSelectionInfo, Rgb } from '../../services/palette/PaletteTypes'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'

type MixFileData = { file: File; info: MixFileInfo }

function toBytePalette(palette: Rgb[]): Uint8Array {
  return PaletteParser.toBytePalette(PaletteParser.ensurePalette256(palette))
}

function colorFromPalette(palette: Uint8Array, index: number): [number, number, number] {
  const i = Math.max(0, Math.min(255, index | 0)) * 3
  return [palette[i], palette[i + 1], palette[i + 2]]
}

const VxlViewer: React.FC<{ selectedFile: string; mixFiles: MixFileData[]; resourceContext?: ResourceContext | null }> = ({
  selectedFile,
  mixFiles,
  resourceContext,
}) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [frames, setFrames] = useState<number>(16)
  const [frameIndex, setFrameIndex] = useState<number>(0)
  const [palettePath, setPalettePath] = useState<string>('')
  const [paletteList, setPaletteList] = useState<string[]>([])
  const [paletteInfo, setPaletteInfo] = useState<PaletteSelectionInfo>({
    source: 'fallback-grayscale',
    reason: '未加载',
    resolvedPath: null,
  })

  function render2DFrame(mount: HTMLDivElement, vxl: VxlFile, palette: Uint8Array, frameIdx: number, frameCount: number) {
    // 清除之前的内容
    mount.innerHTML = ''

    const theta = (frameIdx / Math.max(1, frameCount)) * Math.PI * 2
    const cosT = Math.cos(theta)
    const sinT = Math.sin(theta)

    // 先对每个 (x,y) 列选取最“靠前”的体素作为表面点
    type Sample = { sx: number; sy: number; depth: number; color: [number, number, number] }
    const surface: Sample[] = []
    let minSX = Infinity, maxSX = -Infinity, minSY = Infinity, maxSY = -Infinity
    for (const section of vxl.sections) {
      for (const span of section.spans) {
        let best: Sample | null = null
        for (const v of span.voxels) {
          const wx = v.x
          const wy = v.z
          const wz = v.y
          const rx = wx * cosT - wz * sinT
          const rz = wx * sinT + wz * cosT
          const sx = rx
          const sy = wy - rz * 0.5
          const depth = -rz
          if (!best || depth > best.depth) {
            best = { sx, sy, depth, color: colorFromPalette(palette, v.colorIndex) }
          }
        }
        if (best) {
          surface.push(best)
          if (best.sx < minSX) minSX = best.sx; if (best.sx > maxSX) maxSX = best.sx
          if (best.sy < minSY) minSY = best.sy; if (best.sy > maxSY) maxSY = best.sy
        }
      }
    }
    if (!isFinite(minSX) || !isFinite(minSY)) {
      mount.innerHTML = '<div class="p-2 text-xs text-gray-400">空 VXL</div>'
      return
    }

    const pad = 8
    const targetW = Math.max(64, mount.clientWidth - pad * 2)
    const targetH = Math.max(64, mount.clientHeight - pad * 2)
    const spanX = Math.max(1, maxSX - minSX + 1)
    const spanY = Math.max(1, maxSY - minSY + 1)
    const scale = Math.max(1, Math.floor(Math.min(targetW / spanX, targetH / spanY)))
    const w = Math.max(1, Math.floor(spanX * scale))
    const h = Math.max(1, Math.floor(spanY * scale))
    const patch = Math.max(1, Math.round(scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false
    const img = ctx.createImageData(w, h)
    const buf = img.data
    const depthBuf = new Float32Array(w * h)
    depthBuf.fill(-Infinity)

    for (const s of surface) {
      const baseX = Math.floor((s.sx - minSX) * scale)
      const baseY = Math.floor((s.sy - minSY) * scale)
      for (let dy = 0; dy < patch; dy++) {
        const py = baseY + dy
        if (py < 0 || py >= h) continue
        let rowIdx = py * w
        for (let dx = 0; dx < patch; dx++) {
          const px = baseX + dx
          if (px < 0 || px >= w) continue
          const idx = rowIdx + px
          if (s.depth > depthBuf[idx]) {
            depthBuf[idx] = s.depth
            const o = idx * 4
            buf[o] = s.color[0]
            buf[o + 1] = s.color[1]
            buf[o + 2] = s.color[2]
            buf[o + 3] = 255
          }
        }
      }
    }

    ctx.putImageData(img, 0, 0)
    mount.innerHTML = ''
    mount.appendChild(canvas)
  }

  // 重置帧索引为0，当切换文件时
  useEffect(() => {
    if (selectedFile) {
      console.log('[VxlViewer] selectedFile changed to:', selectedFile, 'frameIndex will be reset to 0')
      setFrameIndex(0)
    }
  }, [selectedFile])

  // 存储VXL和调色板数据，用于帧变化时重新渲染
  const [vxlData, setVxlData] = useState<{ vxl: VxlFile, palette: Uint8Array } | null>(null)

  useEffect(() => {
    let disposed = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const slash = selectedFile.indexOf('/')
        if (slash <= 0) throw new Error('Invalid path')
        const mixName = selectedFile.substring(0, slash)
        const inner = selectedFile.substring(slash + 1)
        const mix = mixFiles.find(m => m.info.name === mixName)
        if (!mix) throw new Error('MIX not found')
        const vf = await MixParser.extractFile(mix.file, inner)
        if (!vf) throw new Error('File not found in MIX')
        const vxl = new VxlFile(vf)
        if (vxl.sections.length === 0) throw new Error('Failed to parse VXL')
        const hasEmbeddedPalette = vxl.embeddedPalette.length >= 48
        const decision = PaletteResolver.resolve({
          assetPath: selectedFile,
          assetKind: 'vxl',
          mixFiles,
          resourceContext,
          manualPalettePath: palettePath || null,
          hasEmbeddedPalette,
        })
        setPaletteList(decision.availablePalettePaths)

        let selectedInfo: PaletteSelectionInfo = decision.selection
        let finalPalette: Rgb[] | null = null

        if (decision.resolvedPalettePath) {
          const loaded = await loadPaletteByPath(decision.resolvedPalettePath, mixFiles)
          if (loaded) {
            finalPalette = loaded
          } else {
            selectedInfo = {
              source: 'fallback-grayscale',
              reason: `调色板加载失败（${decision.resolvedPalettePath}），回退灰度`,
              resolvedPath: decision.resolvedPalettePath,
            }
          }
        } else if (hasEmbeddedPalette) {
          const embedded = PaletteParser.fromBytes(vxl.embeddedPalette)
          if (embedded) {
            finalPalette = embedded.colors
          } else {
            selectedInfo = {
              source: 'fallback-grayscale',
              reason: '内嵌调色板无效，回退灰度',
              resolvedPath: null,
            }
          }
        }

        if (!finalPalette) {
          finalPalette = PaletteParser.buildGrayscalePalette()
        }
        setPaletteInfo(selectedInfo)
        const pal = toBytePalette(finalPalette)

        if (disposed) return

        // 存储VXL和调色板数据，用于后续帧变化时使用
        setVxlData({ vxl, palette: pal })
      } catch (e: any) {
        if (!disposed) setError(e?.message || 'Failed to render VXL')
      } finally {
        if (!disposed) setLoading(false)
      }
    }
    load()
    return () => { disposed = true }
  }, [selectedFile, mixFiles, palettePath, resourceContext])

  // 当帧或VXL数据改变时重新渲染
  useEffect(() => {
    if (!vxlData) return

    const mount = mountRef.current
    if (!mount) return

    const { vxl, palette } = vxlData
    console.log(`[VxlViewer] Rendering frame ${frameIndex}/${frames - 1}`)
    render2DFrame(mount, vxl, palette, frameIndex % Math.max(1, frames), frames)
  }, [frameIndex, frames, vxlData])

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center gap-3">
        <span>VXL 预览（2D帧采样）</span>
        <label className="flex items-center gap-1">
          <span>方向数</span>
          <select className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs" value={frames} onChange={e => setFrames(Math.max(1, parseInt(e.target.value || '16') || 16))}>
            <option value={8}>8</option>
            <option value={12}>12</option>
            <option value={16}>16</option>
            <option value={24}>24</option>
            <option value={32}>32</option>
          </select>
        </label>
        <label className="flex items-center gap-1 flex-1">
          <span>角度</span>
          <input className="flex-1" type="range" min={0} max={Math.max(1, frames) - 1} value={frameIndex % Math.max(1, frames)} onChange={e => setFrameIndex(parseInt(e.target.value || '0') || 0)} />
          <span className="w-6 text-right">{(frameIndex % Math.max(1, frames))}</span>
        </label>
        <label className="flex items-center gap-1">
          <span>调色板</span>
          <select
            className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs"
            value={palettePath}
            onChange={(e) => setPalettePath(e.target.value || '')}
          >
            <option value="">自动(规则/内嵌)</option>
            {paletteList.map((p) => (
              <option key={p} value={p}>
                {p.split('/').pop() || p}
              </option>
            ))}
          </select>
        </label>
        <span className="text-gray-500 truncate max-w-[280px]">
          {paletteInfo.source} - {paletteInfo.reason}
        </span>
      </div>
      <div ref={mountRef} className="flex-1 flex items-center justify-center bg-gray-900" />
      {loading && <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-black/20">加载中...</div>}
      {error && !loading && <div className="absolute top-2 left-2 right-2 p-2 text-red-400 text-xs bg-black/40 rounded">{error}</div>}
    </div>
  )
}

export default VxlViewer


