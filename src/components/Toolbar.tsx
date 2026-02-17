import React, { useEffect, useRef, useState } from 'react'
import { FolderOpen, Download, Settings, FolderPlus, Trash2, PackagePlus } from 'lucide-react'

interface ToolbarProps {
  mixFiles: string[]
  loading?: boolean
  selectedFile?: string | null
  onExport?: () => void
  onReimportBaseDirectory: () => void | Promise<void>
  onReimportBaseArchives: (files: File[]) => void | Promise<void>
  onImportPatchMixes: (files: File[]) => void | Promise<void>
  onClearNonBaseResources: () => void | Promise<void>
  resourceReady: boolean
  resourceSummary?: string
}

const Toolbar: React.FC<ToolbarProps> = ({
  mixFiles,
  loading,
  selectedFile,
  onExport,
  onReimportBaseDirectory,
  onReimportBaseArchives,
  onImportPatchMixes,
  onClearNonBaseResources,
  resourceReady,
  resourceSummary,
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsMenuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!settingsMenuRef.current) return
      if (!settingsMenuRef.current.contains(event.target as Node)) {
        setSettingsOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const openArchivePicker = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.tar.gz,.tgz,.exe,.7z,.zip,.mix'
    input.multiple = true
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      onReimportBaseArchives(files)
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

  const handleReimportBaseDirectoryFromSettings = () => {
    setSettingsOpen(false)
    void onReimportBaseDirectory()
  }

  const handleReimportBaseArchivesFromSettings = () => {
    setSettingsOpen(false)
    openArchivePicker()
  }

  return (
    <div className="h-12 bg-gray-800 border-b border-gray-700 flex items-center px-4">
      <div className="flex items-center space-x-4">
        <div className="relative" ref={settingsMenuRef}>
          <button
            onClick={() => setSettingsOpen((prev) => !prev)}
            className="flex items-center space-x-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
            disabled={!!loading}
          >
            <Settings size={16} />
            <span>设置</span>
          </button>
          {settingsOpen && (
            <div className="absolute left-0 top-full mt-2 w-72 rounded border border-gray-600 bg-gray-800 shadow-lg z-20">
              <div className="px-3 py-2 border-b border-gray-700">
                <div className="text-xs font-semibold text-gray-200">系统内部配置</div>
                <div className="text-[11px] text-gray-400 mt-1">基座文件管理</div>
              </div>
              <button
                onClick={handleReimportBaseDirectoryFromSettings}
                className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-left hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!!loading}
              >
                <FolderPlus size={15} />
                <span>重新导入基座目录</span>
              </button>
              <button
                onClick={handleReimportBaseArchivesFromSettings}
                className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-left hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!!loading}
              >
                <FolderOpen size={15} />
                <span>重新导入基座归档</span>
              </button>
            </div>
          )}
        </div>

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
          onClick={() => onClearNonBaseResources()}
          className="flex items-center space-x-2 px-3 py-1.5 bg-red-700 hover:bg-red-600 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!!loading}
          title="仅清空补丁/模组，不会清除基座文件"
        >
          <Trash2 size={16} />
          <span>清空补丁/模组</span>
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
    </div>
  )
}

export default Toolbar
