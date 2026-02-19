import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { ExportController } from '../../services/export/ExportController'
import type { MixFileInfo } from '../../services/MixParser'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import type { RawAssociationExportMode } from '../../services/export/types'
import { clamp } from '../../services/export/utils'

type MixFileData = { file: File; info: MixFileInfo }
type ExportTab = 'raw' | 'static' | 'gif'
type FrameMode = 'single' | 'range'
type LayoutMode = 'grid' | 'single-column'
type PaletteMode = 'auto' | 'manual'
type TransparencyMode = 'index' | 'opaque'

interface ExportDialogProps {
  open: boolean
  onClose: () => void
  selectedFile: string
  mixFiles: MixFileData[]
  resourceContext?: ResourceContext | null
  initialTab?: ExportTab
}

const DEFAULT_BACKGROUND_COLOR = '#000000'

const ExportDialog: React.FC<ExportDialogProps> = ({
  open,
  onClose,
  selectedFile,
  mixFiles,
  resourceContext,
  initialTab = 'raw',
}) => {
  const extension = useMemo(
    () => selectedFile.split('.').pop()?.toLowerCase() ?? '',
    [selectedFile],
  )
  const shpCapable = extension === 'shp'
  const [activeTab, setActiveTab] = useState<ExportTab>('raw')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  // Raw export options
  const [promptAssociations, setPromptAssociations] = useState(true)
  const [associationMode, setAssociationMode] = useState<RawAssociationExportMode>('separate')

  // SHP shared options
  const [frameCount, setFrameCount] = useState(0)
  const [paletteList, setPaletteList] = useState<string[]>([])
  const [frameMode, setFrameMode] = useState<FrameMode>('single')
  const [frameIndex, setFrameIndex] = useState(0)
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>('auto')
  const [manualPalettePath, setManualPalettePath] = useState('')
  const [transparencyMode, setTransparencyMode] = useState<TransparencyMode>('index')
  const [transparentIndex, setTransparentIndex] = useState(0)
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND_COLOR)

  // Static image export options
  const [staticFormat, setStaticFormat] = useState<'png' | 'jpg'>('png')
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('grid')
  const [gridColumns, setGridColumns] = useState(8)
  const [jpegQuality, setJpegQuality] = useState(0.92)

  // GIF export options
  const [gifDelayMs, setGifDelayMs] = useState(80)
  const [gifLoopCount, setGifLoopCount] = useState(0)

  useEffect(() => {
    if (!open) return
    setActiveTab(initialTab)
    setError(null)
    setResult(null)
    if (!shpCapable) {
      setActiveTab('raw')
      setFrameCount(0)
      setPaletteList([])
      return
    }
    let disposed = false
    async function loadShpMeta() {
      try {
        const context = { selectedFile, mixFiles, resourceContext }
        const [inspection, palettePaths] = await Promise.all([
          ExportController.inspectShp(context),
          ExportController.listShpPaletteOptions(context),
        ])
        if (disposed) return
        const frames = inspection?.frames ?? 0
        setFrameCount(frames)
        setPaletteList(palettePaths)
        if (frames > 0) {
          const max = frames - 1
          setFrameIndex((prev) => clamp(prev, 0, max))
          setRangeStart((prev) => clamp(prev, 0, max))
          setRangeEnd((prev) => clamp(prev, 0, max))
        }
      } catch (e: any) {
        if (disposed) return
        setError(e?.message || '读取 SHP 导出参数失败')
      }
    }
    void loadShpMeta()
    return () => {
      disposed = true
    }
  }, [open, initialTab, shpCapable, selectedFile, mixFiles, resourceContext])

  useEffect(() => {
    if (!open) return
    if (activeTab !== 'raw' && !shpCapable) {
      setActiveTab('raw')
    }
  }, [open, activeTab, shpCapable])

  const frameMax = Math.max(0, frameCount - 1)
  const context = useMemo(
    () => ({ selectedFile, mixFiles, resourceContext }),
    [selectedFile, mixFiles, resourceContext],
  )

  const runRawExport = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const resultData = await ExportController.exportRaw(context, {
        includeAssociations: promptAssociations,
        associationMode,
      })
      const associationCount = resultData.associationPaths.length
      const msg =
        associationCount > 0
          ? `导出完成：主文件 + ${associationCount} 个关联文件`
          : '导出完成：已下载主文件'
      setResult(msg)
    } catch (e: any) {
      setError(e?.message || '原始导出失败')
    } finally {
      setLoading(false)
    }
  }

  const runStaticExport = async () => {
    if (!shpCapable) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const exportResult = await ExportController.exportShpStatic(context, {
        format: staticFormat,
        frameRange: {
          mode: frameMode,
          frameIndex: clamp(frameIndex | 0, 0, frameMax),
          startFrame: clamp(rangeStart | 0, 0, frameMax),
          endFrame: clamp(rangeEnd | 0, 0, frameMax),
        },
        layout: layoutMode,
        gridColumns: clamp(gridColumns | 0, 1, 99),
        palette: {
          mode: paletteMode,
          manualPalettePath: manualPalettePath.trim(),
        },
        transparency: {
          mode: transparencyMode,
          transparentIndex: clamp(transparentIndex | 0, 0, 255),
          backgroundColor,
        },
        jpegQuality: clamp(jpegQuality, 0, 1),
      })
      setResult(`导出完成：${exportResult.filename}`)
    } catch (e: any) {
      setError(e?.message || '静态图导出失败')
    } finally {
      setLoading(false)
    }
  }

  const runGifExport = async () => {
    if (!shpCapable) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const exportResult = await ExportController.exportShpGif(context, {
        frameRange: {
          mode: frameMode,
          frameIndex: clamp(frameIndex | 0, 0, frameMax),
          startFrame: clamp(rangeStart | 0, 0, frameMax),
          endFrame: clamp(rangeEnd | 0, 0, frameMax),
        },
        palette: {
          mode: paletteMode,
          manualPalettePath: manualPalettePath.trim(),
        },
        transparency: {
          mode: transparencyMode,
          transparentIndex: clamp(transparentIndex | 0, 0, 255),
          backgroundColor,
        },
        frameDelayMs: Math.max(10, Math.round(gifDelayMs)),
        loopCount: clamp(gifLoopCount | 0, 0, 65535),
      })
      setResult(`导出完成：${exportResult.filename}`)
    } catch (e: any) {
      setError(e?.message || 'GIF 导出失败')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
      <div className="w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm text-gray-400">文件导出中心</div>
            <div className="text-base font-semibold truncate">{selectedFile.split('/').pop()}</div>
          </div>
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-700 text-gray-300"
            onClick={onClose}
            disabled={loading}
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-gray-700 flex items-center gap-2">
          <button
            type="button"
            className={`px-3 py-1.5 rounded text-sm ${activeTab === 'raw' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'}`}
            onClick={() => setActiveTab('raw')}
            disabled={loading}
          >
            原始导出
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded text-sm ${activeTab === 'static' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'} ${!shpCapable ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => shpCapable && setActiveTab('static')}
            disabled={!shpCapable || loading}
          >
            静态图导出
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded text-sm ${activeTab === 'gif' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200 hover:bg-gray-600'} ${!shpCapable ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => shpCapable && setActiveTab('gif')}
            disabled={!shpCapable || loading}
          >
            GIF 导出
          </button>
          {!shpCapable && (
            <span className="ml-auto text-xs text-yellow-300">当前文件不是 SHP，仅支持原始导出</span>
          )}
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
          {activeTab === 'raw' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={promptAssociations}
                  onChange={(e) => setPromptAssociations(e.target.checked)}
                  disabled={loading}
                />
                导出后提示是否继续导出关联配对文件（PAL/HVA）
              </label>
              {promptAssociations && (
                <div className="flex flex-wrap items-center gap-3 text-sm text-gray-300">
                  <span>关联文件导出方式:</span>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="assoc-mode"
                      checked={associationMode === 'separate'}
                      onChange={() => setAssociationMode('separate')}
                      disabled={loading}
                    />
                    逐个下载
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="assoc-mode"
                      checked={associationMode === 'zip'}
                      onChange={() => setAssociationMode('zip')}
                      disabled={loading}
                    />
                    ZIP 打包
                  </label>
                </div>
              )}
              <button
                type="button"
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => void runRawExport()}
                disabled={loading}
              >
                {loading ? '导出中...' : '导出原始文件'}
              </button>
            </div>
          )}

          {activeTab !== 'raw' && shpCapable && (
            <div className="space-y-3">
              <div className="text-sm text-gray-300">
                SHP 帧数: <span className="text-white">{frameCount || '-'}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm">
                  帧模式
                  <select
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                    value={frameMode}
                    onChange={(e) => setFrameMode(e.target.value as FrameMode)}
                    disabled={loading}
                  >
                    <option value="single">单帧</option>
                    <option value="range">连续帧段</option>
                  </select>
                </label>

                {frameMode === 'single' ? (
                  <label className="text-sm">
                    帧索引
                    <input
                      type="number"
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      min={0}
                      max={frameMax}
                      value={frameIndex}
                      onChange={(e) => setFrameIndex(parseInt(e.target.value || '0', 10))}
                      disabled={loading}
                    />
                  </label>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-sm">
                      起始帧
                      <input
                        type="number"
                        className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                        min={0}
                        max={frameMax}
                        value={rangeStart}
                        onChange={(e) => setRangeStart(parseInt(e.target.value || '0', 10))}
                        disabled={loading}
                      />
                    </label>
                    <label className="text-sm">
                      结束帧
                      <input
                        type="number"
                        className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                        min={0}
                        max={frameMax}
                        value={rangeEnd}
                        onChange={(e) => setRangeEnd(parseInt(e.target.value || '0', 10))}
                        disabled={loading}
                      />
                    </label>
                  </div>
                )}

                <label className="text-sm">
                  调色板模式
                  <select
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                    value={paletteMode}
                    onChange={(e) => setPaletteMode(e.target.value as PaletteMode)}
                    disabled={loading}
                  >
                    <option value="auto">自动规则</option>
                    <option value="manual">手动指定</option>
                  </select>
                </label>

                {paletteMode === 'manual' && (
                  <label className="text-sm">
                    手动调色板
                    <select
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      value={manualPalettePath}
                      onChange={(e) => setManualPalettePath(e.target.value)}
                      disabled={loading}
                    >
                      <option value="">请选择...</option>
                      {paletteList.map((path) => (
                        <option key={path} value={path}>
                          {path}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="text-sm">
                  透明策略
                  <select
                    className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                    value={transparencyMode}
                    onChange={(e) => setTransparencyMode(e.target.value as TransparencyMode)}
                    disabled={loading}
                  >
                    <option value="index">按索引透明</option>
                    <option value="opaque">不透明背景</option>
                  </select>
                </label>

                {transparencyMode === 'index' ? (
                  <label className="text-sm">
                    透明索引
                    <input
                      type="number"
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      min={0}
                      max={255}
                      value={transparentIndex}
                      onChange={(e) => setTransparentIndex(parseInt(e.target.value || '0', 10))}
                      disabled={loading}
                    />
                  </label>
                ) : (
                  <label className="text-sm">
                    背景色
                    <input
                      type="color"
                      className="mt-1 w-full h-9 bg-gray-800 border border-gray-700 rounded px-1"
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      disabled={loading}
                    />
                  </label>
                )}
              </div>

              {activeTab === 'static' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <label className="text-sm">
                    导出格式
                    <select
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      value={staticFormat}
                      onChange={(e) => setStaticFormat(e.target.value as 'png' | 'jpg')}
                      disabled={loading}
                    >
                      <option value="png">PNG</option>
                      <option value="jpg">JPG</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    拼接布局
                    <select
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      value={layoutMode}
                      onChange={(e) => setLayoutMode(e.target.value as LayoutMode)}
                      disabled={loading}
                    >
                      <option value="grid">多行网格</option>
                      <option value="single-column">单列</option>
                    </select>
                  </label>

                  <label className="text-sm">
                    网格列数
                    <input
                      type="number"
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      min={1}
                      max={99}
                      value={gridColumns}
                      onChange={(e) => setGridColumns(parseInt(e.target.value || '1', 10))}
                      disabled={loading || layoutMode === 'single-column'}
                    />
                  </label>

                  {staticFormat === 'jpg' && (
                    <label className="text-sm md:col-span-3">
                      JPG 质量（0-1）
                      <input
                        type="number"
                        step={0.01}
                        min={0}
                        max={1}
                        className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                        value={jpegQuality}
                        onChange={(e) => setJpegQuality(parseFloat(e.target.value || '0.92'))}
                        disabled={loading}
                      />
                    </label>
                  )}
                </div>
              )}

              {activeTab === 'gif' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-sm">
                    帧间隔（毫秒）
                    <input
                      type="number"
                      min={10}
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      value={gifDelayMs}
                      onChange={(e) => setGifDelayMs(parseInt(e.target.value || '80', 10))}
                      disabled={loading}
                    />
                  </label>
                  <label className="text-sm">
                    循环次数（0=无限）
                    <input
                      type="number"
                      min={0}
                      max={65535}
                      className="mt-1 w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                      value={gifLoopCount}
                      onChange={(e) => setGifLoopCount(parseInt(e.target.value || '0', 10))}
                      disabled={loading}
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => void (activeTab === 'static' ? runStaticExport() : runGifExport())}
                disabled={loading || frameCount <= 0}
              >
                {loading ? '导出中...' : activeTab === 'static' ? '导出静态图' : '导出 GIF'}
              </button>
            </div>
          )}

          {error && <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded px-3 py-2">{error}</div>}
          {result && <div className="text-sm text-emerald-300 bg-emerald-950/30 border border-emerald-900 rounded px-3 py-2">{result}</div>}
        </div>
      </div>
    </div>
  )
}

export default ExportDialog

