'use client'

import React, { useEffect, useRef } from 'react';

interface CustomCursorProps {
  size?: number;
  color?: string;
  dotSize?: number;
  dotColor?: string;
}

const CustomCursor: React.FC<CustomCursorProps> = ({
  size = 30,
  color = '#8b5cf6',
  dotSize = 4,
  dotColor = '#ffffff',
}) => {
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (cursorRef.current) {
        // Get the cursor's position relative to the viewport
        const x = e.clientX;
        const y = e.clientY;

        // Add scroll position to get the absolute position
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;

        cursorRef.current.style.left = `${x + scrollX}px`;
        cursorRef.current.style.top = `${y + scrollY}px`;
      }
    };

    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      className="fixed rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none z-[9999] mix-blend-difference"
      style={{ 
        width: `${size}px`, 
        height: `${size}px`,
        backgroundColor: color 
      }}
    >
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ 
          width: `${dotSize}px`, 
          height: `${dotSize}px`,
          backgroundColor: dotColor 
        }}
      />
    </div>
  );
};

export default CustomCursor;