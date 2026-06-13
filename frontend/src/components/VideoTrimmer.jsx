import { useState, useRef, useCallback, useEffect } from 'react';
import { uploadVideoForProcessing, getConversionStatus, getConverterDownloadUrl } from '../services/api';
import { formatBytes } from '../utils/formatBytes';

const ACCEPT='video/*,.mp4,.mkv,.webm,.avi,.mov,.wmv,.flv,.3gp,.m4v,.mpeg,.mpg';
const ALLOWED=/\.(mp4|mkv|webm|avi|mov|wmv|flv|3gp|m4v|mpeg|mpg)$/i;
const POLL_MS=2000,TIMEOUT_MS=10*60*1000;
function saveFile(url,name){const a=document.createElement('a');a.href=url;a.download=name||'video';document.body.appendChild(a);a.click();document.body.removeChild(a);}
function isValidTime(t){return/^\d{2}:\d{2}:\d{2}$/.test(t);}

export default function VideoTrimmer(){
  const [file,setFile]=useState(null);const [dragging,setDragging]=useState(false);
  const [startTime,setStartTime]=useState('00:00:00');const [endTime,setEndTime]=useState('');
  const [phase,setPhase]=useState('idle');const [uploadPct,setUploadPct]=useState(0);
  const [jobId,setJobId]=useState(null);const [jobState,setJobState]=useState(null);
  const [error,setError]=useState(null);const inputRef=useRef(null);
  const pollRef=useRef(null);const startRef=useRef(null);
  const isDone=phase==='done',isFailed=phase==='error',isWorking=phase==='uploading'||phase==='converting';
  const canStart=file&&endTime&&isValidTime(startTime)&&isValidTime(endTime);

  const stopPoll=useCallback(()=>{if(pollRef.current){clearTimeout(pollRef.current);pollRef.current=null;}},[]);
  useEffect(()=>{
    if(!jobId||phase!=='converting') return;
    startRef.current=Date.now();
    const tick=async()=>{
      if(Date.now()-startRef.current>TIMEOUT_MS){stopPoll();setPhase('error');setError('Timed out.');return;}
      try{const d=await getConversionStatus(jobId);setJobState(d);
        if(d.status==='done'){stopPoll();setPhase('done');}
        else if(d.status==='error'){stopPoll();setPhase('error');setError(d.error||'Trim failed.');}
        else pollRef.current=setTimeout(tick,POLL_MS);
      }catch{pollRef.current=setTimeout(tick,POLL_MS*2);}
    };
    tick(); return stopPoll;
  },[jobId,phase,stopPoll]);

  const resetJob=()=>{stopPoll();setJobId(null);setJobState(null);setError(null);setPhase('idle');setUploadPct(0);};
  const acceptFile=(f)=>{if(!f)return;if(!ALLOWED.test(f.name)){setError('Please select a video file.');return;}resetJob();setFile(f);};
  const start=async()=>{
    if(!canStart) return;
    resetJob();setPhase('uploading');setUploadPct(0);
    try{
      const form=new FormData();
      form.append('file',file);form.append('startTime',startTime);form.append('endTime',endTime);
      form.append('filename',file.name.replace(/\.[^.]+$/,''));
      const d=await uploadVideoForProcessing('trim-video',form,(p)=>setUploadPct(p));
      setJobId(d.jobId);setPhase('converting');
    }catch(e){setPhase('error');setError(e.message);}
  };
  const progress=phase==='uploading'?uploadPct:(jobState?.progress||0);
  const statusLabel=phase==='uploading'?`Uploading… ${uploadPct}%`:(jobState?.statusText||'Trimming…');

  return(
    <section className="w-full max-w-xl flex flex-col gap-4" aria-label="Video Trimmer">
      <div><h2 className="text-white font-bold text-base">Video Trimmer</h2>
        <p className="text-zinc-500 text-xs mt-0.5">Cut a specific section from your video. Fast stream copy — no quality loss.</p></div>
      <div onDrop={(e)=>{e.preventDefault();setDragging(false);acceptFile(e.dataTransfer.files?.[0]);}}
        onDragOver={(e)=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onClick={()=>!isWorking&&inputRef.current?.click()} role="button" tabIndex={0}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${dragging?'border-yellow-400 bg-yellow-950/20':file?'border-zinc-600 bg-zinc-900':'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'} ${isWorking?'opacity-50 cursor-not-allowed pointer-events-none':'cursor-pointer'}`}>
        <input ref={inputRef} type="file" accept={ACCEPT} onChange={(e)=>acceptFile(e.target.files?.[0])} className="hidden"/>
        {file?(<div className="flex items-center justify-between gap-3">
          <div className="text-left overflow-hidden"><p className="text-zinc-200 text-sm font-medium truncate">{file.name}</p>
            <p className="text-zinc-500 text-xs">{formatBytes(file.size)}</p></div>
          {!isWorking&&<button onClick={(e)=>{e.stopPropagation();setFile(null);resetJob();}} className="text-zinc-600 hover:text-zinc-400">✕</button>}
        </div>):(<p className="text-zinc-400 text-sm font-medium">{dragging?'Drop video here':'Tap or drag a video file here'}</p>)}
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Trim Range (HH:MM:SS)</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-zinc-500 text-xs">Start Time</label>
            <input type="text" value={startTime} onChange={(e)=>setStartTime(e.target.value)} placeholder="00:00:00"
              className={`bg-zinc-800 border rounded-lg px-3 py-2.5 text-white text-sm outline-none font-mono ${isValidTime(startTime)?'border-zinc-700':'border-red-700'}`}/>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-zinc-500 text-xs">End Time</label>
            <input type="text" value={endTime} onChange={(e)=>setEndTime(e.target.value)} placeholder="00:01:30"
              className={`bg-zinc-800 border rounded-lg px-3 py-2.5 text-white text-sm outline-none font-mono ${!endTime||isValidTime(endTime)?'border-zinc-700':'border-red-700'}`}/>
          </div>
        </div>
        <p className="text-zinc-600 text-xs">Format: HH:MM:SS — e.g. 00:00:30 to 00:02:00 trims from 30s to 2 minutes</p>
      </div>
      {!isDone&&<button onClick={start} disabled={isWorking||!canStart}
        className="w-full bg-yellow-600 hover:bg-yellow-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors">
        {isWorking?statusLabel:'Trim Video'}</button>}
      {isWorking&&(<div className="flex flex-col gap-1.5">
        <div className="flex justify-between"><span className="text-zinc-300 text-xs">{statusLabel}</span><span className="text-zinc-500 text-xs">{progress>0?`${progress}%`:''}</span></div>
        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden"><div className={`h-2 ${phase==='uploading'?'bg-blue-500':'bg-yellow-500'} rounded-full transition-all duration-500`} style={{width:`${progress}%`}}/></div>
      </div>)}
      {isDone&&(<div className="flex flex-col gap-2">
        <button onClick={()=>saveFile(getConverterDownloadUrl(jobState.jobId),`trimmed.mp4`)}
          className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors">
          ✓ Download Trimmed Video{jobState?.fileSizeBytes?` (${formatBytes(jobState.fileSizeBytes)})`:''}</button>
        <button onClick={()=>{resetJob();setFile(null);}} className="text-zinc-500 hover:text-zinc-300 text-xs text-center py-1">Trim another file</button>
      </div>)}
      {isFailed&&(<div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-red-400">⚠</span>
        <div><p className="text-red-300 text-xs">{error}</p>
          <button onClick={()=>{resetJob();setError(null);}} className="text-red-400 text-xs mt-1 underline">Try again</button></div>
      </div>)}
    </section>
  );
}
