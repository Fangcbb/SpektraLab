"""Native host pair workflow: create, reopen, independent exposure, rotation, safe errors."""
import argparse,os,tempfile,sys
import numpy as np
from host_smoke import Host,write_png,write_tiff16

def main():
 p=argparse.ArgumentParser();p.add_argument('--host',required=True);p.add_argument('--resources',required=True);p.add_argument('--wrapper');a=p.parse_args()
 h=Host(([a.wrapper] if a.wrapper else [])+[a.host,'--resources',a.resources])
 def call(method,params):
  header,px=h.call(method,params)
  assert header['ok'],(method,header)
  return header['result'],px
 tmp=tempfile.mkdtemp(prefix='spk-双联-');left=os.path.join(tmp,'左.png');right=os.path.join(tmp,'右.tif');path=os.path.join(tmp,'two.spektrapair')
 write_png(left,96,64);write_tiff16(right,80,120)
 hole=lambda path:{'path':path,'autoExposure':False,'exposureEV':0,'placement':{'scale':1,'x':0,'y':0,'quarterTurns':0}}
 pair={'schemaVersion':1,'folder':tmp,'left':hole(left),'right':hole(right),'spacingMM':1,'onStrip':True,'turned':False}
 pair,_=call('create_pair',{'path':path,'pair':pair});assert os.path.isfile(path)
 probe,_=call('probe',{'path':path});assert probe['kind']=='pair' and probe['width']>probe['height']
 thumb,px=call('thumbnail',{'path':path,'long_edge':128});assert len(px)>0
 params={'grain_active':False,'glare_active':False,'halation_active':False,'dir_couplers_active':False,'auto_exposure':False,'overscan_active':False}
 opened,_=call('open',{'path':path,'params':params});sid=opened['session']
 def render():
  r,b=call('render',{'session':sid,'tier':'full','format':'rgba8','display':'srgb'});im=r['image'];return np.frombuffer(b,np.uint8).reshape(im['height'],im['width'],4).copy()
 before=render();pair['right']['exposureEV']=1
 pair,_=call('create_pair',{'path':path,'pair':pair,'overwrite':True});call('redecode',{'session':sid,'decode':{}});after=render()
 assert before.shape==after.shape
 mid=before.shape[1]//2
 assert np.max(np.abs(before[8:-8,8:mid-8].astype(int)-after[8:-8,8:mid-8].astype(int)))<=3,'editing second frame changed first'
 assert np.count_nonzero(before[:,mid:]!=after[:,mid:])>10,'second frame exposure had no effect'
 # A per-frame enlarger trim changes only its gate, and is restored afterwards.
 pair['left']['print']={'brightnessStops':1,'yFilterShift':0,'mFilterShift':0,'preflashExposure':0}
 pair,_=call('create_pair',{'path':path,'pair':pair,'overwrite':True})
 printed=render()
 assert np.count_nonzero(printed[:,:mid-8]!=after[:,:mid-8])>10,'frame print trim had no effect'
 assert np.max(np.abs(printed[8:-8,mid+8:].astype(int)-after[8:-8,mid+8:].astype(int)))<=3,'frame print trim changed other gate'
 restored,_=call('set_params',{'session':sid,'delta':{}});assert restored['params']['print_exposure']==1,'pair layer leaked print parameters'
 call('set_params',{'session':sid,'delta':{'overscan_active':True,'date_imprint_active':True,'date_imprint_text':"'26 10 25",'date_imprint_text_b':"'24 6 18"}})
 strip=render();assert strip.shape[0]>before.shape[0] or strip.shape[1]>before.shape[1]
 call('close',{'session':sid})
 pair['turned']=True;pair,_=call('create_pair',{'path':path,'pair':pair,'overwrite':True})
 probe,_=call('probe',{'path':path});assert probe['height']>probe['width']
 # Turned pairs change layout, without turning the photos inside their holes.
 opened,_=call('open',{'path':path,'params':params});sid=opened['session'];turned=render()
 assert turned.shape[0]>turned.shape[1]
 call('close',{'session':sid})
 # Native JPEG decode/thumbnail round-trip exercises WIC when available on Windows.
 opened,_=call('open',{'path':left,'params':params});jpg=os.path.join(tmp,'roundtrip.jpg')
 call('export_image',{'session':opened['session'],'path':jpg,'format':'jpeg','color_space':'srgb'})
 call('close',{'session':opened['session']});opened,_=call('open',{'path':jpg,'params':params});call('close',{'session':opened['session']})
 call('thumbnail',{'path':jpg,'long_edge':32})
 # Metered creation has persisted per-hole EV values.
 pair['left']['autoExposure']=True;pair['left']['meteredEV']=None
 pair,_=call('create_pair',{'path':path,'pair':pair,'overwrite':True});assert isinstance(pair['left']['meteredEV'],(int,float))
 bad={**pair,'left':hole(path)}
 reply,_=h.call('create_pair',{'path':os.path.join(tmp,'nested.spektrapair'),'pair':bad});assert not reply['ok']
 reply,_=h.call('create_pair',{'path':path,'pair':pair});assert not reply['ok'],'overwrote pair without authorization'
 call('shutdown',{});assert h.p.wait(timeout=15)==0
 print('PASS: pair create/probe/thumbnail/open, independent exposure, date/film render, rotation, meter, JPEG and safe writes')
 print('WIC native decode logged:',any('Windows WIC' in line for line in h.stderr))
 return 0
if __name__=='__main__':sys.exit(main())
