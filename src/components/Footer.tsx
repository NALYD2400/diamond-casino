import React from 'react';
import { Link } from '@tanstack/react-router';
import type { AppView } from './Navbar';
import { useCasinoUser } from '../context/CasinoUserContext';

interface FooterProps {
  setCurrentView?: (view: AppView) => void;
}

export const Footer: React.FC<FooterProps> = ({ setCurrentView }) => {
  const { user } = useCasinoUser();
  const isAdmin = user?.role === 'DÉVELOPPEUR' || user?.role === 'DIRECTEUR CASINO';

  return (
    <footer id="contact" className="py-14 px-6 sm:px-12 border-t border-white/10 bg-black flex flex-col md:flex-row items-center justify-between gap-6">
      <Link to="/" className="flex items-center gap-4 group">
        <img
          src="/diamond_casino_logo.png"
          alt="The Diamond Casino & Resort"
          className="h-8 w-auto object-contain transition-transform group-hover:scale-105"
        />
        <span className="font-['Geist_Mono'] text-xs text-neutral-400">
          © 2026 THE DIAMOND CASINO &amp; RESORT // LOS SANTOS FIVEM RP. ALL RIGHTS RESERVED.
        </span>
      </Link>

      <div className="flex flex-wrap items-center gap-6 sm:gap-8 text-xs font-['Geist_Mono'] text-neutral-400">
        <Link 
          to="/roue-de-la-fortune"
          onClick={() => setCurrentView?.('lucky-wheel')}
          className="hover:text-amber-400 transition-colors"
        >
          ROUE DE LA FORTUNE
        </Link>
        <Link 
          to="/abonnements"
          className="hover:text-amber-400 transition-colors"
        >
          ABONNEMENTS VIP
        </Link>
        <Link 
          to="/espace-membre"
          onClick={() => setCurrentView?.('member-portal')}
          className="hover:text-white transition-colors"
        >
          ESPACE MEMBRE
        </Link>
        {isAdmin && (
          <Link 
            to="/admin"
            className="hover:text-amber-400 text-neutral-400 transition-colors"
          >
            CONSOLE GÉRANCE
          </Link>
        )}
        <Link 
          to="/404"
          onClick={() => setCurrentView?.('404')}
          className="hover:text-white transition-colors"
        >
          STATUS: 404
        </Link>
      </div>
    </footer>
  );
};
