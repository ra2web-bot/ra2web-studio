type BikCacheKeyInput = {
  mixName: string
  innerPath: string
  bytes: Uint8Array
}

function normalizeMixName(name: string): string {
  return name.trim().toLowerCase()
}

function normalizeInnerPath(path: string): string {
  return path.replace(/\\/g, '/').trim().toLowerCase()
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error('当前环境不支持 crypto.subtle，无法生成稳定缓存键')
  }
  const stableBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(stableBuffer).set(bytes)
  const digest = await subtle.digest('SHA-256', stableBuffer)
  return bytesToHex(new Uint8Array(digest))
}

export async function buildBikCacheKey(input: BikCacheKeyInput): Promise<string> {
  const mixName = normalizeMixName(input.mixName)
  const innerPath = normalizeInnerPath(input.innerPath)
  const size = input.bytes.byteLength
  const metadataBytes = new TextEncoder().encode(`${mixName}|${innerPath}|${size}`)
  const [metaDigest, contentDigest] = await Promise.all([
    sha256Hex(metadataBytes),
    sha256Hex(input.bytes),
  ])
  return `bik-v1-${size}-${metaDigest.slice(0, 16)}-${contentDigest}`
}

