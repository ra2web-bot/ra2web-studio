import React from 'react'
import { FolderOpen, Download, Settings, FolderPlus, Trash2, PackagePlus } from 'lucide-react'

interface ToolbarProps {
  mixFiles: string[]
  loading?: boolean
  selectedFile?: string | null
  onExport?: () => void
  onImportGameDirectory: () => void | Promise<void>
  onImportArchive: (files: File[]) => void | Promise<void>
  onImportPatchMixes: (files: File[]) => void | Promise<void>
  onClearResources: () => void | Promise<void>
  resourceReady: boolean
  resourceSummary?: string
}

const Toolbar: React.FC<ToolbarProps> = ({
  mixFiles,
  loading,
  selectedFile,
  onExport,
  onImportGameDirectory,
  onImportArchive,
  onImportPatchMixes,
  onClearResources,
  resourceReady,
  resourceSummary,
}) => {
  const openArchivePicker = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.tar.gz,.tgz,.exe,.7z,.zip,.mix'
    input.multiple = true
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      onImportArchive(files)
    }
    input.click()
  }

  const openPatchPicker = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mix,.mmx,.yro'
    input.multiple = true
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      onImportPatchMixes(files)
    }
    input.click()
  }

  const handleExport = () => {
    if (!selectedFile) return
    onExport?.()
  }

  return (
    <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4">
      <div className="flex items-center space-x-4">
        {/* 资源导入 */}
        <button
          onClick={() => onImportGameDirectory()}
          className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
          disabled={!!loading}
        >
          <FolderPlus size={16} />
          <span>导入游戏目录</span>
        </button>
        <button
          onClick={openArchivePicker}
          className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!!loading}
        >
          <FolderOpen size={16} />
          <span>导入归档/单MIX</span>
        </button>
        <button
          onClick={openPatchPicker}
          className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!resourceReady || !!loading}
          title={!resourceReady ? '请先导入完整游戏本体' : ''}
        >
          <PackagePlus size={16} />
          <span>导入补丁MIX</span>
        </button>
        <button
          onClick={() => onClearResources()}
          className="flex items-center space-x-2 px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!!loading}
        >
          <Trash2 size={16} />
          <span>清空资源</span>
        </button>

        <button
          onClick={handleExport}
          className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!mixFiles.length || !selectedFile || !!loading}
        >
          <Download size={16} />
          <span>导出到本地</span>
        </button>
      </div>

      <div className="flex-1 text-xs text-gray-400 text-right truncate px-4">
        {resourceSummary ?? (resourceReady ? '资源已就绪' : '等待导入游戏本体')}
      </div>

      <div className="flex items-center space-x-4">
        {/* 视图选项 */}
        <button className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors" disabled>
          <Settings size={16} />
          <span>设置</span>
        </button>
      </div>
    </div>
  )
}

export default Toolbar
