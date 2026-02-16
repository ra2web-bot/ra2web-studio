import React, { useState, useCallback, useMemo, useEffect } from 'react'
import Toolbar from './Toolbar'
import FileTree from './FileTree'
import PreviewPanel from './PreviewPanel'
import PropertiesPanel from './PropertiesPanel'
import ImportProgressPanel from './ImportProgressPanel'
import { MixParser, MixFileInfo } from '../services/MixParser'
import { VirtualFile } from '../data/vfs/VirtualFile'
import { DataStream } from '../data/DataStream'
import { MixFile as MixFileDataStream } from '../data/MixFile'
import { GameResBootstrap } from '../services/gameRes/GameResBootstrap'
import { FileSystemUtil } from '../services/gameRes/FileSystemUtil'
import type { ResourceContext } from '../services/gameRes/ResourceContext'
import {
  createInitialGameResImportSteps,
  GAME_RES_IMPORT_STAGE_ORDER,
} from '../services/gameRes/types'
import type { GameResImportProgressEvent, GameResImportStepState } from '../services/gameRes/types'

export interface MixFileData {
  file: File
  info: MixFileInfo
}

const NON_ERROR_STAGE_ORDER = GAME_RES_IMPORT_STAGE_ORDER.filter((stage) => stage !== 'error')

function applyProgressEventToSteps(
  steps: GameResImportStepState[],
  event: GameResImportProgressEvent,
): GameResImportStepState[] {
  const next = steps.map((step) => ({ ...step }))

  if (event.stage === 'error') {
    for (const step of next) {
      if (step.status === 'active') step.status = 'completed'
    }
    const errorStep = next.find((step) => step.id === 'error')
    if (errorStep) errorStep.status = 'error'
    return next
  }

  const activeIndex = NON_ERROR_STAGE_ORDER.indexOf(event.stage)
  for (const step of next) {
    if (step.id === 'error') {
      step.status = 'pending'
      continue
    }
    const stepIndex = NON_ERROR_STAGE_ORDER.indexOf(step.id as Exclude<typeof step.id, 'error'>)
    if (stepIndex < activeIndex) {
      step.status = 'completed'
    } else if (stepIndex === activeIndex) {
      step.status = event.stage === 'done' ? 'completed' : 'active'
    } else {
      step.status = 'pending'
    }
  }
  return next
}

