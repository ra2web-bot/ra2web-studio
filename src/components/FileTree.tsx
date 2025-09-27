import React, { useState } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react'
import { MixFileData } from './MixEditor'

interface FileTreeNode {
  name: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
  path: string
  extension?: string
  mixName?: string
}

interface FileTreeProps {
  mixFiles: MixFileData[]
  selectedFile: string | null
  onFileSelect: (file: string) => void
}

const FileTree: React.FC<FileTreeProps> = ({ mixFiles, selectedFile, onFileSelect }) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedFolders(newExpanded)
  }

  const renderNode = (node: FileTreeNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.path)
    const isSelected = selectedFile === node.path

    if (node.type === 'folder') {
      return (
        <div key={node.path}>
          <div
            className={`flex items-center py-1 px-2 hover:bg-gray-700 cursor-pointer ${
              isSelected ? 'bg-blue-600' : ''
            }`}
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => toggleFolder(node.path)}
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            {isExpanded ? <FolderOpen size={16} className="ml-1" /> : <Folder size={16} className="ml-1" />}
            <span className="ml-2 text-sm">{node.name}</span>
          </div>
          {isExpanded && node.children?.map(child => renderNode(child, level + 1))}
        </div>
      )
    } else {
      return (
        <div
          key={node.path}
          className={`flex items-center py-1 px-2 hover:bg-gray-700 cursor-pointer ${
            isSelected ? 'bg-blue-600' : ''
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => onFileSelect(node.path)}
        >
          <File size={16} className="mr-2" />
          <span className="text-sm">{node.name}</span>
        </div>
      )
    }
  }

  // 构建文件树结构
  const buildFileTree = (): FileTreeNode[] => {
    const nodes: FileTreeNode[] = []

    mixFiles.forEach(mixData => {
      const mixNode: FileTreeNode = {
        name: mixData.info.name,
        type: 'folder',
        path: mixData.info.name,
        mixName: mixData.info.name,
        children: mixData.info.files.map((file: any) => ({
          name: file.filename,
          type: 'file',
          path: `${mixData.info.name}/${file.filename}`,
          extension: file.extension,
          mixName: mixData.info.name
        }))
      }
      nodes.push(mixNode)
    })

    return nodes
  }

  const fileTree = buildFileTree()

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
        文件浏览器
      </div>
      <div className="text-sm">
        {fileTree.map(node => renderNode(node))}
      </div>
    </div>
  )
}

export default FileTree
