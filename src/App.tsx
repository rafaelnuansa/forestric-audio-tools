import React, { useState, useRef, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { 
  AudioWaveform, 
  Upload, 
  Play, 
  Square, 
  Download, 
  RefreshCcw, 
  Zap, 
  Activity,
  ShieldCheck,
  Volume2,
  Trash2,
  Timer
} from 'lucide-react';
import { Mp3Encoder } from '@breezystack/lamejs';

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1.0);
  const [mode, setMode] = useState<'standard' | 'smooth'>('standard'); 
  
  const audioContext = useRef<AudioContext | null>(null);
  const sourceNode = useRef<AudioBufferSourceNode | null>(null);
  const gainNode = useRef<GainNode | null>(null);
  const analyserNode = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const isDragging = useRef<'start' | 'end' | null>(null);

  const duration = audioBuffer ? audioBuffer.duration : 0;

  const secondsToMMSS = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(2);
    return { m, s: parseFloat(s) };
  };

  const mmssToSeconds = (m: string | number, s: string | number) => {
    return (parseInt(m as string) || 0) * 60 + (parseFloat(s as string) || 0);
  };

  useEffect(() => {
    if (gainNode.current && audioContext.current) {
      gainNode.current.gain.setTargetAtTime(volume, audioContext.current.currentTime, 0.01);
    }
  }, [volume]);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    // Validasi Manual: Pastikan file adalah audio
    if (!uploadedFile.type.startsWith('audio/') && 
        !['.mp3', '.wav', '.m4a', '.ogg'].some(ext => uploadedFile.name.toLowerCase().endsWith(ext))) {
      alert("Format file tidak didukung. Silakan pilih file audio (MP3/WAV/M4A).");
      return;
    }

    if (!audioContext.current) {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
    }

    try {
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const decodedBuffer = await audioContext.current.decodeAudioData(arrayBuffer);
      
      setFile(uploadedFile);
      setAudioBuffer(decodedBuffer);
      setStartTime(0);
      setEndTime(decodedBuffer.duration);
    } catch (err) {
      alert("Gagal memproses audio. File mungkin rusak atau tidak didukung.");
    }
  };

  const drawStaticWave = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, buffer: AudioBuffer) => {
    const data = buffer.getChannelData(0);
    const step = Math.ceil(data.length / canvas.width);
    const amp = canvas.height / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    for (let i = 0; i < canvas.width; i++) {
      let min = 1.0, max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }
    const startX = (startTime / buffer.duration) * canvas.width;
    const endX = (endTime / buffer.duration) * canvas.width;
    ctx.fillStyle = 'rgba(209, 58, 22, 0.15)';
    ctx.fillRect(startX, 0, endX - startX, canvas.height);
    ctx.fillStyle = '#d13a16';
    ctx.fillRect(startX - 2, 0, 4, canvas.height);
    ctx.fillRect(endX - 2, 0, 4, canvas.height);
  };

  const drawBase = () => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStaticWave(ctx, canvas, audioBuffer);
  };

  useEffect(() => { if (audioBuffer) drawBase(); }, [startTime, endTime, audioBuffer]);

  const updateCropPosition = (clientX: number) => {
    if (!canvasRef.current || !audioBuffer || !isDragging.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const newTime = (x / rect.width) * audioBuffer.duration;

    if (isDragging.current === 'start') {
      setStartTime(Math.min(newTime, endTime - 0.1));
    } else {
      setEndTime(Math.max(newTime, startTime + 0.1));
    }
  };

  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      updateCropPosition(clientX);
    };
    const handleGlobalUp = () => { isDragging.current = null; };
    window.addEventListener('mousemove', handleGlobalMove);
    window.addEventListener('touchmove', handleGlobalMove, { passive: false });
    window.addEventListener('mouseup', handleGlobalUp);
    window.addEventListener('touchend', handleGlobalUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMove);
      window.removeEventListener('touchmove', handleGlobalMove);
      window.removeEventListener('mouseup', handleGlobalUp);
      window.removeEventListener('touchend', handleGlobalUp);
    };
  }, [startTime, endTime, audioBuffer]);

  const handleStartDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!audioBuffer || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const x = clientX - rect.left;
    const clickedTime = (x / rect.width) * audioBuffer.duration;
    const distStart = Math.abs(clickedTime - startTime);
    const distEnd = Math.abs(clickedTime - endTime);
    isDragging.current = distStart < distEnd ? 'start' : 'end';
    updateCropPosition(clientX);
  };

  const togglePlayback = () => {
    if (isPlaying) {
      if (sourceNode.current) {
        sourceNode.current.stop();
        sourceNode.current.disconnect();
      }
      setIsPlaying(false);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    } else {
      if (!audioContext.current || !audioBuffer || !canvasRef.current) return;
      sourceNode.current = audioContext.current.createBufferSource();
      sourceNode.current.buffer = audioBuffer;
      sourceNode.current.playbackRate.value = mode === 'standard' ? 2.5 : 2.0;
      gainNode.current = audioContext.current.createGain();
      gainNode.current.gain.value = volume;
      analyserNode.current = audioContext.current.createAnalyser();
      analyserNode.current.fftSize = 512;
      sourceNode.current.connect(gainNode.current);
      gainNode.current.connect(analyserNode.current);
      analyserNode.current.connect(audioContext.current.destination);
      sourceNode.current.start(0, startTime, endTime - startTime);
      setIsPlaying(true);
      const render = () => {
        if (!analyserNode.current || !canvasRef.current) return;
        const data = new Uint8Array(analyserNode.current.frequencyBinCount);
        analyserNode.current.getByteFrequencyData(data);
        drawBase();
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        ctx.beginPath(); ctx.lineWidth = 3; ctx.strokeStyle = '#d13a16';
        const sw = canvasRef.current.width / data.length;
        let x = 0;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] / 128.0; const y = (v * canvasRef.current.height) / 2.5;
          if (i === 0) ctx.moveTo(x, canvasRef.current.height/2 - y/2);
          else ctx.quadraticCurveTo(x-sw/2, canvasRef.current.height/2-(data[i-1]/128*canvasRef.current.height)/2.5, x, canvasRef.current.height/2-y/2);
          x += sw;
        }
        ctx.stroke();
        animationRef.current = requestAnimationFrame(render);
      };
      render();
      sourceNode.current.onended = () => { 
        setIsPlaying(false); 
        if (animationRef.current) cancelAnimationFrame(animationRef.current); 
      };
    }
  };

  const exportAudio = async () => {
    if (!audioBuffer || !file) return;
    setIsExporting(true);
    try {
      const speed = mode === 'standard' ? 2.5 : 2.0;
      const croppedDuration = endTime - startTime;
      const outputDuration = croppedDuration / speed;
      const offline = new OfflineAudioContext(audioBuffer.numberOfChannels, Math.floor(outputDuration * audioBuffer.sampleRate), audioBuffer.sampleRate);
      const source = offline.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = speed;
      const gain = offline.createGain();
      gain.gain.value = volume;
      source.connect(gain);
      gain.connect(offline.destination);
      source.start(0, startTime, croppedDuration);
      const rendered = await offline.startRendering();
      const mp3encoder = new Mp3Encoder(rendered.numberOfChannels, rendered.sampleRate, 128);
      const mp3Data: Uint8Array[] = [];
      const left = rendered.getChannelData(0);
      const right = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : left;
      const floatToInt16 = (chanData: Float32Array) => {
        const l = chanData.length;
        const r = new Int16Array(l);
        for (let i = 0; i < l; i++) {
          const s = Math.max(-1, Math.min(1, chanData[i]));
          r[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return r;
      };
      const leftInt16 = floatToInt16(left);
      const rightInt16 = floatToInt16(right);
      const sampleBlockSize = 1152;
      for (let i = 0; i < leftInt16.length; i += sampleBlockSize) {
        const mp3buf = mp3encoder.encodeBuffer(leftInt16.subarray(i, i + sampleBlockSize), rightInt16.subarray(i, i + sampleBlockSize));
        if (mp3buf.length > 0) mp3Data.push(new Uint8Array(mp3buf));
      }
      const endBuf = mp3encoder.flush();
      if (endBuf.length > 0) mp3Data.push(new Uint8Array(endBuf));
      const blob = new Blob(mp3Data, { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${file.name.replace(/\.[^/.]+$/, "")}_forestric.mp3`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Render Error: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsExporting(false);
    }
  };

  const startMMSS = secondsToMMSS(startTime);
  const endMMSS = secondsToMMSS(endTime);

  return (
    <div className="min-h-screen bg-[#09090a] flex items-center justify-center p-4 text-white font-sans selection:bg-[#d13a16]/30">
      <div className="max-w-2xl w-full bg-[#131314] border border-white/5 rounded-[3rem] shadow-2xl overflow-hidden shadow-black">
        
        <div className="px-8 py-6 flex items-center justify-between bg-white/[0.01] border-b border-white/5">
          <div className="flex items-center gap-2">
            <AudioWaveform className="text-[#d13a16]" size={28} />
            <span className="ml-4 text-sm font-bold text-white">Forestric Roblox Audio Studio</span>
          </div>
          {file && (
            <button onClick={() => window.location.reload()} className="text-white/10 hover:text-[#d13a16] transition-colors p-2">
              <Trash2 size={18} />
            </button>
          )}
        </div>

        <div className="p-8 md:p-10">
          {!file ? (
            <div className="py-24 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[2.5rem] hover:border-[#d13a16]/40 transition-all group bg-white/[0.01] relative cursor-pointer">
              {/* TRIK PAMUNGKAS: Gunakan accept umum untuk memancing File Manager */}
              <input 
                type="file" 
                accept="*" 
                onChange={handleFileUpload} 
                className="absolute inset-0 opacity-0 cursor-pointer z-10" 
              />
              <Upload size={62} className="text-white/10 group-hover:text-[#d13a16] transition-colors" />
              <h3 className="text-lg font-bold mt-3 ">Import Audio Track</h3>
              <p className="text-[10px] font-bold text-white uppercase mt-2 font-mono">Ready for Roblox Pitching</p>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="space-y-4">
                <div className="flex justify-between items-end px-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">Waveform Selection</span>
                    <h4 className="text-xs font-bold truncate max-w-[180px] text-white/50">{file.name}</h4>
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/20 italic font-mono">
                      Total: {secondsToMMSS(duration).m}m {secondsToMMSS(duration).s}s
                    </span>
                  </div>
                </div>
                <div className="relative bg-black/40 rounded-[2.5rem] p-8 border border-white/5 cursor-ew-resize overflow-hidden shadow-inner group touch-none">
                  <canvas ref={canvasRef} width={1200} height={200} className="w-full h-32 md:h-44" onMouseDown={handleStartDrag} onTouchStart={handleStartDrag} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setMode('standard')} className={`flex items-center gap-4 p-5 rounded-[2.2rem] border-2 transition-all ${mode === 'standard' ? 'border-[#d13a16] bg-[#d13a16]/5 shadow-[0_0_20px_rgba(209,58,22,0.1)]' : 'border-white/5 bg-white/[0.01]'}`}>
                  <div className={`p-3 rounded-2xl ${mode === 'standard' ? 'bg-[#d13a16] text-white' : 'bg-white/5 text-white/20'}`}><Zap size={18} /></div>
                  <div className="text-left leading-tight">
                    <p className={`font-bold text-xs ${mode === 'standard' ? 'text-[#d13a16]' : 'text-white/60'}`}>Days Render</p>
                    <p className="text-[9px] font-bold text-white/20 uppercase mt-1">2.5x / 150% Pitch</p>
                    <p className="text-[9px] font-bold text-white/20 mt-1">;music ... pitch 0.40</p>
                  </div>
                </button>
                <button onClick={() => setMode('smooth')} className={`flex items-center gap-4 p-5 rounded-[2.2rem] border-2 transition-all ${mode === 'smooth' ? 'border-[#d13a16] bg-[#d13a16]/5 shadow-[0_0_20px_rgba(209,58,22,0.1)]' : 'border-white/5 bg-white/[0.01]'}`}>
                  <div className={`p-3 rounded-2xl ${mode === 'smooth' ? 'bg-[#d13a16] text-white' : 'bg-white/5 text-white/20'}`}><Activity size={18} /></div>
                  <div className="text-left leading-tight">
                    <p className={`font-bold text-xs ${mode === 'smooth' ? 'text-[#d13a16]' : 'text-white/60'}`}>Abiw Render</p>
                    <p className="text-[9px] font-bold text-white/20 uppercase mt-1">200% / 12 Semitones</p>
                    <p className="text-[9px] font-bold text-white/20 mt-1">;music ... pitch 0.49</p>
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/[0.02] p-6 rounded-[2.2rem] border border-white/5 space-y-4">
                  <div className="flex items-center gap-2 px-1"><Timer size={14} className="text-[#d13a16]" /><span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Manual Crop Tool</span></div>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-4"><span className="text-[9px] font-bold uppercase text-white/20 w-12 italic">Start</span><div className="flex flex-1 items-center gap-2"><input type="number" value={startMMSS.m} onChange={(e) => setStartTime(mmssToSeconds(e.target.value, startMMSS.s))} className="w-full bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono text-white/80 outline-none focus:border-[#d13a16]/50 text-center" /><span className="text-white/20">:</span><input type="number" step="0.1" value={startMMSS.s} onChange={(e) => setStartTime(mmssToSeconds(startMMSS.m, e.target.value))} className="w-full bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono text-white/80 outline-none focus:border-[#d13a16]/50 text-center" /></div></div>
                    <div className="flex items-center justify-between gap-4"><span className="text-[9px] font-bold uppercase text-white/20 w-12 italic">End</span><div className="flex flex-1 items-center gap-2"><input type="number" value={endMMSS.m} onChange={(e) => setEndTime(mmssToSeconds(e.target.value, endMMSS.s))} className="w-full bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono text-white/80 outline-none focus:border-[#d13a16]/50 text-center" /><span className="text-white/20">:</span><input type="number" step="0.1" value={endMMSS.s} onChange={(e) => setEndTime(mmssToSeconds(endMMSS.m, e.target.value))} className="w-full bg-black/30 border border-white/5 rounded-xl px-3 py-2 text-xs font-mono text-white/80 outline-none focus:border-[#d13a16]/50 text-center" /></div></div>
                  </div>
                </div>
                <div className="bg-white/[0.02] p-6 rounded-[2.2rem] border border-white/5 flex flex-col justify-center">
                  <div className="flex justify-between items-center mb-4 px-1"><span className="text-[10px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-2"><Volume2 size={14} /> Master Gain</span><span className="text-xs font-bold text-[#d13a16] font-mono">{volume.toFixed(2)}x</span></div>
                  <input type="range" min="0" max="2" step="0.05" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-full accent-[#d13a16] h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 pt-6 border-t border-white/5">
                <button onClick={togglePlayback} className="flex-1 flex items-center justify-center gap-4 bg-white text-black px-8 py-5 rounded-[2.2rem] font-bold hover:bg-[#d13a16] hover:text-white transition-all active:scale-95 shadow-xl">
                  {isPlaying ? <Square size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                  <span className="uppercase tracking-[0.2em] text-[10px] font-black">{isPlaying ? 'Stop' : 'Preview'}</span>
                </button>
                <button onClick={exportAudio} disabled={isExporting} className="flex-1 flex items-center justify-center gap-4 bg-[#d13a16] text-white px-8 py-5 rounded-[2.2rem] font-bold hover:bg-[#a12b11] transition-all shadow-lg active:scale-95 disabled:bg-white/5">
                  {isExporting ? <RefreshCcw size={18} className="animate-spin" /> : <Download size={18} />}
                  <span className="uppercase tracking-[0.2em] text-[10px] font-black">{isExporting ? 'Encoding' : 'Download MP3'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-10 py-6 bg-black/30 flex flex-col md:flex-row justify-between items-center gap-4 text-[9px] font-bold text-white">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 font-black tracking-tighter "><ShieldCheck size={10} /> Tools by rafaelnuansa</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;