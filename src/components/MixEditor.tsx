import React, { useState, useCallback } from 'react'
import Toolbar from './Toolbar'
import FileTree from './FileTree'
import PreviewPanel from './PreviewPanel'
import PropertiesPanel from './PropertiesPanel'
import { MixParser, MixFileInfo } from '../services/MixParser'

interface MixFileData {
  file: File
  info: MixFileInfo
}

const MixEditor: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [mixFiles, setMixFiles] = useState<MixFileData[]>([])
  const [loading, setLoading] = useState(false)

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
        // 自动选择第一个文件
        const firstMix = mixDataArray[0]
        if (firstMix.info.files.length > 0) {
          setSelectedFile(`${firstMix.info.name}/${firstMix.info.files[0].filename}`)
        }
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

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <Toolbar
        mixFiles={mixFiles.map(mix => mix.file.name)}
        onFileOpen={handleFileOpen}
        loading={loading}
      />

      {/* 主内容区域 */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧文件树 */}
        <div className="w-64 bg-gray-800 border-r border-gray-700">
          <FileTree
            mixFiles={mixFiles}
            selectedFile={selectedFile}
            onFileSelect={handleFileSelect}
          />
        </div>

        {/* 中间预览区域 */}
        <div className="flex-1 min-w-0 min-h-0 bg-gray-900 overflow-hidden">
          <PreviewPanel
            selectedFile={selectedFile}
            mixFiles={mixFiles}
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
        RA2Web Studio - 红色警戒2 Mix文件编辑器
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
