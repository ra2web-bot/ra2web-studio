import { Format3 } from "./encoding/Format3";
import { ShpImage } from "./ShpImage";
import { VirtualFile } from "./vfs/VirtualFile";
import { DataStream } from "./DataStream"; // VirtualFile.stream is a DataStream

interface ShpFrameHeader {
  x: number;
  y: number;
  width: number;
  height: number;
  compressionType: number;
  imageDataStartOffset: number;
  // The original also read 3 unused bytes and 2 unused int32s after compressionType
  // and before imageDataStartOffset in the structure parsed on disk.
  // If these were part of the structure on disk but not this in-memory header, that's fine.
}

export class ShpFile {
  public width: number = 0;      // Overall width of the logical SHP canvas (often max width of frames)
  public height: number = 0;     // Overall height of the logical SHP canvas (often max height of frames)
  public numImages: number = 0;
  public images: ShpImage[] = [];
  public filename?: string;

  static fromVirtualFile(file: VirtualFile): ShpFile {
    const shpFile = new ShpFile();
    shpFile.fromVirtualFile(file);
    return shpFile;
  }

  constructor(file?: VirtualFile) {
    if (file instanceof VirtualFile) {
      this.fromVirtualFile(file);
    }
    // Allow creation of an empty ShpFile that can be populated manually
  }

