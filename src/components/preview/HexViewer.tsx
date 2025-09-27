import React, { useEffect, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'

type MixFileData = { file: File; info: MixFileInfo }

const HexViewer: React.FC<{ selectedFile: string; mixFiles: MixFileData[] }> = ({ selectedFile, mixFiles }) => {
  const [dump, setDump] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setDump('')
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
        if (!cancelled) setDump(out.join('\n'))
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load file')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedFile, mixFiles])

  if (loading) return <div className="h-full w-full flex items-center justify-center text-gray-400">加载中...</div>
  if (error) return <div className="p-3 text-red-400 text-sm">{error}</div>

  return (
    <div className="w-full h-full overflow-y-scroll" style={{ scrollbarGutter: 'stable both-edges' }}>
      <pre className="p-3 text-xs leading-5 whitespace-pre text-gray-200 font-mono">{dump}</pre>
    </div>
  )
}

export default HexViewer


