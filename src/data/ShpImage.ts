export class ShpImage {
    public width: number;
    public height: number;
    public x: number; // Offset X
    public y: number; // Offset Y
    public imageData: Uint8Array;

    constructor(imageData?: Uint8Array, width?: number, height?: number, x?: number, y?: number) {
      this.imageData = imageData ?? new Uint8Array(0);
      this.width = width ?? (imageData ? Math.sqrt(imageData.length) : 1); // Guess if not provided
      this.height = height ?? (imageData ? imageData.length / this.width : 1); // Guess if not provided
      this.x = x ?? 0;
      this.y = y ?? 0;

      // Basic validation if dimensions were guessed or provided
      if (this.imageData.length > 0 && this.width * this.height > this.imageData.length) {
          // This might happen if imageData is provided but dimensions are too large or guessed incorrectly.
          // console.warn("ShpImage: width * height exceeds imageData length. Adjusting dimensions or expecting partial data.");
          // For safety, one might cap height or width, or throw error, depending on expected use.
          // For now, we assume the provided imageData is the source of truth for its own length.
      }
    }

    /**
     * Creates a new ShpImage by clipping the current image to the specified dimensions.
     * The original implementation of clip had a potential issue in how it constructed the new Uint8Array (t*i)
     * vs how it populated it, especially if this.width/height were smaller than t/i.
     * This version aims to correctly copy a sub-rectangle.
     * Note: The original `clip` returned an image of `min(this.width, t) x min(this.height, i)`
     * but allocated `t*i` for `r`. This version uses `newWidth` and `newHeight` for allocation.
     */
    clip(clipWidth: number, clipHeight: number): ShpImage {
      const newWidth = Math.min(this.width, clipWidth);
      const newHeight = Math.min(this.height, clipHeight);

      const clippedImageData = new Uint8Array(newWidth * newHeight);

      for (let r = 0; r < newHeight; r++) {
        for (let c = 0; c < newWidth; c++) {
          // Source index from original imageData
          const sourceIndex = r * this.width + c;
          // Destination index in clippedImageData
          const destIndex = r * newWidth + c;

          if (sourceIndex < this.imageData.length) { // Boundary check for source
               clippedImageData[destIndex] = this.imageData[sourceIndex];
          } else {
              // Should not happen if newHeight/newWidth are derived from this.height/this.width
              // But as a safeguard if source image data is smaller than its stated dimensions.
              clippedImageData[destIndex] = 0; // Or some other default value
          }
        }
      }
      // The new clipped image usually retains the original top-left (x,y) offsets.
      // If clipping is meant to be relative within the image, x/y might need adjustment.
      return new ShpImage(clippedImageData, newWidth, newHeight, this.x, this.y);
    }
  }
