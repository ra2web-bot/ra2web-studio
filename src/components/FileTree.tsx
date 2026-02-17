import React from 'react'
import { File, Folder } from 'lucide-react'
import { MixFileData } from './MixEditor'

type BrowserMode = 'workspace' | 'repository'

interface FileItem {
  filename: string
  extension: string
  length: number
  path: string
  mixName?: string
  isMixFile?: boolean
}

interface FileTreeProps {
  mixFiles: MixFileData[]
  workspaceMixFiles?: MixFileData[]
  browserMode: BrowserMode
  onBrowserModeChange: (mode: BrowserMode) => void
  activeMixName: string | null
  onActiveMixChange: (mixName: string) => void
  mixSourceLabelByName?: Record<string, string>
  selectedFile: string | null
  onFileSelect: (file: string) => void
  // rootless 模式：隐藏顶层 MIX 作为树根，直接显示当前容器的条目
  container?: { name: string; info: any }
  rootless?: boolean
  navPrefix?: string // 如 a.mix/b.mix，便于拼接 path
  onDrillDown?: (filename: string) => void // 当点击的是 .mix 文件时触发
}

const FileTree: React.FC<FileTreeProps> = ({
  mixFiles,
  workspaceMixFiles,
  browserMode,
  onBrowserModeChange,
  activeMixName,
  onActiveMixChange,
  mixSourceLabelByName,
  selectedFile,
  onFileSelect,
  container,
  rootless,
  navPrefix,
  onDrillDown,
}) => {
  // 格式化文件大小显示
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // 获取文件类型名称
  const getFileTypeName = (extension: string): string => {
    const typeMap: { [key: string]: string } = {
      'xif': 'xif',
      'mix': 'mix',
      'shp': 'shp',
      'vxl': 'vxl',
      'pal': 'pal',
      'wav': 'wav',
      'ini': 'ini',
      'txt': 'txt',
      'pcx': 'pcx',
      'csf': 'csf',
      'dat': 'dat'
    }
    return typeMap[extension.toLowerCase()] || extension.toUpperCase() + '文件'
  }

  const toFileItem = (mixName: string, file: any, prefix?: string): FileItem => ({
    filename: file.filename,
    extension: file.extension,
    length: file.length,
    path: prefix ? `${prefix}${file.filename}` : `${mixName}/${file.filename}`,
    mixName,
    isMixFile: file.extension.toLowerCase() === 'mix',
  })

  const buildWorkspaceFileList = (): FileItem[] => {
    const files: FileItem[] = []
    if (rootless && container) {
      // 仅显示当前容器文件列表
      const prefix = navPrefix ? `${navPrefix}/` : `${container.name}/`
      for (const file of container.info.files) {
        files.push(toFileItem(container.name, file, prefix))
      }
      return files
    }
    const sourceMixFiles =
      workspaceMixFiles && workspaceMixFiles.length > 0 ? workspaceMixFiles : mixFiles
    // 工作区模式：仅显示当前激活 mix 对应内容（或 fallback）
    sourceMixFiles.forEach((mixData) => {
      mixData.info.files.forEach((file: any) => {
        files.push(toFileItem(mixData.info.name, file))
      })
    })
    return files
  }

  const buildRepositoryGroups = () => {
    return mixFiles.map((mixData) => ({
      mixName: mixData.info.name,
      sourceLabel: mixSourceLabelByName?.[mixData.info.name],
      files: mixData.info.files.map((file: any) => toFileItem(mixData.info.name, file)),
    }))
  }

  const workspaceFileList = buildWorkspaceFileList()
  const repositoryGroups = buildRepositoryGroups()
  const isNestedWorkspace = Boolean(rootless && navPrefix && navPrefix.includes('/'))

  const renderFileRow = (file: FileItem, key: string) => {
    const isSelected = selectedFile === file.path
    const isMixFile = browserMode === 'workspace' && file.isMixFile && onDrillDown
    return (
      <div
        key={key}
        className={`flex items-center hover:bg-gray-700 cursor-pointer border-b border-gray-800 ${
          isSelected ? 'bg-blue-600' : ''
        }`}
        onClick={() => onFileSelect(file.path)}
        onDoubleClick={() => {
          if (isMixFile) onDrillDown(file.filename)
        }}
      >
        <div className="flex-1 min-w-0 flex items-center px-2 py-1" style={{ minWidth: '175px' }}>
          {isMixFile ? (
            <Folder size={16} className="mr-2 flex-shrink-0" />
          ) : (
            <File size={16} className="mr-2 flex-shrink-0" />
          )}
          <span className="truncate text-sm" title={file.filename}>
            {file.filename}
          </span>
        </div>
        <div className="w-16 text-center text-xs text-gray-400 px-2 py-1" title={getFileTypeName(file.extension)}>
          {getFileTypeName(file.extension)}
        </div>
        <div className="w-20 text-right text-xs text-gray-400 px-2 py-1" title={`${file.length} 字节`}>
          {formatFileSize(file.length)}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 flex-shrink-0 border-b border-gray-700">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">文件浏览器</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`px-2 py-1 text-xs rounded border ${
              browserMode === 'workspace'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
            }`}
            onClick={() => onBrowserModeChange('workspace')}
          >
            单文件视角
          </button>
          <button
            type="button"
            className={`px-2 py-1 text-xs rounded border ${
              browserMode === 'repository'
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600'
            }`}
            onClick={() => onBrowserModeChange('repository')}
          >
            全局视角
          </button>
        </div>
        {browserMode === 'workspace' && mixFiles.length > 1 && (
          <div className="mt-2">
            <label className="text-xs text-gray-400 block mb-1">当前激活 MIX</label>
            <select
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-100"
              value={activeMixName ?? mixFiles[0].info.name}
              onChange={(e) => onActiveMixChange(e.target.value)}
            >
              {mixFiles.map((mix, index) => {
                const sourceLabel = mixSourceLabelByName?.[mix.info.name]
                const displayName =
                  sourceLabel === 'base' ? `${mix.info.name} [基座文件]` : mix.info.name
                return (
                  <option key={`${mix.info.name}-${index}`} value={mix.info.name}>
                    {displayName}
                  </option>
                )
              })}
            </select>
          </div>
        )}
        {browserMode === 'workspace' && isNestedWorkspace && navPrefix && (
          <div className="mt-2 text-xs text-gray-400 truncate" title={navPrefix}>
            当前容器：{navPrefix}
          </div>
        )}
      </div>

      {/* 表格头部 */}
      <div className="flex text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-800 border-b border-gray-700">
        <div className="flex-1 min-w-0 px-2 py-1">文件名</div>
        <div className="w-16 text-center px-2 py-1">类型</div>
        <div className="w-20 text-right px-2 py-1">大小</div>
      </div>

      {/* 表格内容 */}
      <div className="text-sm flex-1 overflow-y-auto">
        {browserMode === 'workspace' ? (
          workspaceFileList.length > 0 ? (
            workspaceFileList.map((file, index) => renderFileRow(file, `${file.path}-${index}`))
          ) : (
            <div className="px-3 py-3 text-xs text-gray-400">当前工作区暂无可显示文件。</div>
          )
        ) : repositoryGroups.length > 0 ? (
          repositoryGroups.map((group, groupIndex) => (
            <React.Fragment key={`${group.mixName}-${groupIndex}`}>
              <div className="flex items-center justify-between px-2 py-1 border-b border-gray-700 bg-gray-700">
                <div className="text-xs text-gray-200 truncate" title={group.mixName}>
                  {group.mixName}
                  {group.mixName === activeMixName && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-700 text-blue-100">
                      active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-gray-300">
                  {group.sourceLabel && (
                    <span className="px-1.5 py-0.5 rounded bg-gray-600 text-gray-100">
                      {group.sourceLabel}
                    </span>
                  )}
                  <span>{group.files.length} files</span>
                </div>
              </div>
              {group.files.map((file, fileIndex) =>
                renderFileRow(file, `${group.mixName}-${file.path}-${fileIndex}`),
              )}
            </React.Fragment>
          ))
        ) : (
          <div className="px-3 py-3 text-xs text-gray-400">资源仓库为空，请先导入资源。</div>
        )}
      </div>
    </div>
  )
}

export default FileTree
