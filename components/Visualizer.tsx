import React, { useEffect, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';

export const Visualizer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = audioEngine.getAnalyser();

    const render = () => {
      // Clear with fade effect for trails
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!analyser) {
         // Static line when idle
         ctx.strokeStyle = '#333';
         ctx.lineWidth = 1;
         ctx.beginPath();
         ctx.moveTo(0, canvas.height/2);
         ctx.lineTo(canvas.width, canvas.height/2);
         ctx.stroke();
         animationId = requestAnimationFrame(render);
         return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        // Dynamic Gradient
        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, '#ff0055'); 
        gradient.addColorStop(0.5, '#b026ff'); 
        gradient.addColorStop(1, '#39ff14'); 

        ctx.fillStyle = gradient;
        
        // Random glitch horizontal offset
        const glitch = Math.random() > 0.99 ? (Math.random() - 0.5) * 20 : 0;
        
        ctx.fillRect(x + glitch, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    const resizeObserver = new ResizeObserver(() => {
      const el = containerRef.current;
      const canvas = canvasRef.current;
      if (!el || !canvas) return;
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(rect.width * dpr);
      const h = Math.floor(128 * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-32 relative overflow-hidden bg-black/50">
      <div className="absolute top-1 left-2 text-[9px] text-[#39ff14] z-10 font-bold bg-black/80 px-1 border border-[#39ff14]/30">VISUAL_FEED_v9.2</div>
      {/* Grid overlay on top of canvas for retro feel */}
      <div className="absolute inset-0 z-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCI+PHBhdGggZD0iTTEwIDBMMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSg1NywgMjU1LCAyMCwgMC4xKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+')] pointer-events-none opacity-50"></div>
      
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={128} 
        className="w-full h-full block"
      />
    </div>
  );
};