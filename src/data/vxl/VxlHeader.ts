import { DataStream } from "../DataStream";

export class VxlHeader {
  public static readonly size = 32; // base header fields size (without palette)

  public fileName: string = "";
  public paletteCount: number = 0;
  public headerCount: number = 0;
  public tailerCount: number = 0;
  public bodySize: number = 0;
  public paletteRemapStart: number = 0;
  public paletteRemapEnd: number = 0;
  public embeddedPalette: Uint8Array = new Uint8Array(0);

  read(stream: DataStream): void {
    this.fileName = stream.readCString(16);
    this.paletteCount = stream.readUint32();
    this.headerCount = stream.readUint32();
    this.tailerCount = stream.readUint32();
    this.bodySize = stream.readUint32();
    this.paletteRemapStart = stream.readUint8();
    this.paletteRemapEnd = stream.readUint8();
    // Read embedded palette (768 bytes) when available
    const remaining = Math.max(0, stream.byteLength - stream.position);
    const paletteBytes = Math.min(768, remaining);
    this.embeddedPalette = stream.mapUint8Array(paletteBytes);
    if (paletteBytes < 768) {
      // Keep stream movement semantics stable even for malformed files
      stream.seek(Math.min(stream.byteLength, stream.position + (768 - paletteBytes)));
    }
  }
}


