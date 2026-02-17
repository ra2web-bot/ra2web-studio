import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import { ShpFile } from '../../data/ShpFile'
import { PaletteParser } from '../../services/palette/PaletteParser'
import { PaletteResolver } from '../../services/palette/PaletteResolver'
import { loadPaletteByPath } from '../../services/palette/PaletteLoader'
import { IndexedColorRenderer } from '../../services/palette/IndexedColorRenderer'
import SearchableSelect from '../common/SearchableSelect'
import type { PaletteSelectionInfo, Rgb } from '../../services/palette/PaletteTypes'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'

type MixFileData = { file: File; info: MixFileInfo }

const ShpViewer: React.FC<{ selectedFile: string; mixFiles: MixFileData[]; resourceContext?: ResourceContext | null }> = ({
  selectedFile,
  mixFiles,
  resourceContext,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<{ w: number; h: number; frames: number } | null>(null)
  const [frame, setFrame] = useState(0)
  const [palettePath, setPalettePath] = useState<string>('')
  const [paletteList, setPaletteList] = useState<string[]>([])
  const [paletteInfo, setPaletteInfo] = useState<PaletteSelectionInfo>({
    source: 'fallback-grayscale',
    reason: '未加载',
    resolvedPath: null,
  })

  // 重置帧为0，当切换文件时
  useEffect(() => {
    if (selectedFile) {
      console.log('[ShpViewer] selectedFile changed to:', selectedFile, 'frame will be reset to 0')
      setFrame(0)
    }
  }, [selectedFile])

  // 存储SHP和调色板数据，用于帧变化时重新渲染
  const [shpData, setShpData] = useState<{ shp: ShpFile; palette: Rgb[] } | null>(null)
  const [canvasSize, setCanvasSize] = useState<{ w: number, h: number } | null>(null)

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

        const decision = PaletteResolver.resolve({
          assetPath: selectedFile,
          assetKind: 'shp',
          mixFiles,
          resourceContext,
          manualPalettePath: palettePath || null,
          assetWidth: shp.width,
          assetHeight: shp.height,
        })
        setPaletteList(decision.availablePalettePaths)

        let palette: Rgb[] | null = null
        let selection: PaletteSelectionInfo = decision.selection
        if (decision.resolvedPalettePath) {
          const loaded = await loadPaletteByPath(decision.resolvedPalettePath, mixFiles)
          if (loaded) {
            palette = loaded
          } else {
            selection = {
              source: 'fallback-grayscale',
              reason: `调色板加载失败（${decision.resolvedPalettePath}），回退灰度`,
              resolvedPath: decision.resolvedPalettePath,
            }
          }
        }

        if (!palette) {
          palette = PaletteParser.buildGrayscalePalette()
        }
        setPaletteInfo(selection)

        const clampedPalette = PaletteParser.ensurePalette256(palette)

        // Calculate canvas size based on the maximum extent of all frames
        let maxW = shp.width
        let maxH = shp.height
        for (let i = 0; i < shp.numImages; i++) {
          const img = shp.images[i]
          if (img) {
            maxW = Math.max(maxW, img.x + img.width)
            maxH = Math.max(maxH, img.y + img.height)
          }
        }
        const safeW = Math.max(1, maxW | 0)
        const safeH = Math.max(1, maxH | 0)

        if (cancelled) return

        // 存储SHP和调色板数据，用于后续帧变化时使用
        setShpData({ shp, palette: clampedPalette })
        setCanvasSize({ w: safeW, h: safeH })
        setInfo({ w: safeW, h: safeH, frames: shp.numImages })
      } catch (e: any) {
        setError(e?.message || 'Failed to render SHP')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedFile, mixFiles, palettePath, resourceContext])

  // 当帧或SHP数据改变时重新渲染
  useEffect(() => {
    if (!shpData || !canvasSize || !info) return

    try {
      const canvas = canvasRef.current
      if (!canvas) {
        console.warn('[ShpViewer] canvasRef.current is null')
        return
      }

      // 设置canvas的实际尺寸
      canvas.width = canvasSize.w
      canvas.height = canvasSize.h

      const { shp, palette } = shpData
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        console.error('[ShpViewer] Failed to get 2D context')
        return
      }

      // 渲染当前帧
      const renderIndex = Math.min(frame, shp.numImages - 1)
      const img = shp.getImage(renderIndex)
      const rgba = IndexedColorRenderer.indexedToRgba(img.imageData, img.width, img.height, palette, 0)
      if (img.width <= 0 || img.height <= 0) {
        setError('SHP 帧尺寸无效，无法渲染图像')
        return
      }
      const imageData = new ImageData(Uint8ClampedArray.from(rgba), img.width, img.height)

      // 计算图像在canvas中的居中位置
      const offsetX = Math.max(0, (canvasSize.w - img.width) / 2)
      const offsetY = Math.max(0, (canvasSize.h - img.height) / 2)

      // 清除画布
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // 居中绘制图像
      ctx.putImageData(imageData, offsetX, offsetY)
    } catch (e: any) {
      setError(e?.message || 'SHP 渲染失败')
    }
  }, [frame, shpData, canvasSize, info])

  const paletteOptions = useMemo(
    () => [{ value: '', label: '自动(规则解析)' }, ...paletteList.map(p => ({ value: p, label: p.split('/').pop() || p }))],
    [paletteList],
  )

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
          <SearchableSelect
            value={palettePath}
            options={paletteOptions}
            onChange={(next) => setPalettePath(next || '')}
            closeOnSelect={false}
            pinnedValues={['']}
            searchPlaceholder="搜索调色板..."
            noResultsText="未找到匹配调色板"
          />
        </div>
        <div className="text-gray-500 truncate max-w-[420px]">
          来源: {paletteInfo.source} - {paletteInfo.reason}
        </div>
        {info && (
          <div className="ml-auto">尺寸: {info.w} × {info.h}，帧数: {info.frames}</div>
        )}
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center relative" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #2d2d2d 0, #2d2d2d 12px, #343434 12px, #343434 24px)' }}>
        <div className="flex items-center justify-center" style={{ width: '100%', height: '100%' }}>
          <canvas ref={canvasRef} style={{ imageRendering: 'pixelated', width: 'auto', height: 'auto' }} />
        </div>
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


