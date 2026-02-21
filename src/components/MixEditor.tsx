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
import type { ResourceContext, ResourceLoadProgressEvent } from '../services/gameRes/ResourceContext'
import { normalizeResourceFilename } from '../services/gameRes/patterns'
import {
  MixArchiveBuilder,
  type MixArchiveBuilderEntry,
  type MixArchiveLmdSummary,
} from '../services/mixEdit/MixArchiveBuilder'
import { bytesToBlob, triggerBrowserDownload } from '../services/export/utils'
import { useAppDialog } from './common/AppDialogProvider'
import { useLocale } from '../i18n/LocaleContext'
import {
  createInitialGameResImportSteps,
  GAME_RES_IMPORT_STAGE_ORDER,
} from '../services/gameRes/types'
import type { GameResImportProgressEvent, GameResImportStepState } from '../services/gameRes/types'

export interface MixFileData {
  file: File
  info: MixFileInfo
}

type BrowserMode = 'workspace' | 'repository'
type MixContainerNode = { name: string; info: MixFileInfo; fileObj: File | VirtualFile }
type RestorableNavigationTarget = { stackNames: string[]; selectedLeafName?: string }
type LayerLmdSummary = MixArchiveLmdSummary & { layerName: string }
type PersistEntriesResult = {
  currentLmdSummary: MixArchiveLmdSummary
  parentLmdSummaries: LayerLmdSummary[]
}

const LOCAL_MIX_DATABASE_FILENAME = 'local mix database.dat'

function normalizeMixEntryName(name: string): string {
  return name.replace(/\\/g, '/').trim().toLowerCase()
}

function sameMixEntryName(a: string, b: string): boolean {
  return normalizeMixEntryName(a) === normalizeMixEntryName(b)
}

function isLocalMixDatabaseEntry(name: string): boolean {
  return sameMixEntryName(name, LOCAL_MIX_DATABASE_FILENAME)
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  return copy
}

