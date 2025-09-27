import React from 'react'
import { FolderOpen, Download, Settings } from 'lucide-react'

interface ToolbarProps {
  mixFiles: string[]
  onFileOpen: (files: File[]) => void
  loading?: boolean
  selectedFile?: string | null
  onExport?: () => void
}

const Toolbar: React.FC<ToolbarProps> = ({ mixFiles, onFileOpen, loading: _loading, selectedFile, onExport }) => {
  const handleFileOpen = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.mix'
    input.multiple = true
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      onFileOpen(files)
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
        {/* 文件操作 */}
        <button
          onClick={handleFileOpen}
          className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
        >
          <FolderOpen size={16} />
          <span>打开MIX文件</span>
        </button>

        {/* <button
          className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
          disabled={mixFiles.length === 0}
        >
          <Save size={16} />
          <span>保存</span>
        </button> */}

        <button
          onClick={handleExport}
          className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!mixFiles.length || !selectedFile}
        >
          <Download size={16} />
          <span>导出到本地</span>
        </button>
      </div>

      <div className="flex-1" />

      <div className="flex items-center space-x-4">
        {/* 视图选项 */}
        <button className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors">
          <Settings size={16} />
          <span>设置</span>
        </button>
      </div>
    </div>
  )
}

export default Toolbar
