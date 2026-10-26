// End-to-end gates for the effects ported from Metal to Vulkan.
#include "spektrafilm/spk_engine.h"
#include <algorithm>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>
namespace {
void require(bool ok,const std::string& message) {if(!ok)throw std::runtime_error(message);}
std::vector<uint16_t> render(spk_engine* e,spk_session* s,uint32_t& w,uint32_t& h) {
    spk_result r{};const auto status=spk_render(s,"full",&r);
    require(status==SPK_OK && r.rgba16 && r.texture,std::string("render: ")+spk_last_error(e));
    w=r.width;h=r.height;std::vector<uint16_t> pixels(size_t(w)*h*4);
    for(uint32_t y=0;y<h;++y)std::copy_n(r.rgba16+size_t(y)*r.row_stride_px*4,size_t(w)*4,pixels.data()+size_t(y)*w*4);
    spk_result_free(&r);return pixels;
}
}
int main(int argc,char**argv) {
    if(argc!=2)return 2;
    try {
        std::unique_ptr<spk_engine,decltype(&spk_engine_destroy)> e(spk_engine_create(argv[1],nullptr),spk_engine_destroy);
        require(bool(e),spk_last_error(nullptr));
        const std::string base=R"("grain_active":false,"glare_active":false,"halation_active":false,"auto_exposure":false)";
        std::vector<float> pixels(96*64*3);
        for(size_t i=0;i<pixels.size();++i)pixels[i]=0.005f+float(i%191)*0.001f;
        spk_image input{pixels.data(),96,64,3};
        auto open=[&](const std::string& extra) {
            auto* s=spk_open(e.get(),&input,("{"+base+extra+"}").c_str(),nullptr);
            require(s!=nullptr,std::string("open ")+extra+": "+spk_last_error(e.get()));return s;
        };
        auto* normal=open("");uint32_t w,h;const auto reference=render(e.get(),normal,w,h);spk_session_release(normal);
        const std::vector<std::string> deltas={
            R"(,"scene_latitude_active":true,"scene_latitude_highlight_knee":-1,"scene_latitude_highlight_room":1)",
            R"(,"contrast_mask_active":true,"contrast_mask_highlights":1,"contrast_mask_shadows":1)",
            R"(,"overscan_active":true,"overscan_format":"135")",
            R"(,"date_imprint_active":true,"date_imprint_text":"26 10 25","date_imprint_size":2,"date_imprint_ev":6)",
            R"(,"digital_intermediate":true)"};
        for(const auto& delta:deltas) {
            auto* s=open(delta);const auto image=render(e.get(),s,w,h);
            require(image!=reference,"ported effect did not change pixels: "+delta);
            require(w>0 && h>0,"empty output");
            if(delta.find("overscan_active")!=std::string::npos) {
                require(w>96 || h>64,"film edge did not expand the frame");
                char* geometry=nullptr;require(spk_overscan_geometry(s,&geometry)==SPK_OK && geometry,"missing film geometry");
                require(std::string(geometry).find("true")!=std::string::npos,"invalid film geometry");spk_string_free(geometry);
            }
            if(delta.find("contrast_mask_active")!=std::string::npos) {
                const float* field=nullptr;uint32_t fw=0,fh=0;
                require(spk_contrast_mask_field(s,"full",&field,&fw,&fh)==SPK_OK && field && fw && fh,"empty active mask field");
            }
            spk_session_release(s);
        }
        // Crop belongs before the film gate. An upstream crop must produce
        // the same physical image as handing the engine the cropped pixels.
        std::vector<float> square(64*64*3);
        for(size_t y=0;y<64;++y)std::copy_n(pixels.data()+(y*96+16)*3,64*3,square.data()+y*64*3);
        const std::string film=",\"overscan_active\":true,\"overscan_format\":\"120_6x6\",\"dir_couplers_active\":false";
        auto* cut=open(film+",\"geometry_crop_x\":0.16666666666666666,\"geometry_crop_w\":0.6666666666666666");
        uint32_t cw,ch;const auto cut_image=render(e.get(),cut,cw,ch);spk_session_release(cut);
        spk_image square_input{square.data(),64,64,3};
        auto* explicit_cut=spk_open(e.get(),&square_input,("{"+base+film+"}").c_str(),nullptr);
        require(explicit_cut!=nullptr,"explicit cropped input failed");
        const auto square_image=render(e.get(),explicit_cut,w,h);spk_session_release(explicit_cut);
        require(w==cw && h==ch && square_image.size()==cut_image.size(),"crop changed film layout dimensions");
        for(size_t i=0;i<square_image.size();++i)require(std::abs(int(square_image[i])-int(cut_image[i]))<=2,"film gate crop differs from explicitly cropped source");
        auto* s=open("");spk_result di{};char* metadata=nullptr;
        require(spk_render_digital_intermediate(s,&di,&metadata)==SPK_OK && di.rgba16 && metadata,
                std::string("Cineon DI API: ")+spk_last_error(e.get()));
        require(di.width==96 && di.height==64,"DI dimensions");spk_result_free(&di);spk_string_free(metadata);spk_session_release(s);
        // Invalid requests must still be rejected after removing the old feature refusals.
        s=open("");require(spk_set_params(s,R"({"geometry_crop_w":0})",nullptr)==SPK_ERR_USER,"invalid crop range accepted");
        render(e.get(),s,w,h);spk_session_release(s);
        std::cout<<"five ported effects, active mask, expanded film geometry, Cineon API and invalid range gates passed\n";
        return 0;
    } catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}
}