const MixEditor: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [mixFiles, setMixFiles] = useState<MixFileData[]>([])
  const [loading, setLoading] = useState(false)
  const [progressMessage, setProgressMessage] = useState<string>('')
  const [importProgressEvent, setImportProgressEvent] = useState<GameResImportProgressEvent | null>(null)
  const [importProgressSteps, setImportProgressSteps] = useState<GameResImportStepState[]>(
    () => createInitialGameResImportSteps(),
  )
  const [resourceReady, setResourceReady] = useState(false)
  const [missingRequiredFiles, setMissingRequiredFiles] = useState<string[]>([])
  const [resourceContext, setResourceContext] = useState<ResourceContext | null>(null)
  // 导航栈：从顶层 MIX 到当前容器（可能是子 MIX）
  const [navStack, setNavStack] = useState<Array<{ name: string; info: MixFileInfo; fileObj: File | VirtualFile }>>([])

  const initializeSelection = useCallback((nextMixFiles: MixFileData[]) => {
    if (!nextMixFiles.length) {
      setNavStack([])
      setSelectedFile(null)
      return
    }
    const firstMix = nextMixFiles[0]
    setNavStack([{ name: firstMix.info.name, info: firstMix.info, fileObj: firstMix.file }])
    if (firstMix.info.files.length > 0) {
      setSelectedFile(`${firstMix.info.name}/${firstMix.info.files[0].filename}`)
    } else {
      setSelectedFile(null)
    }
  }, [])

  const resetImportProgress = useCallback((message?: string) => {
    setImportProgressSteps(createInitialGameResImportSteps())
    setImportProgressEvent(null)
    setProgressMessage(message ?? '')
  }, [])

  const handleImportProgressEvent = useCallback((event: GameResImportProgressEvent) => {
    setImportProgressEvent(event)
    setImportProgressSteps((prev) => applyProgressEventToSteps(prev, event))
    setProgressMessage(event.message)
  }, [])

  const reloadResourceContext = useCallback(async () => {
    setLoading(true)
    setProgressMessage('正在读取浏览器资源...')
    try {
      const config = GameResBootstrap.loadConfig()
      const ctx = await GameResBootstrap.loadContext(config.activeModName)
      setResourceContext(ctx)
      setResourceReady(ctx.readiness.ready)
      setMissingRequiredFiles(ctx.readiness.missingRequiredFiles)
      const nextMixFiles = ctx.toMixFileData()
      setMixFiles(nextMixFiles)
      if (ctx.readiness.ready) {
        initializeSelection(nextMixFiles)
      } else {
        setNavStack([])
        setSelectedFile(null)
      }
      setProgressMessage('')
    } catch (error) {
      console.error('Failed to load resource context:', error)
      setProgressMessage('读取资源失败')
      setResourceReady(false)
      setMissingRequiredFiles(['ra2.mix', 'language.mix', 'multi.mix'])
      setMixFiles([])
      setNavStack([])
      setSelectedFile(null)
    } finally {
      setLoading(false)
    }
  }, [initializeSelection])

  useEffect(() => {
    reloadResourceContext()
  }, [reloadResourceContext])

  const handleImportGameDirectory = useCallback(async () => {
    setLoading(true)
    resetImportProgress('准备导入目录资源...')
    try {
      if (!FileSystemUtil.isOpfsSupported()) {
        alert('当前浏览器不支持持久化文件系统（OPFS），无法导入本体资源。')
        return
      }
      const dirHandle = await FileSystemUtil.showDirectoryPicker()
      const result = await GameResBootstrap.importGameDirectory(
        dirHandle,
        setProgressMessage,
        handleImportProgressEvent,
      )
      if (result.errors.length > 0) {
        alert(`部分文件导入失败：\n${result.errors.slice(0, 8).join('\n')}`)
      }
      await reloadResourceContext()
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      handleImportProgressEvent({
        stage: 'error',
        stageLabel: '导入失败',
        message: e?.message || '导入游戏目录失败',
        errorMessage: e?.message || '导入游戏目录失败',
      })
      alert(e?.message || '导入游戏目录失败')
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [reloadResourceContext, handleImportProgressEvent, resetImportProgress])

  const handleImportArchive = useCallback(async (files: File[]) => {
    if (!files.length) return
    setLoading(true)
    resetImportProgress('准备导入归档资源...')
    try {
      for (const file of files) {
        const result = await GameResBootstrap.importGameArchive(
          file,
          setProgressMessage,
          handleImportProgressEvent,
        )
        if (result.errors.length > 0) {
          alert(`${file.name} 导入异常：\n${result.errors.slice(0, 8).join('\n')}`)
        }
      }
      await reloadResourceContext()
    } catch (e: any) {
      handleImportProgressEvent({
        stage: 'error',
        stageLabel: '导入失败',
        message: e?.message || '导入归档失败',
        errorMessage: e?.message || '导入归档失败',
      })
      alert(e?.message || '导入归档失败')
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [reloadResourceContext, handleImportProgressEvent, resetImportProgress])

  const handleImportPatchMixes = useCallback(async (files: File[]) => {
    if (!files.length) return
    setLoading(true)
    resetImportProgress('准备导入补丁资源...')
    try {
      const result = await GameResBootstrap.importPatchFiles(
        files,
        setProgressMessage,
        handleImportProgressEvent,
      )
      if (result.errors.length > 0) {
        alert(`补丁导入异常：\n${result.errors.slice(0, 8).join('\n')}`)
      }
      await reloadResourceContext()
    } catch (e: any) {
      handleImportProgressEvent({
        stage: 'error',
        stageLabel: '导入失败',
        message: e?.message || '导入补丁失败',
        errorMessage: e?.message || '导入补丁失败',
      })
      alert(e?.message || '导入补丁失败')
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [reloadResourceContext, handleImportProgressEvent, resetImportProgress])

  const handleClearResources = useCallback(async () => {
    if (!confirm('确定清空浏览器中的游戏资源吗？此操作不可撤销。')) return
    setLoading(true)
    try {
      await GameResBootstrap.clearAllResources()
      await reloadResourceContext()
    } catch (e: any) {
      alert(e?.message || '清空资源失败')
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [reloadResourceContext])

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
      {/* 顶部工具栏（仅资源就绪后显示） */}
      {resourceReady && (
        <Toolbar
          mixFiles={mixFiles.map(mix => mix.file.name)}
          loading={loading}
          selectedFile={selectedFile}
          onExport={handleExport}
          onImportGameDirectory={handleImportGameDirectory}
          onImportArchive={handleImportArchive}
          onImportPatchMixes={handleImportPatchMixes}
          onClearResources={handleClearResources}
          resourceReady={resourceReady}
          resourceSummary={
            progressMessage ||
            `资源就绪：${mixFiles.length} 个MIX（补丁可继续导入）`
          }
        />
      )}

      {/* 主内容区域 */}
      {!resourceReady ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-2xl w-full bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-3">导入游戏资源</h2>
            <p className="text-gray-300 text-sm leading-6">
              先导入游戏目录或归档文件，建立本地资源基座后再进入编辑界面。
            </p>
            <div className="mt-4 text-sm text-yellow-300">
              当前缺少：{missingRequiredFiles.join(', ') || '未知（请重新导入）'}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.tar.gz,.tgz,.exe,.7z,.zip,.mix'
                  input.multiple = true
                  input.onchange = (e) => {
                    const files = Array.from((e.target as HTMLInputElement).files || [])
                    void handleImportArchive(files)
                  }
                  input.click()
                }}
                disabled={loading}
              >
                选择归档（tar.gz/exe/7z）文件
              </button>
              <button
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm"
                onClick={() => handleImportGameDirectory()}
                disabled={loading}
              >
                选择游戏目录
              </button>
            </div>
            <ImportProgressPanel
              steps={importProgressSteps}
              message={importProgressEvent?.message}
              currentItem={importProgressEvent?.currentItem}
              percentage={importProgressEvent?.percentage}
              fallbackMessage={loading ? progressMessage : '请选择游戏目录或归档开始导入。'}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* 左侧文件树 */}
          <div className="w-80 bg-gray-800 border-r border-gray-700">
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
              resourceContext={resourceContext}
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
      )}

      {/* 底部状态栏 */}
      <div className="h-8 bg-gray-800 border-t border-gray-700 flex items-center px-4 text-sm text-gray-400">
        RA2Web Studio - 王二火大 Mix文件编辑器
        {resourceReady && mixFiles.length > 0 && (
          <span className="ml-4">
            已加载 {mixFiles.length} 个MIX文件，{mixFiles.reduce((sum, mix) => sum + mix.info.files.length, 0)} 个文件
          </span>
        )}
      </div>
    </div>
  )
}

export default MixEditor
