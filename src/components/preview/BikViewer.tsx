import React, { useEffect, useRef, useState } from 'react'
import { MixParser, MixFileInfo } from '../../services/MixParser'
import { BikTranscoder } from '../../services/video/BikTranscoder'
import type { ResourceContext } from '../../services/gameRes/ResourceContext'

type MixFileData = { file: File; info: MixFileInfo }

function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index++
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const LARGE_FILE_WARNING_THRESHOLD = 32 * 1024 * 1024

const BikViewer: React.FC<{
  selectedFile: string
  mixFiles: MixFileData[]
  resourceContext?: ResourceContext | null
}> = ({ selectedFile, mixFiles }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [phaseText, setPhaseText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [sourceSize, setSourceSize] = useState(0)
  const [convertedSize, setConvertedSize] = useState(0)

  useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null

    const cleanupVideo = () => {
      const video = videoRef.current
      if (!video) return
      try {
        video.pause()
        video.currentTime = 0
      } catch {
        // Ignore media cleanup errors.
      }
    }

    async function load() {
      cleanupVideo()
      setLoading(true)
      setPhaseText('正在读取 MIX 条目...')
      setError(null)
      setPlaybackError(null)
      setVideoUrl(null)
      setSourceSize(0)
      setConvertedSize(0)
      try {
        const slash = selectedFile.indexOf('/')
        if (slash <= 0) throw new Error('无效路径')
        const mixName = selectedFile.substring(0, slash)
        const inner = selectedFile.substring(slash + 1)
        const mix = mixFiles.find((m) => m.info.name === mixName)
        if (!mix) throw new Error('未找到对应 MIX')

        const vf = await MixParser.extractFile(mix.file, inner)
        if (!vf) throw new Error('无法从 MIX 中提取 BIK 文件')
        const rawBytes = vf.getBytes()
        if (cancelled) return

        setSourceSize(rawBytes.byteLength)
        setPhaseText('正在转码 BIK -> WebM（首次可能较慢）...')
        const webmBytes = await BikTranscoder.transcodeToWebm(inner, rawBytes)
        if (cancelled) return

        const webmBuffer = new ArrayBuffer(webmBytes.byteLength)
        new Uint8Array(webmBuffer).set(webmBytes)
        const url = URL.createObjectURL(new Blob([webmBuffer], { type: 'video/webm' }))
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }

        createdUrl = url
        setVideoUrl(url)
        setConvertedSize(webmBytes.byteLength)
        setPhaseText('转码完成，可播放')
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'BIK 预览失败')
          setPhaseText('')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
      cleanupVideo()
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [selectedFile, mixFiles])

  const largeFile = sourceSize >= LARGE_FILE_WARNING_THRESHOLD

  return (
    <div className="w-full h-full flex flex-col">
      <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700 flex items-center justify-between gap-3">
        <span>BIK 预览（即时转码 WebM / 静音）</span>
        <span className="text-gray-500 truncate">{selectedFile.split('/').pop() || selectedFile}</span>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {loading && (
          <div className="space-y-2 text-sm text-gray-400">
            <div>{phaseText || '正在加载...'}</div>
            {sourceSize > 0 && <div className="text-xs text-gray-500">源文件大小：{formatFileSize(sourceSize)}</div>}
          </div>
        )}

        {!loading && error && (
          <div className="space-y-3">
            <div className="text-sm text-red-400">{error}</div>
            <div className="text-xs text-gray-500">可切换到“十六进制”视图排查文件头和原始数据。</div>
          </div>
        )}

        {!loading && !error && videoUrl && (
          <div className="space-y-4">
            <video
              ref={videoRef}
              controls
              muted
              playsInline
              preload="metadata"
              src={videoUrl}
              className="w-full max-w-[900px] bg-black rounded"
              onError={() => setPlaybackError('浏览器无法播放当前转码结果，可切换十六进制视图排查。')}
              onLoadedData={() => setPlaybackError(null)}
            />

            <div className="text-xs text-gray-400 space-y-1">
              <div>源文件大小：{formatFileSize(sourceSize)}</div>
              <div>转码后大小：{formatFileSize(convertedSize)}</div>
              <div>说明：当前版本仅视频轨，音频已禁用（-an）。</div>
            </div>

            {largeFile && (
              <div className="text-xs text-amber-300">
                当前 BIK 文件较大，首次转码耗时可能明显增加。
              </div>
            )}

            {playbackError && <div className="text-xs text-amber-300">{playbackError}</div>}
          </div>
        )}

        {!loading && !error && !videoUrl && (
          <div className="text-sm text-gray-400">没有可播放的视频数据。</div>
        )}
      </div>
    </div>
  )
}

export default BikViewer

