import { DataStream } from "./DataStream";
import { Blowfish } from "./encoding/Blowfish";
import { BlowfishKey } from "./encoding/BlowfishKey";
import { MixEntry } from "./MixEntry";
import { VirtualFile } from "./vfs/VirtualFile";

enum MixFileFlags {
  Checksum = 0x00010000, // 65536
  Encrypted = 0x00020000, // 131072
}

export class MixFile {
  private stream: DataStream;
  private headerStart = 84; // For RA encrypted headers, from original constructor
  private index: Map<number, MixEntry>;
  private dataStart: number = 0; // Offset where the actual file data begins

  constructor(stream: DataStream) {
    this.stream = stream;
    this.index = new Map<number, MixEntry>();
    this.parseHeader();
  }

  private parseHeader(): void {
    const flags = this.stream.readUint32();

    // Original logic: t = 0 == (e & ~(r.Checksum | r.Encrypted));
    // This checks if flags, after clearing Checksum and Encrypted bits, is zero.
    // Meaning, flags only contains Checksum, Encrypted, or both, or is zero.
    const isChronodivideMix = (flags & ~(MixFileFlags.Checksum | MixFileFlags.Encrypted)) === 0;

    if (isChronodivideMix) {
      if ((flags & MixFileFlags.Encrypted) !== 0) {
        // RA/TS Encrypted header
        this.dataStart = this.parseRaHeader();
        return; // Successfully parsed encrypted header
      }
      // else TD/RA unencrypted header (or flags = 0), continue to parseTdHeader with current stream
    } else {
      // Not a Chronodivide MIX file based on flags, or potentially a TD/RA file with no flags set (stream was 0).
      // Original logic: else this.stream.seek(0);
      // Try to parse as TD header from the beginning of the file.
      this.stream.seek(0);
    }
    // For unencrypted Chronodivide Mix or non-Chronodivide (seeked to 0)
    this.dataStart = this.parseTdHeader(this.stream);
  }

  private parseRaHeader(): number {
    const e = this.stream;
    var t: any = e.readUint8Array(80),
      i: any = new BlowfishKey().decryptKey(t),
      r: any = e.readUint32Array(2);

    const s = new Blowfish(i);
    let a = new DataStream(s.decrypt(r));

    t = a.readUint16(); // 重新赋值t为文件数量，就像原项目一样

    a.readUint32(), (e.position = this.headerStart);
    (i = 6 + t * MixEntry.size),
      (t = ((3 + i) / 4) | 0),
      (r = e.readUint32Array(t + (t % 2)));

    a = new DataStream(s.decrypt(r));

    i = this.headerStart + i + ((1 + (~i >>> 0)) & 7);

    this.parseTdHeader(a);
    return i;
  }

  private parseTdHeader(e: DataStream): number {
    var t = e.readUint16();
    e.readUint32();

    let successfulEntries = 0;
    let failedEntries = 0;
    let duplicateHashes = 0;
    const seenHashes = new Set<number>();

    for (let r = 0; r < t; r++) {
      try {
        // 检查是否有足够的数据读取一个完整的条目（12字节）
        if (e.position + 12 > e.byteLength) {
          console.log(`[Our] Entry ${r + 1}: Not enough data remaining. Position: ${e.position}, Remaining: ${e.byteLength - e.position}`);
          failedEntries++;
          break;
        }

        var i = new MixEntry(
          e.readUint32(),
          e.readUint32(),
          e.readUint32(),
        );

        if (r < 5) {
          console.log(`[Our] Entry ${r + 1}: hash=0x${i.hash.toString(16).toUpperCase()}, offset=${i.offset}, length=${i.length}`);
          // 显示当前位置的原始字节数据
          const currentPos = e.position - 12; // 回到条目开始位置
          const rawBytes = new Uint8Array(e.buffer, e.byteOffset + currentPos, 12);
          console.log(`[Our] Entry ${r + 1} raw bytes:`, Array.from(rawBytes));
        }

        // 检查重复哈希
        if (seenHashes.has(i.hash)) {
          duplicateHashes++;
          if (duplicateHashes <= 10) {
            console.log(`[Our] Duplicate hash detected at entry ${r + 1}: 0x${i.hash.toString(16).toUpperCase()}`);
          }
        } else {
          seenHashes.add(i.hash);
        }

        this.index.set(i.hash, i);
        successfulEntries++;
      } catch (error) {
        console.log(`[Our] Entry ${r + 1}: Error reading entry:`, error);
        failedEntries++;
        break;
      }
    }

    return e.position;
  }

