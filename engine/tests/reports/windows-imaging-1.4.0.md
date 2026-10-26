# Windows imaging 1.4.0 preview acceptance — 2026-10-26

Target: Windows 10/11 x64, Tauri/NSIS. Build: Linux → MinGW and Rust
x86_64-pc-windows-gnu. Execution: Mesa lavapipe and the Windows host in
Wine/Xvfb. No physical Windows/NVIDIA machine was available.

| Gate | Result |
|---|---|
| Native CTest integration | 16/16 passed |
| New GPU imaging float64 gate | 34 cases; SLM norms/rolloffs/pair bank, Cineon matrix/offset/encode, mask reduction/epilogue; million-pixel boundaries and guards |
| Numeric bounds | SLM scaled 8e-6, Cineon/mask epilogue 2e-6, large float reduction 3e-4; observed overall max scaled error 1.1133e-4 in reduction |
| Numeric negative control | Adding 0.01 stop to shader gain fails the gate |
| Overscan physical layout/date/data | 137 passed, 0 failures |
| B&W stock/filter/layout checks | 36 passed, 0 failures |
| Native crop before film | Upstream crop matches explicitly cropped source within 2 RGBA16 codes |
| Frontend typecheck/lint/unit | Passed; 67 tests passed, real-host test separately enabled |
| Real-host export | Passed on synthetic PNG: crop + turn + grade → write_image TIFF |
| Browser workflow | 8/8 Playwright tests passed; uses mock pixels, not GPU parity evidence |
| Pair undo negative control | Removing the pair snapshot fails the regression test |
| Windows host integration | Packaged host smoke passed, including all five effects and exports |
| Pair workflow | Windows binary passed create/reopen/Unicode paths, independent EV/print, parameter restoration, dates/film, vertical layout, metering, JPEG, safe writes |
| Bundle integrity | All staged engine resources and host binary match extracted installer; 42 SPIR-V files, both fonts, constants, product profiles and licenses present |
| Installed resource path | Host/pair smokes also passed with exact extended Windows `\\?\Z:\...\host\engine` resource paths |

JPEG thumbnail measurement (Wine, not physical Windows): 7580×5053 JPEG,
2048-pixel output, one cold sample followed by three warm samples. WIC native
codec path: warm median **2517 ms**. The same Windows binary with
`SPEKTRALAB_DISABLE_WIC=1`: **2973 ms**. Logs verified WIC enabled/disabled in
the respective runs. File caches, Wine codec behavior and concurrent CPU
load limit interpretation. No GPU performance inference is made.

The Windows port now renders film edge, date/data imprint, scene mapping,
contrast mask and Cineon. Half-frame pairs keep their own source geometry,
WB, meter/exposure, enlarger trims and Post-Dev grade; full export processes
edits in a background worker. Product B&W resources and the Mac app's
filter-2 / grain constants are carried without modifying material profiles.

Remaining differences: automatic calibrated lens correction and RAW neutral
picker; several Mac canvas gestures; display ICC/HDR monitor acceptance;
whole-image Metal parity and physical Win10/11 GPU acceptance. Portable film
text uses licensed Liberation Sans in place of CoreText Helvetica. CLI/MCP
and updater are outside this requested imaging scope. Installer is unsigned.
