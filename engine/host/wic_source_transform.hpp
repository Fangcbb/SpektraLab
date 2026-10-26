#pragma once
// MinGW-w64 12 omits this standard WIC interface. ABI declarations from
// Microsoft's Windows SDK: microsoft/win32metadata/.../um/wincodec.h.
#ifndef __IWICBitmapSourceTransform_INTERFACE_DEFINED__
#define __IWICBitmapSourceTransform_INTERFACE_DEFINED__
struct IWICBitmapSourceTransform : IUnknown {
    virtual HRESULT STDMETHODCALLTYPE CopyPixels(const WICRect*,UINT,UINT,WICPixelFormatGUID*,WICBitmapTransformOptions,UINT,UINT,BYTE*)=0;
    virtual HRESULT STDMETHODCALLTYPE GetClosestSize(UINT*,UINT*)=0;
    virtual HRESULT STDMETHODCALLTYPE GetClosestPixelFormat(WICPixelFormatGUID*)=0;
    virtual HRESULT STDMETHODCALLTYPE DoesSupportTransform(WICBitmapTransformOptions,BOOL*)=0;
};
static const GUID IID_IWICBitmapSourceTransform={0x3b16811b,0x6a43,0x4ec9,{0xb7,0x13,0x3d,0x5a,0x0c,0x13,0xb9,0x40}};
#endif
