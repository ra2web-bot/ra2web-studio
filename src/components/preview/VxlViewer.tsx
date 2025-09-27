import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import { VxlFile } from '../../data/VxlFile'

type MixFileData = { file: File; info: MixFileInfo }

function buildDefaultPalette(): Uint8Array {
  // grayscale palette as fallback (256 * 3)
  const pal = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) pal.set([i, i, i], i * 3)
  return pal
}

function colorFromPalette(palette: Uint8Array, index: number): THREE.Color {
  const i = Math.max(0, Math.min(255, index | 0)) * 3
  const r = palette[i] / 255
  const g = palette[i + 1] / 255
  const b = palette[i + 2] / 255
  return new THREE.Color(r, g, b)
}

const VxlViewer: React.FC<{ selectedFile: string; mixFiles: MixFileData[] }> = ({ selectedFile, mixFiles }) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let renderer: THREE.WebGLRenderer | null = null
    let scene: THREE.Scene | null = null
    let camera: THREE.PerspectiveCamera | null = null
    let controls: OrbitControls | null = null
    let animationId = 0
    let mesh: THREE.Mesh | null = null

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

        const pal = buildDefaultPalette() // TODO: load real palette if available

        // Build simple voxel geometry (boxes per voxel)
        const group = new THREE.Group()
        const box = new THREE.BoxGeometry(1, 1, 1)
        for (const section of vxl.sections) {
          const { voxels } = section.getAllVoxels()
          for (const v of voxels) {
            const color = colorFromPalette(pal, v.colorIndex)
            const mat = new THREE.MeshLambertMaterial({ color })
            const cube = new THREE.Mesh(box, mat)
            cube.position.set(v.x, v.z, v.y) // swap to Z-up-ish
            group.add(cube)
          }
        }

        // Init three
        const mount = mountRef.current
        if (!mount) throw new Error('Mount not ready')
        renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(mount.clientWidth, mount.clientHeight)
        renderer.setPixelRatio(devicePixelRatio)
        mount.innerHTML = ''
        mount.appendChild(renderer.domElement)

        scene = new THREE.Scene()
        scene.background = new THREE.Color(0x2e2e2e)
        camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 2000)
        camera.position.set(40, 40, 40)
        camera.lookAt(0, 0, 0)

        const light = new THREE.DirectionalLight(0xffffff, 1)
        light.position.set(1, 2, 3)
        scene.add(light)
        scene.add(new THREE.AmbientLight(0xffffff, 0.3))

        // Center group
        const box3 = new THREE.Box3().setFromObject(group)
        const center = new THREE.Vector3()
        box3.getCenter(center)
        group.position.sub(center)
        scene.add(group)

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
        setError(e?.message || 'Failed to render VXL')
      } finally {
        setLoading(false)
      }

      return () => {}
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
      mesh = null
    }
  }, [selectedFile, mixFiles])

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700">VXL 预览（简化体素盒渲染）</div>
      <div ref={mountRef} className="flex-1" />
      {loading && <div className="absolute inset-0 flex items-center justify-center text-gray-400 bg-black/20">加载中...</div>}
      {error && !loading && <div className="absolute top-2 left-2 right-2 p-2 text-red-400 text-xs bg-black/40 rounded">{error}</div>}
    </div>
  )
}

export default VxlViewer


