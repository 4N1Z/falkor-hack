import { cn } from '@/lib/utils';
import React from 'react';

interface CardProps {
  text: string;
  className?: string;
  emoji: string;
}

const HeroFeatureCard: React.FC<CardProps> = ({ text, className, emoji }) => {
  return (
    <div className={cn(` w-fit flex gap-1 items-center justify-center rounded-sm px-2 h-fit `, className)}>
      {emoji} 
      <p className="text-xs">{text}</p>
    </div>
  );
};

export default HeroFeatureCard; 