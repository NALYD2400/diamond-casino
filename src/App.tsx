import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { Discovery } from './components/Discovery';
import { Mission } from './components/Mission';
import { Architecture } from './components/Architecture';
import { Gallery } from './components/Gallery';
import { CtaStream } from './components/CtaStream';
import { Footer } from './components/Footer';
import { NotFound } from './components/NotFound';

export default function App() {
  const [view404, setView404] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans">
      {/* 1. Orbit Precision Navbar */}
      <Navbar
        view404={view404}
        setView404={setView404}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* Switch between 404 View and Main Landing Page */}
      <AnimatePresence mode="wait">
        {view404 ? (
          <NotFound onReturn={() => setView404(false)} />
        ) : (
          <motion.div
            key="landing-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* 2. Hero Section */}
            <Hero />

            {/* 3. "Search has changed" Section */}
            <Discovery />

            {/* 4. Mission Section with Scroll-driven Reveal */}
            <Mission />

            {/* 5. Benefits & Architecture Grid */}
            <Architecture />

            {/* 6. Vault Visual Archive */}
            <Gallery />

            {/* 7. CTA Section with HLS Streaming Background */}
            <CtaStream view404={view404} />

            {/* 8. Footer */}
            <Footer setView404={setView404} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
