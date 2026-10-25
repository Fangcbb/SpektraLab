// file_path.hpp -- the engine's paths are UTF-8 (the C ABI says so).
//
// On POSIX a std::string is already what the filesystem takes, so this is the
// identity and the Apple build is unchanged. On Windows a narrow std::string
// handed to std::ifstream is read in the ANSI code page, which cannot name an
// install folder under a non-ASCII user name; going through char8_t makes it
// a wide path, which libstdc++ (MinGW) and MSVC both open with _wfopen.
#pragma once
#include <string>
#ifdef _WIN32
#include <algorithm>
#include <filesystem>
#endif

namespace spk {

#ifdef _WIN32
inline std::filesystem::path file_path(const std::string& utf8) {
    // Tauri's resource directory may use the extended \\?\ prefix. Win32
    // does not translate forward slashes for such paths, including the ones
    // the portable engine appends when naming a resource. Preserve the prefix
    // (and long-path support), but use native separators at the I/O boundary.
    std::u8string native(utf8.begin(), utf8.end());
    std::replace(native.begin(), native.end(), u8'/', u8'\\');
    return std::filesystem::path(native);
}
#else
inline const std::string& file_path(const std::string& utf8) { return utf8; }
#endif

}  // namespace spk
