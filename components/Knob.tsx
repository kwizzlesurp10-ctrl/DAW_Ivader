import React, { useState, useEffect, useCallback } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  color?: string; // Expecting class names like "text-[#39ff14]"
}

export const Knob: React.FC<KnobProps> = ({ 
  label, value, min, max, step = 0.01, onChange, color = "text-[#39ff14]" 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startValue, setStartValue] = useState(0);

  // Extract hex color from class prop for SVG usage
  const getHexColor = () => {
      if (color.includes("#39ff14")) return "#39ff14";
      if (color.includes("#b026ff")) return "#b026ff";
      if (color.includes("#ff0055")) return "#ff0055";
      return "#39ff14";
  };

  const hexColor = getHexColor();

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStartY(e.clientY);
    setStartValue(value);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY;
    const range = max - min;
    const deltaVal = (deltaY / 100) * range; 
    let newValue = startValue + deltaVal;
    
    if (newValue < min) newValue = min;
    if (newValue > max) newValue = max;
    
    newValue = Math.round(newValue / step) * step;
    onChange(newValue);
  }, [isDragging, startY, startValue, min, max, step, onChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const range = max - min;
  const percentage = range === 0 ? 0 : (value - min) / range;
  const rotation = -135 + (percentage * 270);

  return (
    <div className="flex flex-col items-center justify-center m-1 select-none group">
      <div 
        className="knob-container cursor-ns-resize relative w-[50px] h-[50px]"
        onMouseDown={handleMouseDown}
      >
        <svg width="50" height="50" viewBox="0 0 100 100" className="absolute top-0 left-0 pointer-events-none drop-shadow-[0_0_2px_rgba(0,0,0,1)]">
          {/* Background Track */}
          <circle cx="50" cy="50" r="42" stroke="#1a1a20" strokeWidth="8" fill="transparent" strokeDasharray="251.2" strokeDashoffset="62.8" transform="rotate(135 50 50)" />
          
          {/* Value Arc with Glow */}
          <circle 
            cx="50" cy="50" r="42" 
            stroke={hexColor} 
            strokeWidth="8" 
            fill="transparent" 
            strokeDasharray="251.2" 
            strokeDashoffset={251.2 - (percentage * (251.2 * 0.75))}
            transform="rotate(135 50 50)"
            className="transition-all duration-75"
            style={{ filter: `drop-shadow(0 0 4px ${hexColor})` }}
          />
        </svg>

        {/* Knob Cap */}
        <div 
          className="absolute inset-[15%] rounded-full border border-gray-700 bg-gradient-to-br from-gray-800 to-black shadow-lg flex items-center justify-center transition-transform duration-75 group-hover:border-gray-500"
          style={{ transform: `rotate(${rotation}deg)` }}
        >
           {/* Indicator Line */}
          <div className={`w-1 h-3 absolute top-1 ${color.replace('text-', 'bg-')} rounded-full shadow-[0_0_5px_currentColor]`}></div>
        </div>
      </div>
      
      <div className={`text-[10px] mt-1 font-mono font-bold ${color} opacity-80 group-hover:opacity-100 transition-opacity`}>{label}</div>
      <div className="text-[9px] text-gray-600 bg-black/50 px-1 rounded">{value.toFixed(2)}</div>
    </div>
  );
};