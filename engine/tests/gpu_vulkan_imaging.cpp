// New imaging kernels against double precision formulae. Includes dispatch
// boundaries and tail guards; full Metal image parity is a separate gate.
#include "gpu/gpu.hpp"
#include "gpu_vulkan_read.hpp"
#include "core/latitude_fit.hpp"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <memory>
#include <stdexcept>
using namespace spk::gpu;
namespace {
std::string error;
size_t cases=0;double worst=0;
void require(bool ok){if(!ok)throw std::runtime_error(error);}
BufferRef upload(Gpu* gpu,const std::vector<float>& data){auto b=gpu->upload(data.data(),data.size()*4,error);require(bool(b));return b;}
BufferRef output(Gpu* gpu,size_t n){return upload(gpu,std::vector<float>(n+16,-123456.0f));}
void check(Gpu* gpu,const BufferRef& b,const std::vector<double>& expected,double tolerance,const char* name){
 std::vector<float> actual(expected.size()+16);require(gpu->flush(error));require(gpu->read(b.get(),0,actual.data(),actual.size()*sizeof(float),error));
 for(size_t i=0;i<expected.size();++i){
  const double delta=std::abs(actual[i]-expected[i]);worst=std::max(worst,delta/std::max(1.0,std::abs(expected[i])));
  if(!std::isfinite(actual[i]) || delta>tolerance*std::max(1.0,std::abs(expected[i]))){
   char message[256];std::snprintf(message,sizeof message,"%s[%zu]: %.9g vs %.12g",name,i,actual[i],expected[i]);throw std::runtime_error(message);
  }
 }
 for(size_t i=expected.size();i<actual.size();++i)if(actual[i]!=-123456.0f){char message[200];std::snprintf(message,sizeof message,"%s tail guard[%zu/%zu] overwritten: %.9g",name,i,actual.size(),actual[i]);throw std::runtime_error(message);}
 ++cases;
}
void latitude(Gpu* gpu){
 for(uint32_t count:{1u,257u,1048577u})for(int norm=0;norm<3;++norm)for(float rolloff:{1.f,2.f,3.f}){
  std::vector<float> rgb(count*3);
  for(size_t i=0;i<rgb.size();++i)rgb[i]=float(.184*std::exp2(double(int(i%97)-48)/4));
  rgb[0]=-.1f;
  std::vector<float> p={2,1.25f,-2,1.5f,rolloff,4,float(norm),.2126f,.7152f,.0722f,.184f,float(count),1,.5f,1,2,-1,.75f,0};
  auto input=upload(gpu,rgb),params=upload(gpu,p),dst=output(gpu,rgb.size());
  const uint32_t n[]={count};
  require(gpu->dispatch("spk_scene_latitude",{Arg::buf(input),Arg::buf(params),Arg::inline_bytes(n,1),Arg::buf(dst)},count,error));
  std::vector<double> expected(rgb.size());
  for(uint32_t i=0;i<count;++i){
   const double r=std::max(rgb[3*i],0.f),g=std::max(rgb[3*i+1],0.f),b=std::max(rgb[3*i+2],0.f),s2=r*r+g*g+b*b;
   const double value=norm==1?p[7]*r+p[8]*g+p[9]*b:norm==2?std::max({r,g,b}):s2>0?(r*r*r+g*g*g+b*b*b)/s2:0;
   spk::SceneLatitudeParams curve;curve.rolloff=rolloff;curve.max_lift=4;
   const bool second=(i+.5)/count>=.5;
   curve.highlight_knee=second?p[14]:p[0];curve.highlight_room=second?p[15]:p[1];
   curve.shadow_knee=second?p[16]:p[2];curve.shadow_room=second?p[17]:p[3];
   const double gain=value>0?std::exp2(spk::slm::delta(std::log2(std::max(value,double(p[10])*std::exp2(-24))/p[10]),curve)):1;
   for(int k=0;k<3;++k)expected[3*i+k]=rgb[3*i+k]*gain;
  }
  check(gpu,dst,expected,8e-6,"scene latitude");
 }
}
void cineon(Gpu* gpu){
 for(uint32_t count:{1u,257u,1048577u}){
  std::vector<float> input(count*3),p(42,0);
  for(size_t i=0;i<input.size();++i)input[i]=float(int(i%121)-80)/20;
  // A deliberately non-symmetric colour matrix catches column/row mistakes.
  p[0]=1.1f;p[3]=-.1f;p[6]=.03f;p[1]=.1f;p[4]=.8f;p[7]=.05f;p[2]=-.05f;p[5]=.2f;p[8]=.9f;
  p[9]=.1f;p[10]=-.2f;p[11]=.05f;p[37]=685;p[38]=300;p[39]=1023;p[40]=.001f;p[41]=float(std::pow(10.,(95.-685.)/300.));
  auto src=upload(gpu,input),params=upload(gpu,p),dst=output(gpu,input.size());const uint32_t n[]={count};
  require(gpu->dispatch("spk_di_encode",{Arg::buf(src),Arg::buf(params),Arg::inline_bytes(n,1),Arg::buf(dst)},count,error));
  std::vector<double> expected(input.size());
  for(uint32_t i=0;i<count;++i){double pos[3];for(int k=0;k<3;++k)pos[k]=(std::pow(10.,input[3*i+k])-p[40])*std::pow(10.,p[9+k]);
   for(int k=0;k<3;++k){double linear=0;for(int c=0;c<3;++c)linear+=p[c*3+k]*pos[c];expected[3*i+k]=std::clamp((p[37]+p[38]*std::log10(std::max(linear,0.)*(1-p[41])+p[41]))/p[39],0.,1.);}
  }
  check(gpu,dst,expected,2e-6,"Cineon");
 }
}
void masks(Gpu* gpu){
 for(const auto wh:{std::array<uint32_t,2>{11,7},std::array<uint32_t,2>{1025,1024}}){
  const uint32_t w=wh[0],h=wh[1],count=w*h,nl=3,gw=4,gh=3;
  std::vector<float> cmy(count*3),chd={.8f,.1f,.05f,.2f,.9f,.1f,.05f,.2f,.7f},base={.1f,.2f,.3f},ixs={.4f,.1f,.2f,.2f,.3f,.1f,.1f,.2f,.5f};
  for(size_t i=0;i<cmy.size();++i)cmy[i]=float(i%71)/30;
  std::vector<float> p={1,.8f,1.2f,4,3,5,.02f,.01f,.03f,-1,.7f,1,1,.9f,1,4};
  auto c=upload(gpu,cmy),d=upload(gpu,chd),b=upload(gpu,base),ix=upload(gpu,ixs),params=upload(gpu,p);
  auto exposure=[&](uint32_t i){std::array<double,3>a{};for(uint32_t l=0;l<nl;++l){double density=base[l];for(int k=0;k<3;++k)density+=cmy[3*i+k]*chd[3*l+k];for(int k=0;k<3;++k)a[k]+=std::pow(10.,-density)*ixs[3*l+k];}for(int k=0;k<3;++k)a[k]*=p[k];return a;};
  auto coordinate=[&](const std::array<double,3>&a){double x=0;for(int k=0;k<3;++k)x+=std::max(-20.,std::log2(std::max(a[k]*p[k+3],0.)));return x/3;};
  auto reduced=output(gpu,gw*gh);const uint32_t meta[]={w,h,gw,gh,nl};
  require(gpu->dispatch("spk_mask_reduce",{Arg::buf(c),Arg::buf(d),Arg::buf(b),Arg::buf(ix),Arg::buf(params),Arg::inline_bytes(meta,5),Arg::buf(reduced)},gw*gh,error));
  std::vector<double> expected(gw*gh);
  for(uint32_t cy=0;cy<gh;++cy)for(uint32_t cx=0;cx<gw;++cx){double sum=0;uint32_t n=0;for(uint32_t y=cy*h/gh;y<(cy+1)*h/gh;++y)for(uint32_t x=cx*w/gw;x<(cx+1)*w/gw;++x){sum+=coordinate(exposure(y*w+x));++n;}expected[cy*gw+cx]=sum/n;}
  // The large reduction sums ~87k floats in each cell; accumulation is float.
  check(gpu,reduced,expected,count>1000?3e-4:2e-6,"mask grid");
  std::vector<float> coef(gw*gh*2);for(size_t i=0;i<coef.size();i+=2){coef[i]=.6f;coef[i+1]=.3f;}
  auto coefficients=upload(gpu,coef),dst=output(gpu,count*3);const uint32_t ep[]={count,nl,w,h,0,gw,gh};
  require(gpu->dispatch("spk_mask_epilogue",{Arg::buf(c),Arg::buf(d),Arg::buf(b),Arg::buf(ix),Arg::buf(params),Arg::buf(coefficients),Arg::inline_bytes(ep,7),Arg::buf(dst)},count,error));
  expected.resize(count*3);
  for(uint32_t i=0;i<count;++i){const auto a=exposure(i);const double x=.6f*coordinate(a)+.3f;double delta=0;
   if(x<p[9]){const double v=p[9]-x;delta=v-v*p[10]/std::hypot(p[10],v);}
   else if(x>p[12]){const double v=x-p[12];delta=v*p[13]/std::hypot(p[13],v)-v;}
   delta=delta*p[15]/std::hypot(p[15],delta);const double gain=std::exp2(delta);
   for(int k=0;k<3;++k)expected[3*i+k]=std::log10(std::max(gain*a[k]+p[6+k],0.)+1e-10);
  }
  check(gpu,dst,expected,2e-6,"mask epilogue");
 }
}
}
int main(int argc,char**argv){
 if(argc!=2)return 2;
 try{std::unique_ptr<Gpu> gpu(Gpu::create_vulkan(std::string(argv[1])+"/vulkan",error));require(bool(gpu));latitude(gpu.get());cineon(gpu.get());masks(gpu.get());
 std::printf("PASS: %zu float64 imaging cases; maximum scaled error %.9g; guards intact\n",cases,worst);return 0;}
 catch(const std::exception& e){std::fprintf(stderr,"imaging: %s\n",e.what());return 1;}
}
