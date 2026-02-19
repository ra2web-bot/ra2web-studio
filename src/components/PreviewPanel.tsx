import React, { useMemo, useState, useEffect } from 'react'
import { Image, Box, FileText, Music, Info, Archive, Video, Download } from 'lucide-react'
import { MixFileInfo } from '../services/MixParser'
import IniViewer from './preview/IniViewer'
import DatViewer from './preview/DatViewer'
import HexViewer from './preview/HexViewer'
import TxtViewer from './preview/TxtViewer'
import CsfViewer from './preview/CsfViewer'
import PalViewer from './preview/PalViewer'
import PcxViewer from './preview/PcxViewer'
import ShpViewer from './preview/ShpViewer'
import TmpViewer from './preview/TmpViewer'
import VxlViewer from './preview/VxlViewer'
import VxlViewer3D from './preview/VxlViewer3D.tsx'
import HvaViewer from './preview/HvaViewer'
import MixDirectoryViewer from './preview/MixDirectoryViewer'
import WavViewer from './preview/WavViewer'
import MapViewer from './preview/MapViewer'
import BikViewer from './preview/BikViewer'
import type { ResourceContext } from '../services/gameRes/ResourceContext'
import ExportDialog from './export/ExportDialog'
import { useLocale } from '../i18n/LocaleContext'

type MixFileData = { file: File; info: MixFileInfo }

interface PreviewPanelProps {
  selectedFile: string | null
  mixFiles: MixFileData[]
  breadcrumbs?: string[]
  onBreadcrumbClick?: (index: number) => void
  resourceContext?: ResourceContext | null
  onOpenMetadataDrawer?: () => void
  metadataDrawerOpen?: boolean
  onEnterCurrentMix?: () => void
  canEnterCurrentMix?: boolean
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({
  selectedFile,
  mixFiles,
  breadcrumbs,
  onBreadcrumbClick,
  resourceContext,
  onOpenMetadataDrawer,
  metadataDrawerOpen = false,
  onEnterCurrentMix,
  canEnterCurrentMix = false,
}) => {
  const { t } = useLocale()

  const getFileTypeIcon = (filePath: string) => {
    const extension = filePath.split('.').pop()?.toLowerCase()

    switch (extension) {
      case 'ini':
        return <FileText size={48} className="text-gray-300" />
      case 'shp':
        return <Image size={48} className="text-blue-400" />
      case 'vxl':
        return <Box size={48} className="text-green-400" />
      case 'pcx':
        return <Image size={48} className="text-purple-400" />
      case 'tmp':
      case 'tem':
      case 'sno':
      case 'urb':
      case 'ubn':
      case 'des':
      case 'lun':
        return <Image size={48} className="text-orange-400" />
      case 'wav':
        return <Music size={48} className="text-yellow-400" />
      case 'bik':
        return <Video size={48} className="text-rose-400" />
      case 'csf':
        return <FileText size={48} className="text-sky-400" />
      case 'map':
      case 'mpr':
        return <Image size={48} className="text-emerald-400" />
      case 'mix':
      case 'mmx':
      case 'yro':
        return <Archive size={48} className="text-cyan-400" />
      default:
        return <FileText size={48} className="text-gray-400" />
    }
  }

  const getFileTypeName = (filePath: string) => {
    const extension = filePath.split('.').pop()?.toLowerCase()
    const keyMap: Record<string, string> = {
      ini: 'preview.fileType_ini', txt: 'preview.fileType_txt', csf: 'preview.fileType_csf',
      pal: 'preview.fileType_pal', shp: 'preview.fileType_shp', vxl: 'preview.fileType_vxl',
      pcx: 'preview.fileType_pcx', wav: 'preview.fileType_wav', bik: 'preview.fileType_bik',
      map: 'preview.fileType_map', mpr: 'preview.fileType_map',
      mix: 'preview.fileType_mix', mmx: 'preview.fileType_mix', yro: 'preview.fileType_mix',
    }
    const key = extension ? (keyMap[extension] ?? (['tmp','tem','sno','urb','ubn','des','lun'].includes(extension) ? 'preview.fileType_tmp' : 'preview.fileType_unknown')) : 'preview.fileType_unknown'
    return t(key as 'preview.fileType_ini')
  }

  const ext = useMemo(() => selectedFile?.split('.').pop()?.toLowerCase() ?? '', [selectedFile])
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportInitialTab, setExportInitialTab] = useState<'raw' | 'static' | 'gif'>('raw')