  private fromVirtualFile(file: VirtualFile): void {
    this.filename = file.filename;
    const s = file.stream as DataStream; // Assuming VirtualFile.stream is a DataStream

    // Original header format: Reserved (zero, 2 bytes), Width (2 bytes), Height (2 bytes), NumImages (2 bytes)
    const reserved = s.readInt16(); // Should be 0 for standard SHP(TD)
    // Some SHP variants (e.g. SHP(TS) from Tiberian Sun) might have different global headers or no global width/height.
    // The original code only proceeds if reserved is 0.

    if (reserved === 0) { // Standard SHP (TD) format
      this.width = s.readInt16();
      this.height = s.readInt16();
      this.numImages = s.readInt16();
    } else {
        // This might be a different SHP format (e.g., SHP(TS) with image count at offset 0)
        // or the file is not a typical SHP. The original code would stop here.
        // For now, let's try to read numImages from the start for TS-like SHP if reserved wasn't 0.
        s.seek(0); // Rewind to check for numImages at the start
        this.numImages = s.readUint16(); // Tiberian Sun SHP has numframes (uint16) at the beginning.
                                       // Width/Height are per-frame in TS SHP.
        // Global width/height are not present in TS SHP header, they are max of frames.
        // The original parsing seems to assume RA2 SHP (TD).
        // For robustness, if it's not TD, we'll determine W/H after reading frames.
        console.warn(`ShpFile ${this.filename}: Non-standard SHP header (reserved field was ${reserved}). Attempting to read as potentially TS-like format.`);
        // Reset main width/height, they will be determined by frames
        this.width = 0;
        this.height = 0;
    }

    if (this.numImages <=0 || this.numImages > 4096) { // Basic sanity check for numImages
        console.error(`ShpFile ${this.filename}: Invalid number of images: ${this.numImages}. Stopping parse.`);
        this.numImages = 0;
        return;
    }

    const frameHeaders: ShpFrameHeader[] = [];
    const frameHeaderBaseOffset = s.position; // Current position after global header (or start for TS)

    // In RA2 SHP (TD), frame offsets are listed first. In TS SHP, frame headers (including offsets) are listed.
    // The original code reads frame headers directly. This implies it might be geared for TS SHP frame header structures
    // or a unified view after an initial offset list is processed (which isn't shown for TD SHP).
    // Let's assume RA2 SHP (TD) for now, where an offset table exists first.
    // The original `readFrameHeader` reads x,y,w,h, comp, 3_skip_bytes, 2_skip_int32s, then offset.
    // This is NOT the structure of the frame *header entry* in TD SHP files after the main offset list.
    // That header is simpler (x,y,w,h,comp, 3 unused bytes, offset_from_file_start_to_imagedata).

    // Re-interpreting: The original code reads a list of *full frame descriptors* first.
    // This is more like SHP(TS) frame directory, or a pre-processed list.
    // Let's stick to the original code's structure for `readFrameHeader`:

    const frameDescriptorSize = 2 + 2 + 2 + 2 + 1 + 3 + 4 + 4 + 4; // Size of structure read by readFrameHeader
    // For RA2 SHP, the initial block is just offsets (numImages * 4 bytes)
    // The provided `readFrameHeader` seems to be reading a richer structure than just an offset.

    // Given the original code structure, it seems it expects a list of frame *descriptors* (like in TS SHP)
    // rather than just a list of offsets (like in TD SHP).
    // Let's assume the `readFrameHeader` function is correct for the format variant it handles.

    for (let i = 0; i < this.numImages; ++i) {
        // If seeking is needed based on an offset list first (typical for TD SHP), that would happen here.
        // However, the loop implies reading sequential frame headers.
        frameHeaders.push(this.readFrameHeader(s));
    }

    this.images = [];
    let maxWidth = 0;
    let maxHeight = 0;

    for (let i = 0; i < this.numImages; ++i) {
        const header = frameHeaders[i];
        const { x, y, width: frameWidth, height: frameHeight, compressionType, imageDataStartOffset } = header;

        let nextOffset: number;
        if (i < this.numImages - 1) {
            nextOffset = frameHeaders[i + 1].imageDataStartOffset;
        } else {
            // For the last image, length is until end of file (or a known refoffs table for some formats)
            // We need a reliable way to get stream length. Assume `s.byteLength` is total length.
            s.seek(0); // Ensure relative to file start if byteLength is absolute
            nextOffset = s.byteLength;
        }

        // Align with original behavior: if the next frame's offset is before the current one,
        // treat the end of file as the end of this frame's data.
        if (nextOffset < imageDataStartOffset) {
            nextOffset = s.byteLength;
        }

        let imageDataLength = nextOffset - imageDataStartOffset;
        if (imageDataStartOffset + imageDataLength > s.byteLength) {
            // console.warn(`ShpFile ${this.filename}, frame ${i}: Image data exceeds file bounds. Clamping.`);
            imageDataLength = s.byteLength - imageDataStartOffset;
        }
        if (imageDataLength <= 0 && !(frameWidth === 0 && frameHeight === 0)) {
            console.warn(`ShpFile ${this.filename}, frame ${i}: Zero or negative image data length (${imageDataLength}) for non-empty frame dimensions (${frameWidth}x${frameHeight}). Skipping frame data read.`);
             // Create an empty image if dimensions are also 0, otherwise this is an error.
            const emptyImage = new ShpImage(new Uint8Array(0), frameWidth, frameHeight, x, y);
            this.images.push(emptyImage);
            maxWidth = Math.max(maxWidth, x + frameWidth);
            maxHeight = Math.max(maxHeight, y + frameHeight);
            continue;
        }

        s.seek(imageDataStartOffset);
        const imageData = this.readImageData(s, frameWidth, frameHeight, compressionType, imageDataLength);

        const image = new ShpImage(imageData, frameWidth, frameHeight, x, y);
        this.images.push(image);

        maxWidth = Math.max(maxWidth, x + frameWidth);
        maxHeight = Math.max(maxHeight, y + frameHeight);
    }

    // If global width/height were not in header (e.g. TS SHP), set them from content
    if (reserved !== 0) {
        this.width = maxWidth;
        this.height = maxHeight;
    }
  }

  // This header structure seems specific. Standard SHP(TD) frame headers are simpler.
  // Format: XOffset (2), YOffset (2), Width (2), Height (2), Compression (1), Reserved (3), RefOffset (4), Unknown (4), FileOffsetToData (4)
  private readFrameHeader(s: DataStream): ShpFrameHeader {
    const x = s.readInt16();
    const y = s.readInt16();
    const width = s.readInt16();
    const height = s.readInt16();
    const compressionType = s.readUint8();
    s.readUint8();
    s.readUint8();
    s.readUint8();
    s.readInt32();
    s.readInt32();
    const imageDataStartOffset = s.readInt32();
    return {
      x,
      y,
      width,
      height,
      compressionType,
      imageDataStartOffset,
    };
  }

