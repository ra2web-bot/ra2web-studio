import * as THREE from 'three'
import { DataStream } from '../DataStream'

export interface Voxel { x: number; y: number; z: number; colorIndex: number; normalIndex: number }
export interface Span { x: number; y: number; voxels: Voxel[] }

export class Section {
  public name: string = ''
  public normalsMode: number = 1
  public minBounds: THREE.Vector3 = new THREE.Vector3()
  public maxBounds: THREE.Vector3 = new THREE.Vector3()
  public sizeX: number = 0
  public sizeY: number = 0
  public sizeZ: number = 0
  public hvaMultiplier: number = 1
  public transfMatrix: THREE.Matrix4 = new THREE.Matrix4()
  public spans: Span[] = []

  getAllVoxels(): { voxels: Voxel[] } {
    const all: Voxel[] = []
    for (const s of this.spans) for (const v of s.voxels) all.push(v)
    return { voxels: all }
  }
}

export function readSectionHeader(section: Section, stream: DataStream): void {
  section.name = stream.readCString(16)
  stream.readUint32(); stream.readUint32(); stream.readUint32();
}

export function readSectionTailer(section: Section, stream: DataStream) {
  const startingSpanOffset = stream.readUint32()
  const endingSpanOffset = stream.readUint32()
  const dataSpanOffset = stream.readUint32()
  section.hvaMultiplier = stream.readFloat32()
  section.transfMatrix = readTransfMatrix(stream)
  section.minBounds = new THREE.Vector3(stream.readFloat32(), stream.readFloat32(), stream.readFloat32())
  section.maxBounds = new THREE.Vector3(stream.readFloat32(), stream.readFloat32(), stream.readFloat32())
  section.sizeX = stream.readUint8()
  section.sizeY = stream.readUint8()
  section.sizeZ = stream.readUint8()
  section.normalsMode = stream.readUint8()
  return { startingSpanOffset, endingSpanOffset, dataSpanOffset }
}

function readTransfMatrix(stream: DataStream): THREE.Matrix4 {
  const arr: number[] = []
  for (let i = 0; i < 3; i++) {
    arr.push(stream.readFloat32(), stream.readFloat32(), stream.readFloat32(), stream.readFloat32())
  }
  arr.push(0, 0, 0, 1)
  return new THREE.Matrix4().fromArray(arr).transpose()
}

export function readSectionBodySpans(section: Section, tailer: { startingSpanOffset: number; endingSpanOffset: number; dataSpanOffset: number }, stream: DataStream): number {
  stream.seek(stream.position + tailer.startingSpanOffset)
  const { sizeX, sizeY, sizeZ } = section
  const startingOffsets: number[][] = new Array(sizeY)
  for (let y = 0; y < sizeY; y++) { startingOffsets[y] = new Array(sizeX); for (let x = 0; x < sizeX; x++) startingOffsets[y][x] = stream.readInt32() }
  const endingOffsets: number[][] = new Array(sizeY)
  for (let y = 0; y < sizeY; y++) { endingOffsets[y] = new Array(sizeX); for (let x = 0; x < sizeX; x++) endingOffsets[y][x] = stream.readInt32() }
  const spans: Span[] = section.spans = []
  let count = 0
  for (let y = 0; y < sizeY; y++) {
    for (let x = 0; x < sizeX; x++) {
      const voxels = readSpanVoxels(startingOffsets[y][x], endingOffsets[y][x], x, y, sizeZ, stream)
      spans.push({ x, y, voxels })
      count += voxels.length
    }
  }
  return count
}

function readSpanVoxels(startOffset: number, endOffset: number, x: number, y: number, sizeZ: number, stream: DataStream): Voxel[] {
  if (startOffset === -1 || endOffset === -1) return []
  const voxels: Voxel[] = []
  for (let z = 0; z < sizeZ;) {
    z += stream.readUint8()
    const voxelCount = stream.readUint8()
    for (let i = 0; i < voxelCount; i++) {
      voxels.push({ x, y, z: z++, colorIndex: stream.readUint8(), normalIndex: stream.readUint8() })
    }
    stream.readUint8() // end count
  }
  return voxels
}


