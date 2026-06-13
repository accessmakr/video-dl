import { useState, useRef, useCallback, useEffect } from 'react';
import { uploadForWatermarkRemoval, getConversionStatus, getConverterDownloadUrl } from '../services/api';
import { formatBytes } from '../utils/formatBytes';

const ACCEPT='image/*,.jpg,.jpeg,.png,.webp,.bmp,.gif';
const ALLOWED=/\.(jpg|jpeg|png|webp|bmp|gif)$/i;
const POLL_MS=1500,TIMEOUT_MS=5*60*1000;

const PRESETS=[
  {id:'top-left',    label:'Top Left',     x:0,  y:0,  w:25, h:20, desc:'Logo or text top-left'},
  {id:'top-right',   label:'Top Right',    x:75, y:0,  w:25, h:20, desc:'Logo or text top-right'},
  {id:'center',      label:'Center',       x:25, y:35, w:50, h:30, desc:'Center overlay watermark'},
  {id:'bottom-left', label:'Bottom Left',  x:0,  y:75, w:35, h:25, desc:'Bottom-left watermark'},
  {id:'bottom-right',label:'Bottom Right', x:65, y:75, w:35, h:25, desc:'Bottom-right watermark'},
  {id:'custom',      label:'Custom',       x:0,  y:0,  w:0,  h:0,  desc:'Enter pixel coordinates'},
];

function saveFile(url,name){const a=document.createElement('a');a.href=url;a.download=name||'image';document.body.appendChild(a);a.click();document.body.removeChild(a);}

