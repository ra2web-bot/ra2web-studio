import type { ImportedResourceFile, ResourceBucket } from './types'
import { normalizeResourceFilename } from './patterns'

type AnyDirectoryHandle = any
type AnyFileHandle = any

const WORKSPACE_DIR = 'ra2web-studio-resources'
const BASE_DIR = 'base'
const PATCH_DIR = 'patch'
const MODS_DIR = 'mods'

function ensureSupported(): void {
  const storageAny = navigator.storage as any
  if (!storageAny || typeof storageAny.getDirectory !== 'function') {
    throw new Error('当前浏览器不支持 OPFS（navigator.storage.getDirectory）')
  }
}

async function getOpfsRoot(): Promise<AnyDirectoryHandle> {
  ensureSupported()
  const storageAny = navigator.storage as any
  return storageAny.getDirectory()
}

async function getOrCreateDirectory(parent: AnyDirectoryHandle, name: string): Promise<AnyDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create: true })
}

async function resolveBucketDir(
  bucket: ResourceBucket,
  modName: string | null = null,
): Promise<AnyDirectoryHandle> {
  const root = await getOpfsRoot()
  const workspace = await getOrCreateDirectory(root, WORKSPACE_DIR)
  if (bucket === 'base') {
    return getOrCreateDirectory(workspace, BASE_DIR)
  }
  if (bucket === 'patch') {
    return getOrCreateDirectory(workspace, PATCH_DIR)
  }
  const modsRoot = await getOrCreateDirectory(workspace, MODS_DIR)
  if (!modName) {
    throw new Error('mod bucket 需要 modName')
  }
  return getOrCreateDirectory(modsRoot, modName)
}

async function tryGetDirectory(parent: AnyDirectoryHandle, name: string): Promise<AnyDirectoryHandle | null> {
  try {
    return await parent.getDirectoryHandle(name)
  } catch {
    return null
  }
}

export class FileSystemUtil {
  static isOpfsSupported(): boolean {
    const storageAny = navigator.storage as any
    return !!storageAny && typeof storageAny.getDirectory === 'function'
  }

  static async showDirectoryPicker(): Promise<AnyDirectoryHandle> {
    const picker = (window as any).showDirectoryPicker
    if (typeof picker !== 'function') {
      throw new Error('当前浏览器不支持目录选择器 showDirectoryPicker')
    }
    return picker()
  }

  static async writeImportedFile(
    bucket: ResourceBucket,
    source: File,
    modName: string | null = null,
    forceName?: string,
  ): Promise<string> {
    const dir = await resolveBucketDir(bucket, modName)
    const normalizedName = normalizeResourceFilename(forceName ?? source.name)
    const fileHandle: AnyFileHandle = await dir.getFileHandle(normalizedName, { create: true })
    const writable = await fileHandle.createWritable()
    try {
      await writable.write(await source.arrayBuffer())
      await writable.close()
    } catch (e) {
      try {
        await writable.abort()
      } catch {
        // ignore abort failure
      }
      throw e
    }
    return normalizedName
  }

  static async readImportedFile(
    bucket: ResourceBucket,
    filename: string,
    modName: string | null = null,
  ): Promise<File> {
    const dir = await resolveBucketDir(bucket, modName)
    const fileHandle: AnyFileHandle = await dir.getFileHandle(normalizeResourceFilename(filename))
    return fileHandle.getFile()
  }

  static async listImportedFiles(
    bucket: ResourceBucket,
    modName: string | null = null,
  ): Promise<ImportedResourceFile[]> {
    const dir = await resolveBucketDir(bucket, modName)
    const result: ImportedResourceFile[] = []
    for await (const [entryName, handle] of dir.entries()) {
      if (handle.kind !== 'file') continue
      const file = await handle.getFile()
      result.push({
        bucket,
        name: entryName,
        size: file.size,
        lastModified: file.lastModified,
        modName: bucket === 'mod' ? (modName ?? undefined) : undefined,
      })
    }
    result.sort((a, b) => a.name.localeCompare(b.name))
    return result
  }

  static async listImportedModNames(): Promise<string[]> {
    const root = await getOpfsRoot()
    const workspace = await tryGetDirectory(root, WORKSPACE_DIR)
    if (!workspace) return []
    const modsRoot = await tryGetDirectory(workspace, MODS_DIR)
    if (!modsRoot) return []
    const result: string[] = []
    for await (const [entryName, handle] of modsRoot.entries()) {
      if (handle.kind === 'directory') result.push(entryName)
    }
    result.sort((a, b) => a.localeCompare(b))
    return result
  }

  static async listAllImportedFiles(activeModName: string | null): Promise<ImportedResourceFile[]> {
    const base = await this.listImportedFiles('base')
    const patch = await this.listImportedFiles('patch')
    const mod = activeModName ? await this.listImportedFiles('mod', activeModName) : []
    return [...base, ...patch, ...mod]
  }

  static async clearWorkspace(): Promise<void> {
    const root = await getOpfsRoot()
    try {
      await root.removeEntry(WORKSPACE_DIR, { recursive: true })
    } catch {
      // ignore when workspace is missing
    }
  }

  static async clearBucket(bucket: ResourceBucket, modName: string | null = null): Promise<void> {
    const root = await getOpfsRoot()
    const workspace = await tryGetDirectory(root, WORKSPACE_DIR)
    if (!workspace) return
    if (bucket === 'base') {
      try {
        await workspace.removeEntry(BASE_DIR, { recursive: true })
      } catch {
        // ignore
      }
      return
    }
    if (bucket === 'patch') {
      try {
        await workspace.removeEntry(PATCH_DIR, { recursive: true })
      } catch {
        // ignore
      }
      return
    }
    if (!modName) return
    const modsRoot = await tryGetDirectory(workspace, MODS_DIR)
    if (!modsRoot) return
    try {
      await modsRoot.removeEntry(modName, { recursive: true })
    } catch {
      // ignore
    }
  }
}
