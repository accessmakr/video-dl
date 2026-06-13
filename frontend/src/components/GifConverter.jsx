import { useState, useRef, useCallback, useEffect } from 'react';
import { uploadVideoForProcessing, getConversionStatus, getConverterDownloadUrl } from '../services/api';
import { formatBytes } from '../utils/formatBytes';

const ACCEPT='video/*,.mp4,.mkv,.webm,.avi,.mov,.flv,.3gp,.m4v,.mpeg,.mpg';
const ALLOWED=/\.(mp4|mkv|webm|avi|mov|flv|3gp|m4v|mpeg|mpg)$/i;
const POLL_MS=2000,TIMEOUT_MS=10*60*1000;
const FPS_OPTIONS=[5,8,10,15,20];
const WIDTH_OPTIONS=[{v:240,l:'240px tiny'},{v:320,l:'320px small'},{v:480,l:'480px medium'},{v:640,l:'640px large'},{v:720,l:'720px HD'}];
function saveFile(url,name){const a=document.createElement('a');a.href=url;a.download=name||'video.gif';document.body.appendChild(a);a.click();document.body.removeChild(a);}

export default function GifConverter(){
  const [file,setFile]=useState(null);const [dragging,setDragging]=useState(false);
  const [fps,setFps]=useState(10);const [width,setWidth]=useState(480);
  const [startTime,setStartTime]=useState('');const [duration,setDuration]=useState('');
  const [phase,setPhase]=useState('idle');const [uploadPct,setUploadPct]=useState(0);
  const [jobId,setJobId]=useState(null);const [jobState,setJobState]=useState(null);
  const [error,setError]=useState(null);const inputRef=useRef(null);
  const pollRef=useRef(null);const startRef=useRef(null);
  const isDone=phase==='done',isFailed=phase==='error',isWorking=phase==='uploading'||phase==='converting';

  const stopPoll=useCallback(()=>{if(pollRef.current){clearTimeout(pollRef.current);pollRef.current=null;}},[]);
  useEffect(()=>{
    if(!jobId||phase!=='converting') return;
    startRef.current=Date.now();
    const tick=async()=>{
      if(Date.now()-startRef.current>TIMEOUT_MS){stopPoll();setPhase('error');setError('Timed out.');return;}
      try{const d=await getConversionStatus(jobId);setJobState(d);
        if(d.status==='done'){stopPoll();setPhase('done');}
        else if(d.status==='error'){stopPoll();setPhase('error');setError(d.error||'GIF conversion failed.');}
        else pollRef.current=setTimeout(tick,POLL_MS);
      }catch{pollRef.current=setTimeout(tick,POLL_MS*2);}
    };
    tick(); return stopPoll;
  },[jobId,phase,stopPoll]);

  const resetJob=()=>{stopPoll();setJobId(null);setJobState(null);setError(null);setPhase('idle');setUploadPct(0);};
  const acceptFile=(f)=>{if(!f)return;if(!ALLOWED.test(f.name)){setError('Please select a video file.');return;}resetJob();setFile(f);};
  const start=async()=>{
    resetJob();setPhase('uploading');setUploadPct(0);
    try{
      const form=new FormData();
      form.append('file',file);form.append('fps',fps);form.append('width',width);
      if(startTime) form.append('startTime',startTime);
      if(duration)  form.append('duration',duration);
      form.append('filename',file.name.replace(/\.[^.]+$/,''));
      const d=await uploadVideoForProcessing('convert-gif',form,(p)=>setUploadPct(p));
      setJobId(d.jobId);setPhase('converting');
    }catch(e){setPhase('error');setError(e.message);}
  };
  const progress=phase==='uploading'?uploadPct:(jobState?.progress||0);
  const statusLabel=phase==='uploading'?`Uploading… ${uploadPct}%`:(jobState?.statusText||'Generating GIF…');

  return(
    <section className="w-full max-w-xl flex flex-col gap-4" aria-label="GIF Converter">
      <div><h2 className="text-white font-bold text-base">Video to GIF</h2>
        <p className="text-zinc-500 text-xs mt-0.5">Convert any video clip to an animated GIF. Keep clips under 15 seconds for best results.</p></div>
      <div onDrop={(e)=>{e.preventDefault();setDragging(false);acceptFile(e.dataTransfer.files?.[0]);}}
        onDragOver={(e)=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onClick={()=>!isWorking&&inputRef.current?.click()} role="button" tabIndex={0}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${dragging?'border-pink-400 bg-pink-950/20':file?'border-zinc-600 bg-zinc-900':'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'} ${isWorking?'opacity-50 cursor-not-allowed pointer-events-none':'cursor-pointer'}`}>
        <input ref={inputRef} type="file" accept={ACCEPT} onChange={(e)=>acceptFile(e.target.files?.[0])} className="hidden"/>
        {file?(<div className="flex items-center justify-between gap-3">
          <div className="text-left overflow-hidden"><p className="text-zinc-200 text-sm font-medium truncate">{file.name}</p>
            <p className="text-zinc-500 text-xs">{formatBytes(file.size)}</p></div>
          {!isWorking&&<button onClick={(e)=>{e.stopPropagation();setFile(null);resetJob();}} className="text-zinc-600 hover:text-zinc-400">✕</button>}
        </div>):(<p className="text-zinc-400 text-sm font-medium">{dragging?'Drop video here':'Tap or drag a video file here'}</p>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">Frame Rate (FPS)</p>
          <div className="flex gap-1.5 flex-wrap">{FPS_OPTIONS.map(f=>(
            <button key={f} onClick={()=>!isWorking&&setFps(f)} disabled={isWorking} aria-pressed={fps===f}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-50 ${fps===f?'border-pink-500 bg-pink-950 text-white':'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'}`}>
              {f}fps</button>))}</div></div>
        <div><p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">Width</p>
          <select value={width} onChange={(e)=>!isWorking&&setWidth(parseInt(e.target.value))} disabled={isWorking}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-white text-xs outline-none disabled:opacity-50">
            {WIDTH_OPTIONS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select></div>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Clip Range (optional)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1"><label className="text-zinc-500 text-xs">Start Time (HH:MM:SS)</label>
            <input type="text" value={startTime} onChange={(e)=>setStartTime(e.target.value)} placeholder="00:00:00"
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs outline-none font-mono"/></div>
          <div className="flex flex-col gap-1"><label className="text-zinc-500 text-xs">Duration (seconds)</label>
            <input type="number" value={duration} onChange={(e)=>setDuration(e.target.value)} placeholder="10" min="1" max="60"
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs outline-none"/></div>
        </div>
        <p className="text-zinc-600 text-xs">Tip: Keep duration under 10 seconds for smaller GIF size.</p>
      </div>
      {!isDone&&<button onClick={start} disabled={isWorking||!file}
        className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors">
        {isWorking?statusLabel:'Convert to GIF'}</button>}
      {isWorking&&(<div className="flex flex-col gap-1.5">
        <div className="flex justify-between"><span className="text-zinc-300 text-xs">{statusLabel}</span><span className="text-zinc-500 text-xs">{progress>0?`${progress}%`:''}</span></div>
        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden"><div className={`h-2 ${phase==='uploading'?'bg-blue-500':'bg-pink-500'} rounded-full transition-all duration-500`} style={{width:`${progress}%`}}/></div>
        {phase==='converting'&&<p className="text-zinc-600 text-xs">Two-pass palette encoding for best GIF quality…</p>}
      </div>)}
      {isDone&&(<div className="flex flex-col gap-2">
        <button onClick={()=>saveFile(getConverterDownloadUrl(jobState.jobId),`animation.gif`)}
          className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors">
          ✓ Download GIF{jobState?.fileSizeBytes?` (${formatBytes(jobState.fileSizeBytes)})`:''}</button>
        <button onClick={()=>{resetJob();setFile(null);}} className="text-zinc-500 hover:text-zinc-300 text-xs text-center py-1">Convert another file</button>
      </div>)}
      {isFailed&&(<div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-red-400">⚠</span>
        <div><p className="text-red-300 text-xs">{error}</p>
          <button onClick={()=>{resetJob();setError(null);}} className="text-red-400 text-xs mt-1 underline">Try again</button></div>
      </div>)}
    </section>
  );
}
