import { MixFile } from '../data/MixFile';
import { VirtualFile } from '../data/vfs/VirtualFile';
import { DataStream } from '../data/DataStream';
import { MixEntry } from '../data/MixEntry';

export interface MixFileInfo {
  name: string;
  size: number;
  files: MixEntryInfo[];
}

export interface MixEntryInfo {
  filename: string;
  hash: number;
  offset: number;
  length: number;
  extension: string;
}

export class MixParser {
  static async parseFile(file: File): Promise<MixFileInfo> {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const dataStream = new DataStream(arrayBuffer);
      const mixFile = new MixFile(dataStream);

      const files: MixEntryInfo[] = [];

      // 获取所有文件条目
      const entries = mixFile.getAllEntries();

      // 1) 尝试从 MIX 中的 LMD (local mix database.dat) 解析真实文件名
      // 2) 如果没有 LMD 或解析失败，则回退到哈希占位名
      const hashToName = new Map<number, string>();
      try {
        const lmdName = 'local mix database.dat';
        if (mixFile.containsFile(lmdName)) {
          const vf = mixFile.openFile(lmdName);
          const s = vf.stream;
          s.seek(0);
          const id = s.readString(32);
          // 放宽判断：前缀匹配 + 类型/版本校验
          if (id.startsWith('XCC by Olaf van der Spek')) {
            s.readInt32(); // size
            const type = s.readInt32();
            const version = s.readInt32();
            if (version === 0 && type === 0 /* xcc_ft_lmd */) {
              s.readInt32(); // game
              const count = s.readInt32();
              for (let i = 0; i < count; i++) {
                const name = s.readCString();
                if (!name) continue;
                const h = MixEntry.hashFilename(name);
                hashToName.set(h >>> 0, name);
              }
            }
          }
        }
      } catch (_) {
        // 忽略 LMD 解析失败，使用回退方案
      }

      // 将MixEntry转换为MixEntryInfo（优先使用 LMD 名称）
      entries.forEach((entry, index) => {
        const preferred = hashToName.get(entry.hash >>> 0);
        const filename = preferred ?? this.generateFilenameFromHash(entry.hash.toString(16).toUpperCase().padStart(8, '0'), index);

        files.push({
          filename,
          hash: entry.hash,
          offset: entry.offset,
          length: entry.length,
          extension: this.getExtensionFromFilename(filename)
        });
      });

      return {
        name: file.name,
        size: file.size,
        files
      };
    } catch (error) {
      console.error('Failed to parse MIX file:', error);
      throw error;
    }
  }

  static async extractFile(mixFile: File, filename: string): Promise<VirtualFile | null> {
    try {
      const arrayBuffer = await mixFile.arrayBuffer();
      const dataStream = new DataStream(arrayBuffer);
      const mixFileObj = new MixFile(dataStream);

      // 检查文件是否存在
      if (!mixFileObj.containsFile(filename)) {
        return null;
      }

      // 提取文件
      return mixFileObj.openFile(filename);
    } catch (error) {
      console.error('Failed to extract file from MIX:', error);
      return null;
    }
  }

  private static getExtensionFromFilename(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }

  private static generateFilenameFromHash(hashHex: string, index: number): string {
    // 常见RA2文件扩展名映射
    const commonExtensions = ['shp', 'vxl', 'pcx', 'wav', 'ini', 'pal', 'tmp', 'hva'];

    // 根据哈希值的某些特征来选择扩展名
    const hashNum = parseInt(hashHex, 16);
    const extensionIndex = hashNum % commonExtensions.length;
    const extension = commonExtensions[extensionIndex];

    return `file_${hashHex}.${extension}`;
  }
}
