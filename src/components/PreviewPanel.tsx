import React, { useMemo, useState, useEffect } from 'react'
import { Image, Box, FileText, Music, Info, Archive, Video } from 'lucide-react'
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

    switch (extension) {
      case 'ini':
        return 'INI 配置文件'
      case 'txt':
        return '文本文件'
      case 'csf':
        return 'CSF 字符串表'
      case 'pal':
        return '调色板文件'
      case 'shp':
        return 'SHP 图像文件'
      case 'vxl':
        return 'VXL 3D模型文件'
      case 'pcx':
        return 'PCX 图像文件'
      case 'tmp':
      case 'tem':
      case 'sno':
      case 'urb':
      case 'ubn':
      case 'des':
      case 'lun':
        return 'TMP 地图图块文件'
      case 'wav':
        return 'WAV 音频文件'
      case 'bik':
        return 'BIK 视频文件'
      case 'map':
      case 'mpr':
        return '地图文件'
      case 'mix':
      case 'mmx':
      case 'yro':
        return '王二火大归档文件'
      default:
        return '未知文件类型'
    }
  }

  const ext = useMemo(() => selectedFile?.split('.').pop()?.toLowerCase() ?? '', [selectedFile])

  type ViewerDef = {
    key: string
    label: string
    Component: React.FC<{ selectedFile: string; mixFiles: MixFileData[]; resourceContext?: ResourceContext | null }>
  }
  const tmpViews: ViewerDef[] = [
    { key: 'image', label: '图像', Component: TmpViewer },
    { key: 'hex', label: '十六进制', Component: HexViewer },
  ]
  const mixViews: ViewerDef[] = [
    { key: 'directory', label: '目录', Component: MixDirectoryViewer },
    { key: 'hex', label: '十六进制', Component: HexViewer },
  ]
  const mapViews: ViewerDef[] = [
    { key: 'minimap', label: '小地图', Component: MapViewer },
    { key: 'text', label: '文本', Component: IniViewer },
    { key: 'hex', label: '十六进制', Component: HexViewer },
  ]
  const viewsByExt: Record<string, ViewerDef[]> = {
    ini: [
      { key: 'text', label: '文本', Component: IniViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
    dat: [
      { key: 'auto', label: 'LMD/自动', Component: DatViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
    txt: [
      { key: 'text', label: '文本', Component: TxtViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
    csf: [
      { key: 'viewer', label: 'CSF', Component: CsfViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
    pal: [
      { key: 'swatches', label: '色板', Component: PalViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
    shp: [
      { key: 'image', label: '图像', Component: ShpViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
    vxl: [
      { key: 'viewer2d', label: '2D帧采样', Component: VxlViewer },
      { key: 'viewer3d', label: '3D', Component: VxlViewer3D },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
    pcx: [
      { key: 'image', label: '图像', Component: PcxViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
    wav: [
      { key: 'audio', label: '音频', Component: WavViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
    bik: [
      { key: 'video', label: '视频', Component: BikViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
    hva: [
      { key: 'viewer', label: '3D', Component: HvaViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
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
    { key: 'hex', label: '十六进制', Component: HexViewer },
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
          <p className="text-lg">选择一个文件来预览</p>
          <p className="text-sm mt-2">在左侧文件树中点击文件来查看预览</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* 预览头部：面包屑 + 文件信息 */}
      <div className="p-4 border-b border-gray-700">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="mb-2 text-sm text-gray-300 flex flex-wrap items-center gap-1">
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
        <div className="flex items-center space-x-3">
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
                title="点击可以查看元数据详情"
                aria-label="点击可以查看元数据详情"
                aria-pressed={metadataDrawerOpen}
              >
                <Info size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-400">{getFileTypeName(selectedFile)}</p>
          </div>
        </div>
      </div>

      {/* 视图切换 */}
      <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2">
        <span className="text-xs text-gray-400">视图:</span>
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

      {/* 预览工具栏 */}
      <div className="p-2 border-t border-gray-700 flex justify-between items-center">
        <div className="flex space-x-2">
          <span className="text-xs text-gray-400">您正在查看文件：{selectedFile.split('/').pop()}</span>
        </div>
      </div>
    </div>
  )
}

export default PreviewPanel
