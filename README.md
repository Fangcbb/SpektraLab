Windows x64 安装包，目标系统为 Windows 10 22H2 和 Windows 11。

下载 `SpektraLab_1.3.1_x64-setup.exe` 安装，支持英文和简体中文。

- 包含桌面程序、Windows Vulkan 引擎、渲染资源和第三方许可证。
- 需要支持 Vulkan 的显卡与驱动。缺少 Microsoft Edge WebView2 Runtime 时，安装器会联网下载，因此不是完整离线安装包。
- 安装包未做数字签名，Windows 可能提示未知发布者或 SmartScreen。
- Linux 交叉编译成功；Windows 引擎和安装包提取出的引擎在 Wine/Mesa 下通过渲染与 PNG/JPEG/TIFF 导出烟雾测试；安装包完整性检查通过。
- 前端类型检查、lint、51 项单元测试、6 项浏览器测试及 5 项 Rust 测试通过。1 项相机 RAW 真实主机测试因缺少样本跳过。
- 尚未完成真实 Windows 10/11 上的安装、卸载和 WebView2 GUI 验收，因此作为预览版发布。Windows 端功能范围参见仓库 engine/PORT_COVERAGE.md 与 desktop/PARITY.md。

源码提交：99c2d5c9883be485085895157279cc7c4eaa8db6

SHA-256：`38fa9e9ebf4f481cd1aee577645e5062dfc88e638bdfca9f8f0e30d74bd84b19`
