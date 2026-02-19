import React, { useEffect, useMemo, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import { PaletteParser } from '../../services/palette/PaletteParser'
import type { Rgb } from '../../services/palette/PaletteTypes'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'
import { useLocale } from '../../i18n/LocaleContext'

type MixFileData = { file: File; info: MixFileInfo }
const PalViewer: React.FC<{ selectedFile: string; mixFiles: MixFileData[]; resourceContext?: ResourceContext | null }> = ({ selectedFile, mixFiles }) => {
  const { t } = useLocale()
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

        const parsed = PaletteParser.fromUnknownContent({
          text: vf.readAsString(),
          bytes: vf.getBytes(),
        })
        if (!parsed) throw new Error('Unsupported PAL format')
        if (!cancelled) setColors(PaletteParser.ensurePalette256(parsed.colors))
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

  if (loading) return <div className="h-full w-full flex items-center justify-center text-gray-400">{t('bik.loading')}</div>
  if (error) return <div className="p-3 text-red-400 text-sm">{error}</div>
  if (!colors) return null

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="px-4 py-2 border-b border-gray-700 text-xs text-gray-400">
        {t('viewer.paletteColorCount', { count: String(count) })}
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





