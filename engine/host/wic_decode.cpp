#include "wic_decode.hpp"
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <wincodec.h>
#include "wic_source_transform.hpp"
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <limits>
#include <string>
namespace spkhost {
namespace {
template<class T> struct Com {
    T* p=nullptr;
    ~Com(){if(p)p->Release();}
    T** put(){return &p;}
    T* operator->()const{return p;}
};
struct Apartment {
    HRESULT result=CoInitializeEx(nullptr,COINIT_MULTITHREADED);
    ~Apartment(){if(SUCCEEDED(result))CoUninitialize();}
};
}
bool native_jpeg(const std::vector<uint8_t>& bytes,uint32_t edge,uint32_t& width,uint32_t& height,std::vector<uint8_t>& rgb) {
    // WIC decodes JPEG using the Windows codec. For thumbnails request the
    // decoder's native DCT scale, avoiding a full-size float image just to shrink it.
    if(const char* disabled=std::getenv("SPEKTRALAB_DISABLE_WIC");disabled && std::string(disabled)=="1")return false;
    if(bytes.empty() || bytes.size()>std::numeric_limits<DWORD>::max())return false;
    thread_local Apartment apartment;
    if(FAILED(apartment.result) && apartment.result!=RPC_E_CHANGED_MODE)return false;
    Com<IWICImagingFactory> factory;
    if(FAILED(CoCreateInstance(CLSID_WICImagingFactory,nullptr,CLSCTX_INPROC_SERVER,IID_IWICImagingFactory,reinterpret_cast<void**>(factory.put()))))return false;
    Com<IWICStream> stream;
    if(FAILED(factory->CreateStream(stream.put())) || FAILED(stream->InitializeFromMemory(const_cast<BYTE*>(bytes.data()),DWORD(bytes.size()))))return false;
    Com<IWICBitmapDecoder> decoder;
    if(FAILED(factory->CreateDecoderFromStream(stream.p,nullptr,WICDecodeMetadataCacheOnDemand,decoder.put())))return false;
    Com<IWICBitmapFrameDecode> frame;
    UINT w=0,h=0;
    if(FAILED(decoder->GetFrame(0,frame.put())) || FAILED(frame->GetSize(&w,&h)) || !w || !h)return false;
    auto allocate=[&](UINT a,UINT b) {
        if(uint64_t(a)*b*3>std::numeric_limits<UINT>::max())return false;
        rgb.resize(size_t(a)*b*3);return true;
    };
    if(edge && std::max(w,h)>edge) {
        Com<IWICBitmapSourceTransform> transform;
        UINT sw=std::max(1u,UINT(std::ceil(double(w)*edge/std::max(w,h))));
        UINT sh=std::max(1u,UINT(std::ceil(double(h)*edge/std::max(w,h))));
        WICPixelFormatGUID format=GUID_WICPixelFormat24bppRGB;
        if(SUCCEEDED(frame->QueryInterface(IID_IWICBitmapSourceTransform,reinterpret_cast<void**>(transform.put()))) &&
           SUCCEEDED(transform->GetClosestSize(&sw,&sh)) && sw && sh &&
           SUCCEEDED(transform->GetClosestPixelFormat(&format)) && IsEqualGUID(format,GUID_WICPixelFormat24bppRGB) && allocate(sw,sh) &&
           SUCCEEDED(transform->CopyPixels(nullptr,sw,sh,&format,WICBitmapTransformRotate0,sw*3,UINT(rgb.size()),rgb.data()))) {
            width=sw;height=sh;return true;
        }
    }
    // No implicit colour conversion: the existing ICC/TRC pipeline still owns it.
    Com<IWICBitmapScaler> scaler;
    IWICBitmapSource* source=frame.p;
    if(edge && std::max(w,h)>edge) {
        const UINT sw=std::max(1u,UINT(std::lround(double(w)*edge/std::max(w,h))));
        const UINT sh=std::max(1u,UINT(std::lround(double(h)*edge/std::max(w,h))));
        if(SUCCEEDED(factory->CreateBitmapScaler(scaler.put())) && SUCCEEDED(scaler->Initialize(frame.p,sw,sh,WICBitmapInterpolationModeFant))) {
            source=scaler.p;w=sw;h=sh;
        }
    }
    Com<IWICFormatConverter> converter;
    if(FAILED(factory->CreateFormatConverter(converter.put())) ||
       FAILED(converter->Initialize(source,GUID_WICPixelFormat24bppRGB,WICBitmapDitherTypeNone,nullptr,0,WICBitmapPaletteTypeCustom)) ||
       !allocate(w,h) || FAILED(converter->CopyPixels(nullptr,w*3,UINT(rgb.size()),rgb.data())))return false;
    width=w;height=h;return true;
}
}
#endif
