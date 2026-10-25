#include "blob.hpp"
#include "file_path.hpp"

#include <fstream>
#include <iostream>
#include <stdexcept>

#ifdef _WIN32
int wmain(int argc, wchar_t** argv) {
#else
int main(int argc, char** argv) {
#endif
    try {
#ifdef _WIN32
        const auto extended = spk::file_path(R"(\\?\C:\Program Files\SpektraLab\host\engine/spektrafilm_constants.bin)");
        if (extended.native() != LR"(\\?\C:\Program Files\SpektraLab\host\engine\spektrafilm_constants.bin)")
            throw std::runtime_error("extended Windows path contains a forward slash");
        const auto unc = spk::file_path(R"(\\?\UNC\server\share/engine/profiles/test.json)");
        if (unc.native() != LR"(\\?\UNC\server\share\engine\profiles\test.json)")
            throw std::runtime_error("extended UNC path contains a forward slash");
#endif
        if (argc != 2) throw std::runtime_error("usage: file_path_test <engine-resources>");
#ifdef _WIN32
        auto native = std::filesystem::path(argv[1]).native();
        if (native.rfind(LR"(\\?\)", 0) != 0) {
            native = std::filesystem::absolute(std::filesystem::path(native)).native();
            native = native.rfind(LR"(\\)", 0) == 0
                ? LR"(\\?\UNC\)" + native.substr(2)
                : LR"(\\?\)" + native;
        }
        const auto utf8 = std::filesystem::path(native).u8string();
        const std::string root(utf8.begin(), utf8.end());
#else
        const std::string root = argv[1];
#endif
        spk::Blob blob;
        std::string error;
        if (!blob.open(root + "/spektrafilm_constants.bin", error))
            throw std::runtime_error(error);
        std::ifstream filters(spk::file_path(root + "/neutral_print_filters.json"));
        if (!filters) throw std::runtime_error("cannot read resource JSON");
        std::cout << "resource path checks passed\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
