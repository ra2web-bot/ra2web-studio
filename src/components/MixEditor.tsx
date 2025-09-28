import React, { useState, useCallback, useMemo } from 'react'
import Toolbar from './Toolbar'
import FileTree from './FileTree'
import PreviewPanel from './PreviewPanel'
import PropertiesPanel from './PropertiesPanel'
import { MixParser, MixFileInfo } from '../services/MixParser'
import { VirtualFile } from '../data/vfs/VirtualFile'
import { DataStream } from '../data/DataStream'
import { MixFile as MixFileDataStream } from '../data/MixFile'

export interface MixFileData {
  file: File
  info: MixFileInfo
}

const MixEditor: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [mixFiles, setMixFiles] = useState<MixFileData[]>([])
  const [loading, setLoading] = useState(false)
  // 导航栈：从顶层 MIX 到当前容器（可能是子 MIX）
  const [navStack, setNavStack] = useState<Array<{ name: string; info: MixFileInfo; fileObj: File | VirtualFile }>>([])

  const handleFileOpen = useCallback(async (files: File[]) => {
    setLoading(true)
    try {
      const mixDataArray: MixFileData[] = []

      for (const file of files) {
        const info = await MixParser.parseFile(file)
        mixDataArray.push({ file, info })
      }

      setMixFiles(mixDataArray)
      if (mixDataArray.length > 0) {
        // 默认激活第一个 MIX
        const firstMix = mixDataArray[0]
        setNavStack([{ name: firstMix.info.name, info: firstMix.info, fileObj: firstMix.file }])
        if (firstMix.info.files.length > 0) {
          setSelectedFile(`${firstMix.info.name}/${firstMix.info.files[0].filename}`)
        } else {
          setSelectedFile(null)
        }
      } else {
        setNavStack([])
        setSelectedFile(null)
      }
    } catch (error) {
      console.error('Failed to open MIX files:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleFileSelect = useCallback((filePath: string) => {
    setSelectedFile(filePath)
  }, [])

  const currentContainer = navStack.length > 0 ? navStack[navStack.length - 1] : null
  const currentPrefix = useMemo(() => navStack.map(n => n.name).join('/'), [navStack])

  const handleDrillDown = useCallback(async (filename: string) => {
    if (!currentContainer) return
    try {
      let childVf: VirtualFile | null = null
      if (currentContainer.fileObj instanceof File) {
        // 从顶层 File 容器提取
        childVf = await MixParser.extractFile(currentContainer.fileObj, filename)
      } else {
        // 从 VirtualFile 容器提取
        const ds = currentContainer.fileObj.stream as DataStream
        const mix = new MixFileDataStream(ds)
        if (mix.containsFile(filename)) {
          childVf = mix.openFile(filename)
        }
      }
      if (!childVf) return
      // 解析子 MIX
      const childInfo = await MixParser.parseVirtualFile(childVf, filename)
      const newStack = [...navStack, { name: filename, info: childInfo, fileObj: childVf }]
      setNavStack(newStack)
      // 自动选择子容器中的第一个文件
      if (childInfo.files.length > 0) {
        const newPrefix = newStack.map(n => n.name).join('/')
        setSelectedFile(`${newPrefix}/${childInfo.files[0].filename}`)
      } else {
        const newPrefix = newStack.map(n => n.name).join('/')
        setSelectedFile(`${newPrefix}/`)
      }
    } catch (e) {
      console.error('Drill down failed:', e)
    }
  }, [currentContainer, navStack])

  const handleBreadcrumbClick = useCallback((index: number) => {
    if (index < 0 || index >= navStack.length) return
    const newStack = navStack.slice(0, index + 1)
    setNavStack(newStack)
    const top = newStack[newStack.length - 1]
    if (top && top.info.files.length > 0) {
      const prefix = newStack.map(n => n.name).join('/')
      setSelectedFile(`${prefix}/${top.info.files[0].filename}`)
    } else {
      setSelectedFile(null)
    }
  }, [navStack])

  const handleExport = useCallback(async () => {
    try {
      if (!selectedFile) return
      const slash = selectedFile.indexOf('/')
      if (slash <= 0) return
      const mixName = selectedFile.substring(0, slash)
      const inner = selectedFile.substring(slash + 1)
      const mix = mixFiles.find(m => m.info.name === mixName)
      if (!mix) return
      const vf = await MixParser.extractFile(mix.file, inner)
      if (!vf) return
      const bytes = vf.getBytes()
      const ab = bytes.buffer as ArrayBuffer
      const blob = new Blob([ab.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = inner
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }, [selectedFile, mixFiles])

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <Toolbar
        mixFiles={mixFiles.map(mix => mix.file.name)}
        onFileOpen={handleFileOpen}
        loading={loading}
        selectedFile={selectedFile}
        onExport={handleExport}
      />

      {/* 主内容区域 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧文件树 */}
        <div className="w-64 bg-gray-800 border-r border-gray-700">
          <FileTree
            mixFiles={mixFiles}
            selectedFile={selectedFile}
            onFileSelect={handleFileSelect}
            // rootless container view when we have a current container
            container={currentContainer ? { info: currentContainer.info, name: currentContainer.name } : undefined}
            rootless={!!currentContainer}
            navPrefix={currentPrefix}
            onDrillDown={handleDrillDown}
          />
        </div>

        {/* 中间预览区域 */}
        <div className="flex-1 min-w-0 min-h-0 bg-gray-900 overflow-hidden">
          <PreviewPanel
            selectedFile={selectedFile}
            mixFiles={mixFiles}
            breadcrumbs={navStack.map(n => n.name)}
            onBreadcrumbClick={handleBreadcrumbClick}
          />
        </div>

        {/* 右侧属性面板 */}
        <div className="w-80 bg-gray-800 border-l border-gray-700">
          <PropertiesPanel
            selectedFile={selectedFile}
            mixFiles={mixFiles}
          />
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="h-8 bg-gray-800 border-t border-gray-700 flex items-center px-4 text-sm text-gray-400">
        RA2Web Studio - 王二火大 Mix文件编辑器
        {mixFiles.length > 0 && (
          <span className="ml-4">
            已加载 {mixFiles.length} 个MIX文件，{mixFiles.reduce((sum, mix) => sum + mix.info.files.length, 0)} 个文件
          </span>
        )}
      </div>
    </div>
  )
}

export default MixEditor
