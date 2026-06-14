## 任务目标
构建一个本地跨平台的桌面应用 (Universal2MD)，支持将多类专有文档（如 DOCX、EPUB、HTML 等）批量且离线地转换为高保真 Markdown 文件，并确保输出内容包含图文剥离并尽可能支持全部的高级 Markdown 语法扩展。

## 已确认的事实
- **项目架构**：采用 Tauri 2 + Rust 后端 + React/TypeScript/Vite 前端架构。
- **核心引擎**：Rust 后端目前基于 `std::process::Command` 封装了全局 `pandoc` 调用，利用 `--extract-media` 完美实现了图像剥离。
- **高级语法支持**：为满足极端复杂的 Markdown 排版诉求，已将 Pandoc 输出格式参数精准调整为 `markdown+mark+emoji+abbreviations`，默认支持高亮、注脚、上下标、表格和定义列表等高级格式。
- **前端重构**：左侧任务队列已同时支持文件选择对话框（在 `capabilities/default.json` 注入了 `dialog:default`）与基于 Tauri 核心架构的原生拖拽 (`getCurrentWebview().onDragDropEvent`)，且已妥善处理二次渲染造成的重复挂载防抖与文件路径去重。右侧预览区摒弃了富文本库，直接基于 `<pre><code>` 以源码形式输出带代码换行的文本。
- **依赖冲突修复**：已攻克 `tauri-utils` / `cookie` 依赖中极其隐蔽的 `time 0.3.37+` Blanket Impl 冲突错误，方式是通过锁定 `serde_with 3.0.0` 并将全局 `time` 版本强制降级为 `0.3.36`。目前项目全量编译通过。

## 未验证/待确认
- **PDF 格式兼容与 OCR**：Pandoc 原生不擅长解析强版式的 PDF。P1 需求中的 PDF 提取逻辑（是否通过整合 `mupdf`、`pdf2htmlEX` 或直接调取 OCR 模型做图片反扫）尚未敲定具体技术栈和落地方案。
- **多线程高并发**：目前的批量处理方式为前端通过 `for` 循环同步 `await` 请求，面对极大批量的重型文件时可能存在页面响应迟滞风险，暂未验证是否必须在 Rust 端重写为 `tokio` 协程分发机制。

## 当前进度
- P0 基础核心需求 100% 完成：前端界面、解析调用、进度状态机、核心 IPC 链路已打通，可平稳支持基础测试和日常使用。
- PRD 与最新高级排版需求已对齐更新。

## 阻塞点
- 目前已无系统环境及代码层面的 Blocking 阻塞点。
- 潜在难点在于对 PDF 的进阶支持及更小众专有格式（如 HWP、WPS）底层解析链路的预研。

## 下一步行动
- **Step 1**: 开发 P0 收尾工作——在右侧面板的“操作按钮组”中，补充实现“在系统文件管理器中打开输出文件夹”的功能（需引入 Tauri 2 的 `plugin-shell` API）。
- **Step 2**: 进入 P1 阶段预研，找几个极端复杂的测试文档（如带有巨量表格的 DOCX、带有数学公式的 EPUB），跑测试看高级 Markdown 的解析结果是否符合预期，若有遗漏则对 Pandoc 参数进行最后微调。
- **Step 3**: 确定 PDF 接入方案并执行。

## 环境与约束
- **项目路径**: `/Users/meizu/Documents/00|我的文档/30_Projects (项目执行区)/to-md/universal-to-md`
- **启动与构建命令**: `npm run tauri dev`
- **系统前置依赖**: 本地系统必须安装 `pandoc`，应用强依赖此二进制程序的存在。
- **开发约束限制**: 
  1. 必须遵守“离线化运行”，不能为图文分离上传至任何云端。
  2. 严禁随意增删 Rust Crate 引发依赖链级联错误，特别是切勿升级 `time` 等基础时间库，除非官方上游 Tauri 发布明确修复。
  3. 不要再用 `react-markdown` 包装右侧预览，用户明确要求看到 MD 源码级语法。
