#pragma once
#include "image_io.hpp"
#include "core/json.hpp"
namespace spkhost {
bool is_pair_path(const std::filesystem::path& path);
bool read_pair(const std::filesystem::path& path,spk::Json& pair,std::string& error);
bool probe_pair(const std::filesystem::path& path,Probe& out,std::string& error);
bool decode_pair(const std::filesystem::path& path,FloatImage& out,Probe& probe,std::string& error);
bool thumbnail_pair(const std::filesystem::path& path,uint32_t edge,Rgba8& out,std::string& error);
}
