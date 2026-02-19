import { GIFEncoder, applyPalette, quantize, type GifPaletteColor } from 'gifenc'
import { ShpFile } from '../../data/ShpFile'
import { MixParser } from '../MixParser'
import { IndexedColorRenderer } from '../palette/IndexedColorRenderer'
import { loadPaletteByPath } from '../palette/PaletteLoader'
import { PaletteParser } from '../palette/PaletteParser'
import { PaletteResolver } from '../palette/PaletteResolver'
import type { Rgb } from '../palette/PaletteTypes'
import type {
  ExportContext,
  FrameRangeOptions,
  LoadedShpPalette,
  ShpFrameGeometry,
  ShpGifExportOptions,
  ShpStaticExportOptions,
} from './types'
import {
  canvasToBlob,
  clamp,
  normalizeFilename,
  parseHexColor,
  splitSelectedFilePath,
} from './utils'

type LoadedShpAsset = {
  selectedFilename: string
  shp: ShpFile
  geometry: ShpFrameGeometry
  palette: Rgb[]
  paletteMeta: LoadedShpPalette
}

function padFrameNumber(value: number): string {
  return value.toString().padStart(4, '0')
}

function getFilenameStem(filename: string): string {
  const base = normalizeFilename(filename)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? base : base.substring(0, dot)
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, width | 0)
  canvas.height = Math.max(1, height | 0)
  return canvas
}

function buildFrameIndices(range: FrameRangeOptions, totalFrames: number): number[] {
  if (totalFrames <= 0) return []
  if (range.mode === 'single') {
    return [clamp(range.frameIndex | 0, 0, totalFrames - 1)]
  }
  let start = clamp(range.startFrame | 0, 0, totalFrames - 1)
  let end = clamp(range.endFrame | 0, 0, totalFrames - 1)
  if (end < start) [start, end] = [end, start]
  const result: number[] = []
  for (let i = start; i <= end; i++) result.push(i)
  return result
}

export class ShpExportRenderer {
  static async inspect(context: ExportContext): Promise<ShpFrameGeometry | null> {
    try {
      const loaded = await this.loadShpAsset(context, { mode: 'auto', manualPalettePath: '' })
      return loaded.geometry
    } catch {
      return null
    }
  }

  static async listPaletteOptions(context: ExportContext): Promise<string[]> {
    const decision = PaletteResolver.resolve({
      assetPath: context.selectedFile,
      assetKind: 'shp',
      mixFiles: context.mixFiles,
      resourceContext: context.resourceContext,
      manualPalettePath: null,
    })
    return decision.availablePalettePaths
  }

  static async exportStatic(
    context: ExportContext,
    options: ShpStaticExportOptions,
  ): Promise<{ blob: Blob; filename: string; geometry: ShpFrameGeometry; paletteMeta: LoadedShpPalette }> {
    const loaded = await this.loadShpAsset(context, options.palette)
    const frameIndices = buildFrameIndices(options.frameRange, loaded.geometry.frames)
    if (!frameIndices.length) {
      throw new Error('No frames to export')
    }

    const frameCanvases = frameIndices.map((frameIndex) =>
      this.renderFrameCanvas(loaded, frameIndex, options.transparency),
    )
    let outputCanvas: HTMLCanvasElement
    let suffix = ''
    if (frameCanvases.length === 1) {
      outputCanvas = frameCanvases[0]
      suffix = `f${padFrameNumber(frameIndices[0])}`
    } else {
      outputCanvas = this.composeSheet(
        frameCanvases,
        loaded.geometry.width,
        loaded.geometry.height,
        options.layout,
        options.gridColumns,
      )
      const start = frameIndices[0]
      const end = frameIndices[frameIndices.length - 1]
      if (options.layout === 'single-column') {
        suffix = `f${padFrameNumber(start)}-${padFrameNumber(end)}_column`
      } else {
        const columns = clamp(options.gridColumns | 0, 1, frameCanvases.length)
        suffix = `f${padFrameNumber(start)}-${padFrameNumber(end)}_grid${columns}`
      }
    }

    const stem = getFilenameStem(loaded.selectedFilename)
    const ext = options.format === 'png' ? 'png' : 'jpg'
    const filename = `${stem}_${suffix}.${ext}`
    const mimeType = options.format === 'png' ? 'image/png' : 'image/jpeg'
    const canvasForEncode =
      options.format === 'jpg'
        ? this.flattenForJpeg(outputCanvas, options.transparency.backgroundColor)
        : outputCanvas
    const quality = options.format === 'jpg' ? clamp(options.jpegQuality, 0, 1) : undefined
    const blob = await canvasToBlob(canvasForEncode, mimeType, quality)
    return { blob, filename, geometry: loaded.geometry, paletteMeta: loaded.paletteMeta }
  }

