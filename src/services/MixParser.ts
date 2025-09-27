import { MixFile } from '../data/MixFile';
import { VirtualFile } from '../data/vfs/VirtualFile';
import { DataStream } from '../data/DataStream';
import { MixEntry } from '../data/MixEntry';
import { GlobalMixDatabase } from './GlobalMixDatabase';

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
      console.log('[MixParser] parseFile', { name: file.name, size: file.size })
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

      // 预取全局数据库（懒加载）
      const globalMap = await GlobalMixDatabase.get().catch(() => new Map<number, string>())

      // 将MixEntry转换为MixEntryInfo（优先 LMD；次选 GMD；无则 8位十六进制 + 推测扩展名）
      entries.forEach((entry) => {
        const h = entry.hash >>> 0
        const preferred = hashToName.get(h) ?? globalMap.get(h);
        const hashHex = (entry.hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
        const extGuess = this.guessExtensionByHeader(mixFile, entry);
        const fallbackName = extGuess ? `${hashHex}.${extGuess}` : hashHex;
        const filename = preferred ?? fallbackName;

        files.push({
          filename,
          hash: entry.hash,
          offset: entry.offset,
          length: entry.length,
          extension: this.getExtensionFromFilename(filename)
        });
      });

      const info = {
        name: file.name,
        size: file.size,
        files
      };
      console.log('[MixParser] parsed mix', { name: info.name, files: info.files.length })
      return info;
    } catch (error) {
      console.error('Failed to parse MIX file:', error);
      throw error;
    }
  }

  static async extractFile(mixFile: File, filename: string): Promise<VirtualFile | null> {
    try {
      console.log('[MixParser] extractFile request', { mix: mixFile.name, filename })
      const arrayBuffer = await mixFile.arrayBuffer();
      const dataStream = new DataStream(arrayBuffer);
      const mixFileObj = new MixFile(dataStream);

      // 检查文件是否存在
      if (mixFileObj.containsFile(filename)) {
        const vf = mixFileObj.openFile(filename);
        console.log('[MixParser] extractFile by name success', { filename, size: vf.getSize() })
        return vf;
      }

      // 回退：如果文件名看起来是 8位十六进制（可带扩展名），直接按 id 尝试
      const patterns = [
        /^file_([0-9A-Fa-f]{8})(?:\.[^.]+)?$/, // 兼容旧占位名
        /^([0-9A-Fa-f]{8})(?:\.[^.]+)?$/,
      ];
      for (const re of patterns) {
        const m = filename.match(re);
        if (m) {
          const id = parseInt(m[1], 16) >>> 0;
          if (mixFileObj.containsId(id)) {
            const vf = mixFileObj.openById(id, filename);
            console.log('[MixParser] extractFile by id success', { id: '0x' + id.toString(16).toUpperCase(), size: vf.getSize() })
            return vf;
          }
        }
      }
      // 尝试用全局数据库将传入名称映射为真实文件名
      try {
        const globalMap = await GlobalMixDatabase.get()
        const h = MixEntry.hashFilename(filename) >>> 0
        const alt = globalMap.get(h)
        if (alt && mixFileObj.containsFile(alt)) {
          const vf = mixFileObj.openFile(alt)
          console.log('[MixParser] extractFile by global map success', { requested: filename, resolved: alt, size: vf.getSize() })
          return vf
        }
      } catch {}
      console.warn('[MixParser] extractFile not found', { filename })
      return null;
    } catch (error) {
      console.error('Failed to extract file from MIX:', error);
      return null;
    }
  }

  private static getExtensionFromFilename(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }

  // 粗略的头部嗅探来推测扩展名（有限字节，不解码全文件）
  private static guessExtensionByHeader(mix: MixFile, entry: MixEntry): string | '' {
    try {
      if (entry.length === 768) return 'pal'
      const sliceLen = Math.min(512, entry.length)
      const vf = (mix as any).openSliceById ? (mix as any).openSliceById(entry.hash, sliceLen) : null
      if (!vf) return ''
      const s = vf.stream
      s.seek(0)
      const head32 = s.readString(Math.min(32, s.byteLength))
      if (head32.startsWith('JASC-PAL')) return 'pal'
      if (head32.startsWith('XCC by Olaf')) return 'dat'
      if (head32.startsWith('Voxel Animation')) return 'vxl'
      if (head32.startsWith('RIFF')) return 'wav'
      s.seek(0)
      const b0 = s.readUint8()
      if (b0 === 0x0A) return 'pcx'
      s.seek(0)
      const sample = s.readString(Math.min(256, s.byteLength)).replace(/\0/g, '')
      if (sample) {
        const visible = sample.split('').filter((ch: string) => (ch >= ' ' && ch <= '~') || ch === '\n' || ch === '\r' || ch === '\t').length
        const ratio = visible / sample.length
        if (ratio > 0.9) {
          if (sample.includes('[') && sample.includes(']') && sample.includes('=')) return 'ini'
          return 'txt'
        }
      }
      return ''
    } catch {
      return ''
    }
  }
}
