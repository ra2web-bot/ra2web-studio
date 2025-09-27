import React, { useMemo, useState, useEffect } from 'react'
import { Image, Box, FileText, Music } from 'lucide-react'
import { MixFileInfo } from '../services/MixParser'
import IniViewer from './preview/IniViewer'
import DatViewer from './preview/DatViewer'
import HexViewer from './preview/HexViewer'
import TxtViewer from './preview/TxtViewer'
import PalViewer from './preview/PalViewer'
import PcxViewer from './preview/PcxViewer'

type MixFileData = { file: File; info: MixFileInfo }

interface PreviewPanelProps {
  selectedFile: string | null
  mixFiles: MixFileData[]
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({ selectedFile, mixFiles }) => {
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
      case 'wav':
        return <Music size={48} className="text-yellow-400" />
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
      case 'pal':
        return '调色板文件'
      case 'shp':
        return 'SHP 图像文件'
      case 'vxl':
        return 'VXL 3D模型文件'
      case 'pcx':
        return 'PCX 图像文件'
      case 'wav':
        return 'WAV 音频文件'
      default:
        return '未知文件类型'
    }
  }

  const ext = useMemo(() => selectedFile?.split('.').pop()?.toLowerCase() ?? '', [selectedFile])

  type ViewerDef = { key: string; label: string; Component: React.FC<{ selectedFile: string; mixFiles: MixFileData[] }> }
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
    pal: [
      { key: 'swatches', label: '色板', Component: PalViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
    pcx: [
      { key: 'image', label: '图像', Component: PcxViewer },
      { key: 'hex', label: '十六进制', Component: HexViewer },
    ],
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
      {/* 预览头部 */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center space-x-3">
          {getFileTypeIcon(selectedFile)}
          <div>
            <h3 className="text-lg font-semibold">{selectedFile.split('/').pop()}</h3>
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
            return selectedFile ? <Viewer selectedFile={selectedFile} mixFiles={mixFiles} /> : null
          })()}
        </div>
      </div>

      {/* 预览工具栏 */}
      <div className="p-2 border-t border-gray-700 flex justify-between items-center">
        <div className="flex space-x-2">
          <button className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors">
            缩放
          </button>
          <button className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded transition-colors">
            旋转
          </button>
        </div>
        <div className="text-xs text-gray-500">
          文件大小: 模拟数据
        </div>
      </div>
    </div>
  )
}

export default PreviewPanel