  static async exportGif(
    context: ExportContext,
    options: ShpGifExportOptions,
  ): Promise<{ blob: Blob; filename: string; geometry: ShpFrameGeometry; paletteMeta: LoadedShpPalette }> {
    const loaded = await this.loadShpAsset(context, options.palette)
    const frameIndices = buildFrameIndices(options.frameRange, loaded.geometry.frames)
    if (!frameIndices.length) {
      throw new Error('No frames to export')
    }

    const gif = GIFEncoder()
    const delay = Math.max(10, Math.round(options.frameDelayMs))
    const repeat = clamp(options.loopCount | 0, 0, 65535)
    for (let i = 0; i < frameIndices.length; i++) {
      const frameIndex = frameIndices[i]
      if (frameIndex == null) continue
      const frameCanvas = this.renderFrameCanvas(loaded, frameIndex, options.transparency)
      const frameCtx = frameCanvas.getContext('2d')
      if (!frameCtx) throw new Error('Cannot create GIF frame render context')
      const rgba = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height).data
      const palette = quantize(rgba, 256, {
        format: 'rgba4444',
        oneBitAlpha: options.transparency.mode === 'index',
      })
      const index = applyPalette(rgba, palette, 'rgba4444')
      const transparentIndex = this.findTransparentIndex(palette)
      gif.writeFrame(index, frameCanvas.width, frameCanvas.height, {
        first: i === 0,
        repeat: i === 0 ? repeat : undefined,
        delay,
        palette,
        transparent: options.transparency.mode === 'index' && transparentIndex >= 0,
        transparentIndex: transparentIndex >= 0 ? transparentIndex : 0,
      })
    }
    gif.finish()
    const gifBytes = gif.bytes()
    const gifCopy = new Uint8Array(gifBytes.length)
    gifCopy.set(gifBytes)
    const stem = getFilenameStem(loaded.selectedFilename)
    const start = frameIndices[0]
    const end = frameIndices[frameIndices.length - 1]
    const filename = `${stem}_anim_f${padFrameNumber(start)}-${padFrameNumber(end)}.gif`
    const blob = new Blob([gifCopy.buffer], {
      type: 'image/gif',
    })
    return { blob, filename, geometry: loaded.geometry, paletteMeta: loaded.paletteMeta }
  }

  private static findTransparentIndex(palette: GifPaletteColor[]): number {
    for (let i = 0; i < palette.length; i++) {
      const color = palette[i]
      if (!color) continue
      const alpha = color.length >= 4 ? (color[3] ?? 255) : 255
      if ((alpha | 0) === 0) return i
    }
    return -1
  }

  private static async loadShpAsset(
    context: ExportContext,
    paletteOptions: { mode: 'auto' | 'manual'; manualPalettePath: string },
  ): Promise<LoadedShpAsset> {
    const selected = splitSelectedFilePath(context.selectedFile, context.mixFiles)
    if (selected.extension !== 'shp') {
      throw new Error('Current file is not SHP, cannot export image')
    }
    const vf = await MixParser.extractFile(selected.mixFile, selected.innerPath)
    if (!vf) {
      throw new Error('Cannot read current SHP file')
    }
    const shp = ShpFile.fromVirtualFile(vf)
    if (!shp || shp.numImages <= 0) {
      throw new Error('SHP parse failed or no frame data')
    }

    const geometry = this.computeGeometry(shp)
    const manualPalettePath =
      paletteOptions.mode === 'manual' && paletteOptions.manualPalettePath.trim()
        ? paletteOptions.manualPalettePath.trim()
        : null
    const decision = PaletteResolver.resolve({
      assetPath: selected.selectedFile,
      assetKind: 'shp',
      mixFiles: context.mixFiles,
      resourceContext: context.resourceContext,
      manualPalettePath,
      assetWidth: geometry.width,
      assetHeight: geometry.height,
    })
    let palette: Rgb[] | null = null
    if (decision.resolvedPalettePath) {
      palette = await loadPaletteByPath(decision.resolvedPalettePath, context.mixFiles)
    }
    if (!palette) {
      palette = PaletteParser.buildGrayscalePalette()
    }
    const fixedPalette = PaletteParser.ensurePalette256(palette)
    const paletteMeta: LoadedShpPalette = {
      palettePath: decision.resolvedPalettePath,
      paletteSelection: decision.selection,
    }
    return {
      selectedFilename: selected.filename,
      shp,
      geometry,
      palette: fixedPalette,
      paletteMeta,
    }
  }

  private static computeGeometry(shp: ShpFile): ShpFrameGeometry {
    let width = Math.max(1, shp.width | 0)
    let height = Math.max(1, shp.height | 0)
    for (const image of shp.images) {
      width = Math.max(width, image.x + image.width)
      height = Math.max(height, image.y + image.height)
    }
    return { width, height, frames: shp.numImages }
  }

  private static renderFrameCanvas(
    loaded: LoadedShpAsset,
    frameIndex: number,
    transparency: ShpStaticExportOptions['transparency'] | ShpGifExportOptions['transparency'],
  ): HTMLCanvasElement {
    const frame = loaded.shp.getImage(frameIndex)
    const canvas = createCanvas(loaded.geometry.width, loaded.geometry.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Cannot create export canvas')

    let parsedBackground: { r: number; g: number; b: number } | null = null
    if (transparency.mode === 'opaque') {
      const bg = parseHexColor(transparency.backgroundColor)
      parsedBackground = bg
      ctx.fillStyle = `rgb(${bg.r}, ${bg.g}, ${bg.b})`
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    const requestedTransparentIndex = clamp(transparency.transparentIndex | 0, 0, 255)
    // Keep background-mask identification active in both modes.
    // In opaque mode we will remap masked pixels to the chosen background color.
    const transparentIndex = requestedTransparentIndex
    const rgba = IndexedColorRenderer.indexedToRgba(
      frame.imageData,
      frame.width,
      frame.height,
      loaded.palette,
      transparentIndex,
    )
    if (transparency.mode === 'opaque' && parsedBackground) {
      for (let i = 0; i < rgba.length; i += 4) {
        if ((rgba[i + 3] | 0) !== 0) continue
        rgba[i] = parsedBackground.r
        rgba[i + 1] = parsedBackground.g
        rgba[i + 2] = parsedBackground.b
        rgba[i + 3] = 255
      }
    }
    const imageData = new ImageData(
      Uint8ClampedArray.from(rgba),
      frame.width,
      frame.height,
    )
    const offsetX = Math.max(0, ((canvas.width - frame.width) / 2) | 0)
    const offsetY = Math.max(0, ((canvas.height - frame.height) / 2) | 0)
    ctx.putImageData(imageData, offsetX, offsetY)
    return canvas
  }

  private static composeSheet(
    frames: HTMLCanvasElement[],
    cellWidth: number,
    cellHeight: number,
    layout: ShpStaticExportOptions['layout'],
    gridColumns: number,
  ): HTMLCanvasElement {
    const frameCount = frames.length
    const columns = layout === 'single-column' ? 1 : clamp(gridColumns | 0, 1, frameCount)
    const rows = Math.ceil(frameCount / columns)
    const canvas = createCanvas(cellWidth * columns, cellHeight * rows)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Cannot create tiled export canvas')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    for (let i = 0; i < frameCount; i++) {
      const col = i % columns
      const row = Math.floor(i / columns)
      ctx.drawImage(frames[i], col * cellWidth, row * cellHeight)
    }
    return canvas
  }

  private static flattenForJpeg(canvas: HTMLCanvasElement, backgroundColor: string): HTMLCanvasElement {
    const flattened = createCanvas(canvas.width, canvas.height)
    const ctx = flattened.getContext('2d')
    if (!ctx) throw new Error('Cannot create JPG export canvas')
    const bg = parseHexColor(backgroundColor)
    ctx.fillStyle = `rgb(${bg.r}, ${bg.g}, ${bg.b})`
    ctx.fillRect(0, 0, flattened.width, flattened.height)
    ctx.drawImage(canvas, 0, 0)
    return flattened
  }
}

