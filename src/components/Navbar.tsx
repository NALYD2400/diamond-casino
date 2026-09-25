import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { X, User, Disc } from 'lucide-react';
import { useCasinoUser } from '../context/CasinoUserContext';

export type AppView = 'landing' | 'member-portal' | 'lucky-wheel' | '404';

interface NavbarProps {
  currentView?: AppView;
  setCurrentView?: (view: AppView) => void;
  mobileMenuOpen?: boolean;
  setMobileMenuOpen?: (val: boolean) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView: propCurrentView,
  setCurrentView,
  mobileMenuOpen: propMobileMenuOpen,
  setMobileMenuOpen: propSetMobileMenuOpen,
}) => {
  const { user, isAuthenticated } = useCasinoUser();
  const location = useLocation();
  const navigate = useNavigate();

  const [internalMenuOpen, setInternalMenuOpen] = useState<boolean>(false);
  const isMenuOpen = propMobileMenuOpen !== undefined ? propMobileMenuOpen : internalMenuOpen;
  const setMenuOpen = propSetMobileMenuOpen || setInternalMenuOpen;

  // Determine current active route
  const currentPath = location.pathname;
  const isHome = currentPath === '/' || propCurrentView === 'landing';
  const isWheel = currentPath === '/roue-de-la-fortune' || propCurrentView === 'lucky-wheel';
  const isVip = currentPath === '/abonnements';
  const isGames = currentPath === '/jeux' || currentPath === '/mines';
  const isMember = currentPath === '/espace-membre' || propCurrentView === 'member-portal';

  const handleSectionScroll = (sectionId: string) => {
    setMenuOpen(false);
    if (currentPath !== '/') {
      navigate({ to: '/' }).then(() => {
        setTimeout(() => {
          const el = document.getElementById(sectionId);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      });
    } else {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
    setCurrentView?.('landing');
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 h-[80px] sm:h-[90px] px-6 sm:px-12 flex items-center justify-between pointer-events-none backdrop-blur-md bg-black/50 border-b border-white/10">
        <div className="flex items-center gap-6 sm:gap-10 pointer-events-auto">
          {/* Official Diamond Casino Logo Brand */}
          <Link
            to="/"
            onClick={() => {
              setMenuOpen(false);
              setCurrentView?.('landing');
            }}
            className="flex items-center gap-3 group transition-transform duration-300 hover:scale-105 cursor-pointer bg-transparent border-none p-0"
            aria-label="The Diamond Casino & Resort Home"
          >
            <img
              src="/diamond_casino_logo.png"
              alt="The Diamond Casino & Resort"
              className="h-9 sm:h-11 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
            />
          </Link>

          {/* Primary Nav */}
          <nav className="hidden lg:flex items-center gap-8 text-[15px] tracking-tight">
            <Link
              to="/"
              onClick={() => setCurrentView?.('landing')}
              className={`font-medium transition-colors cursor-pointer ${
                isHome && !isWheel && !isVip && !isMember && !isGames
                  ? 'text-white font-semibold'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              Accueil
            </Link>
            
            <Link
              to="/jeux"
              className={`font-medium transition-colors cursor-pointer ${
                isGames ? 'text-amber-400 font-semibold' : 'text-white/70 hover:text-white'
              }`}
            >
              Jeux
            </Link>

            {/* Clean Roue de la Fortune Nav Link */}
            <Link
              to="/roue-de-la-fortune"
              onClick={() => setCurrentView?.('lucky-wheel')}
              className={`font-medium transition-colors cursor-pointer ${
                isWheel ? 'text-amber-400 font-semibold' : 'text-white/70 hover:text-white'
              }`}
            >
              Roue de la Fortune
            </Link>

            {/* Clean Abonnements VIP Nav Link */}
            <Link
              to="/abonnements"
              className={`font-medium transition-colors cursor-pointer ${
                location.pathname === '/abonnements' ? 'text-amber-400 font-semibold' : 'text-white/70 hover:text-white'
              }`}
            >
              Abonnements VIP
            </Link>
          </nav>
        </div>

        {/* Right Action: Discord icon + Espace Membre + Mobile toggle */}
        <div className="flex items-center gap-3 sm:gap-4 pointer-events-auto">
          {/* Discord Icon */}
          <a
            href="https://discord.gg/patvwjhNzK"
            target="_blank"
            rel="noopener noreferrer"
            className="liquid-glass w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors"
            aria-label="Discord"
            title="Rejoindre la communauté Discord"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </a>

          {/* Member Status Pill or Login Button */}
          {isAuthenticated && user ? (
            <Link
              to="/espace-membre"
              onClick={() => {
                setMenuOpen(false);
                setCurrentView?.('member-portal');
              }}
              className={`flex items-center gap-2.5 bg-neutral-900 border text-white rounded-full px-4 sm:px-5 py-2 hover:border-amber-400/80 transition-all cursor-pointer shadow-[0_0_20px_rgba(255,255,255,0.1)] ${
                isMember ? 'border-amber-400 ring-1 ring-amber-400/40' : 'border-white/20'
              }`}
            >
              <img
                src={user.avatarUrl}
                alt={user.rpFirstName}
                className="w-6 h-6 rounded-full object-cover border border-amber-400"
              />
              <span className="text-xs sm:text-sm font-semibold tracking-wide">
                {user.rpFirstName} <span className="text-neutral-400 font-normal">| {user.citizenId}</span>
              </span>
            </Link>
          ) : (
            <Link
              to="/espace-membre"
              onClick={() => {
                setMenuOpen(false);
                setCurrentView?.('member-portal');
              }}
              className="flex items-center justify-center gap-2 bg-white text-black font-semibold text-xs sm:text-sm tracking-wide rounded-full px-5 sm:px-7 py-2.5 sm:py-3 transition-transform duration-200 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.25)] cursor-pointer"
            >
              <User size={14} />
              <span>Espace Membre</span>
            </Link>
          )}

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMenuOpen(!isMenuOpen)}
            className="lg:hidden p-2 rounded-full border border-white/20 text-white bg-white/5 cursor-pointer"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X size={20} /> : (
              <svg viewBox="0 0 24 24" className="w-5 h-5 stroke-white stroke-2 fill-none">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-0 top-[80px] bg-black/95 backdrop-blur-2xl border-b border-white/10 z-40 p-6 flex flex-col gap-4 lg:hidden"
          >
            <Link
              to="/"
              onClick={() => {
                setMenuOpen(false);
                setCurrentView?.('landing');
              }}
              className="text-left text-lg font-medium text-white/90 hover:text-white"
            >
              Accueil
            </Link>
            <Link
              to="/jeux"
              onClick={() => setMenuOpen(false)}
              className="text-left text-lg font-medium text-white/90 hover:text-white"
            >
              Jeux
            </Link>
            <Link
              to="/roue-de-la-fortune"
              onClick={() => {
                setMenuOpen(false);
                setCurrentView?.('lucky-wheel');
              }}
              className="text-left text-lg font-medium text-white/90 hover:text-white"
            >
              Roue de la Fortune
            </Link>
            <Link
              to="/abonnements"
              onClick={() => {
                setMenuOpen(false);
              }}
              className="text-left text-lg font-medium text-white/90 hover:text-white"
            >
              Abonnements VIP
            </Link>
            <Link
              to="/espace-membre"
              onClick={() => {
                setMenuOpen(false);
                setCurrentView?.('member-portal');
              }}
              className="text-left text-lg font-medium text-white/90 hover:text-white border-t border-white/10 pt-3 flex items-center gap-2"
            >
              <User size={18} /> {isAuthenticated && user ? `Espace Client (${user.rpFirstName})` : 'Espace Membre (Connexion Discord)'}
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
