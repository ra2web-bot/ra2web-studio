export type Rgb = { r: number; g: number; b: number }

export type PaletteSourceKind = 'manual' | 'embedded' | 'rule' | 'theater-default' | 'fallback-grayscale'

export interface PaletteSelectionInfo {
  source: PaletteSourceKind
  reason: string
  resolvedPath: string | null
}

export interface PaletteParseResult {
  colors: Rgb[]
  sourceFormat: 'jasc' | 'binary'
}
