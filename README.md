# RA2Web Studio

**[简体中文](README.zh.md)**

An online **RA2-compatible** MIX file editor built for **RA2WEB**. Supports viewing, editing, and exporting game assets directly in the browser — no installation required.

---

## ✨ Features

### File Format Support (16+ formats)

| Format | Description | Viewer |
|--------|-------------|--------|
| **MIX / MMX / YRO** | RA2-compatible archive (encrypted & unencrypted) | Directory listing, nested navigation |
| **SHP** | 2D sprite file | Multi-frame preview with palette |
| **VXL** | 3D voxel model | 2D frame sampling + Three.js 3D view |
| **HVA** | Voxel animation | 3D axis-based section transform preview |
| **TMP / TEM / SNO / URB / …** | Map tile | Tile-grid preview with palette |
| **PCX** | Image | Palette-support preview |
| **PAL** | Palette | Color swatch grid |
| **WAV** | Audio | In-browser audio player |
| **BIK** | Video | Transcoded to WebM via FFmpeg.wasm |
| **CSF** | String table | Searchable key/value table, copy to clipboard |
| **MAP / MPR** | Map file | Minimap preview with starting locations |
| **INI / TXT** | Config / text | Monaco-based syntax editor |
| **DAT** | LMD / binary | Auto-format detection |
| **Any** | Fallback | Hex viewer |

### Palette System
- Auto-resolution: same-name lookup → XCC rule table → fallback
- Manual override per asset
- Supports embedded palettes (SHP/VXL)
- Smart palette cache for fast re-render

### Export
- **Raw file**: export any asset as-is
- **SHP → PNG / JPG / GIF**: frame selection, associated PAL/HVA resolution
- **MIX rebuild**: import files into a MIX archive and re-export

### Game Resource Management
- Import from **game directory** or **archive** (tar.gz / exe / 7z / zip)
- Persistent storage via **OPFS** (no re-import on page reload)
- Layered resource system: base → patch → mod overrides
- Supports **LMD** (Local Mix Database) and **GMD** (Global Mix Database / XCC)
- Nested MIX navigation (drill into sub-MIX files)

### Editing
- Add / replace files inside a MIX archive
- Rebuild and export the modified MIX

### i18n
- Interface in **English** (default) and **Simplified Chinese**
- Language follows browser locale; manual switch persisted in localStorage

---

## 🚀 Quick Start

### Requirements
- Node.js 18+
- Modern browser (ES2020+)

### Install & Run

```bash
npm install
npm run dev
# Open http://localhost:5173
```

### Production Build

```bash
npm run build
npm run preview
```

---

## 📁 Project Structure

```
ra2web-studio/
├── src/
│   ├── components/
│   │   ├── MixEditor.tsx          # Main editor shell
│   │   ├── Toolbar.tsx            # Import / export actions
│   │   ├── FileTree.tsx           # File tree with search
│   │   ├── PreviewPanel.tsx       # Format-dispatch preview panel
│   │   ├── PropertiesPanel.tsx    # File metadata panel
│   │   ├── ImportProgressPanel.tsx
│   │   ├── common/                # Dialogs, SearchableSelect
│   │   ├── export/                # ExportDialog
│   │   └── preview/               # 16 format-specific viewers
│   ├── data/                      # Binary parsers (MIX, SHP, VXL, TMP, CSF, HVA, WAV, PCX …)
│   │   └── encoding/              # Blowfish, Format3/5/80, LZO1x
│   ├── services/
│   │   ├── gameRes/               # Import, bootstrap, OPFS storage, ResourceContext
│   │   ├── palette/               # PaletteResolver, PaletteLoader, IndexedColorRenderer
│   │   ├── export/                # ExportController, ShpExportRenderer, AssociationResolver
│   │   ├── video/                 # BikTranscoder (FFmpeg.wasm), BikCacheStore
│   │   └── mixEdit/               # MixArchiveBuilder
│   ├── i18n/                      # LocaleContext, en.ts, zh.ts
│   └── util/
├── public/                        # XIF palette index files, global-mix-database.dat
└── package.json
```

---

## 🛠 Tech Stack

| Layer | Library |
|-------|---------|
| UI Framework | React 18 + TypeScript 5.3 |
| Styling | Tailwind CSS 3 |
| Build | Vite 5 |
| Code Editor | Monaco Editor 0.53 |
| 3D Rendering | Three.js 0.177 |
| Video Transcoding | FFmpeg.wasm 0.12 |
| Archive Extraction | 7z-wasm 1.2 |
| GIF Encoding | gifenc 1.0 |
| Icons | Lucide React |

---

## 📄 License

MIT License.

---

> **Note**: This project is for learning and research purposes. Red Alert 2 is intellectual property of EA. Ensure you own a legal copy of the game before importing assets.
