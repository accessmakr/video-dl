import { useState, useRef, useCallback, useEffect } from 'react';
import { uploadVideoForProcessing, getConversionStatus, getConverterDownloadUrl } from '../services/api';
import { formatBytes } from '../utils/formatBytes';

const FORMATS = [
  { id:'mp4',  label:'MP4',  desc:'Universal'    },
  { id:'mkv',  label:'MKV',  desc:'High quality' },
  { id:'webm', label:'WebM', desc:'Web / HTML5'  },
  { id:'avi',  label:'AVI',  desc:'Windows'      },
  { id:'mov',  label:'MOV',  desc:'Apple/Mac'    },
  { id:'wmv',  label:'WMV',  desc:'Windows Media'},
  { id:'flv',  label:'FLV',  desc:'Flash'        },
  { id:'3gp',  label:'3GP',  desc:'Mobile'       },
];
const QUALITIES = [
  { id:'high',   label:'High',   desc:'Best quality, larger file' },
  { id:'medium', label:'Medium', desc:'Balanced (recommended)'    },
  { id:'low',    label:'Low',    desc:'Smallest file size'        },
];
const ACCEPT = 'video/*,.mp4,.mkv,.webm,.avi,.mov,.wmv,.flv,.3gp,.m4v,.mpeg,.mpg';
const ALLOWED = /\.(mp4|mkv|webm|avi|mov|wmv|flv|3gp|m4v|mpeg|mpg)$/i;
const POLL_MS = 2000, TIMEOUT_MS = 10*60*1000;
function saveFile(url,name){const a=document.createElement('a');a.href=url;a.download=name||'video';document.body.appendChild(a);a.click();document.body.removeChild(a);}

export default function VideoConverter() {
  const [file,setFile]=useState(null);const [dragging,setDragging]=useState(false);
  const [format,setFormat]=useState('mp4');const [quality,setQuality]=useState('medium');
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
        else if(d.status==='error'){stopPoll();setPhase('error');setError(d.error||'Conversion failed.');}
        else pollRef.current=setTimeout(tick,POLL_MS);
      }catch{pollRef.current=setTimeout(tick,POLL_MS*2);}
    };
    tick(); return stopPoll;
  },[jobId,phase,stopPoll]);

  const resetJob=()=>{stopPoll();setJobId(null);setJobState(null);setError(null);setPhase('idle');setUploadPct(0);};
  const acceptFile=(f)=>{if(!f)return;if(!ALLOWED.test(f.name)){setError('Please select a video file.');return;}resetJob();setFile(f);};
  const handleDrop=(e)=>{e.preventDefault();setDragging(false);acceptFile(e.dataTransfer.files?.[0]);};

  const start=async()=>{
    resetJob();setPhase('uploading');setUploadPct(0);
    try{
      const form=new FormData();
      form.append('file',file);form.append('format',format);
      form.append('quality',quality);form.append('filename',file.name.replace(/\.[^.]+$/,''));
      const d=await uploadVideoForProcessing('convert-video',form,(p)=>setUploadPct(p));
      setJobId(d.jobId);setPhase('converting');
    }catch(e){setPhase('error');setError(e.message);}
  };

  const progress=phase==='uploading'?uploadPct:(jobState?.progress||0);
  const statusLabel=phase==='uploading'?`Uploading… ${uploadPct}%`:(jobState?.statusText||'Converting…');

  return (
    <section className="w-full max-w-xl flex flex-col gap-4" aria-label="Video Format Converter">
      <div><h2 className="text-white font-bold text-base">Video Format Converter</h2>
        <p className="text-zinc-500 text-xs mt-0.5">Convert video to MP4, MKV, WebM, AVI, MOV and more.</p></div>
      <div onDrop={handleDrop} onDragOver={(e)=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onClick={()=>!isWorking&&inputRef.current?.click()} role="button" tabIndex={0}
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${dragging?'border-blue-400 bg-blue-950/20':file?'border-zinc-600 bg-zinc-900':'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'} ${isWorking?'opacity-50 cursor-not-allowed pointer-events-none':'cursor-pointer'}`}>
        <input ref={inputRef} type="file" accept={ACCEPT} onChange={(e)=>acceptFile(e.target.files?.[0])} className="hidden"/>
        {file?(<div className="flex items-center justify-between gap-3"><div className="text-left overflow-hidden"><p className="text-zinc-200 text-sm font-medium truncate">{file.name}</p><p className="text-zinc-500 text-xs">{formatBytes(file.size)}</p></div>
          {!isWorking&&<button onClick={(e)=>{e.stopPropagation();setFile(null);resetJob();}} className="text-zinc-600 hover:text-zinc-400">✕</button>}</div>)
          :(<p className="text-zinc-400 text-sm font-medium">{dragging?'Drop video here':'Tap or drag a video file here'}</p>)}
      </div>
      <div><p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">Output Format</p>
        <div className="grid grid-cols-4 gap-2">{FORMATS.map(f=>(
          <button key={f.id} onClick={()=>!isWorking&&setFormat(f.id)} disabled={isWorking} aria-pressed={format===f.id}
            className={`flex flex-col items-center py-2.5 rounded-xl border text-center transition-all disabled:opacity-50 ${format===f.id?'border-blue-500 bg-blue-950 text-white':'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'}`}>
            <span className="font-bold text-sm">{f.label}</span><span className="text-xs opacity-60 mt-0.5">{f.desc}</span>
          </button>))}</div></div>
      <div><p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">Quality</p>
        <div className="flex gap-2">{QUALITIES.map(q=>(
          <button key={q.id} onClick={()=>!isWorking&&setQuality(q.id)} disabled={isWorking} aria-pressed={quality===q.id}
            className={`flex-1 flex flex-col items-center py-2.5 rounded-xl border text-center transition-all disabled:opacity-50 ${quality===q.id?'border-blue-500 bg-blue-950 text-white':'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'}`}>
            <span className="font-semibold text-sm">{q.label}</span><span className="text-xs opacity-60">{q.desc}</span>
          </button>))}</div></div>
      {!isDone&&<button onClick={start} disabled={isWorking||!file}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors">
        {isWorking?statusLabel:`Convert to ${format.toUpperCase()}`}</button>}
      {isWorking&&(<div className="flex flex-col gap-1.5">
        <div className="flex justify-between"><span className="text-zinc-300 text-xs">{statusLabel}</span><span className="text-zinc-500 text-xs">{progress>0?`${progress}%`:''}</span></div>
        <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden"><div className={`h-2 ${phase==='uploading'?'bg-blue-500':'bg-green-500'} rounded-full transition-all duration-500`} style={{width:`${progress}%`}}/></div>
      </div>)}
      {isDone&&(<div className="flex flex-col gap-2">
        <button onClick={()=>saveFile(getConverterDownloadUrl(jobState.jobId),`video.${format}`)}
          className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors">
          ✓ Download {format.toUpperCase()}{jobState?.fileSizeBytes?` (${formatBytes(jobState.fileSizeBytes)})`:''}</button>
        <button onClick={()=>{resetJob();setFile(null);}} className="text-zinc-500 hover:text-zinc-300 text-xs text-center py-1">Convert another file</button>
      </div>)}
      {isFailed&&(<div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 flex items-start gap-3">
        <span className="text-red-400 flex-shrink-0">⚠</span>
        <div><p className="text-red-300 text-xs">{error}</p>
          <button onClick={()=>{resetJob();setError(null);}} className="text-red-400 hover:text-red-300 text-xs mt-1 underline">Try again</button></div>
      </div>)}
    </section>
  );
}