  public containsFile(filename: string): boolean { // 'e' in original
    // Filenames in MIX are typically case-insensitive. MixEntry.hashFilename handles uppercasing.
    const normalized = filename.replace(/\//g, "\\");
    return this.index.has(MixEntry.hashFilename(normalized));
  }

  public openFile(filename: string): VirtualFile { // 'e' in original filename
    // Filenames in MIX are typically case-insensitive.
    const normalized = filename.replace(/\//g, "\\");
    const fileId = MixEntry.hashFilename(normalized);
    const entry = this.index.get(fileId); // 't' in original

    if (!entry) {
      throw new Error(`File "${filename}" not found`);
    }

    // The 'this.stream' here is the DataStream of the entire MIX file.
    // 'VirtualFile.factory' in original was i.VirtualFile.factory
    // It expects the source DataStream (or DataView), filename, absolute offset, and length.
    return VirtualFile.factory(
      this.stream, // Pass the DataStream, not the DataView
      filename,
      this.dataStart + entry.offset, // entry.offset is relative to dataStart
      entry.length
    );
  }

  /**
   * 直接通过 id (索引中的散列/标识) 打开条目。
   * 用作回退（例如 UI 使用占位名 file_XXXXXXXX.ext）。
   */
  public containsId(id: number): boolean {
    return this.index.has(id >>> 0);
  }

  public openById(id: number, filename?: string): VirtualFile {
    const entry = this.index.get(id >>> 0);
    if (!entry) {
      throw new Error(`File id 0x${(id >>> 0).toString(16).toUpperCase()} not found`);
    }
    return VirtualFile.factory(
      this.stream,
      filename ?? `file_${(id >>> 0).toString(16).toUpperCase()}`,
      this.dataStart + entry.offset,
      entry.length
    );
  }

  /**
   * 打开指定 id 的前 length 字节视图，用于类型嗅探。
   */
  public openSliceById(id: number, length: number): VirtualFile {
    const entry = this.index.get(id >>> 0);
    if (!entry) {
      throw new Error(`File id 0x${(id >>> 0).toString(16).toUpperCase()} not found`);
    }
    const sliceLen = Math.max(0, Math.min(length, entry.length));
    return VirtualFile.factory(
      this.stream,
      `slice_${(id >>> 0).toString(16).toUpperCase()}`,
      this.dataStart + entry.offset,
      sliceLen
    );
  }

  /**
   * 获取所有文件条目
   */
  public getAllEntries(): MixEntry[] {
    return Array.from(this.index.values());
  }

  /**
   * 获取所有文件名
   */
  public getAllFilenames(): string[] {
    return Array.from(this.index.values()).map(entry => {
      // 这里需要反向计算文件名
      // 由于原始代码没有提供反向哈希函数，我们需要一个不同的方法
      // 暂时返回哈希值的十六进制表示作为文件名
      return `file_${entry.hash.toString(16).toUpperCase()}.${this.getExtensionFromHash(entry.hash)}`;
    });
  }

  /**
   * 根据哈希值推测文件扩展名（这是一个简化的实现）
   */
  private getExtensionFromHash(_hash: number): string {
    // 这是一个简化的实现，实际应该通过其他方式确定扩展名
    // 或者在MIX文件中存储文件名映射
    return 'bin';
  }
}
