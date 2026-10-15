
import Header from '@/components/landing/header';
import React from 'react';
import { Playfair_Display } from 'next/font/google';

const playfair = Playfair_Display({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-playfair',
});

const HomePageLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className={`w-full font-sans tracking-4 ${playfair.variable} box-border `}>
      {children}
    </main>
  );
};

export default HomePageLayout;