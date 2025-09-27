import React, { useEffect, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'

type MixFileData = { file: File; info: MixFileInfo }

const IniViewer: React.FC<{ selectedFile: string; mixFiles: MixFileData[] }> = ({ selectedFile, mixFiles }) => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [Monaco, setMonaco] = useState<React.ComponentType<any> | null>(null)

  useEffect(() => {
    let mounted = true
    import('@monaco-editor/react')
      .then(mod => { if (mounted) setMonaco(() => mod.default as any) })
      .catch(() => setMonaco(null))
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setContent('')
      try {
        const slash = selectedFile.indexOf('/')
        if (slash <= 0) throw new Error('Invalid path')
        const mixName = selectedFile.substring(0, slash)
        const inner = selectedFile.substring(slash + 1)
        const mix = mixFiles.find(m => m.info.name === mixName)
        if (!mix) throw new Error('MIX not found')
        const vf = await MixParser.extractFile(mix.file, inner)
        if (!vf) throw new Error('File not found in MIX')
        const text = vf.readAsString()
        if (!cancelled) setContent(text)
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load INI')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedFile, mixFiles])

  if (loading) return <div className="h-full w-full flex items-center justify-center text-gray-400">加载中...</div>
  if (error) return <div className="p-3 text-red-400 text-sm">{error}</div>

  if (Monaco) {
    const Editor = Monaco
    return (
      <Editor
        height="100%"
        defaultLanguage="ini"
        defaultValue={content || ''}
        options={{
          readOnly: true,
          wordWrap: 'on',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          automaticLayout: true,
        }}
        theme="vs-dark"
      />
    )
  }

  return (
    <div className="w-full h-full overflow-y-scroll" style={{ scrollbarGutter: 'stable both-edges' }}>
      <pre className="p-3 text-sm leading-5 whitespace-pre-wrap break-words text-gray-200 font-mono">{content}</pre>
    </div>
  )
}

export default IniViewer


