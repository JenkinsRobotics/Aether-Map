"""Decode and qualify bundled loops independently of browser playback."""
from pathlib import Path
import hashlib
import importlib.util
import json
import subprocess
import numpy as np
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('render_loops',ROOT/'scripts/render-video-loops.py')
renderer=importlib.util.module_from_spec(spec);spec.loader.exec_module(renderer)
DEST=ROOT/'.verification/visual-library-2026-10-14';DEST.mkdir(parents=True,exist_ok=True)
manifest=json.loads((ROOT/'public/visual-loops/manifest.json').read_text())
results=[];sheet=Image.new('RGB',(960,900),'#101420');draw=ImageDraw.Draw(sheet)
for index,entry in enumerate(manifest):
    path=ROOT/'public/visual-loops'/entry['file']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==entry['sha256']
    assert path.stat().st_size==entry['bytes']
    probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(path)]))
    stream=probe['streams'][0]
    assert len(probe['streams'])==1 and stream['codec_name']=='h264' and stream['pix_fmt']=='yuv420p'
    assert (stream['width'],stream['height'])==(1280,720) and stream['r_frame_rate']=='24/1' and int(stream['nb_frames'])==192
    assert abs(float(stream['duration'])-8)<.001
    decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-vf','scale=320:180','-f','rawvideo','-pix_fmt','rgb24','-'])
    frames=np.frombuffer(decoded,dtype=np.uint8).reshape(-1,180,320,3).astype(np.float32)
    assert len(frames)==192
    adjacent=np.abs(frames[1:]-frames[:-1]).mean(axis=(1,2,3));boundary=float(np.abs(frames[-1]-frames[0]).mean())
    assert adjacent.mean()>.05, f"{entry['id']} is static"
    assert frames.std(axis=(1,2,3)).min()>5, f"{entry['id']} has blank frames"
    assert boundary < max(1,adjacent.max()*1.4), f"{entry['id']} has a seam: {boundary}"
    fn=next(row[3] for row in renderer.LOOPS if row[0]==entry['id'])
    formula_error=float(np.abs(renderer.frame(fn,0).astype(float)-renderer.frame(fn,renderer.TAU).astype(float)).mean())
    assert formula_error<.01
    poster=Image.open(ROOT/'public/visual-loops'/entry['poster']);assert poster.size==(480,270)
    sheet.paste(poster,((index%2)*480,(index//2)*300));draw.text(((index%2)*480+12,(index//2)*300+278),entry['name'],fill='white')
    results.append({'id':entry['id'],'frames':len(frames),'codec':stream['codec_name'],'size':[1280,720],'fps':24,'duration_s':8,'mean_adjacent_pixel_change':float(adjacent.mean()),'max_adjacent_pixel_change':float(adjacent.max()),'boundary_pixel_change':boundary,'periodic_formula_error':formula_error,'sha256':entry['sha256']})
(DEST/'video-qualification.json').write_text(json.dumps(results,indent=2)+'\n');sheet.save(DEST/'loop-posters.png')
print(json.dumps(results,indent=2))
