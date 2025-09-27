import React from 'react'
import { Info, Palette, Layers, FileText } from 'lucide-react'
import { MixFileData } from './MixEditor'

interface PropertiesPanelProps {
  selectedFile: string | null
  mixFiles: MixFileData[]
}

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ selectedFile, mixFiles }) => {
  const getFileProperties = (filePath: string) => {
    const parts = filePath.split('/')
    const mixName = parts[0]
    const filename = parts[1]

    if (!filename) {
      return {
        name: '未选择文件',
        path: '',
        type: 'UNKNOWN',
        size: '0',
      }
    }

    const extension = filename.split('.').pop()?.toLowerCase() || ''

    // 查找对应的MIX文件和文件信息
    const mixData = mixFiles.find(mix => mix.info.name === mixName)
    const fileInfo = mixData?.info.files.find(file => file.filename === filename)

    const baseProps = {
      name: filename,
      path: filePath,
      type: extension.toUpperCase(),
      size: fileInfo ? fileInfo.length.toString() : '未知',
      hash: fileInfo ? `0x${fileInfo.hash.toString(16).toUpperCase()}` : '未知',
      offset: fileInfo ? fileInfo.offset.toString() : '未知',
    }

    switch (extension) {
      case 'shp':
        return {
          ...baseProps,
          format: 'SHP (Westwood Image Format)',
          frames: 12,
          width: 64,
          height: 48,
          compression: 'Format80',
          palette: 'unittem.pal',
        }
      case 'vxl':
        return {
          ...baseProps,
          format: 'VXL (Westwood 3D Model Format)',
          sections: 3,
          voxels: 1248,
          bounds: { min: [-32, -16, -8], max: [32, 16, 24] },
          normals: 'Enabled',
        }
      case 'pcx':
        return {
          ...baseProps,
          format: 'PCX (PC Paintbrush Format)',
          width: 320,
          height: 200,
          colors: 256,
          planes: 1,
          encoding: 'RLE',
        }
      default:
        return baseProps
    }
  }

  if (!selectedFile) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Info size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-sm">选择文件查看属性</p>
        </div>
      </div>
    )
  }

  const properties = getFileProperties(selectedFile)

  return (
    <div className="h-full flex flex-col">
      {/* 属性头部 */}
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold flex items-center">
          <Info size={20} className="mr-2" />
          文件属性
        </h3>
      </div>

      {/* 属性内容 */}
      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {/* 基本信息 */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-300 flex items-center">
            <FileText size={16} className="mr-2" />
            基本信息
          </h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">文件名:</span>
              <span className="text-white">{properties.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">文件路径:</span>
              <span className="text-white text-xs break-all">{properties.path}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">文件类型:</span>
              <span className="text-white">{properties.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">文件大小:</span>
              <span className="text-white">{properties.size} 字节</span>
            </div>
            {'hash' in properties && (
              <div className="flex justify-between">
                <span className="text-gray-400">哈希值:</span>
                <span className="text-white font-mono text-xs">{properties.hash}</span>
              </div>
            )}
            {'offset' in properties && (
              <div className="flex justify-between">
                <span className="text-gray-400">偏移量:</span>
                <span className="text-white">{properties.offset}</span>
              </div>
            )}
          </div>
        </div>

        {/* 格式特定信息 */}
        {'frames' in properties && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-300 flex items-center">
              <Layers size={16} className="mr-2" />
              SHP 信息
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">格式:</span>
                <span className="text-white">{properties.format}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">帧数:</span>
                <span className="text-white">{properties.frames}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">尺寸:</span>
                <span className="text-white">{properties.width} × {properties.height}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">压缩:</span>
                <span className="text-white">{properties.compression}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">调色板:</span>
                <span className="text-white">{properties.palette}</span>
              </div>
            </div>
          </div>
        )}

        {'voxels' in properties && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-300 flex items-center">
              <Layers size={16} className="mr-2" />
              VXL 信息
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">格式:</span>
                <span className="text-white">{properties.format}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Section数:</span>
                <span className="text-white">{properties.sections}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">体素数:</span>
                <span className="text-white">{properties.voxels}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">边界:</span>
                <span className="text-white">
                  [{properties.bounds.min.join(', ')}] - [{properties.bounds.max.join(', ')}]
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">法线:</span>
                <span className="text-white">{properties.normals}</span>
              </div>
            </div>
          </div>
        )}

        {'colors' in properties && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-gray-300 flex items-center">
              <Palette size={16} className="mr-2" />
              PCX 信息
            </h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">格式:</span>
                <span className="text-white">{properties.format}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">尺寸:</span>
                <span className="text-white">{properties.width} × {properties.height}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">颜色数:</span>
                <span className="text-white">{properties.colors}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">位平面:</span>
                <span className="text-white">{properties.planes}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">编码:</span>
                <span className="text-white">{properties.encoding}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PropertiesPanel
