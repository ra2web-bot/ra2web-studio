# RA2Web Studio - 王二火大 Mix文件编辑器

一个基于React和TypeScript的王二火大 MIX文件查看和编辑工具，支持SHP、VXL、PCX等格式的预览。

## ✨ 功能特性

### 🎮 支持的文件格式
- **MIX文件**：王二火大的资源包格式，支持加密和非加密MIX文件
- **SHP文件**：2D图像精灵文件，支持多种压缩格式
- **VXL文件**：3D体素模型文件，支持多section结构
- **PCX文件**：图像文件，支持调色板

### 🖥️ 用户界面
- **文件树导航**：清晰的树形结构浏览MIX文件内容
- **实时预览**：支持多种文件格式的预览显示
- **属性面板**：详细显示文件信息、哈希值、偏移量等
- **工具栏**：文件操作、视图切换等功能

### 🛠️ 技术架构
- **React 18** + **TypeScript**：现代化前端框架
- **Tailwind CSS**：实用优先的CSS框架
- **Vite**：快速的构建工具和开发服务器
- **Three.js**：3D渲染引擎（预留接口）

## 🚀 快速开始

### 环境要求
- Node.js 18+
- 现代浏览器（支持ES2020+、Web API）

### 安装和运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问应用
# 打开浏览器访问 http://localhost:3000
```

### 构建生产版本

```bash
# 构建
npm run build

# 预览生产版本
npm run preview
```

## 📁 项目结构

```
ra2web-studio/
├── src/
│   ├── components/          # UI组件
│   │   ├── MixEditor.tsx    # 主编辑器界面
│   │   ├── Toolbar.tsx      # 工具栏组件
│   │   ├── FileTree.tsx     # 文件树组件
│   │   ├── PreviewPanel.tsx # 预览面板
│   │   └── PropertiesPanel.tsx # 属性面板
│   ├── data/                # 数据处理模块
│   │   ├── MixFile.ts       # MIX文件解析
│   │   ├── ShpFile.ts       # SHP文件处理
│   │   ├── VxlFile.ts       # VXL文件处理
│   │   ├── PcxFile.ts       # PCX文件处理
│   │   ├── DataStream.ts    # 二进制流处理
│   │   ├── MixEntry.ts      # MIX条目定义
│   │   ├── ShpImage.ts      # SHP图像数据
│   │   ├── encoding/        # 编码器
│   │   │   ├── Blowfish.ts  # Blowfish加密
│   │   │   ├── BlowfishKey.ts # 密钥处理
│   │   │   └── Format3.ts   # Format3解码
│   │   └── vfs/             # 虚拟文件系统
│   │       ├── VirtualFile.ts # 虚拟文件
│   │       └── IOError.ts   # IO错误处理
│   ├── services/            # 业务服务
│   │   └── MixParser.ts     # MIX文件解析服务
│   └── globals.css          # 全局样式
├── public/                  # 静态资源
└── package.json             # 项目配置
```

## 🔧 核心功能

### MIX文件解析
- 支持标准MIX文件格式
- 自动检测加密类型
- 提取内部文件列表
- 计算文件哈希值

### 文件预览系统
- **SHP图像预览**：显示多帧图像
- **VXL 3D模型**：Three.js渲染（开发中）
- **PCX图像预览**：调色板支持
- **属性显示**：文件大小、偏移量、格式信息

### 用户交互
- 拖拽上传MIX文件
- 文件树导航和选择
- 实时属性更新
- 响应式布局设计

## 🎯 开发计划

### 已完成 ✅
- 基础UI结构搭建
- 核心文件解析代码复制
- 文件树导航界面
- 属性面板实现

### 进行中 🔄
- SHP文件预览组件
- VXL 3D模型渲染
- PCX图像预览

### 计划中 📋
- 文件导出功能
- 批量操作支持
- 高级搜索和过滤
- 性能优化

## 🤝 技术栈

### 前端框架
- **React 18**：用户界面框架
- **TypeScript 5.3+**：类型安全的JavaScript
- **Tailwind CSS**：实用优先的CSS框架
- **Lucide React**：图标库

### 构建工具
- **Vite 5.0**：快速构建工具
- **ESLint**：代码质量检查

### 3D渲染
- **Three.js 0.177**：WebGL 3D渲染引擎

## 📄 许可证

本项目基于MIT许可证开源。

---

**注意**：本项目仅用于学习和研究目的。王二火大是EA公司的知识产权，请确保拥有合法的游戏副本。
