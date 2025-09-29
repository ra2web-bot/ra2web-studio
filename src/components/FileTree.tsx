import React from 'react'
import { File, Folder } from 'lucide-react'
import { MixFileData } from './MixEditor'

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
  selectedFile: string | null
  onFileSelect: (file: string) => void
  // rootless 模式：隐藏顶层 MIX 作为树根，直接显示当前容器的条目
  container?: { name: string; info: any }
  rootless?: boolean
  navPrefix?: string // 如 a.mix/b.mix，便于拼接 path
  onDrillDown?: (filename: string) => void // 当点击的是 .mix 文件时触发
}

const FileTree: React.FC<FileTreeProps> = ({ mixFiles, selectedFile, onFileSelect, container, rootless, navPrefix, onDrillDown }) => {
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

  // 构建文件列表
  const buildFileList = (): FileItem[] => {
    const files: FileItem[] = []
    if (rootless && container) {
      // 仅显示当前容器文件列表
      const prefix = navPrefix ? `${navPrefix}/` : `${container.name}/`
      for (const file of container.info.files) {
        files.push({
          filename: file.filename,
          extension: file.extension,
          length: file.length,
          path: `${prefix}${file.filename}`,
          mixName: container.name,
          isMixFile: file.extension.toLowerCase() === 'mix'
        })
      }
      return files
    }
    // 默认：显示所有 MIX 文件中的文件
    mixFiles.forEach(mixData => {
      mixData.info.files.forEach((file: any) => {
        files.push({
          filename: file.filename,
          extension: file.extension,
          length: file.length,
          path: `${mixData.info.name}/${file.filename}`,
          mixName: mixData.info.name,
          isMixFile: file.extension.toLowerCase() === 'mix'
        })
      })
    })

    return files
  }

  const fileList = buildFileList()

  return (
    <div className="h-full flex flex-col">
      <div className="p-2 text-xs font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0 border-b border-gray-700">
        文件浏览器
      </div>

      {/* 表格头部 */}
      <div className="flex text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-800 border-b border-gray-700">
        <div className="flex-1 min-w-0 px-2 py-1">文件名</div>
        <div className="w-16 text-center px-2 py-1">类型</div>
        <div className="w-20 text-right px-2 py-1">大小</div>
      </div>

      {/* 表格内容 */}
      <div className="text-sm flex-1 overflow-y-auto">
        {fileList.map((file, index) => {
          const isSelected = selectedFile === file.path
          const isMixFile = file.isMixFile && onDrillDown

          return (
            <div
              key={file.path || index}
              className={`flex items-center hover:bg-gray-700 cursor-pointer border-b border-gray-800 ${
                isSelected ? 'bg-blue-600' : ''
              }`}
              onClick={() => onFileSelect(file.path)}
              onDoubleClick={() => { if (isMixFile) onDrillDown(file.filename) }}
            >
              {/* 文件名列 */}
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

              {/* 类型列 */}
              <div className="w-16 text-center text-xs text-gray-400 px-2 py-1" title={getFileTypeName(file.extension)}>
                {getFileTypeName(file.extension)}
              </div>

              {/* 大小列 */}
              <div className="w-20 text-right text-xs text-gray-400 px-2 py-1" title={`${file.length} 字节`}>
                {formatFileSize(file.length)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default FileTree
