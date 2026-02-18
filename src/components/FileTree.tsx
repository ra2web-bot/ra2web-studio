import React, { useMemo, useState } from 'react'
import { File, Folder } from 'lucide-react'
import { MixFileData } from './MixEditor'
import SearchableSelect from './common/SearchableSelect'

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
  onNavigateUp?: () => void
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
  onNavigateUp,
}) => {
  const [searchQuery, setSearchQuery] = useState('')

  // 格式化文件大小显示
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // 类型列仅显示后缀（小写）
  const getFileTypeName = (extension: string): string => {
    const ext = (extension || '').trim().toLowerCase()
    return ext || '-'
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

  const workspaceFileList = useMemo(
    () => buildWorkspaceFileList(),
    [rootless, container, navPrefix, workspaceMixFiles, mixFiles],
  )
  const repositoryGroups = useMemo(
    () => buildRepositoryGroups(),
    [mixFiles, mixSourceLabelByName],
  )
  const normalizedSearchQuery = useMemo(
    () => searchQuery.trim().toLowerCase(),
    [searchQuery],
  )
  const filteredWorkspaceFileList = useMemo(() => {
    if (!normalizedSearchQuery) return workspaceFileList
    return workspaceFileList.filter((file) => (
      file.filename.toLowerCase().includes(normalizedSearchQuery)
      || file.extension.toLowerCase().includes(normalizedSearchQuery)
      || file.path.toLowerCase().includes(normalizedSearchQuery)
    ))
  }, [workspaceFileList, normalizedSearchQuery])
  const activeMixOptions = useMemo(
    () => mixFiles.map((mix) => {
      const sourceLabel = mixSourceLabelByName?.[mix.info.name]
      const label = sourceLabel === 'base' ? `${mix.info.name} [基座文件]` : mix.info.name
      return {
        value: mix.info.name,
        label,
        searchText: sourceLabel ?? '',
      }
    }),
    [mixFiles, mixSourceLabelByName],
  )
  const activeMixValue = activeMixName ?? mixFiles[0]?.info.name ?? ''
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
        {browserMode === 'workspace' && (
          <div className="mt-2">
            <input
              type="text"
              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-gray-100"
              placeholder="搜索素材名/后缀..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        )}
        {browserMode === 'workspace' && mixFiles.length > 1 && (
          <div className="mt-2">
            <label className="text-xs text-gray-400 block mb-1">当前激活 MIX</label>
            <SearchableSelect
              value={activeMixValue}
              options={activeMixOptions}
              onChange={(next) => {
                if (next) onActiveMixChange(next)
              }}
              triggerClassName="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-left text-gray-100 flex items-center gap-2"
              menuClassName="absolute z-50 mt-1 left-0 right-0 rounded border border-gray-600 bg-gray-700 shadow-xl"
              searchPlaceholder="搜索 MIX..."
              noResultsText="未找到匹配 MIX"
              footerHint=""
            />
          </div>
        )}
        {browserMode === 'workspace' && isNestedWorkspace && navPrefix && (
          <div className="mt-2 flex items-center gap-2">
            <div className="text-xs text-gray-400 truncate flex-1" title={navPrefix}>
              当前容器：{navPrefix}
            </div>
            {onNavigateUp && (
              <button
                type="button"
                className="px-2 py-0.5 text-[11px] rounded border border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600"
                onClick={onNavigateUp}
              >
                返回上一级
              </button>
            )}
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
            filteredWorkspaceFileList.length > 0 ? (
              filteredWorkspaceFileList.map((file, index) => renderFileRow(file, `${file.path}-${index}`))
            ) : (
              <div className="px-3 py-3 text-xs text-gray-400">未找到匹配素材。</div>
            )
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
