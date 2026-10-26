#pragma once
#include <algorithm>
#include <cstdint>
#include <thread>
#include <vector>
namespace spk {
// Independent rows retain accumulation order; cap workers to avoid oversubscribing the UI.
template<class F> void parallel_rows(uint32_t rows,F&& fn) {
    const unsigned count=std::min({8u,std::max(1u,std::thread::hardware_concurrency()),std::max(1u,rows/16)});
    std::vector<std::thread> workers;
    for(unsigned k=1;k<count;++k)workers.emplace_back([&,k]{for(uint32_t row=k;row<rows;row+=count)fn(row);});
    for(uint32_t row=0;row<rows;row+=count)fn(row);
    for(auto& worker:workers)worker.join();
}
}