  private readImageData(
    s: DataStream,
    width: number,
    height: number,
    compressionType: number,
    expectedLength: number // Expected length of compressed data block
  ): Uint8Array {
    const uncompressedSize = width * height;
    if (uncompressedSize === 0) return new Uint8Array(0); // Empty frame
    if (expectedLength <=0 && compressionType > 1) {
        // If compressed and no data length, can't proceed
        console.warn(`ShpFile: readImageData called with expectedLength ${expectedLength} for compressed type ${compressionType}`);
        return new Uint8Array(uncompressedSize); // Return blank image
    }

    if (compressionType <= 1) { // Type 0 (uncompressed), Type 1 ( blittable / uncompressed variant in some tools)
      // Ensure we don't read past `expectedLength` or `uncompressedSize`
      const bytesToRead = Math.min(expectedLength, uncompressedSize);
      if (s.position + bytesToRead > s.byteLength) {
          // Not enough data in stream for even the minimum expected.
          console.error(`ShpFile: Not enough data in stream to read uncompressed image. Pos: ${s.position}, Need: ${bytesToRead}, Total: ${s.byteLength}`);
          return new Uint8Array(uncompressedSize); // return blank
      }
      const data = s.readUint8Array(bytesToRead);
      if (bytesToRead < uncompressedSize) { // If file was truncated
          const paddedData = new Uint8Array(uncompressedSize);
          paddedData.set(data);
          return paddedData;
      }
      return data;
    } else if (compressionType === 2) { // RLE variant ( Westwood Format 2 / Type 2 SHP)
        // Data is series of [length_word, byte*length]
        // This format is less common for SHP(TD), more for WW TMP files. SHP(TD) Type 2 is different.
        // The original code interprets this as: read Uint16 for line length, then read that many bytes.
        const decodedData = new Uint8Array(uncompressedSize);
        let destIndex = 0;
        for (let i = 0; i < height; ++i) {
            if (s.position + 2 > s.byteLength) break; // Not enough for line length word
            const lineRunLength = s.readUint16() - 2; // Original code subtracts 2 from length
            if (lineRunLength < 0 || s.position + lineRunLength > s.byteLength) break; // Invalid length or not enough data

            const lineData = s.readUint8Array(lineRunLength);
            if (destIndex + lineRunLength <= uncompressedSize) {
                decodedData.set(lineData, destIndex);
            }
            destIndex += lineRunLength; // Original logic just advanced by `o` (lineRunLength)
            // It didn't seem to fill the rest of the line if lineRunLength < width.
            // For SHP Type 2 (RA1 style RLE per line), it should fill up to `width`.
            // The current implementation matches the original script's behavior.
        }
        return decodedData;
    } else if (compressionType === 3) { // Format3 compression (LCW-like)
      // Read the *compressed* block of `expectedLength`
      if (s.position + expectedLength > s.byteLength) {
          console.error(`ShpFile: Not enough data for Format3 block. Pos: ${s.position}, Expected: ${expectedLength}, Total: ${s.byteLength}`);
          return new Uint8Array(uncompressedSize); // return blank
      }
      const compressedData = s.readUint8Array(expectedLength);
      return Format3.decode(compressedData, width, height);
    }
    console.warn(`ShpFile: Unknown compression type ${compressionType}`);
    return new Uint8Array(uncompressedSize); // Return blank image for unknown types
  }

  getImage(index: number): ShpImage {
    if (index < 0 || index >= this.images.length) {
      throw new RangeError(
        `Image index out of bounds (file=${this.filename}, index=${index}, numImages=${this.numImages}, images.length=${this.images.length})`
      );
    }
    return this.images[index];
  }

  addImage(image: ShpImage): void {
    this.images.push(image);
    this.numImages = this.images.length;
    // Recalculate overall width/height if necessary
    this.width = Math.max(this.width, image.x + image.width);
    this.height = Math.max(this.height, image.y + image.height);
  }

  clip(newWidth: number, newHeight: number): ShpFile {
    const clippedFile = new ShpFile();
    clippedFile.filename = this.filename;
    // The global width/height of the clipped SHP should be the new clip dimensions
    clippedFile.width = newWidth;
    clippedFile.height = newHeight;
    clippedFile.images = this.images.map((img) =>
      img.clip(newWidth, newHeight) // Clip each image to the new overall dimensions
    );
    clippedFile.numImages = this.images.length;
    return clippedFile;
  }
}
