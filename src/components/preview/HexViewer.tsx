import React, { useEffect, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'

type MixFileData = { file: File; info: MixFileInfo }
type HexRow = {
  lineNo: string
  rawData: string
  translated: string
}
type HexColumnKey = 'line' | 'raw' | 'translated'

const HexViewer: React.FC<{ selectedFile: string; mixFiles: MixFileData[]; resourceContext?: ResourceContext | null }> = ({ selectedFile, mixFiles }) => {
  const [rows, setRows] = useState<HexRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeSelectionColumn, setActiveSelectionColumn] = useState<HexColumnKey | null>(null)

  useEffect(() => {
    const clearActiveColumn = () => setActiveSelectionColumn(null)
    window.addEventListener('mouseup', clearActiveColumn)
    return () => window.removeEventListener('mouseup', clearActiveColumn)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setRows([])
      try {
        const slash = selectedFile.indexOf('/')
        if (slash <= 0) throw new Error('Invalid path')
        const mixName = selectedFile.substring(0, slash)
        const inner = selectedFile.substring(slash + 1)
        const mix = mixFiles.find(m => m.info.name === mixName)
        if (!mix) throw new Error('MIX not found')
        const vf = await MixParser.extractFile(mix.file, inner)
        if (!vf) throw new Error('File not found in MIX')
        const bytes = vf.getBytes()
        const viewLen = Math.min(bytes.length, 4096)
        const out: HexRow[] = []
        for (let off = 0; off < viewLen; off += 16) {
          const hexParts: string[] = []
          let ascii = ''
          for (let j = 0; j < 16 && off + j < viewLen; j++) {
            const b = bytes[off + j]
            hexParts.push(b.toString(16).toUpperCase().padStart(2, '0'))
            ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'
          }
          out.push({
            lineNo: off.toString(16).toUpperCase().padStart(8, '0'),
            rawData: hexParts.join(' '),
            translated: ascii,
          })
        }
        if (!cancelled) setRows(out)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load file')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedFile, mixFiles])

  const getColumnSelectionClass = (column: HexColumnKey): string => {
    if (activeSelectionColumn && activeSelectionColumn !== column) return 'select-none'
    return 'select-text'
  }

  if (loading) return <div className="h-full w-full flex items-center justify-center text-gray-400">加载中...</div>
  if (error) return <div className="p-3 text-red-400 text-sm">{error}</div>

  return (
    <div className="w-full h-full overflow-x-auto">
      <div className="min-w-[460px] h-full text-xs font-mono flex flex-col">
        {rows.length > 0 ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div
              className="grid grid-cols-[80px_380px_minmax(0,1fr)]"
            >
              <div
                className={`border-r border-gray-700 text-cyan-300 ${getColumnSelectionClass('line')}`}
                onMouseDown={() => setActiveSelectionColumn('line')}
              >
                {rows.map((row) => (
                  <div key={`line-${row.lineNo}`} className="h-6 leading-6 px-3 border-b border-gray-800 whitespace-pre">
                    {row.lineNo}
                  </div>
                ))}
              </div>
              <div
                className={`border-r border-gray-700 text-gray-200 ${getColumnSelectionClass('raw')}`}
                onMouseDown={() => setActiveSelectionColumn('raw')}
              >
                {rows.map((row) => (
                  <div key={`raw-${row.lineNo}`} className="h-6 leading-6 px-3 border-b border-gray-800 whitespace-pre tracking-wide">
                    {row.rawData}
                  </div>
                ))}
              </div>
              <div
                className={`text-gray-400 ${getColumnSelectionClass('translated')}`}
                onMouseDown={() => setActiveSelectionColumn('translated')}
              >
                {rows.map((row) => (
                  <div key={`translated-${row.lineNo}`} className="h-6 leading-6 px-3 border-b border-gray-800 whitespace-pre">
                    {row.translated || '.'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 text-gray-400">文件为空或无可显示内容。</div>
        )}
      </div>
    </div>
  )
}

export default HexViewer


