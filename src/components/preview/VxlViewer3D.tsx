import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import { VxlFile } from '../../data/VxlFile'
import { PaletteParser } from '../../services/palette/PaletteParser'
import { PaletteResolver } from '../../services/palette/PaletteResolver'
import { loadPaletteByPath } from '../../services/palette/PaletteLoader'
import SearchableSelect from '../common/SearchableSelect'
import { usePaletteHotkeys } from './usePaletteHotkeys'
import type { PaletteSelectionInfo, Rgb } from '../../services/palette/PaletteTypes'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'

type MixFileData = { file: File; info: MixFileInfo }

function toBytePalette(palette: Rgb[]): Uint8Array {
  return PaletteParser.toBytePalette(PaletteParser.ensurePalette256(palette))
}

function colorFromPalette(palette: Uint8Array, index: number): THREE.Color {
  const i = Math.max(0, Math.min(255, index | 0)) * 3
  const r = palette[i] / 255
  const g = palette[i + 1] / 255
  const b = palette[i + 2] / 255
  return new THREE.Color(r, g, b)
}

const VxlViewer3D: React.FC<{ selectedFile: string; mixFiles: MixFileData[]; resourceContext?: ResourceContext | null }> = ({
  selectedFile,
  mixFiles,
  resourceContext,
}) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [palettePath, setPalettePath] = useState<string>('')
  const [paletteList, setPaletteList] = useState<string[]>([])
  const [paletteInfo, setPaletteInfo] = useState<PaletteSelectionInfo>({
    source: 'fallback-grayscale',
    reason: '未加载',
    resolvedPath: null,
  })

  useEffect(() => {
    let renderer: THREE.WebGLRenderer | null = null
    let scene: THREE.Scene | null = null
    let camera: THREE.PerspectiveCamera | null = null
    let controls: OrbitControls | null = null
    let animationId = 0

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const slash = selectedFile.indexOf('/')
        if (slash <= 0) throw new Error('Invalid path')
        const mixName = selectedFile.substring(0, slash)
        const inner = selectedFile.substring(slash + 1)
        const mix = mixFiles.find(m => m.info.name === mixName)
        if (!mix) throw new Error('MIX not found')
        const vf = await MixParser.extractFile(mix.file, inner)
        if (!vf) throw new Error('File not found in MIX')

        const vxl = new VxlFile(vf)
        if (vxl.sections.length === 0) throw new Error('Failed to parse VXL')
        const hasEmbeddedPalette = vxl.embeddedPalette.length >= 48
        const decision = PaletteResolver.resolve({
          assetPath: selectedFile,
          assetKind: 'vxl',
          mixFiles,
          resourceContext,
          manualPalettePath: palettePath || null,
          hasEmbeddedPalette,
        })
        setPaletteList(decision.availablePalettePaths)

        let selectedInfo: PaletteSelectionInfo = decision.selection
        let finalPalette: Rgb[] | null = null
        if (decision.resolvedPalettePath) {
          const loaded = await loadPaletteByPath(decision.resolvedPalettePath, mixFiles)
          if (loaded) {
            finalPalette = loaded
          } else {
            selectedInfo = {
              source: 'fallback-grayscale',
              reason: `调色板加载失败（${decision.resolvedPalettePath}），回退灰度`,
              resolvedPath: decision.resolvedPalettePath,
            }
          }
        } else if (hasEmbeddedPalette) {
          const embedded = PaletteParser.fromBytes(vxl.embeddedPalette)
          if (embedded) {
            finalPalette = embedded.colors
          } else {
            selectedInfo = {
              source: 'fallback-grayscale',
              reason: '内嵌调色板无效，回退灰度',
              resolvedPath: null,
            }
          }
        }
        if (!finalPalette) finalPalette = PaletteParser.buildGrayscalePalette()
        setPaletteInfo(selectedInfo)
        const pal = toBytePalette(finalPalette)

        // 构建体素网格（低开销：实例化网格）
        const mount = mountRef.current
        if (!mount) throw new Error('Mount not ready')
        renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(mount.clientWidth, mount.clientHeight)
        renderer.setPixelRatio(devicePixelRatio)
        // 使用 sRGB 输出，避免整体过暗；保持无色调映射
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.NoToneMapping
        mount.innerHTML = ''
        mount.appendChild(renderer.domElement)

        scene = new THREE.Scene()
        scene.background = new THREE.Color(0x2e2e2e)
        camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 5000)
        camera.position.set(80, 80, 80)
        camera.lookAt(0, 0, 0)

        const light = new THREE.DirectionalLight(0xffffff, 1.2)
        light.position.set(2, 3, 4)
        scene.add(light)
        scene.add(new THREE.AmbientLight(0xffffff, 0.6))
        // 额外补光，避免材料受光不均导致发黑
        scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.5))

        // 使用 InstancedMesh 渲染体素小立方体
        const boxGeo = new THREE.BoxGeometry(1, 1, 1)
        // 为顶点写入全白颜色，确保 vertexColors 有有效输入（避免被当作全黑）
        const vertCount = (boxGeo.attributes.position?.count || 0)
        if (vertCount > 0) {
          const white = new Float32Array(vertCount * 3)
          for (let i = 0; i < white.length; i++) white[i] = 1
          boxGeo.setAttribute('color', new THREE.BufferAttribute(white, 3))
        }
        // 材质：支持 instanceColor。若依然发黑，可通过 URL 加上 ?material=basic 切换无光照材质
        const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : undefined
        const materialType = (search?.get('material') || '').toLowerCase()
        const useBasic = materialType === 'basic'
        const mat = useBasic
          ? new THREE.MeshBasicMaterial({ vertexColors: true })
          : new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(0x222222) })
        mat.side = THREE.DoubleSide

        // 构建单个彩色立方体的几何（用 per-instance color 需要扩展，这里简单复制不同色）
        // 为了性能，这里按 section 分批构建合并网格
        // 将几何加入独立分组，便于计算包围盒与相机对齐
        const root = new THREE.Group()
        scene.add(root)

        for (const section of vxl.sections) {
          const { voxels } = section.getAllVoxels()
          if (voxels.length === 0) continue
          const inst = new THREE.InstancedMesh(boxGeo, mat, voxels.length)
          const color = new THREE.Color()
          const dummy = new THREE.Object3D()
          let idx = 0
          for (const v of voxels) {
            dummy.position.set(v.x, v.z, v.y)
            dummy.updateMatrix()
            inst.setMatrixAt(idx, dummy.matrix)
            color.copy(colorFromPalette(pal, v.colorIndex))
            inst.setColorAt(idx, color)
            idx++
          }
          inst.instanceMatrix.needsUpdate = true
          // @ts-ignore THREE r150+
          if (inst.instanceColor) inst.instanceColor.needsUpdate = true
          root.add(inst)
        }

        // 居中并自动适配相机距离
        const box3 = new THREE.Box3().setFromObject(root)
        const center = new THREE.Vector3()
        box3.getCenter(center)
        root.position.sub(center)

        const size = new THREE.Vector3()
        box3.getSize(size)
        const radius = Math.max(1, size.length() * 0.6)
        const dir = new THREE.Vector3(1, 1, 1).normalize()
        camera.position.copy(dir.multiplyScalar(radius * 1.6))
        camera.lookAt(0, 0, 0)

        // Debug: 辅助观察包围盒
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1') {
          const helper = new THREE.Box3Helper(box3, 0x00ff00)
          scene.add(helper)
        }

        controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true

        const onResize = () => {
          if (!renderer || !camera || !mount) return
          const w = mount.clientWidth, h = mount.clientHeight
          renderer.setSize(w, h)
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
        window.addEventListener('resize', onResize)

        const loop = () => {
          controls?.update()
          renderer?.render(scene!, camera!)
          animationId = requestAnimationFrame(loop)
        }
        loop()
      } catch (e: any) {
        setError(e?.message || 'Failed to render VXL 3D')
      } finally {
        setLoading(false)
      }
    }
    load()

    return () => {
      cancelAnimationFrame(animationId)
      controls?.dispose()
      renderer?.dispose()
      if (renderer?.domElement?.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement)
      scene = null
      camera = null
      renderer = null
      controls = null
    }
  }, [selectedFile, mixFiles, palettePath, resourceContext])

  const paletteOptions = useMemo(
    () => [{ value: '', label: '自动(规则/内嵌)' }, ...paletteList.map((p) => ({ value: p, label: p.split('/').pop() || p }))],
    [paletteList],
  )
  usePaletteHotkeys(paletteOptions, palettePath, setPalettePath, true)

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center gap-2">
        <span>VXL 预览（3D体素）</span>
        <label className="flex items-center gap-1">
          <span>调色板</span>
          <SearchableSelect
            value={palettePath}
            options={paletteOptions}
            onChange={(next) => setPalettePath(next || '')}
            closeOnSelect={false}
            pinnedValues={['']}
            searchPlaceholder="搜索调色板..."
            noResultsText="未找到匹配调色板"
            triggerClassName="min-w-[160px] max-w-[240px] bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-xs text-left flex items-center gap-2"
            menuClassName="absolute z-50 mt-1 w-[260px] max-w-[70vw] rounded border border-gray-700 bg-gray-800 shadow-xl"
          />
        </label>
        <span className="text-gray-500 truncate">{paletteInfo.source} - {paletteInfo.reason}</span>
      </div>
      <div ref={mountRef} className="flex-1" />
      {loading && <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-black/20">加载中...</div>}
      {error && !loading && <div className="absolute top-2 left-2 right-2 p-2 text-red-400 text-xs bg-black/40 rounded">{error}</div>}
    </div>
  )
}

export default VxlViewer3D


