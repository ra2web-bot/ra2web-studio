import React, { useEffect, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'

type MixFileData = { file: File; info: MixFileInfo }

const DatViewer: React.FC<{ selectedFile: string; mixFiles: MixFileData[] }> = ({ selectedFile, mixFiles }) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLmd, setIsLmd] = useState(false)
  const [game, setGame] = useState<number | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [hexDump, setHexDump] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    async function loadDat() {
      setLoading(true)
      setError(null)
      setIsLmd(false)
      setNames([])
      setHexDump('')
      try {
        const slash = selectedFile.indexOf('/')
        if (slash <= 0) throw new Error('Invalid path')
        const mixName = selectedFile.substring(0, slash)
        const inner = selectedFile.substring(slash + 1)
        const mix = mixFiles.find(m => m.info.name === mixName)
        if (!mix) throw new Error('MIX not found')
        const vf = await MixParser.extractFile(mix.file, inner)
        if (!vf) throw new Error('File not found in MIX')
        const s = vf.stream
        s.seek(0)
        const id = s.readString(32)
        s.seek(32)
        s.readInt32() // size (unused)
        const type = s.readInt32()
        const version = s.readInt32()
        if (id.startsWith('XCC by Olaf van der Spek') && version === 0 && type === 0) {
          const g = s.readInt32()
          const count = s.readInt32()
          const arr: string[] = []
          for (let i = 0; i < count; i++) arr.push(s.readCString())
          if (!cancelled) {
            setIsLmd(true)
            setGame(g)
            setNames(arr)
          }
        } else {
          const bytes = vf.getBytes()
          const viewLen = Math.min(bytes.length, 4096)
          let out: string[] = []
          for (let off = 0; off < viewLen; off += 16) {
            let hex = ''
            let ascii = ''
            for (let j = 0; j < 16 && off + j < viewLen; j++) {
              const b = bytes[off + j]
              hex += b.toString(16).toUpperCase().padStart(2, '0') + ' '
              ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'
            }
            out.push(off.toString(16).toUpperCase().padStart(8, '0') + '  ' + hex.padEnd(16 * 3, ' ') + ' ' + ascii)
          }
          if (!cancelled) setHexDump(out.join('\n'))
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load DAT')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadDat()
    return () => { cancelled = true }
  }, [selectedFile, mixFiles])

  if (loading) return <div className="h-full w-full flex items-center justify-center text-gray-400">加载中...</div>
  if (error) return <div className="p-3 text-red-400 text-sm">{error}</div>

  if (isLmd) {
    const filtered = query ? names.filter(n => n.toLowerCase().includes(query.toLowerCase())) : names
    return (
      <div className="w-full h-full flex flex-col overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-400 flex items-center gap-2">
          <span>Local Mix Database</span>
          <span className="text-gray-500">(game: {game}, files: {names.length})</span>
          <div className="ml-auto flex items-center gap-2">
            <input
              className="bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded outline-none"
              placeholder="搜索文件名"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            <button
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
              onClick={() => navigator.clipboard.writeText(names.join('\n'))}
            >复制全部</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-scroll" style={{ scrollbarGutter: 'stable' }}>
          <table className="w-full text-xs text-gray-200 font-mono">
            <thead className="sticky top-0 bg-gray-800">
              <tr className="text-left">
                <th className="px-3 py-2 w-20 text-gray-400">#</th>
                <th className="px-3 py-2 text-gray-400">Filename</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((name, i) => (
                <tr key={i} className="border-b border-gray-700/50">
                  <td className="px-3 py-1 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-1">{name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full overflow-y-scroll" style={{ scrollbarGutter: 'stable both-edges' }}>
      <pre className="p-3 text-xs leading-5 whitespace-pre text-gray-200 font-mono">{hexDump}</pre>
    </div>
  )
}

export default DatViewer


