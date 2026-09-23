import React from 'react';

interface FooterProps {
  setView404: (val: boolean) => void;
}

export const Footer: React.FC<FooterProps> = ({ setView404 }) => {
  return (
    <footer id="contact" className="py-14 px-6 sm:px-12 border-t border-white/10 bg-black flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-4">
        <img
          src="/diamond_casino_logo.png"
          alt="The Diamond Casino & Resort"
          className="h-8 w-auto object-contain"
        />
        <span className="font-['Geist_Mono'] text-xs text-neutral-400">
          © 2026 THE DIAMOND CASINO & RESORT. ALL RIGHTS RESERVED.
        </span>
      </div>

      <div className="flex items-center gap-8 text-xs font-['Geist_Mono'] text-neutral-400">
        <button onClick={() => setView404(true)} className="hover:text-white transition-colors cursor-pointer">
          SYSTEM STATUS: 404
        </button>
        <a href="#home" className="hover:text-white transition-colors">
          TERMS
        </a>
        <a href="#home" className="hover:text-white transition-colors">
          PRIVACY ENCLAVE
        </a>
      </div>
    </footer>
  );
};
