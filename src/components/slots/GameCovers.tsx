import React from 'react';
import { DogSymbol } from '../doghouse/DogSymbols';
import { WantedSymbol } from '../wanted/WantedSymbols';

export const DogHouseCover: React.FC = () => (
  <div className="absolute inset-0 bg-[linear-gradient(180deg,#3fa9f5_0%,#8fd3ff_55%,#7ed957_55%,#2d7d27_100%)]">
    <div className="absolute top-[8%] right-[10%] w-10 h-10 rounded-full bg-[#ffe14a] shadow-[0_0_30px_10px_rgba(255,240,150,0.6)]" />
    <div className="absolute top-[14%] left-[6%] w-20 h-6 rounded-full bg-white/90" />
    <div className="absolute inset-x-[14%] top-[20%] bottom-[30%] drop-shadow-[0_8px_0_rgba(0,0,0,0.25)]">
      <DogSymbol id="wild" multiplier={3} />
    </div>
    <div className="absolute left-[4%] bottom-[20%] w-[34%] aspect-square -rotate-6">
      <DogSymbol id="shihtzu" />
    </div>
    <div className="absolute right-[4%] bottom-[20%] w-[34%] aspect-square rotate-6">
      <DogSymbol id="scatter" />
    </div>
    <div className="absolute inset-x-0 bottom-[5%] text-center dh-font-xl text-[clamp(18px,2.2vw,26px)] leading-none text-[#ffb300] [-webkit-text-stroke:1.5px_#3b1d0e] drop-shadow-[0_3px_0_#3b1d0e]">
      THE DOG HOUSE
    </div>
  </div>
);

export const WantedCover: React.FC = () => (
  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,#e8482a_0%,#b8231a_45%,#3a0a06_100%)]">
    <div className="absolute -left-6 top-[10%] w-24 h-24 rounded-full bg-[#f5d86a] opacity-90" />
    <div className="absolute inset-x-[18%] top-[16%] aspect-square drop-shadow-[0_6px_0_rgba(0,0,0,0.35)]">
      <WantedSymbol id="vs" />
    </div>
    <div className="absolute left-[5%] bottom-[22%] w-[34%] aspect-square -rotate-6">
      <WantedSymbol id="skull" />
    </div>
    <div className="absolute right-[5%] bottom-[22%] w-[34%] aspect-square rotate-6">
      <WantedSymbol id="wild" />
    </div>
    <div className="absolute inset-x-0 bottom-[5%] text-center font-['Rye'] text-[clamp(20px,2.4vw,30px)] leading-none text-[#e0b040] [-webkit-text-stroke:1.5px_#1c120c] drop-shadow-[0_3px_0_#1c120c]">
      WANTED
    </div>
  </div>
);
