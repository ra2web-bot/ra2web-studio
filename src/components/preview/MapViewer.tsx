import React, { useEffect, useRef, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import {
  MapPreviewDecodeResult,
  MapRect,
  MapPreviewDecoder,
  projectStartingLocationToPreview,
} from '../../data/map/MapPreviewDecoder'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'

type MixFileData = { file: File; info: MixFileInfo }

function formatRect(rect: MapRect | null): string {
  if (!rect) return '-'
  return `${rect.x}, ${rect.y}, ${rect.width}, ${rect.height}`
}

function drawPreviewToCanvas(canvas: HTMLCanvasElement, data: MapPreviewDecodeResult): void {
  const width = data.previewRect.width
  const height = data.previewRect.height
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const imageData = ctx.createImageData(width, height)
  const rgba = imageData.data
  const rgb = data.rgbData
  let sourceIndex = 0
  let destIndex = 0
  while (sourceIndex + 2 < rgb.length && destIndex + 3 < rgba.length) {
    rgba[destIndex] = rgb[sourceIndex]
    rgba[destIndex + 1] = rgb[sourceIndex + 1]
    rgba[destIndex + 2] = rgb[sourceIndex + 2]
    rgba[destIndex + 3] = 255
    sourceIndex += 3
    destIndex += 4
  }
  ctx.putImageData(imageData, 0, 0)

  if (data.startingLocations.length === 0) return

  const fontSize = Math.max(10, Math.round(Math.min(width, height) / 18))
  ctx.font = `700 ${fontSize}px Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#FFEB3B'
  ctx.strokeStyle = '#111827'
  ctx.lineWidth = Math.max(2, Math.round(fontSize / 6))

  for (const location of data.startingLocations) {
    const projected = projectStartingLocationToPreview(
      location,
      data.fullSize,
      data.localSize,
      width,
      height,
    )
    if (!projected) continue
    if (
      projected.x < -fontSize
      || projected.x > width + fontSize
      || projected.y < -fontSize
      || projected.y > height + fontSize
    ) {
      continue
    }
    const label = String(location.slot + 1)
    ctx.strokeText(label, projected.x, projected.y)
    ctx.fillText(label, projected.x, projected.y)
  }
}

const MapViewer: React.FC<{
  selectedFile: string
  mixFiles: MixFileData[]
  resourceContext?: ResourceContext | null
}> = ({ selectedFile, mixFiles }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noPreview, setNoPreview] = useState(false)
  const [previewData, setPreviewData] = useState<MapPreviewDecodeResult | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setNoPreview(false)
      setPreviewData(null)

      try {
        const slash = selectedFile.indexOf('/')
        if (slash <= 0) throw new Error('Invalid path')
        const mixName = selectedFile.substring(0, slash)
        const inner = selectedFile.substring(slash + 1)
        const mix = mixFiles.find((m) => m.info.name === mixName)
        if (!mix) throw new Error('MIX not found')

        const vf = await MixParser.extractFile(mix.file, inner)
        if (!vf) throw new Error('File not found in MIX')

        const text = vf.readAsString()
        const decoded = MapPreviewDecoder.decode(text)
        if (cancelled) return
        if (!decoded) {
          setNoPreview(true)
          return
        }
        setPreviewData(decoded)
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || '地图小地图预览读取失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [selectedFile, mixFiles])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !previewData) return
    drawPreviewToCanvas(canvas, previewData)
  }, [previewData])

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center justify-between gap-3">
        <span>小地图预览（MAP/MPR）</span>
        <span className="text-gray-500 truncate">
          {selectedFile.split('/').pop() || selectedFile}
          {previewData ? ` · ${previewData.previewRect.width} x ${previewData.previewRect.height}` : ''}
        </span>
      </div>

      <div className="flex-1 min-h-0 p-4 overflow-auto">
        {loading && (
          <div className="text-sm text-gray-400">小地图加载中...</div>
        )}

        {!loading && error && (
          <div className="space-y-3">
            <div className="text-sm text-red-400">{error}</div>
            <div className="text-xs text-gray-500">
              可切换到“文本”或“十六进制”视图进一步排查地图内容。
            </div>
          </div>
        )}

        {!loading && !error && noPreview && (
          <div className="space-y-2">
            <div className="text-sm text-amber-300">该地图未包含 [Preview]/[PreviewPack] 预览数据。</div>
            <div className="text-xs text-gray-500">
              可切换到“文本”视图检查地图节内容。
            </div>
          </div>
        )}

        {!loading && !error && previewData && (
          <div className="space-y-4 h-full flex flex-col">
            <div className="flex-1 min-h-[220px] rounded border border-gray-700 bg-black/40 p-2 overflow-hidden">
              <div className="w-full h-full flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  className="h-full w-auto max-h-full max-w-full border border-gray-700 bg-black"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            </div>

            <div className="text-xs text-gray-400 space-y-1">
              <div>预览尺寸: {previewData.previewRect.width} x {previewData.previewRect.height}</div>
              <div>Map.Size: {formatRect(previewData.fullSize)}</div>
              <div>Map.LocalSize: {formatRect(previewData.localSize)}</div>
              <div>出生点数量: {previewData.startingLocations.length}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MapViewer

