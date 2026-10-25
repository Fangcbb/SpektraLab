[下载 Windows x64 安装包 SpektraLab 1.3.2](https://raw.githubusercontent.com/Fangcbb/SpektraLab/windows-downloads/SpektraLab_1.3.2_x64-setup.exe)

针对大照片全尺寸渲染时的 Vulkan 设备丢失和后续照片无法打开，改进任务调度与恢复。

- 默认只运行交互预览，避免编辑停下后自动触发整张大图的全尺寸计算。在“设置 → 渲染”可点击“立即渲染原尺寸”，或开启“自动渲染原尺寸”（空闲 1.5 秒）。导出仍使用完整分辨率。
- 将大型 Vulkan 计算拆成有界提交：普通内核每批最多 1,048,576 个调用，递归模糊每批最多 512 个完整行/通道调用。保留全局像素索引、颗粒 RNG 流及每行递推状态；计算精度与材料参数未更改。
- 遇到设备丢失（VkResult -4），返回错误后退出失效主机，由桌面现有的有限次数重启机制重建进程与设备。重启后重新打开当前照片，关闭自动全尺寸渲染，避免循环触发同一任务；失败的导出需重新发起。
- 耗时超过 250 ms 的计算记录内核名、调用规模、提交次数与耗时；失败额外记录批次偏移和缓冲池分配量，便于定位实际显卡问题。
- 保留之前的 Windows 扩展安装路径与中文资源路径修复。

验证：引擎 CTest 15/15（含跨提交边界的数值与颗粒测试）；前端类型检查及 lint；前端测试 55 项通过、1 项真实相机样本测试因缺少样本跳过；Playwright 6/6；Rust 5/5；Windows 引擎在 Wine/Mesa 下完成启动、渲染和 PNG/JPEG/TIFF 导出。安装包完整性及其中提取的引擎/着色器已验证，并在 Windows 扩展安装路径下通过同一烟雾测试。

这是 Windows 10 22H2 / Windows 11 x64 预览版。当前构建机没有 RTX 3060 Ti，尚未完成真实 Windows/NVIDIA/AMD/Intel GPU 的稳定性、驱动重置恢复和性能验证；有界任务并不等于固定 GPU 耗时，也不保证消除所有驱动重置。全尺寸渲染仍有相应显存需求。安装包未签名；需要 Vulkan 驱动，缺少 WebView2 时安装器会联网获取。

请完全退出旧程序后覆盖安装，并确认日志显示 1.3.2。先打开原照片进行预览编辑，再按需尝试原尺寸或导出；如果仍有错误，请提供新的完整日志，其中现在包含失败内核信息。

[SHA-256 校验值](https://github.com/Fangcbb/SpektraLab/blob/windows-downloads/SHA256SUMS.txt) · [源码](https://github.com/Fangcbb/SpektraLab/tree/perf/windows-large-photo-rendering)

SHA-256：`247cad699042da6a346272f199f910e4e94b56fc35a5e2776e204ea74121caf4`
