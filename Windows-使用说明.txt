[下载安装包：Windows 路径修复版（x64，约 10 MB）](https://raw.githubusercontent.com/Fangcbb/SpektraLab/windows-downloads/SpektraLab_1.3.1_x64-pathfix-setup.exe)

修复安装到 `C:\Program Files\SpektraLab` 后出现 `cannot open \\?\C:\Program Files\SpektraLab\host\engine/spektrafilm_constants.bin`、渲染引擎无法启动的问题。

Tauri 返回的资源目录可能带有 Windows 扩展路径前缀 `\\?\`。引擎此前使用 `/` 拼接文件名，而 Win32 对这种路径不转换斜杠。现在统一在文件读取边界转换为 Windows 分隔符，覆盖常量、配置 JSON、配置文件和 Vulkan 着色器，并保留长路径前缀。

请完全退出旧版后运行新版安装包，覆盖安装。显示的产品版本仍为 1.3.1，以文件名中的 `pathfix` 识别本修复版。

验证：旧引擎在扩展路径下复现原错误；新引擎及安装包中提取的引擎，在 Wine 下使用 `\\?\C:\Program Files\SpektraLab\host\engine` 完成启动、实际渲染和 PNG/JPEG/TIFF 导出；中文目录资源读取通过；Windows CMake 路径回归测试通过；Linux 引擎 CTest 15/15；安装包完整性检查通过。

目标系统为 Windows 10 22H2 / Windows 11 x64，需要 Vulkan 显卡驱动。安装包未签名，缺少 WebView2 时会联网获取。尚未完成真实 Windows 10/11 上的完整 GUI 验收。

SHA-256：`891fb99e927480d4fb9ce5b010822d962ef3d75d3c0f72e7fef0ae9438d4f4ec`

[源码修复分支](https://github.com/Fangcbb/SpektraLab/tree/fix/windows-resource-paths)