  type ViewerDef = {
    key: string
    label: string
    Component: React.FC<{ selectedFile: string; mixFiles: MixFileData[]; resourceContext?: ResourceContext | null }>
  }
  const tmpViews: ViewerDef[] = [
    { key: 'image', label: t('viewLabels.image'), Component: TmpViewer },
    { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
  ]
  const mixViews: ViewerDef[] = [
    { key: 'directory', label: t('viewLabels.directory'), Component: MixDirectoryViewer },
    { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
  ]
  const mapViews: ViewerDef[] = [
    { key: 'minimap', label: t('viewLabels.minimap'), Component: MapViewer },
    { key: 'text', label: t('viewLabels.text'), Component: IniViewer },
    { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
  ]
  const viewsByExt: Record<string, ViewerDef[]> = {
    ini: [
      { key: 'text', label: t('viewLabels.text'), Component: IniViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    dat: [
      { key: 'auto', label: t('viewLabels.lmdAuto'), Component: DatViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    txt: [
      { key: 'text', label: t('viewLabels.text'), Component: TxtViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    csf: [
      { key: 'viewer', label: 'CSF', Component: CsfViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    pal: [
      { key: 'swatches', label: t('viewLabels.swatches'), Component: PalViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    shp: [
      { key: 'image', label: t('viewLabels.image'), Component: ShpViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    vxl: [
      { key: 'viewer2d', label: t('viewLabels.viewer2d'), Component: VxlViewer },
      { key: 'viewer3d', label: t('viewLabels.viewer3d'), Component: VxlViewer3D },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    pcx: [
      { key: 'image', label: t('viewLabels.image'), Component: PcxViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    wav: [
      { key: 'audio', label: t('viewLabels.audio'), Component: WavViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    bik: [
      { key: 'video', label: t('viewLabels.video'), Component: BikViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    hva: [
      { key: 'viewer', label: t('viewLabels.viewer3d'), Component: HvaViewer },
      { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
    ],
    mix: mixViews,
    mmx: mixViews,
    yro: mixViews,
    map: mapViews,
    mpr: mapViews,
    tmp: tmpViews,
    tem: tmpViews,
    sno: tmpViews,
    urb: tmpViews,
    ubn: tmpViews,
    des: tmpViews,
    lun: tmpViews,
  }
  const defaultViews: ViewerDef[] = [
    { key: 'hex', label: t('viewLabels.hex'), Component: HexViewer },
  ]
  const available = useMemo(() => viewsByExt[ext] ?? defaultViews, [ext])
  const [activeView, setActiveView] = useState<string>(available[0].key)
  useEffect(() => {
    setActiveView(available[0].key)
  }, [available])

  // 旧的 INI 本地状态已移入 IniViewer 组件

  if (!selectedFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <FileText size={64} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg">{t('preview.selectFile')}</p>
          <p className="text-sm mt-2">{t('preview.selectFileHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 预览头部：文件信息 + 文件操作区 */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0">
          {getFileTypeIcon(selectedFile)}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold truncate">{selectedFile.split('/').pop()}</h3>
              <button
                type="button"
                onClick={() => onOpenMetadataDrawer?.()}
                className={`inline-flex items-center justify-center p-1 rounded transition-colors ${
                  metadataDrawerOpen
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }`}
                title={t('preview.metadataAria')}
                aria-label={t('preview.metadataAria')}
                aria-pressed={metadataDrawerOpen}
              >
                <Info size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-400">{getFileTypeName(selectedFile)}</p>
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-100 inline-flex items-center gap-1"
              onClick={() => {
                setExportInitialTab('raw')
                setExportDialogOpen(true)
              }}
            >
              <Download size={14} />
              {t('preview.rawExport')}
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded text-xs inline-flex items-center gap-1 ${
                ext === 'shp'
                  ? 'bg-blue-700 hover:bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
              }`}
              onClick={() => {
                if (ext !== 'shp') return
                setExportInitialTab('static')
                setExportDialogOpen(true)
              }}
              disabled={ext !== 'shp'}
              title={ext === 'shp' ? t('preview.imageGifExportTitle') : t('preview.shpOnlyHint')}
            >
              <Image size={14} />
              {t('preview.imageGifExport')}
            </button>
          </div>
        </div>
      </div>

      {/* 视图切换 */}
      <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2">
        <span className="text-xs text-gray-400">{t('preview.viewLabel')}:</span>
        <div className="flex flex-wrap gap-2">
          {available.map(v => (
            <button
              key={v.key}
              className={`px-2 py-1 text-xs rounded ${activeView === v.key ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-200'}`}
              onClick={() => setActiveView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* 预览内容区域 */}
      <div className="flex-1 overflow-hidden">
        <div className="bg-gray-800 h-full w-full overflow-hidden">
          {(() => {
            const Viewer = available.find(v => v.key === activeView)?.Component ?? available[0].Component
            if (!selectedFile) return null
            if (
              (ext === 'mix' || ext === 'mmx' || ext === 'yro')
              && activeView === 'directory'
            ) {
              return (
                <MixDirectoryViewer
                  selectedFile={selectedFile}
                  mixFiles={mixFiles}
                  resourceContext={resourceContext}
                  onEnterCurrentMix={onEnterCurrentMix}
                  canEnterCurrentMix={canEnterCurrentMix}
                />
              )
            }
            return <Viewer selectedFile={selectedFile} mixFiles={mixFiles} resourceContext={resourceContext} />
          })()}
        </div>
      </div>

      {/* 预览底部：路径导航 + 当前文件 */}
      <div className="p-2 border-t border-gray-700 space-y-1">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="text-xs text-gray-300 flex flex-wrap items-center gap-1">
            {breadcrumbs.map((seg, i) => (
              <span key={i} className="flex items-center gap-1">
                <button
                  className="hover:text-white disabled:text-gray-400 focus:outline-none"
                  onClick={() => onBreadcrumbClick && onBreadcrumbClick(i)}
                >
                  {seg}
                </button>
                {i < breadcrumbs.length - 1 && <span className="text-gray-500">/</span>}
              </span>
            ))}
          </div>
        )}
        <div>
          <span className="text-xs text-gray-400">{t('preview.viewingFile', { name: selectedFile.split('/').pop() ?? '' })}</span>
        </div>
      </div>
      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        selectedFile={selectedFile}
        mixFiles={mixFiles}
        resourceContext={resourceContext}
        initialTab={exportInitialTab}
      />
    </div>
  )
}

export default PreviewPanel
