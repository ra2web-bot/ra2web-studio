export class Format3 {
    static decode(sourceData: Uint8Array, width: number, height: number): Uint8Array {
      const decodedData = new Uint8Array(width * height);
      let sourceIndex = 0;
      let destIndex = 0;

      for (let y = 0; y < height; y++) {
        // Read the length of the current line's data block
        // Original: let t = ((r[n + 1] << 8) | r[n]) - 2;
        let lineDataLength = ((sourceData[sourceIndex + 1] << 8) | sourceData[sourceIndex]) - 2;
        sourceIndex += 2;

        let currentXInLine = 0; // Tracks pixels written in the current line for bounds checking

        // Process this line's data block
        while (lineDataLength > 0) {
          const value = sourceData[sourceIndex++];
          lineDataLength--;

          if (value !== 0) { // Non-zero value is a literal pixel
            if (destIndex < decodedData.length && currentXInLine < width) {
              decodedData[destIndex++] = value;
            }
            currentXInLine++;
          } else { // Zero value indicates a run of zeros
            let runLength = sourceData[sourceIndex++];
            lineDataLength--;

            // Original: i + e > s && (e = (s - i) & 255)
            // This seems to be a bounds check: if currentX + runLength > width, truncate runLength.
            if (currentXInLine + runLength > width) {
              runLength = (width - currentXInLine) & 255; // Ensure it fits, and keep original byte logic if that was intended for some reason
            }

            for (let k = 0; k < runLength; k++) {
              if (destIndex < decodedData.length && currentXInLine < width) {
                decodedData[destIndex++] = 0;
              }
              currentXInLine++;
            }
          }
        }
        // If the decoded line is shorter than width due to abrupt end or corruption,
        // ensure destIndex is at the start of the next line for safety, by filling remaining with 0s.
        // This part is an addition for robustness if source data is malformed for a line.
        while (currentXInLine < width && destIndex < (y + 1) * width && destIndex < decodedData.length) {
            decodedData[destIndex++] = 0;
            currentXInLine++;
        }
        // Ensure destIndex is aligned for the next line start, if not already there by filling width.
        destIndex = (y + 1) * width;

      }
      return decodedData;
    }
  }