const NON_ERROR_STAGE_ORDER = GAME_RES_IMPORT_STAGE_ORDER.filter((stage) => stage !== 'error')
const STARTUP_LOADED_RESOURCE_LIMIT = 10

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
  const dialog = useAppDialog()
  const { t } = useLocale()
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [mixFiles, setMixFiles] = useState<MixFileData[]>([])
  const [browserMode, setBrowserMode] = useState<BrowserMode>('workspace')
  const [activeTopMixName, setActiveTopMixName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [progressMessage, setProgressMessage] = useState<string>('')
  const [importProgressEvent, setImportProgressEvent] = useState<GameResImportProgressEvent | null>(null)
  const [importProgressSteps, setImportProgressSteps] = useState<GameResImportStepState[]>(
    () => createInitialGameResImportSteps(),
  )
  const [resourceReady, setResourceReady] = useState(false)
  const [missingRequiredFiles, setMissingRequiredFiles] = useState<string[]>([])
  const [resourceContext, setResourceContext] = useState<ResourceContext | null>(null)
  const [metadataDrawerOpen, setMetadataDrawerOpen] = useState(false)
  // 导航栈：从顶层 MIX 到当前容器（可能是子 MIX）
  const [navStack, setNavStack] = useState<MixContainerNode[]>([])
  const [initialBooting, setInitialBooting] = useState(true)
  const [showStartupLoadingScreen, setShowStartupLoadingScreen] = useState(false)
  const [startupLoadingStatus, setStartupLoadingStatus] = useState('')
  const [startupTotalResourceCount, setStartupTotalResourceCount] = useState(0)
  const [startupLoadedResourceCount, setStartupLoadedResourceCount] = useState(0)
  const [startupLoadedResourceNames, setStartupLoadedResourceNames] = useState<string[]>([])

  const initializeSelection = useCallback((nextMixFiles: MixFileData[]) => {
    if (!nextMixFiles.length) {
      setActiveTopMixName(null)
      setNavStack([])
      setSelectedFile(null)
      setMetadataDrawerOpen(false)
      return
    }
    const firstMix = nextMixFiles[0]
    setActiveTopMixName(firstMix.info.name)
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

  const appendStartupLoadedResource = useCallback((name: string) => {
    setStartupLoadedResourceNames((prev) => {
      const trimmed = name.trim()
      if (!trimmed) return prev
      const deDuped = prev.filter((item) => item !== trimmed)
      const next = [...deDuped, trimmed]
      return next.slice(-STARTUP_LOADED_RESOURCE_LIMIT)
    })
  }, [])

  const handleStartupResourceProgress = useCallback((event: ResourceLoadProgressEvent) => {
    if (event.phase === 'scan') {
      setStartupTotalResourceCount(event.totalCount)
      setStartupLoadedResourceCount(event.loadedCount)
      setShowStartupLoadingScreen(event.totalCount > 0)
      if (event.totalCount > 0) {
        setStartupLoadingStatus(`${t('mixEditor.readingResources')} (${event.totalCount})`)
      } else {
        setStartupLoadingStatus(t('mixEditor.readingResources'))
      }
      return
    }

    if (event.phase === 'read' || event.phase === 'parse') {
      if (event.itemName) {
        setStartupLoadingStatus(`${t('mixEditor.readingResources')} ${event.itemName}`)
      }
      return
    }

    if (event.phase === 'loaded') {
      setStartupLoadedResourceCount(event.loadedCount)
      if (event.itemName) {
        appendStartupLoadedResource(event.itemName)
        if (event.itemKind === 'archive') {
          setStartupLoadingStatus(`[MIX] ${event.itemName}`)
        } else {
          setStartupLoadingStatus(`[FILE] ${event.itemName}`)
        }
      }
      return
    }

    if (event.phase === 'finalize') {
      setStartupLoadingStatus(t('gameRes.finalize'))
      return
    }

    if (event.phase === 'done') {
      setStartupLoadingStatus(t('gameRes.done'))
    }
  }, [appendStartupLoadedResource, t])

  const createMixReaderFromFileObj = useCallback(async (fileObj: File | VirtualFile) => {
    if (fileObj instanceof File) {
      const ab = await fileObj.arrayBuffer()
      return new MixFileDataStream(new DataStream(ab))
    }
    const ds = fileObj.stream as DataStream
    ds.seek(0)
    return new MixFileDataStream(ds)
  }, [])

  const openContainerEntry = useCallback(
    async (container: MixContainerNode, entry: MixFileInfo['files'][number]): Promise<VirtualFile | null> => {
      const mix = await createMixReaderFromFileObj(container.fileObj)
      const hash = entry.hash >>> 0
      if (mix.containsId(hash)) return mix.openById(hash, entry.filename)
      if (mix.containsFile(entry.filename)) return mix.openFile(entry.filename)
      return null
    },
    [createMixReaderFromFileObj],
  )

  const readContainerEntries = useCallback(
    async (container: MixContainerNode): Promise<MixArchiveBuilderEntry[]> => {
      const mix = await createMixReaderFromFileObj(container.fileObj)
      const entries: MixArchiveBuilderEntry[] = []
      for (const entry of container.info.files) {
        const hash = entry.hash >>> 0
        let vf: VirtualFile | null = null
        if (mix.containsId(hash)) {
          vf = mix.openById(hash, entry.filename)
        } else if (mix.containsFile(entry.filename)) {
          vf = mix.openFile(entry.filename)
        }
        if (!vf) {
          throw new Error(`Cannot read container entry: ${entry.filename}`)
        }
        entries.push({
          filename: entry.filename,
          hash,
          bytes: cloneBytes(vf.getBytes()),
        })
      }
      return entries
    },
    [createMixReaderFromFileObj],
  )

  const restoreNavigation = useCallback(
    async (nextMixFiles: MixFileData[], target?: RestorableNavigationTarget): Promise<boolean> => {
      if (!target || !target.stackNames.length) return false
      const topMix = nextMixFiles.find((mix) => sameMixEntryName(mix.info.name, target.stackNames[0]))
      if (!topMix) return false

      const restoredStack: MixContainerNode[] = [
        { name: topMix.info.name, info: topMix.info, fileObj: topMix.file },
      ]

      for (let i = 1; i < target.stackNames.length; i++) {
        const expectedName = target.stackNames[i]
        const parent = restoredStack[restoredStack.length - 1]
        const childEntry = parent.info.files.find((entry) => sameMixEntryName(entry.filename, expectedName))
        if (!childEntry) break
        const childVf = await openContainerEntry(parent, childEntry)
        if (!childVf) break
        try {
          const childInfo = await MixParser.parseVirtualFile(childVf, childEntry.filename)
          restoredStack.push({
            name: childEntry.filename,
            info: childInfo,
            fileObj: childVf,
          })
        } catch {
          break
        }
      }

      const leaf = restoredStack[restoredStack.length - 1]
      const prefix = restoredStack.map((item) => item.name).join('/')
      const preferredLeafEntry = target.selectedLeafName
        ? leaf.info.files.find((entry) => sameMixEntryName(entry.filename, target.selectedLeafName as string))
        : null
      const selectedLeafEntry = preferredLeafEntry ?? leaf.info.files[0]

      setActiveTopMixName(restoredStack[0].name)
      setNavStack(restoredStack)
      setSelectedFile(selectedLeafEntry ? `${prefix}/${selectedLeafEntry.filename}` : null)
      return true
    },
    [openContainerEntry],
  )

  const reloadResourceContext = useCallback(async (
    restoreTarget?: RestorableNavigationTarget,
    options?: { startup?: boolean },
  ) => {
    const isStartup = options?.startup === true
    if (isStartup) {
      setShowStartupLoadingScreen(false)
      setStartupLoadingStatus(t('mixEditor.readingResources'))
      setStartupTotalResourceCount(0)
      setStartupLoadedResourceCount(0)
      setStartupLoadedResourceNames([])
    }
    setLoading(true)
    setProgressMessage(t('mixEditor.readingResources'))
    try {
      const config = GameResBootstrap.loadConfig()
      const ctx = await GameResBootstrap.loadContext(
        config.activeModName,
        isStartup ? handleStartupResourceProgress : undefined,
      )
      setResourceContext(ctx)
      setResourceReady(ctx.readiness.ready)
      setMissingRequiredFiles(ctx.readiness.missingRequiredFiles)
      const nextMixFiles = ctx.toMixFileData()
      setMixFiles(nextMixFiles)
      if (ctx.readiness.ready) {
        const restored = await restoreNavigation(nextMixFiles, restoreTarget)
        if (!restored) {
          initializeSelection(nextMixFiles)
        }
      } else {
        setActiveTopMixName(null)
        setNavStack([])
        setSelectedFile(null)
        setMetadataDrawerOpen(false)
      }
      setProgressMessage('')
    } catch (error) {
      console.error('Failed to load resource context:', error)
      setProgressMessage(t('mixEditor.readResourcesFailed'))
      setResourceReady(false)
      setMissingRequiredFiles(['ra2.mix', 'language.mix', 'multi.mix'])
      setMixFiles([])
      setActiveTopMixName(null)
      setNavStack([])
      setSelectedFile(null)
      setMetadataDrawerOpen(false)
    } finally {
      setLoading(false)
      if (isStartup) setInitialBooting(false)
    }
  }, [initializeSelection, restoreNavigation, t, handleStartupResourceProgress])

  useEffect(() => {
    reloadResourceContext(undefined, { startup: true })
  }, [reloadResourceContext])

  const handleReimportBaseDirectory = useCallback(async () => {
    setLoading(true)
    resetImportProgress(t('importProgress.prepareReimportDir'))
    try {
      if (!FileSystemUtil.isOpfsSupported()) {
        await dialog.info(t('mixEditor.opfsNotSupported'))
        return
      }
      const dirHandle = await FileSystemUtil.showDirectoryPicker()
      const result = await GameResBootstrap.reimportBaseFromDirectory(
        dirHandle,
        setProgressMessage,
        handleImportProgressEvent,
      )
      if (result.errors.length > 0) {
        await dialog.info(t('mixEditor.baseDirImportError', { errors: result.errors.slice(0, 8).join('\n') }))
      }
      await reloadResourceContext()
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      handleImportProgressEvent({
        stage: 'error',
        stageLabel: t('importProgress.importFailed'),
        message: e?.message || t('mixEditor.reimportBaseDirFailed'),
        errorMessage: e?.message || t('mixEditor.reimportBaseDirFailed'),
      })
      await dialog.info(e?.message || t('mixEditor.reimportBaseDirFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [reloadResourceContext, handleImportProgressEvent, resetImportProgress, dialog, t])

  const handleReimportBaseArchives = useCallback(async (files: File[]) => {
    if (!files.length) return
    setLoading(true)
    resetImportProgress(t('importProgress.prepareReimportArchive'))
    try {
      const result = await GameResBootstrap.reimportBaseFromArchives(
        files,
        setProgressMessage,
        handleImportProgressEvent,
      )
      if (result.errors.length > 0) {
        await dialog.info(t('mixEditor.baseArchiveImportError', { errors: result.errors.slice(0, 8).join('\n') }))
      }
      await reloadResourceContext()
    } catch (e: any) {
      handleImportProgressEvent({
        stage: 'error',
        stageLabel: t('importProgress.importFailed'),
        message: e?.message || t('mixEditor.reimportBaseArchiveFailed'),
        errorMessage: e?.message || t('mixEditor.reimportBaseArchiveFailed'),
      })
      await dialog.info(e?.message || t('mixEditor.reimportBaseArchiveFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [reloadResourceContext, handleImportProgressEvent, resetImportProgress, dialog, t])

  const handleImportPatchMixes = useCallback(async (files: File[]) => {
    if (!files.length) return
    setLoading(true)
    resetImportProgress(t('importProgress.prepareImportPatch'))
    try {
      const result = await GameResBootstrap.importPatchFiles(
        files,
        setProgressMessage,
        handleImportProgressEvent,
      )
      if (result.errors.length > 0) {
        await dialog.info(t('mixEditor.patchImportError', { errors: result.errors.slice(0, 8).join('\n') }))
      }
      await reloadResourceContext()
    } catch (e: any) {
      handleImportProgressEvent({
        stage: 'error',
        stageLabel: t('importProgress.importFailed'),
        message: e?.message || t('mixEditor.importPatchFailed'),
        errorMessage: e?.message || t('mixEditor.importPatchFailed'),
      })
      await dialog.info(e?.message || t('mixEditor.importPatchFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [reloadResourceContext, handleImportProgressEvent, resetImportProgress, dialog, t])

  const handleClearNonBaseResources = useCallback(async () => {
    const confirmed = await dialog.confirmDanger({
      title: t('mixEditor.confirmClearPatches'),
      message: t('mixEditor.confirmClearPatchesMsg'),
      confirmText: t('mixEditor.confirmClear'),
    })
    if (!confirmed) return
    setLoading(true)
    try {
      await GameResBootstrap.clearNonBaseResources(resourceContext?.activeModName ?? null)
      await reloadResourceContext()
    } catch (e: any) {
      await dialog.info(e?.message || t('mixEditor.clearPatchesFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [resourceContext, reloadResourceContext, dialog, t])

  const setWorkspaceMix = useCallback((mixName: string, selectFirstFile: boolean) => {
    const mix = mixFiles.find((m) => m.info.name === mixName)
    if (!mix) return
    setActiveTopMixName(mix.info.name)
    setNavStack([{ name: mix.info.name, info: mix.info, fileObj: mix.file }])
    if (selectFirstFile) {
      if (mix.info.files.length > 0) {
        setSelectedFile(`${mix.info.name}/${mix.info.files[0].filename}`)
      } else {
        setSelectedFile(null)
      }
    }
  }, [mixFiles])

  const handleFileSelect = useCallback((filePath: string) => {
    setSelectedFile(filePath)
    const slash = filePath.indexOf('/')
    if (slash <= 0) return
    const mixName = filePath.substring(0, slash)
    if (browserMode === 'repository' && mixName !== activeTopMixName) {
      setWorkspaceMix(mixName, false)
    }
  }, [browserMode, activeTopMixName, setWorkspaceMix])

  const handleOpenMetadataDrawer = useCallback(() => {
    setMetadataDrawerOpen(true)
  }, [])

  const handleCloseMetadataDrawer = useCallback(() => {
    setMetadataDrawerOpen(false)
  }, [])

  const handleBrowserModeChange = useCallback((mode: BrowserMode) => {
    setBrowserMode(mode)
  }, [])

  const handleActiveMixChange = useCallback((mixName: string) => {
    setWorkspaceMix(mixName, true)
  }, [setWorkspaceMix])

  const workspaceMixFiles = useMemo(() => {
    if (!mixFiles.length) return []
    if (!activeTopMixName) return [mixFiles[0]]
    const active = mixFiles.find((m) => m.info.name === activeTopMixName)
    return active ? [active] : [mixFiles[0]]
  }, [mixFiles, activeTopMixName])

  const mixSourceLabelByName = useMemo(() => {
    const map: Record<string, string> = {}
    if (!resourceContext) return map
    for (const archive of resourceContext.archives) {
      if (map[archive.info.name]) continue
      if (archive.bucket === 'base') map[archive.info.name] = 'base'
      else if (archive.bucket === 'patch') map[archive.info.name] = 'patch'
      else map[archive.info.name] = archive.modName ? `mod:${archive.modName}` : 'mod'
    }
    return map
  }, [resourceContext])

  useEffect(() => {
    if (!mixFiles.length) {
      setActiveTopMixName(null)
      return
    }
    if (!activeTopMixName || !mixFiles.some((m) => m.info.name === activeTopMixName)) {
      setActiveTopMixName(mixFiles[0].info.name)
    }
  }, [mixFiles, activeTopMixName])

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
        ds.seek(0)
        const mix = new MixFileDataStream(ds)
        const containsByName = mix.containsFile(filename)
        if (!containsByName) {
          const idMatch = filename.match(/^([0-9A-Fa-f]{8})(?:\.[^.]+)?$/)
          if (idMatch) {
            const id = parseInt(idMatch[1], 16) >>> 0
            if (mix.containsId(id)) {
              childVf = mix.openById(id, filename)
            }
          }
        }
        if (containsByName) {
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

  const handleNavigateUp = useCallback(() => {
    if (navStack.length <= 1) return
    handleBreadcrumbClick(navStack.length - 2)
  }, [navStack, handleBreadcrumbClick])

  const selectedLeafName = useMemo(() => {
    if (!selectedFile) return ''
    const parts = selectedFile.split('/')
    return parts[parts.length - 1] || ''
  }, [selectedFile])

  const canEnterCurrentMix = useMemo(() => {
    if (!selectedLeafName) return false
    const ext = selectedLeafName.split('.').pop()?.toLowerCase() || ''
    return ext === 'mix' || ext === 'mmx' || ext === 'yro'
  }, [selectedLeafName])

  const canEditSelectedEntry = useMemo(() => {
    if (!currentContainer || !selectedLeafName) return false
    return currentContainer.info.files.some((entry) => sameMixEntryName(entry.filename, selectedLeafName))
  }, [currentContainer, selectedLeafName])

  const showInitialLoadingSplash = (
    !resourceReady
    && initialBooting
    && loading
    && showStartupLoadingScreen
  )
  const startupProgressPercent = startupTotalResourceCount > 0
    ? Math.max(0, Math.min(100, Math.round((startupLoadedResourceCount / startupTotalResourceCount) * 100)))
    : 0

  const handleEnterCurrentMix = useCallback(() => {
    if (!canEnterCurrentMix || !selectedLeafName) return
    void handleDrillDown(selectedLeafName)
  }, [canEnterCurrentMix, selectedLeafName, handleDrillDown])

  const readFileObjBytes = useCallback(async (fileObj: File | VirtualFile): Promise<Uint8Array> => {
    if (fileObj instanceof File) {
      return new Uint8Array(await fileObj.arrayBuffer())
    }
    return cloneBytes(fileObj.getBytes())
  }, [])

  const resolveTopArchiveSource = useCallback(() => {
    if (!resourceContext || navStack.length === 0) return null
    const topNode = navStack[0]
    if (topNode.fileObj instanceof File) {
      const byReference = resourceContext.archives.find((item) => item.file === topNode.fileObj)
      if (byReference) {
        return {
          bucket: byReference.bucket,
          modName: byReference.modName ?? null,
          topFilename: byReference.info.name,
        }
      }
    }
    const byName = resourceContext.archives.find((item) => sameMixEntryName(item.info.name, topNode.name))
    if (!byName) return null
    return {
      bucket: byName.bucket,
      modName: byName.modName ?? null,
      topFilename: byName.info.name,
    }
  }, [resourceContext, navStack])

  const rebuildTopMixBytesFromCurrent = useCallback(async (
    currentMixBytes: Uint8Array,
  ): Promise<{ topBytes: Uint8Array; parentLmdSummaries: LayerLmdSummary[] }> => {
    if (!navStack.length) {
      throw new Error('No MIX container to write back')
    }
    const parentLmdSummaries: LayerLmdSummary[] = []
    let replacementBytes = cloneBytes(currentMixBytes)
    let replacementName = navStack[navStack.length - 1].name
    for (let depth = navStack.length - 2; depth >= 0; depth--) {
      const parent = navStack[depth]
      const parentEntries = await readContainerEntries(parent)
      const targetIndex = parentEntries.findIndex((entry) => sameMixEntryName(entry.filename, replacementName))
      if (targetIndex < 0) {
        throw new Error(`Cannot locate sub-container in parent MIX: ${replacementName}`)
      }
      parentEntries[targetIndex] = {
        ...parentEntries[targetIndex],
        bytes: replacementBytes,
      }
      const parentLmd = MixArchiveBuilder.upsertLocalMixDatabaseWithSummary(parentEntries)
      parentLmdSummaries.push({
        layerName: parent.name,
        ...parentLmd.summary,
      })
      replacementBytes = MixArchiveBuilder.build(parentLmd.entries)
      replacementName = parent.name
    }
    return { topBytes: replacementBytes, parentLmdSummaries }
  }, [navStack, readContainerEntries])

  const buildLmdSummaryLines = useCallback((
    currentLayerName: string,
    currentSummary: MixArchiveLmdSummary,
    parentSummaries: LayerLmdSummary[],
  ): string[] => {
    const lmdLines: string[] = []
    const currentLmdAction = currentSummary.replacedExisting ? t('mixEditor.lmdReplaced') : t('mixEditor.lmdAdded')
    lmdLines.push(
      `- ${t('mixEditor.lmdCurrentLayer', { name: currentLayerName, action: currentLmdAction, count: String(currentSummary.fileNameCount) })}`,
    )
    if (currentSummary.skippedByHashMismatch > 0) {
      lmdLines.push(`  ${t('mixEditor.lmdSkippedHash', { count: String(currentSummary.skippedByHashMismatch) })}`)
    }
    for (const parentSummary of parentSummaries) {
      const parentAction = parentSummary.replacedExisting ? t('mixEditor.lmdReplaced') : t('mixEditor.lmdAdded')
      lmdLines.push(
        `- ${t('mixEditor.lmdParentLayer', { name: parentSummary.layerName, action: parentAction, count: String(parentSummary.fileNameCount) })}`,
      )
      if (parentSummary.skippedByHashMismatch > 0) {
        lmdLines.push(`  ${t('mixEditor.lmdSkippedHash', { count: String(parentSummary.skippedByHashMismatch) })}`)
      }
    }
    return lmdLines
  }, [t])

  const persistCurrentContainerEntries = useCallback(async (
    entries: MixArchiveBuilderEntry[],
    nextSelectedLeafName?: string,
  ): Promise<PersistEntriesResult> => {
    const currentLmd = MixArchiveBuilder.upsertLocalMixDatabaseWithSummary(entries)
    const rebuiltCurrentBytes = MixArchiveBuilder.build(currentLmd.entries)
    const rebuiltTop = await rebuildTopMixBytesFromCurrent(rebuiltCurrentBytes)
    const source = resolveTopArchiveSource()
    if (!source) {
      throw new Error('Cannot locate top MIX source bucket')
    }

    const topFilename = source.topFilename
    const persistedBuffer = new ArrayBuffer(rebuiltTop.topBytes.length)
    new Uint8Array(persistedBuffer).set(rebuiltTop.topBytes)
    const topFile = new File([persistedBuffer], topFilename, { type: 'application/octet-stream' })
    await FileSystemUtil.writeImportedFile(source.bucket, topFile, source.modName, topFilename)

    const restoreTarget: RestorableNavigationTarget = { stackNames: navStack.map((node) => node.name) }
    if (nextSelectedLeafName) {
      restoreTarget.selectedLeafName = nextSelectedLeafName
    }
    await reloadResourceContext(restoreTarget)

    return {
      currentLmdSummary: currentLmd.summary,
      parentLmdSummaries: rebuiltTop.parentLmdSummaries,
    }
  }, [navStack, rebuildTopMixBytesFromCurrent, reloadResourceContext, resolveTopArchiveSource])

  const handleImportFilesToCurrentMix = useCallback(async (files: File[]) => {
    if (!files.length || !navStack.length) return
    const currentNode = navStack[navStack.length - 1]
    setLoading(true)
    setProgressMessage(t('mixEditor.importingFiles'))
    try {
      const currentEntries = await readContainerEntries(currentNode)
      const indexByName = new Map<string, number>()
      for (let i = 0; i < currentEntries.length; i++) {
        indexByName.set(normalizeMixEntryName(currentEntries[i].filename), i)
      }

      let importedCount = 0
      let skippedCount = 0
      for (const file of files) {
        const normalizedName = normalizeResourceFilename(file.name)
        if (!normalizedName) {
          skippedCount++
          continue
        }
        const key = normalizeMixEntryName(normalizedName)
        const bytes = cloneBytes(new Uint8Array(await file.arrayBuffer()))
        const existedIndex = indexByName.get(key)
        if (existedIndex != null) {
          const existedName = currentEntries[existedIndex].filename
          const replaceConfirmed = await dialog.confirmDanger({
            title: t('mixEditor.confirmReplace'),
            message: t('mixEditor.confirmReplaceMsg', { name: existedName }),
            confirmText: t('common.replace'),
          })
          if (!replaceConfirmed) {
            skippedCount++
            continue
          }
          currentEntries[existedIndex] = {
            ...currentEntries[existedIndex],
            filename: normalizedName,
            bytes,
          }
          importedCount++
          continue
        }

        const nextHash = MixArchiveBuilder.hashFilename(normalizedName)
        const hashConflictIndex = currentEntries.findIndex((entry) => (entry.hash ?? 0) === nextHash)
        if (hashConflictIndex >= 0) {
          const conflictName = currentEntries[hashConflictIndex].filename
          const hashConflictConfirmed = await dialog.confirmDanger({
            title: t('mixEditor.confirmHashConflict'),
            message: t('mixEditor.confirmHashConflictMsg', { name: normalizedName, conflict: conflictName }),
            confirmText: t('common.replace'),
          })
          if (!hashConflictConfirmed) {
            skippedCount++
            continue
          }
          currentEntries[hashConflictIndex] = {
            ...currentEntries[hashConflictIndex],
            filename: normalizedName,
            hash: nextHash,
            bytes,
          }
          indexByName.set(key, hashConflictIndex)
          importedCount++
          continue
        }

        currentEntries.push({
          filename: normalizedName,
          hash: nextHash,
          bytes,
        })
        indexByName.set(key, currentEntries.length - 1)
        importedCount++
      }

      if (importedCount <= 0) {
        await dialog.info(t('mixEditor.noFileImported'))
        return
      }

      const persisted = await persistCurrentContainerEntries(currentEntries, selectedLeafName || undefined)
      const lmdLines = buildLmdSummaryLines(
        currentNode.name,
        persisted.currentLmdSummary,
        persisted.parentLmdSummaries,
      )

      const importSummary = skippedCount > 0
        ? t('mixEditor.importSummaryWithSkipped', { imported: String(importedCount), skipped: String(skippedCount) })
        : t('mixEditor.importSummaryDone', { imported: String(importedCount) })
      await dialog.info({
        title: t('mixEditor.importComplete'),
        message: `${importSummary}\n\n${t('mixEditor.lmdUpdateSummary')}\n${lmdLines.join('\n')}`,
      })
    } catch (err: any) {
      console.error('Import to current MIX failed:', err)
      await dialog.info(err?.message || t('mixEditor.importFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [
    navStack,
    readContainerEntries,
    selectedLeafName,
    persistCurrentContainerEntries,
    buildLmdSummaryLines,
    dialog,
    t,
  ])

  const handleRenameSelectedFileInCurrentMix = useCallback(async () => {
    if (!currentContainer || !selectedLeafName || typeof window === 'undefined') return
    setLoading(true)
    setProgressMessage(t('mixEditor.renamingFile'))
    try {
      const currentEntries = await readContainerEntries(currentContainer)
      let selectedIndex = currentEntries.findIndex((entry) => sameMixEntryName(entry.filename, selectedLeafName))
      if (selectedIndex < 0) {
        await dialog.info(t('mixEditor.selectedEntryNotFound'))
        return
      }

      const oldName = currentEntries[selectedIndex].filename
      if (isLocalMixDatabaseEntry(oldName)) {
        await dialog.info(t('mixEditor.renameLmdForbidden'))
        return
      }

      const renameInput = window.prompt(t('mixEditor.renamePrompt', { name: oldName }), oldName)
      if (renameInput == null) return
      const nextName = normalizeResourceFilename(renameInput)
      if (!nextName) {
        await dialog.info(t('mixEditor.invalidFilename'))
        return
      }
      if (sameMixEntryName(nextName, oldName)) return

      const removeEntryAt = (index: number) => {
        currentEntries.splice(index, 1)
        if (index < selectedIndex) selectedIndex--
      }

      const nameConflictIndex = currentEntries.findIndex(
        (entry, index) => index !== selectedIndex && sameMixEntryName(entry.filename, nextName),
      )
      if (nameConflictIndex >= 0) {
        const conflictName = currentEntries[nameConflictIndex].filename
        const replaceByNameConfirmed = await dialog.confirmDanger({
          title: t('mixEditor.confirmReplace'),
          message: t('mixEditor.confirmReplaceMsg', { name: conflictName }),
          confirmText: t('common.replace'),
        })
        if (!replaceByNameConfirmed) return
        removeEntryAt(nameConflictIndex)
      }

      const nextHash = MixArchiveBuilder.hashFilename(nextName)
      const hashConflictIndex = currentEntries.findIndex((entry, index) => {
        if (index === selectedIndex) return false
        const entryHash = entry.hash == null ? MixArchiveBuilder.hashFilename(entry.filename) : (entry.hash >>> 0)
        return entryHash === nextHash
      })
      if (hashConflictIndex >= 0) {
        const conflictName = currentEntries[hashConflictIndex].filename
        const replaceByHashConfirmed = await dialog.confirmDanger({
          title: t('mixEditor.confirmHashConflict'),
          message: t('mixEditor.confirmHashConflictMsg', { name: nextName, conflict: conflictName }),
          confirmText: t('common.replace'),
        })
        if (!replaceByHashConfirmed) return
        removeEntryAt(hashConflictIndex)
      }

      const targetEntry = currentEntries[selectedIndex]
      if (!targetEntry) {
        throw new Error(t('mixEditor.selectedEntryNotFound'))
      }
      currentEntries[selectedIndex] = {
        ...targetEntry,
        filename: nextName,
        hash: nextHash,
      }

      const persisted = await persistCurrentContainerEntries(currentEntries, nextName)
      const lmdLines = buildLmdSummaryLines(
        currentContainer.name,
        persisted.currentLmdSummary,
        persisted.parentLmdSummaries,
      )
      await dialog.info({
        title: t('mixEditor.renameComplete'),
        message: `${t('mixEditor.renameSummary', { from: oldName, to: nextName })}\n\n${t('mixEditor.lmdUpdateSummary')}\n${lmdLines.join('\n')}`,
      })
    } catch (err: any) {
      console.error('Rename entry in current MIX failed:', err)
      await dialog.info(err?.message || t('mixEditor.renameFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [
    currentContainer,
    selectedLeafName,
    readContainerEntries,
    persistCurrentContainerEntries,
    buildLmdSummaryLines,
    dialog,
    t,
  ])

  const handleDeleteSelectedFileInCurrentMix = useCallback(async () => {
    if (!currentContainer || !selectedLeafName) return
    setLoading(true)
    setProgressMessage(t('mixEditor.deletingFile'))
    try {
      const currentEntries = await readContainerEntries(currentContainer)
      const selectedIndex = currentEntries.findIndex((entry) => sameMixEntryName(entry.filename, selectedLeafName))
      if (selectedIndex < 0) {
        await dialog.info(t('mixEditor.selectedEntryNotFound'))
        return
      }
      const targetName = currentEntries[selectedIndex].filename
      const confirmed = await dialog.confirmDanger({
        title: t('mixEditor.confirmDelete'),
        message: t('mixEditor.confirmDeleteMsg', { name: targetName }),
        confirmText: t('common.confirm'),
      })
      if (!confirmed) return

      currentEntries.splice(selectedIndex, 1)
      const nextSelectedName = currentEntries.length > 0
        ? currentEntries[Math.min(selectedIndex, currentEntries.length - 1)].filename
        : undefined

      const persisted = await persistCurrentContainerEntries(currentEntries, nextSelectedName)
      const lmdLines = buildLmdSummaryLines(
        currentContainer.name,
        persisted.currentLmdSummary,
        persisted.parentLmdSummaries,
      )
      await dialog.info({
        title: t('mixEditor.deleteComplete'),
        message: `${t('mixEditor.deleteSummary', { name: targetName })}\n\n${t('mixEditor.lmdUpdateSummary')}\n${lmdLines.join('\n')}`,
      })
    } catch (err: any) {
      console.error('Delete entry in current MIX failed:', err)
      await dialog.info(err?.message || t('mixEditor.deleteFailed'))
    } finally {
      setLoading(false)
      setProgressMessage('')
    }
  }, [
    currentContainer,
    selectedLeafName,
    readContainerEntries,
    persistCurrentContainerEntries,
    buildLmdSummaryLines,
    dialog,
    t,
  ])

  const handleExportTopMix = useCallback(async () => {
    if (!navStack.length) return
    try {
      const topNode = navStack[0]
      const bytes = await readFileObjBytes(topNode.fileObj)
      triggerBrowserDownload(bytesToBlob(bytes, 'application/octet-stream'), topNode.name)
    } catch (err) {
      console.error('Export top MIX failed:', err)
    }
  }, [navStack, readFileObjBytes])

  const handleExportCurrentMix = useCallback(async () => {
    if (!currentContainer) return
    try {
      const bytes = await readFileObjBytes(currentContainer.fileObj)
      triggerBrowserDownload(bytesToBlob(bytes, 'application/octet-stream'), currentContainer.name)
    } catch (err) {
      console.error('Export current MIX failed:', err)
    }
  }, [currentContainer, readFileObjBytes])

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏（仅资源就绪后显示） */}
      {resourceReady && (
        <Toolbar
          mixFiles={mixFiles.map(mix => mix.file.name)}
          loading={loading}
          onExportTopMix={handleExportTopMix}
          onExportCurrentMix={handleExportCurrentMix}
          onImportFilesToCurrentMix={handleImportFilesToCurrentMix}
          onReimportBaseDirectory={handleReimportBaseDirectory}
          onReimportBaseArchives={handleReimportBaseArchives}
          onImportPatchMixes={handleImportPatchMixes}
          onClearNonBaseResources={handleClearNonBaseResources}
          resourceReady={resourceReady}
          resourceSummary={
            progressMessage ||
            t('mixEditor.resourceReadyDetail', { count: mixFiles.length })
          }
        />
      )}

      {/* 主内容区域 */}
      {!resourceReady ? (
        showInitialLoadingSplash ? (
          <div className="flex-1 relative overflow-hidden">
            <img
              src="/game-bg.png"
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/45" />
            <div className="absolute inset-0 bg-gradient-to-br from-black/70 via-black/35 to-black/75" />
            <div className="absolute left-8 top-8 max-w-xl">
              <div className="text-2xl font-bold tracking-wide text-white drop-shadow-md">
                RA2Web Studio
              </div>
              <div className="mt-2 text-sm text-gray-200 drop-shadow">
                {startupLoadingStatus || t('mixEditor.readingResources')}
              </div>
              {startupTotalResourceCount > 0 && (
                <div className="mt-3 w-72">
                  <div className="mb-1 flex items-center justify-between text-xs text-gray-200">
                    <span>{t('common.progress')}</span>
                    <span>{startupProgressPercent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-black/45">
                    <div
                      className="h-full bg-blue-400 transition-all duration-200"
                      style={{ width: `${startupProgressPercent}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-gray-300">
                    {`${startupLoadedResourceCount} / ${startupTotalResourceCount}`}
                  </div>
                </div>
              )}
            </div>

            <div className="absolute right-5 bottom-5 w-[min(30rem,90vw)] rounded-lg border border-gray-500/40 bg-black/45 backdrop-blur-sm shadow-2xl">
              <div className="px-3 py-2 border-b border-gray-500/30 text-xs font-semibold tracking-wide text-gray-200">
                Loaded Resources
              </div>
              <div className="max-h-44 overflow-y-auto px-3 py-2 space-y-1">
                {startupLoadedResourceNames.length > 0 ? (
                  startupLoadedResourceNames.map((name, idx) => (
                    <div
                      key={`${name}-${idx}`}
                      className={`text-xs truncate ${
                        idx === startupLoadedResourceNames.length - 1
                          ? 'text-emerald-200 animate-pulse'
                          : 'text-emerald-100/85'
                      }`}
                      title={name}
                    >
                      {name}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-300">{t('importProgress.waitStart')}</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-2xl w-full bg-gray-800 border border-gray-700 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-3">{t('mixEditor.importGameRes')}</h2>
              <p className="text-gray-300 text-sm leading-6">
                {t('mixEditor.importHint')}
              </p>
              <div className="mt-4 text-sm text-yellow-300">
                {t('mixEditor.missingFiles', { files: missingRequiredFiles.join(', ') || t('mixEditor.unknownMissing') })}
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
                      void handleReimportBaseArchives(files)
                    }
                    input.click()
                  }}
                  disabled={loading}
                >
                  {t('mixEditor.selectArchive')}
                </button>
                <button
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm"
                  onClick={() => handleReimportBaseDirectory()}
                  disabled={loading}
                >
                  {t('mixEditor.selectGameDir')}
                </button>
              </div>
              <ImportProgressPanel
                steps={importProgressSteps}
                message={importProgressEvent?.message}
                currentItem={importProgressEvent?.currentItem}
                percentage={importProgressEvent?.percentage}
                fallbackMessage={loading ? progressMessage : t('mixEditor.selectToStart')}
              />
            </div>
          </div>
        )
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* 左侧文件树 */}
          <div className="w-80 bg-gray-800 border-r border-gray-700">
            <FileTree
              mixFiles={mixFiles}
              workspaceMixFiles={workspaceMixFiles}
              browserMode={browserMode}
              onBrowserModeChange={handleBrowserModeChange}
              activeMixName={activeTopMixName}
              onActiveMixChange={handleActiveMixChange}
              mixSourceLabelByName={mixSourceLabelByName}
              selectedFile={selectedFile}
              onFileSelect={handleFileSelect}
              // rootless container view when we have a current container
              container={browserMode === 'workspace' && currentContainer ? { info: currentContainer.info, name: currentContainer.name } : undefined}
              rootless={browserMode === 'workspace' && !!currentContainer}
              navPrefix={currentPrefix}
              onDrillDown={handleDrillDown}
              onNavigateUp={browserMode === 'workspace' && navStack.length > 1 ? handleNavigateUp : undefined}
            />
          </div>

          {/* 中间预览区域 */}
          <div className="flex-1 min-w-0 min-h-0 bg-gray-900 overflow-hidden relative">
            {metadataDrawerOpen && (
              <button
                type="button"
                className="absolute inset-0 bg-black/25 z-10"
                aria-label={t('mixEditor.closeMetadataAria')}
                onClick={handleCloseMetadataDrawer}
              />
            )}
            <PreviewPanel
              selectedFile={selectedFile}
              mixFiles={mixFiles}
              breadcrumbs={navStack.map(n => n.name)}
              onBreadcrumbClick={handleBreadcrumbClick}
              resourceContext={resourceContext}
              onOpenMetadataDrawer={handleOpenMetadataDrawer}
              metadataDrawerOpen={metadataDrawerOpen}
              onEnterCurrentMix={handleEnterCurrentMix}
              canEnterCurrentMix={canEnterCurrentMix}
              onRenameFile={handleRenameSelectedFileInCurrentMix}
              onDeleteFile={handleDeleteSelectedFileInCurrentMix}
              canModifyFile={canEditSelectedEntry}
              actionsDisabled={loading}
            />
            <div
              className={`absolute inset-y-0 right-0 w-80 bg-gray-800 border-l border-gray-700 shadow-2xl z-20 transform transition-transform duration-200 ${
                metadataDrawerOpen ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <div className="h-full flex flex-col">
                <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
                  <span className="text-sm text-gray-300">{t('mixEditor.metadataDetail')}</span>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200"
                    onClick={handleCloseMetadataDrawer}
                  >
                    {t('common.close')}
                  </button>
                </div>
                <div className="flex-1 min-h-0">
                  <PropertiesPanel
                    selectedFile={selectedFile}
                    mixFiles={mixFiles}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部状态栏 */}
      <div className="h-8 bg-gray-800 border-t border-gray-700 flex items-center px-4 text-sm text-gray-400">
        {t('mixEditor.appTitle')}
        {resourceReady && mixFiles.length > 0 && (
          <span className="ml-4">
            {t('mixEditor.mixCount', { mixCount: mixFiles.length, fileCount: mixFiles.reduce((sum, mix) => sum + mix.info.files.length, 0) })}
          </span>
        )}
      </div>
    </div>
  )
}

export default MixEditor
