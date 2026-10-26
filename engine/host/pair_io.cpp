#include "pair_io.hpp"
#include "platform.hpp"
#include <algorithm>
#include <cmath>
#include <thread>
#include "core/parallel_rows.hpp"
namespace spkhost {
using spk::Json;
namespace {
struct Layout {uint32_t w,h,slot_w,slot_h,stride;bool turned;};
Layout layout(uint32_t across,const Json& pair) {
    const double gap=pair.at("onStrip").as_bool()?1.0:std::clamp(pair.at("spacingMM").as_double(1),0.5,2.0);
    const auto along=uint32_t(std::lround(across*18.0/24));
    const auto stride=uint32_t(std::lround(across*(18+gap)/24));
    const auto piece=uint32_t(std::lround(across*(36+gap)/24));
    const bool turned=pair.at("turned").as_bool();
    return turned?Layout{across,piece,across,along,stride,true}:Layout{piece,across,along,across,stride,false};
}
std::filesystem::path source_path(const std::filesystem::path& file,const Json& hole) {
    auto path=utf8_path(hole.at("path").as_string());
    return path.is_absolute() || hole.at("path").as_string().rfind("\\\\?\\",0)==0 ? path:file.parent_path()/path;
}
// Fit a source under a portrait 18x24 gate, then apply the hole's pan/scale/turn.
void place(const FloatImage& src,const Json& hole,FloatImage& out,uint32_t x0,uint32_t y0,uint32_t slot_w,uint32_t slot_h) {
    const Json& g=hole.at("geometry"),c=g.at("crop"),p=hole.at("placement");
    const double cx=c.at("x").as_double(),cy=c.at("y").as_double();
    const double cw=std::clamp(c.at("width").as_double(1),1e-4,1.0),ch=std::clamp(c.at("height").as_double(1),1e-4,1.0);
    const int turns=(int(g.at("quarterTurns").as_double())+int(p.at("quarterTurns").as_double())+8)%4;
    const bool swap=turns%2;
    const double sw=(swap?ch*src.height:cw*src.width),sh=(swap?cw*src.width:ch*src.height);
    const double scale=std::max(double(slot_w)/sw,double(slot_h)/sh)*std::clamp(p.at("scale").as_double(1),1.0,4.0);
    const double angle=g.at("angle").as_double()*3.141592653589793/180,co=std::cos(angle),si=std::sin(angle);
    const double ev=hole.at("exposureEV").as_double()+ (hole.at("autoExposure").as_bool(true)?hole.at("meteredEV").as_double():0);
    const float gain=float(std::exp2(std::clamp(ev,-24.0,24.0)));
    spk::parallel_rows(slot_h,[&](uint32_t y) {for(uint32_t x=0;x<slot_w && x+x0<out.width;++x) {
        double a=(double(x)+.5-slot_w*.5)/scale+std::clamp(p.at("x").as_double(),-1.0,1.0)*(sw-slot_w/scale)*.5;
        double b=(double(y)+.5-slot_h*.5)/scale+std::clamp(p.at("y").as_double(),-1.0,1.0)*(sh-slot_h/scale)*.5;
        for(int turn=0;turn<(int(p.at("quarterTurns").as_double())+4)%4;++turn){const double t=a;a=b;b=-t;}
        if(g.at("flipH").as_bool())a=-a;if(g.at("flipV").as_bool())b=-b;
        for(int turn=0;turn<(int(g.at("quarterTurns").as_double())+4)%4;++turn){const double t=a;a=b;b=-t;}
        const double rx=co*a-si*b+(cx+cw/2)*src.width-.5,ry=si*a+co*b+(cy+ch/2)*src.height-.5;
        if(rx<-.5 || ry<-.5 || rx>src.width-.5 || ry>src.height-.5)continue;
        const double fx=std::clamp(rx,0.0,double(src.width-1)),fy=std::clamp(ry,0.0,double(src.height-1));
        const uint32_t x1=uint32_t(fx),y1=uint32_t(fy),x2=std::min(x1+1,src.width-1),y2=std::min(y1+1,src.height-1);
        const float ax=float(fx-x1),ay=float(fy-y1);
        for(unsigned k=0;k<3;++k) {
            const float top=src.rgb[(size_t(y1)*src.width+x1)*3+k]*(1-ax)+src.rgb[(size_t(y1)*src.width+x2)*3+k]*ax;
            const float bot=src.rgb[(size_t(y2)*src.width+x1)*3+k]*(1-ax)+src.rgb[(size_t(y2)*src.width+x2)*3+k]*ax;
            out.rgb[(size_t(y+y0)*out.width+x+x0)*3+k]=gain*(top*(1-ay)+bot*ay);
        }
    }});
}
bool pair_sources(const std::filesystem::path& file,const Json& pair,uint32_t& height,Probe* out,std::string& error) {
    height=0;double longest=0;
    for(const char* side:{"left","right"}) {
        const auto& hole=pair.at(side);if(!hole.is_object())continue;
        const auto path=source_path(file,hole);
        if(is_pair_path(path)){error="a half-frame pair cannot contain another pair";return false;}
        Probe p;if(!probe_file(path,p,error))return false;
        const auto& g=hole.at("geometry"),c=g.at("crop");
        double w=p.width*std::clamp(c.at("width").as_double(1),1e-4,1.0),h=p.height*std::clamp(c.at("height").as_double(1),1e-4,1.0);
        if((int(g.at("quarterTurns").as_double())+int(hole.at("placement").at("quarterTurns").as_double()))%2)std::swap(w,h);
        longest=std::max({longest,w,h});
        const auto candidate=uint32_t(std::max(1.0,pair.at("turned").as_bool()?std::min(w,h*24/18):std::min(h,w*24/18)));
        height=height?std::min(height,candidate):candidate;
        if(out && side==std::string("left"))out->metadata=p.metadata;
    }
    if(!height){error="half-frame pair has no source photos";return false;}
    height=std::min(height,uint32_t(std::max(1.0,std::floor(longest*24/37))));
    return true;
}
}
bool is_pair_path(const std::filesystem::path& path) {auto e=path_utf8(path.extension());std::transform(e.begin(),e.end(),e.begin(),[](unsigned char c){return char(std::tolower(c));});return e==".spektrapair";}
bool read_pair(const std::filesystem::path& path,Json& pair,std::string& error) {
    std::error_code ec;const auto n=std::filesystem::file_size(path,ec);
    if(ec || n>1024*1024){error="half-frame pair file is missing or too large";return false;}
    std::vector<uint8_t> bytes;if(!read_file(path,bytes,error))return false;
    if(!Json::parse(std::string(bytes.begin(),bytes.end()),pair,error) || !pair.is_object())return false;
    if(pair.at("schemaVersion").as_double(1)!=1){error="unsupported half-frame pair schema";return false;}
    return true;
}
bool probe_pair(const std::filesystem::path& path,Probe& out,std::string& error) {
    Json pair;if(!read_pair(path,pair,error))return false;uint32_t h=0;
    if(!pair_sources(path,pair,h,&out,error))return false;const auto l=layout(h,pair);
    out.kind=FileKind::Pair;out.width=l.w;out.height=l.h;out.metadata.orientation=1;return true;
}
bool decode_pair(const std::filesystem::path& path,FloatImage& out,Probe& probe,std::string& error) {
    Json pair;if(!read_pair(path,pair,error))return false;uint32_t h=0;
    if(!pair_sources(path,pair,h,&probe,error))return false;const auto l=layout(h,pair);
    if(uint64_t(l.w)*l.h>100000000){error="half-frame pair exceeds 100 MP; use smaller source copies";return false;}
    out.width=l.w;out.height=l.h;out.rgb.assign(size_t(l.w)*l.h*3,0);
    for(const char* side:{"left","right"}) {
        const auto& hole=pair.at(side);if(!hole.is_object())continue;
        DecodeOptions options;const auto& d=hole.at("decode");
        if(d.at("lensCorrection").as_bool()){error=std::string(kUnsupportedPrefix)+"lens correction requires calibrated lens profiles";return false;}
        if(!d.at("whiteBalance").as_string().empty() && d.at("whiteBalance").as_string()!="As Shot") {
            options.temperature_k=d.at("temperature").as_double(5500);options.tint=d.at("tint").as_double();
        }
        FloatImage src;Probe p;if(!decode_linear_prophoto(source_path(path,hole),options,src,p,error))return false;
        const bool second=side==std::string("right");
        place(src,hole,out,second&&!l.turned?l.stride:0,second&&l.turned?l.stride:0,l.slot_w,l.slot_h);
    }
    probe.kind=FileKind::Pair;probe.width=out.width;probe.height=out.height;probe.metadata.orientation=1;return true;
}
bool thumbnail_pair(const std::filesystem::path& path,uint32_t edge,Rgba8& out,std::string& error) {
    Json pair;if(!read_pair(path,pair,error))return false;
    const auto l=layout(std::max(16u,uint32_t(edge*24/37)),pair);
    FloatImage canvas{l.w,l.h,std::vector<float>(size_t(l.w)*l.h*3,0)};
    for(const char* side:{"left","right"}) {
        const auto& hole=pair.at(side);if(!hole.is_object())continue;
        const auto source=source_path(path,hole);if(is_pair_path(source)){error="nested pair";return false;}
        Rgba8 image;std::string origin;if(!thumbnail(source,std::min(2048u,edge*4),image,origin,error))return false;
        FloatImage src{image.width,image.height,std::vector<float>(size_t(image.width)*image.height*3)};
        for(size_t i=0;i<src.rgb.size()/3;++i)for(size_t k=0;k<3;++k)src.rgb[i*3+k]=image.rgba[i*4+k];
        const bool second=side==std::string("right");
        place(src,hole,canvas,second&&!l.turned?l.stride:0,second&&l.turned?l.stride:0,l.slot_w,l.slot_h);
    }
    out.width=canvas.width;out.height=canvas.height;out.rgba.resize(size_t(out.width)*out.height*4);
    for(size_t i=0;i<canvas.rgb.size()/3;++i){for(size_t k=0;k<3;++k)out.rgba[i*4+k]=uint8_t(std::clamp(canvas.rgb[i*3+k],0.0f,255.0f));out.rgba[i*4+3]=255;}
    return true;
}
}
