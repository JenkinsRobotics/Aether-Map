"""Rebuild original Aether Map loops; no external imagery or footage.

Requires numpy, Pillow and ffmpeg. Each formula is periodic over exactly eight
seconds. Encode frames [0, N) so the loop has neither a duplicated end frame nor
a pause. MP4/H.264/yuv420p supports the app's ordinary video playback/export path.
"""
from pathlib import Path
import hashlib
import argparse
import json
import subprocess
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/visual-loops'
WIDTH, HEIGHT, FPS, SECONDS = 1280, 720, 24, 8
x, y = np.meshgrid(np.linspace(-1, 1, WIDTH, dtype=np.float32), np.linspace(-1, 1, HEIGHT, dtype=np.float32))
TAU = np.pi * 2

def palette(v, colors):
    v = np.clip(v, 0, 1)[..., None]
    a, b, c = [np.array(color, dtype=np.float32) / 255 for color in colors]
    return np.where(v < .5, a + (b-a)*v*2, b+(c-b)*(v-.5)*2)

def prismatic(t):
    v = (.5 + .22*np.sin(x*7 + np.sin(y*4+t)*1.7-t) + .16*np.cos(y*5+x*2+t) + .12*np.sin(x*3-y*3+t*2))
    return palette(v, [(8,9,39),(84,29,173),(44,239,223)])

def orbital(t):
    col = np.zeros((HEIGHT, WIDTH, 3), dtype=np.float32) + np.array([.006,.012,.027])
    for i in range(18):
        a = TAU*i/18+t
        radius = .2+.5*(.5+.5*np.sin(i*2.3+t))
        px, py = np.cos(a)*radius, np.sin(a)*radius
        d = (x*1.6-px)**2+(y-py)**2
        light = np.exp(-d*(100+20*np.sin(i)))
        tint = np.array([.18+.6*(.5+.5*np.sin(i)),.4+.5*np.cos(i)**2,.7+.3*np.sin(i*2)**2])
        col += light[...,None]*tint*.8
    return col

def caustics(t):
    a = np.sin(x*6+np.sin(y*4+t)*1.4+t)+np.cos(y*8+np.sin(x*3-t)*1.2)
    b = np.sin(y*5+np.cos(x*7+t)*.8-t)+np.cos(x*8+y*2+t)
    light = np.exp(-np.abs(a*b)*5)
    return palette(light,[(1,10,30),(6,86,140),(140,243,244)])

def confetti(t):
    col=np.zeros((HEIGHT,WIDTH,3),dtype=np.float32)+np.array([.016,.008,.035])
    for i in range(30):
        px=np.sin(i*17.2)*1.25+.09*np.sin(t+i)
        py=(i*.613+t/TAU*2.4)%2.4-1.2
        angle=t+i*2.8
        qx=(x*1.5-px)*np.cos(angle)+(y-py)*np.sin(angle)
        qy=-(x*1.5-px)*np.sin(angle)+(y-py)*np.cos(angle)
        edge=np.maximum(np.abs(qx)/(.017+.009*(i%3)),np.abs(qy)/(.03+.009*(i%4)))
        shape=np.clip((1-edge)*9,0,1)
        tint=np.array([1,.45+.5*(.5+.5*np.cos(i)),.05+.2*(i%2)])
        col+=shape[...,None]*tint*(.55+.45*np.cos(t+i)**2)
    return col

def vortex(t):
    radius=np.sqrt((x*1.5)**2+y*y);angle=np.arctan2(y,x*1.5)
    bands=.5+.5*np.cos(angle*5-radius*13+t)
    ribbons=np.clip((bands-.65)*3,0,1)*(1-np.exp(-radius*6))
    return palette(ribbons,[(2,3,16),(64,28,143),(244,77,207)])

def horizon(t):
    z=1/np.maximum(.04,y+.16)
    road=x*z
    vertical=np.exp(-np.abs(np.sin(road*3))*24)
    horizontal=np.exp(-np.abs(np.sin(z*.8-t))*20)
    grid=np.maximum(vertical,horizontal)*np.clip((y+.1)*1.5,0,1)
    sky=.05+.12*(1-y)/2
    col=np.zeros((HEIGHT,WIDTH,3),dtype=np.float32)+np.stack([sky*.4,sky*.2,sky],axis=-1)
    col+=grid[...,None]*np.array([.65,.24,1])
    sun=np.exp(-((x*1.5)**2+(y+.45)**2)*24)
    col+=sun[...,None]*np.array([.85,.38,.12])
    return col

LOOPS=[
 ('prismatic-flow','Prismatic Flow','Soft violet and turquoise ribbons flow in a seamless loop.',prismatic),
 ('orbital-lights','Orbital Lights','Luminous points orbit and breathe against a dark field.',orbital),
 ('liquid-caustics','Liquid Caustics','Blue rippling highlights resembling light under water.',caustics),
 ('golden-confetti','Golden Confetti','Warm tumbling confetti for celebrations and layered scenes.',confetti),
 ('ribbon-vortex','Ribbon Vortex','Five magenta ribbons spiral around a dark center.',vortex),
 ('neon-horizon','Neon Horizon','A luminous moving perspective grid beneath a warm horizon.',horizon),
]

def frame(fn,t):return (np.clip(fn(t),0,1)*255).astype(np.uint8)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--only',choices=[entry[0] for entry in LOOPS])
    args=parser.parse_args()
    DEST.mkdir(exist_ok=True)
    manifest=[]
    for id,name,description,fn in LOOPS:
        path=DEST/f'{id}.mp4';poster=DEST/f'{id}.jpg'
        if not args.only or args.only==id:
            if np.abs(frame(fn,0).astype(float)-frame(fn,TAU).astype(float)).mean()>.01:
                raise RuntimeError(f'{id} is not periodic at the loop boundary')
            process=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{WIDTH}x{HEIGHT}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart','-g',str(FPS*2),str(path)],stdin=subprocess.PIPE)
            for i in range(FPS*SECONDS):
                pixels=frame(fn,TAU*i/(FPS*SECONDS))
                if i==FPS*2:Image.fromarray(pixels).resize((480,270),Image.Resampling.LANCZOS).save(poster,quality=90)
                process.stdin.write(pixels.tobytes())
            process.stdin.close()
            if process.wait():raise RuntimeError(f'Encoding {id} failed')
        manifest.append({'id':id,'name':name,'description':description,'file':path.name,'poster':poster.name,'width':WIDTH,'height':HEIGHT,'duration':SECONDS,'fps':FPS,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        print(f'{id}: {path.stat().st_size} bytes',flush=True)
    (DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

if __name__=='__main__':main()