export default function ImageWatermarkRemover(){
  const [file,setFile]=useState(null);const [dragging,setDragging]=useState(false);
  const [preset,setPreset]=useState('top-right');
  const [custom,setCustom]=useState({x:0,y:0,w:200,h:80});
  const [phase,setPhase]=useState('idle');const [uploadPct,setUploadPct]=useState(0);
  const [jobId,setJobId]=useState(null);const [jobState,setJobState]=useState(null);
  const [error,setError]=useState(null);const [preview,setPreview]=useState(null);
  const inputRef=useRef(null);const pollRef=useRef(null);const startRef=useRef(null);
  const isDone=phase==='done',isFailed=phase==='error',isWorking=phase==='uploading'||phase==='converting';
  const isCustom=preset==='custom';
  const selectedPreset=PRESETS.find(p=>p.id===preset);

  const stopPoll=useCallback(()=>{if(pollRef.current){clearTimeout(pollRef.current);pollRef.current=null;}},[]);
  useEffect(()=>{
    if(!jobId||phase!=='converting') return;
    startRef.current=Date.now();
    const tick=async()=>{
      if(Date.now()-startRef.current>TIMEOUT_MS){stopPoll();setPhase('error');setError('Timed out.');return;}
      try{const d=await getConversionStatus(jobId);setJobState(d);
        if(d.status==='done'){stopPoll();setPhase('done');}
        else if(d.status==='error'){stopPoll();setPhase('error');setError(d.error||'Removal failed.');}
        else pollRef.current=setTimeout(tick,POLL_MS);
      }catch{pollRef.current=setTimeout(tick,POLL_MS*2);}
    };
    tick(); return stopPoll;
  },[jobId,phase,stopPoll]);

  const resetJob=()=>{stopPoll();setJobId(null);setJobState(null);setError(null);setPhase('idle');setUploadPct(0);};
  const acceptFile=(f)=>{
    if(!f)return;
    if(!ALLOWED.test(f.name)){setError('Please select an image file (JPG, PNG, WebP, BMP).');return;}
    resetJob();setFile(f);
    const url=URL.createObjectURL(f);setPreview(url);
  };
  const handleDrop=(e)=>{e.preventDefault();setDragging(false);acceptFile(e.dataTransfer.files?.[0]);};

  const start=async()=>{
    resetJob();setPhase('uploading');setUploadPct(0);
    try{
      const form=new FormData();
      form.append('file',file);
      form.append('mode','percent');
      if(isCustom){
        form.append('x',custom.x);form.append('y',custom.y);
        form.append('w',custom.w);form.append('h',custom.h);
        // custom uses pixels — override mode
        const formData2=new FormData();
        formData2.append('file',file);formData2.append('mode','pixels');
        formData2.append('x',custom.x);formData2.append('y',custom.y);
        formData2.append('w',custom.w);formData2.append('h',custom.h);
        formData2.append('filename',file.name.replace(/\.[^.]+$/,''));
        const d=await uploadForWatermarkRemoval('watermark-image',formData2,(p)=>setUploadPct(p));
        setJobId(d.jobId);setPhase('converting');return;
      }
      form.append('x',selectedPreset.x);form.append('y',selectedPreset.y);
      form.append('w',selectedPreset.w);form.append('h',selectedPreset.h);
      form.append('filename',file.name.replace(/\.[^.]+$/,''));
      const d=await uploadForWatermarkRemoval('watermark-image',form,(p)=>setUploadPct(p));
      setJobId(d.jobId);setPhase('converting');
    }catch(e){setPhase('error');setError(e.message);}
  };

  const progress=phase==='uploading'?uploadPct:(jobState?.progress||0);
  const downloadUrl=isDone?getConverterDownloadUrl(jobState.jobId):null;
  const ext=file?file.name.split('.').pop():'jpg';

  return(
    <section className="w-full max-w-xl flex flex-col gap-4" aria-label="Image Watermark Remover">
      <div><h2 className="text-white font-bold text-base">Image Watermark Remover</h2>
        <p className="text-zinc-500 text-xs mt-0.5">Remove logos, watermarks, and text overlays from JPG, PNG, and WebP images.</p></div>
      <div onDrop={handleDrop} onDragOver={(e)=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onClick={()=>!isWorking&&inputRef.current?.click()} role="button" tabIndex={0}
        className={`border-2 border-dashed rounded-xl overflow-hidden transition-all ${dragging?'border-violet-400 bg-violet-950/20':file?'border-zinc-600':'border-zinc-700 hover:border-zinc-500'} ${isWorking?'opacity-50 cursor-not-allowed pointer-events-none':'cursor-pointer'}`}>
        <input ref={inputRef} type="file" accept={ACCEPT} onChange={(e)=>acceptFile(e.target.files?.[0])} className="hidden"/>
        {preview&&file?(
          <div className="relative">
            <img src={preview} alt="Preview" className="w-full max-h-48 object-contain bg-zinc-900"/>
            <div className="absolute bottom-0 left-0 right-0 bg-zinc-950/80 px-3 py-2 flex justify-between items-center">
              <span className="text-zinc-300 text-xs truncate">{file.name}</span>
              <span className="text-zinc-500 text-xs">{formatBytes(file.size)}</span>
            </div>
            {!isWorking&&<button onClick={(e)=>{e.stopPropagation();setFile(null);setPreview(null);resetJob();}}
              className="absolute top-2 right-2 bg-zinc-950/80 text-zinc-400 hover:text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">✕</button>}
          </div>
        ):(
          <div className="p-8 text-center"><p className="text-zinc-400 text-sm font-medium">{dragging?'Drop image here':'Tap or drag an image here'}</p>
            <p className="text-zinc-600 text-xs mt-1">JPG · PNG · WebP · BMP</p></div>
        )}
      </div>
      <div><p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">Watermark Position</p>
        <div className="flex flex-col gap-1.5">{PRESETS.map(p=>(
          <button key={p.id} onClick={()=>!isWorking&&setPreset(p.id)} disabled={isWorking}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all disabled:opacity-50 ${preset===p.id?'border-violet-500 bg-violet-950/30':'border-zinc-700 bg-zinc-900 hover:border-zinc-600'}`}>
            <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${preset===p.id?'border-violet-400 bg-violet-400':'border-zinc-600'}`}/>
            <div><span className="text-zinc-200 text-xs font-medium">{p.label}</span>
              <span className="text-zinc-600 text-xs ml-2">{p.desc}</span></div>
          </button>))}</div></div>
      {isCustom&&(
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-zinc-400 text-xs font-medium">Custom pixel coordinates</p>
          <div className="grid grid-cols-2 gap-2">
            {[['x','X position'],['y','Y position'],['w','Width'],['h','Height']].map(([k,l])=>(
              <div key={k} className="flex flex-col gap-1">
                <label className="text-zinc-500 text-xs">{l} (px)</label>
                <input type="number" min={0} value={custom[k]}
                  onChange={(e)=>setCustom(p=>({...p,[k]:parseInt(e.target.value)||0}))}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs outline-none"/>
              </div>))}</div>
          <p className="text-zinc-600 text-xs">Use browser DevTools or a photo editor to find the exact pixel coordinates.</p>
        </div>
      )}
      {!isDone&&<button onClick={start} disabled={isWorking||!file}
        className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors">
        {isWorking?(phase==='uploading'?`Uploading… ${uploadPct}%`:'Removing watermark…'):'Remove Watermark'}</button>}
      {isWorking&&(<div className="flex flex-col gap-1.5">
        <div className="flex justify-between"><span className="text-zinc-300 text-xs">{phase==='uploading'?`Uploading… ${uploadPct}%`:'Removing watermark…'}</span>
          <span className="text-zinc-500 text-xs">{progress>0?`${progress}%`:''}</span></div>
        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
          <div className={`h-2 ${phase==='uploading'?'bg-blue-500':'bg-violet-500'} rounded-full transition-all duration-300`} style={{width:`${progress}%`}}/></div>
      </div>)}
      {isDone&&(<div className="flex flex-col gap-2">
        <button onClick={()=>saveFile(downloadUrl,`image_clean.${ext}`)}
          className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors">
          ✓ Download Clean Image{jobState?.fileSizeBytes?` (${formatBytes(jobState.fileSizeBytes)})`:''}</button>
        <button onClick={()=>{resetJob();setFile(null);setPreview(null);}} className="text-zinc-500 hover:text-zinc-300 text-xs text-center py-1">Process another image</button>
      </div>)}
      {isFailed&&(<div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-red-400">⚠</span>
        <div><p className="text-red-300 text-xs">{error}</p>
          <button onClick={()=>{resetJob();setError(null);}} className="text-red-400 text-xs mt-1 underline">Try again</button></div>
      </div>)}
    </section>
  );
}
