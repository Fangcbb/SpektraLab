#pragma once
#include <cstdint>
#include <vector>
namespace spkhost {
#ifdef _WIN32
bool native_jpeg(const std::vector<uint8_t>& bytes, uint32_t edge, uint32_t& width,
                 uint32_t& height, std::vector<uint8_t>& rgb);
#else
inline bool native_jpeg(const std::vector<uint8_t>&, uint32_t, uint32_t&, uint32_t&, std::vector<uint8_t>&) {return false;}
#endif
}
