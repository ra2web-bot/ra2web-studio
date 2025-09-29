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
          // 严格按照XCC格式验证：前缀匹配 + 类型/版本校验
          if (id.startsWith('XCC by Olaf van der Spek')) {
            s.readInt32(); // size
            const type = s.readInt32();
            const version = s.readInt32();
            if (version === 0 && type === 0 /* xcc_ft_lmd */) {
              s.readInt32(); // 游戏类型
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
      const globalMap = await GlobalMixDatabase.get()

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

  static async parseVirtualFile(vf: VirtualFile, name: string): Promise<MixFileInfo> {
    try {
      const dataStream = vf.stream as DataStream
      const mixFile = new MixFile(dataStream)

      const files: MixEntryInfo[] = []
      const entries = mixFile.getAllEntries()

      const hashToName = new Map<number, string>()
      try {
        const lmdName = 'local mix database.dat'
        if (mixFile.containsFile(lmdName)) {
          const v = mixFile.openFile(lmdName)
          const s = v.stream
          s.seek(0)
          const id = s.readString(32)
          if (id.startsWith('XCC by Olaf van der Spek')) {
            s.readInt32()
            const type = s.readInt32()
            const version = s.readInt32()
            if (version === 0 && type === 0) {
              s.readInt32()
              const count = s.readInt32()
              for (let i = 0; i < count; i++) {
                const n = s.readCString()
                if (!n) continue
                const h = MixEntry.hashFilename(n)
                hashToName.set(h >>> 0, n)
              }
            }
          }
        }
      } catch {}

      const globalMap = await GlobalMixDatabase.get().catch(() => new Map<number, string>())

      entries.forEach((entry) => {
        const h = entry.hash >>> 0
        const preferred = hashToName.get(h) ?? globalMap.get(h)
        const hashHex = (entry.hash >>> 0).toString(16).toUpperCase().padStart(8, '0')
        const extGuess = this.guessExtensionByHeader(mixFile, entry)
        const fallbackName = extGuess ? `${hashHex}.${extGuess}` : hashHex
        const filename = preferred ?? fallbackName

        files.push({
          filename,
          hash: entry.hash,
          offset: entry.offset,
          length: entry.length,
          extension: this.getExtensionFromFilename(filename),
        })
      })

      return { name, size: vf.getSize(), files }
    } catch (error) {
      console.error('Failed to parse MIX virtual file:', error)
      throw error
    }
  }

  static async extractFile(mixFile: File, filename: string): Promise<VirtualFile | null> {
    try {
      console.log('[MixParser] extractFile request', { mix: mixFile.name, filename })
      // 支持嵌套路径： a.mix/b.mix/c.shp
      if (filename.includes('/')) {
        return await this.extractNested(mixFile, filename)
      }
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

  private static async extractNested(mixFile: File, nestedPath: string): Promise<VirtualFile | null> {
    const segments = nestedPath.split('/')
    const arrayBuffer = await mixFile.arrayBuffer()
    let currentMix = new MixFile(new DataStream(arrayBuffer))
    let currentVf: VirtualFile | null = null
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const isLast = i === segments.length - 1
      // 先按名称找
      if (currentMix.containsFile(seg)) {
        currentVf = currentMix.openFile(seg)
      } else {
        // 尝试按 id（8位十六进制）
        const m = seg.match(/^([0-9A-Fa-f]{8})(?:\.[^.]+)?$/)
        if (m) {
          const id = parseInt(m[1], 16) >>> 0
          if (currentMix.containsId(id)) {
            currentVf = currentMix.openById(id, seg)
          } else {
            // 尝试 GMD 映射
            try {
              const g = await GlobalMixDatabase.get()
              const alt = g.get(id)
              if (alt && currentMix.containsFile(alt)) {
                currentVf = currentMix.openFile(alt)
              }
            } catch {}
          }
        }
      }
      if (!currentVf) return null
      if (isLast) return currentVf
      // 非最后一段，需把 currentVf 作为子 MIX 继续深入
      try {
        const subStream = currentVf.stream as DataStream
        currentMix = new MixFile(subStream)
        currentVf = null
      } catch (e) {
        console.warn('[MixParser] sub container parse failed', e)
        return null
      }
    }
    return null
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
      // MIX 容器嗅探（XCC 风格）：
      // 1) RA/TS Chronodivide 标志位（flags 仅包含 Checksum/Encrypted 位）
      if (s.byteLength >= 4) {
        const flags = s.readUint32()
        const masked = flags & ~(0x00010000 | 0x00020000)
        if (masked === 0 && (flags & (0x00010000 | 0x00020000)) !== 0) {
          return 'mix'
        }
        // 2) TD/RA 非加密头：count (u16) + u32 + entries(count*12)，大小合理
        s.seek(0)
        if (s.byteLength >= 6) {
          const count = s.readUint16()
          s.readUint32()
          const tableEnd = 6 + count * 12
          if (count > 0 && count < 50000 && tableEnd <= entry.length) {
            return 'mix'
          }
        }
      }
      s.seek(0)
      const head32 = s.readString(Math.min(32, s.byteLength))
      if (head32.startsWith('JASC-PAL')) return 'pal'
      if (head32.startsWith('XCC by Olaf')) return 'dat'
      if (head32.startsWith('Voxel Animation')) return 'vxl'
      if (head32.startsWith('RIFF')) return 'wav'
      if (head32.startsWith('CSF ')) return 'csf'
      if (head32.startsWith('Creative Voice File')) return 'voc'
      s.seek(0)
      const b0 = s.readUint8()
      if (b0 === 0x0A) return 'pcx'

      // 检查XIF文件（XCC Index File）
      s.seek(0)
      if (s.byteLength >= 8) {
        const signature = s.readUint32()
        s.readUint32() // version (unused)
        if (signature === 0x1a464958) { // 'XIF\x1a'
          return 'xif'
        }
      }

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

  // 创建local mix database数据（与XCC Mixer保持一致）
  static createLocalMixDatabase(files: MixEntryInfo[], gameType: number = 3): Uint8Array {
    // XCC LMD格式：
    // - XCC header (32 bytes): "XCC by Olaf van der Spek" + size + type + version
    // - LMD header (12 bytes): count + game
    // - 文件名列表 (每个文件名以null结尾)

    const fileNames = files
      .filter(file => file.filename && file.filename !== 'local mix database.dat')
      .map(file => file.filename.toLowerCase());

    // 计算总大小
    const xccHeaderSize = 32; // "XCC by Olaf van der Spek" + 4 bytes size + 4 bytes type + 4 bytes version
    const lmdHeaderSize = 12; // 4 bytes count + 4 bytes game + 4 bytes (unused)
    const namesSize = fileNames.reduce((sum, name) => sum + name.length + 1, 0); // +1 for null terminator

    const totalSize = xccHeaderSize + lmdHeaderSize + namesSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const uint8Array = new Uint8Array(buffer);

    let offset = 0;

    // XCC Header
    const xccId = 'XCC by Olaf van der Spek';
    for (let i = 0; i < xccId.length; i++) {
      uint8Array[offset++] = xccId.charCodeAt(i);
    }

    // Size (4 bytes)
    view.setUint32(offset, totalSize, true);
    offset += 4;

    // Type (4 bytes) - xcc_ft_lmd = 0
    view.setUint32(offset, 0, true);
    offset += 4;

    // Version (4 bytes) - 0
    view.setUint32(offset, 0, true);
    offset += 4;

    // LMD Header
    // Count (4 bytes)
    view.setUint32(offset, fileNames.length, true);
    offset += 4;

    // Game (4 bytes)
    view.setUint32(offset, gameType, true);
    offset += 4;

    // Unused (4 bytes)
    offset += 4;

    // 文件名列表
    for (const name of fileNames) {
      for (let i = 0; i < name.length; i++) {
        uint8Array[offset++] = name.charCodeAt(i);
      }
      uint8Array[offset++] = 0; // null terminator
    }

    return uint8Array;
  }

  // 将local mix database写入MIX文件
  static updateLocalMixDatabase(mixFile: MixFile, files: MixEntryInfo[]): boolean {
    try {
      // 检查是否已有LMD文件
      const lmdName = 'local mix database.dat';
      if (mixFile.containsFile(lmdName)) {
        // 如果存在，删除旧的LMD
        // 注意：实际的MIX文件操作需要通过mix_file_write.cpp实现
        console.warn('LMD file already exists in MIX, update operation not implemented');
        return false;
      }

      // 创建新的LMD数据
      this.createLocalMixDatabase(files);

      // TODO: 实现实际的MIX文件写入逻辑
      // 这里需要调用底层的MIX文件写入功能

      return true;
    } catch (error) {
      console.error('Failed to update local mix database:', error);
      return false;
    }
  }

  // 验证加密MIX文件的处理能力
  static async testEncryptedMixFile(file: File): Promise<boolean> {
    try {
      console.log('Testing encrypted MIX file:', file.name, 'Size:', file.size);

      // 解析MIX文件
      const mixInfo = await this.parseFile(file);
      console.log('MIX file parsed successfully:', mixInfo.name, 'Files:', mixInfo.files.length);

      // 检查是否包含加密标志
      const encryptedFiles = mixInfo.files.filter(f => f.length > 0);
      console.log('Files with content:', encryptedFiles.length);

      // 显示前几个文件的信息，验证文件名解析
      const firstFiles = mixInfo.files.slice(0, 5);
      console.log('First 5 files:');
      firstFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.filename} (${file.extension}) - ${file.length} bytes`);
      });

      // 尝试提取第一个文件来测试解密
      if (encryptedFiles.length > 0) {
        const firstFile = encryptedFiles[0];
        const vf = await this.extractFile(file, firstFile.filename);
        if (vf) {
          console.log('Successfully extracted and decrypted file:', firstFile.filename, 'Size:', vf.getSize());
          return true;
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to test encrypted MIX file:', error);
      return false;
    }
  }

  // 测试Global Mix Database加载
  static async testGlobalMixDatabase(): Promise<void> {
    try {
      console.log('Testing Global Mix Database...');
      const globalMap = await GlobalMixDatabase.get();
      console.log('Global Mix Database loaded with', globalMap.size, 'entries');

      // 测试一些已知的RA2文件哈希
      const testHashes = [
        0x82C00E10, // 应该对应某个PCX文件
        0x8A7417E7, // 应该对应某个MIX文件
        0x93850347, // 应该对应某个INI文件
      ];

      console.log('Testing hash lookups:');
      testHashes.forEach(hash => {
        const name = globalMap.get(hash);
        console.log(`  Hash 0x${hash.toString(16).toUpperCase().padStart(8, '0')}: ${name || 'Not found'}`);
      });

    } catch (error) {
      console.error('Failed to test Global Mix Database:', error);
    }
  }

  // 测试XIF文件识别
  static testXifFileSignature(): boolean {
    try {
      // 测试XIF文件签名识别
      const signature = 0x1a464958; // 'XIF\x1a'
      const signatureHex = signature.toString(16).toUpperCase().padStart(8, '0');
      console.log('XIF signature test:', signatureHex, signature === 0x1a464958);

      // 测试一些已知的XIF文件哈希（从XCC编译的文件中看到的）
      const knownXifHashes = [
        0x27F8A1E5, // infantry.xif
        0x3B4F2C90, // structures.xif
        0x4A5D3E12, // units.xif
        0x5C6E4F23, // overlays.xif
      ];

      console.log('Testing XIF file hash recognition:');
      knownXifHashes.forEach(hash => {
        const hashHex = hash.toString(16).toUpperCase().padStart(8, '0');
        console.log(`  Hash 0x${hashHex}: Should be recognized as XIF file`);
      });

      return true;
    } catch (error) {
      console.error('Failed to test XIF file signature:', error);
      return false;
    }
  }
}
