import React, { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, X, Sparkles, RefreshCw } from 'lucide-react';
import Hls from 'hls.js';

const fadeUp = (delay: number = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.7, delay, ease: "easeOut" as const }
});

const GALLERY_IMAGES = [
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_104530_521b2f85-c0f3-4d0e-9704-b578315b4cb9.png&w=1920&q=85",
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103711_76ccdb8b-5043-4f47-9c54-4379713393ea.png&w=1920&q=85",
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103728_394f6a1b-85e2-4386-a4f6-408472a0a5b7.png&w=1920&q=85",
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103739_86743e0e-16a7-4bee-bf38-dd67985344dc.png&w=1920&q=85",
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103748_b2215dc8-a3a7-470d-b19a-5b87fa7d0c37.png&w=1920&q=85",
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103758_e919ce72-5c9d-4b87-9be6-d7647b34825c.png&w=1920&q=85",
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103808_013583d0-3386-4547-9832-37c7d8edb3ac.png&w=1920&q=85",
  "https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20260629_103937_a0c49d0a-33eb-4ead-aea6-c1baf241acbc.png&w=1920&q=85",
];

export default function App() {
  const [view404, setView404] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [subscribed, setSubscribed] = useState<boolean>(false);
  const [emailInput, setEmailInput] = useState<string>('');
  
  const ctaVideoRef = useRef<HTMLVideoElement>(null);
  const missionSectionRef = useRef<HTMLDivElement>(null);

  // Hls.js stream loading for CTA section from mindloop
  useEffect(() => {
    if (view404) return;
    const video = ctaVideoRef.current;
    if (!video) return;

    const src = 'https://stream.mux.com/8wrHPCX2dC3msyYU9ObwqNdm00u3ViXvOSHUMRYSEe5Q.m3u8';
    let hlsInstance: Hls | null = null;

    if (Hls.isSupported()) {
      hlsInstance = new Hls({ autoStartLoad: true });
      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(video);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hlsInstance) {
        hlsInstance.destroy();
      }
    };
  }, [view404]);

  // Mission scroll animation
  const { scrollYProgress } = useScroll({
    target: missionSectionRef,
    offset: ['start 85%', 'end 25%']
  });

  const p1Text = "We're building an autonomous space where curiosity meets pristine clarity — where intelligence finds depth, creators find reach, and every synthesis becomes a paradigm shift.";
  const p1Words = p1Text.split(' ');

  const p2Text = "A high-performance substrate where knowledge, cryptographic security, and neural insight flow together — with zero noise, zero friction, and immaculate execution.";
  const p2Words = p2Text.split(' ');

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setSubscribed(true);
    setTimeout(() => {
      setEmailInput('');
      setSubscribed(false);
    }, 4000);
  };

  return (
    <div className="relative min-h-screen bg-black text-white selection:bg-white selection:text-black font-sans">
      {/* 1. Orbit Precision Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-[80px] sm:h-[90px] px-6 sm:px-12 flex items-center justify-between pointer-events-none backdrop-blur-md bg-black/40 border-b border-white/10">
        <div className="flex items-center gap-6 sm:gap-10 pointer-events-auto">
          {/* Asterisk brand mark SVG from maquette/index.html */}
          <a
            href="#home"
            onClick={(e) => {
              if (view404) {
                e.preventDefault();
                setView404(false);
              }
            }}
            className="flex items-center gap-3 group transition-transform duration-300 hover:scale-105"
            aria-label="The Diamond Casino Home"
          >
            <img
              src="/diamond_casino_logo.png"
              alt="The Diamond Casino & Resort"
              className="h-9 sm:h-11 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
            />
          </a>

          {/* Primary Nav with optical scaleX from Orbit */}
          <nav className="hidden lg:flex items-center gap-8 text-[15px] tracking-tight">
            <a
              href="#home"
              onClick={() => setView404(false)}
              className="nav-home-scale text-white/90 hover:text-white transition-opacity font-medium"
            >
              Home
            </a>
            <a
              href="#resources"
              onClick={() => setView404(false)}
              className="nav-resources-scale text-white/70 hover:text-white transition-opacity font-medium"
            >
              Resources
            </a>
            <a
              href="#benefits"
              onClick={() => setView404(false)}
              className="nav-benefits-scale text-white/70 hover:text-white transition-opacity font-medium"
            >
              Benefits
            </a>
            <a
              href="#contact"
              onClick={() => setView404(false)}
              className="nav-contact-scale text-white/70 hover:text-white transition-opacity font-medium"
            >
              Contact
            </a>
          </nav>
        </div>

        {/* Right Action: Discord icon + Pill button ("Secure system") + 404 trigger & Mobile toggle */}
        <div className="flex items-center gap-3 sm:gap-4 pointer-events-auto">
          {/* Discord Icon */}
          <a
            href="https://discord.com"
            target="_blank"
            rel="noopener noreferrer"
            className="liquid-glass w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white/80 hover:text-white transition-colors"
            aria-label="Discord"
            title="Join Discord Community"
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

          {/* Orbit Secure system pill */}
          <a
            href="#secure"
            onClick={(e) => {
              e.preventDefault();
              setView404(false);
              const el = document.getElementById('secure');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            }}
            className="flex items-center justify-center bg-white text-black font-semibold text-xs sm:text-sm tracking-wide rounded-full px-5 sm:px-7 py-2.5 sm:py-3 transition-transform duration-200 hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.25)]"
          >
            Secure system
          </a>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-full border border-white/20 text-white bg-white/5"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X size={20} /> : (
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
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-x-0 top-[80px] bg-black/95 backdrop-blur-2xl border-b border-white/10 z-40 p-6 flex flex-col gap-4 lg:hidden"
          >
            <a
              href="#home"
              onClick={() => { setView404(false); setMobileMenuOpen(false); }}
              className="text-lg font-medium text-white/90 hover:text-white"
            >
              Home
            </a>
            <a
              href="#resources"
              onClick={() => { setView404(false); setMobileMenuOpen(false); }}
              className="text-lg font-medium text-white/70 hover:text-white"
            >
              Resources
            </a>
            <a
              href="#benefits"
              onClick={() => { setView404(false); setMobileMenuOpen(false); }}
              className="text-lg font-medium text-white/70 hover:text-white"
            >
              Benefits
            </a>
            <a
              href="#contact"
              onClick={() => { setView404(false); setMobileMenuOpen(false); }}
              className="text-lg font-medium text-white/70 hover:text-white"
            >
              Contact
            </a>
          </motion.div>
        )}
      </AnimatePresence>

      {/* VIEW: 404 Page (if toggled or requested) */}
      <AnimatePresence mode="wait">
        {view404 ? (
          <motion.main
            key="404-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="relative w-full min-h-screen bg-black overflow-x-hidden font-['Geist_Mono'] flex items-center justify-center pt-20"
          >
            {/* Background Video from maquette/404 */}
            <video
              autoPlay
              loop
              muted
              playsInline
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover opacity-80 z-0 pointer-events-none"
              src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260801_001207_ec20d138-aa45-4b2b-ab8c-bdc71607f240.mp4"
            />

            {/* Dark vignette overlay */}
            <div className="absolute inset-0 bg-black/50 z-[1] pointer-events-none" />

            {/* Top 404 LGPSM Geometric Logo Header */}
            <div className="absolute left-1/2 -translate-x-1/2 z-10 top-[100px] flex items-center justify-center scale-90 sm:scale-100">
              <svg viewBox="0 0 54 40" fill="none" aria-hidden="true" className="w-[54px] h-[40px] shrink-0">
                <path d="M38 0H26V12H38V0Z" fill="white" />
                <path d="M54 12H38V28H54V12Z" fill="white" />
                <path d="M38 28H26V40H38V28Z" fill="white" />
                <path d="M26 12H16V22H26V12Z" fill="white" />
                <path d="M16 22H8V30H16V22Z" fill="white" />
                <path d="M16 2H6V12H16V2Z" fill="white" />
                <path d="M6 12H0V18H6V12Z" fill="white" />
              </svg>
              <svg viewBox="0 0 164.311 100" fill="none" aria-hidden="true" className="h-[40px] ml-[14px] shrink-0">
                <path
                  d="M122.498 37.4573H131.321L139.533 51.6222L147.772 37.4573H156.595V56.0604H152.449V37.6433L141.739 56.0604H137.354L126.617 37.6433V56.0604H122.498V37.4573ZM95.921 48.8317C92.785 48.8317 90.261 46.307 90.261 43.1445C90.261 40.0086 92.785 37.4573 95.921 37.4573H119.972V41.6031H95.921C95.071 41.6031 94.38 42.2941 94.38 43.1445C94.38 44.0215 95.071 44.7125 95.921 44.7125H114.285C117.421 44.7125 119.972 47.2372 119.972 50.3997C119.972 53.5357 117.421 56.0604 114.285 56.0604H90.261V51.9411H114.285C115.136 51.9411 115.827 51.2501 115.827 50.3997C115.827 49.5227 115.136 48.8317 114.285 48.8317H95.921ZM80.857 37.4573C84.843 37.4573 88.086 40.6995 88.086 44.7125C88.086 48.6989 84.843 51.9411 80.857 51.9411H62.254V56.0604H58.135V37.4573H80.857ZM80.83 47.7953C82.558 47.7953 83.94 46.4133 83.94 44.7125C83.94 42.985 82.558 41.6031 80.83 41.6031H62.254V47.7953H80.83ZM35.975 41.6031C33.105 41.6031 30.7927 43.9152 30.7927 46.7588C30.7927 49.629 33.105 51.9411 35.975 51.9411H51.336V48.6989H35.576V44.5796H55.482V56.0604H35.975C30.8192 56.0604 26.6734 51.9145 26.6734 46.7588C26.6734 41.6297 30.8192 37.4573 35.975 37.4573H55.482V41.6031H35.975ZM0 56.0604V37.4573H4.1192V51.9411H24.9281V56.0604H0ZM164.311 36.4177C164.311 37.7529 163.228 38.8354 161.893 38.8354C160.558 38.8354 159.475 37.7529 159.475 36.4177C159.475 35.0824 160.558 34 161.893 34C163.228 34 164.311 35.0824 164.311 36.4177Z"
                  fill="white"
                />
              </svg>
            </div>

            {/* Centered 404 Block */}
            <section className="relative z-10 flex flex-col items-center text-center max-w-[500px] px-6 gap-6 sm:gap-8">
              <h1
                className="m-0 p-0 leading-[1.0] font-bold text-center select-none text-transparent bg-clip-text text-[clamp(130px,36vw,220px)] tracking-[-0.08em]"
                style={{
                  backgroundImage: `linear-gradient(247deg, rgb(255, 255, 255) 5%, rgba(255, 255, 255, 0.35) 95%)`
                }}
              >
                404
              </h1>

              <div className="w-full sm:w-[420px] h-[1px] bg-white/40 shrink-0" />

              <p className="m-0 text-white font-semibold text-center leading-snug text-lg sm:text-2xl tracking-tight">
                The path may be broken, but the journey isn't. Let's get you back.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full justify-center">
                <button
                  onClick={() => setView404(false)}
                  className="bg-white text-black font-semibold px-8 py-3.5 rounded-full hover:bg-neutral-200 transition-colors uppercase tracking-wider text-xs flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} /> Return to Landing
                </button>
                <a
                  href="#home"
                  onClick={() => setView404(false)}
                  className="liquid-glass px-8 py-3.5 rounded-full text-white text-xs font-semibold uppercase tracking-wider hover:bg-white/10 transition-colors text-center"
                >
                  Explore Features
                </a>
              </div>
            </section>
          </motion.main>
        ) : (
          /* MAIN LANDING PAGE VIEW */
          <motion.div
            key="landing-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* 2. Hero Section (Mindloop narrative + Prmpt high contrast + Orbit precision) */}
            <section id="home" className="relative w-full min-h-[100svh] flex flex-col justify-center items-center overflow-hidden pt-28 pb-16">
              {/* Background Video */}
              <video
                src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260325_120549_0cd82c36-56b3-4dd9-b190-069cfc3a623f.mp4"
                className="absolute inset-0 w-full h-full object-cover z-0 opacity-80"
                autoPlay
                loop
                muted
                playsInline
              />

              {/* Gradient Masking for smooth blend to black */}
              <div className="absolute bottom-0 left-0 right-0 h-48 sm:h-72 bg-gradient-to-t from-black via-black/70 to-transparent z-[1] pointer-events-none" />

              {/* Hero Content */}
              <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-5xl">
                {/* Hero Title with Instrument Serif accent */}
                <motion.h1
                  {...fadeUp(0.2)}
                  className="text-5xl sm:text-7xl lg:text-8xl xl:text-9xl text-white tracking-tight leading-tight mb-6 font-['Instrument_Serif'] font-normal"
                >
                  Get <em className="italic">Inspired</em> with Us
                </motion.h1>

                {/* Subtitle */}
                <motion.p
                  {...fadeUp(0.3)}
                  className="text-base sm:text-xl text-neutral-300 max-w-2xl leading-relaxed mb-10 font-normal"
                >
                  Experience the intersection of autonomous synthesis, uncompromised typography, and cinematic fluidity. Join 7,000+ pioneers redefining knowledge discovery.
                </motion.p>

                {/* Email Subscription Bar */}
                <motion.form
                  {...fadeUp(0.4)}
                  onSubmit={handleSubscribe}
                  className="liquid-glass rounded-full p-2 max-w-lg w-full flex items-center justify-between shadow-[0_0_40px_rgba(255,255,255,0.06)]"
                >
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Enter your private enclave email"
                    className="bg-transparent border-none outline-none px-6 text-sm sm:text-base text-white placeholder:text-neutral-500 flex-1 font-['Inter_Tight']"
                  />
                  <button
                    type="submit"
                    className="bg-white text-black font-bold text-xs tracking-wider uppercase rounded-full px-6 sm:px-8 py-3.5 transition-transform duration-200 hover:scale-105 active:scale-95 shrink-0"
                  >
                    {subscribed ? "SENT" : "SUBSCRIBE"}
                  </button>
                </motion.form>
              </div>
            </section>

            {/* 3. "Search has changed" Section (From Mindloop with Prmpt Monochromatic polish) */}
            <section id="resources" className="bg-black pt-24 sm:pt-36 pb-20 px-6 max-w-6xl mx-auto">
              <div className="text-center max-w-3xl mx-auto mb-20">
                <motion.span
                  {...fadeUp(0.05)}
                  className="text-xs font-['Geist_Mono'] tracking-[4px] uppercase text-neutral-400 block mb-3"
                >
                  EVOLUTION OF DISCOVERY
                </motion.span>
                <motion.h2
                  {...fadeUp(0.1)}
                  className="text-4xl sm:text-6xl lg:text-7xl font-semibold text-white tracking-[-0.03em] mb-6"
                >
                  Search has <span className="font-['Instrument_Serif'] font-normal italic">changed.</span> Have you?
                </motion.h2>
                <motion.p
                  {...fadeUp(0.15)}
                  className="text-neutral-400 text-base sm:text-lg leading-relaxed"
                >
                  Traditional indexing is fading. Autonomous neural agents now answer queries directly. Be positioned at the heart of synthesis.
                </motion.p>
              </div>

              {/* 3 Engine Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                {/* ChatGPT Card */}
                <motion.div
                  {...fadeUp(0.2)}
                  className="liquid-glass rounded-2xl p-8 flex flex-col items-center text-center group hover:bg-white/[0.04] transition-colors"
                >
                  <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <svg viewBox="0 0 24 24" className="w-12 h-12 fill-white" aria-label="ChatGPT">
                      <path d="M12 2a10 10 0 0 0-3.16 19.49 1 1 0 0 0 1.16-.76l.32-1.42a1 1 0 0 0-.74-1.2A6.5 6.5 0 1 1 18.5 12a1 1 0 0 0 2 0A10 10 0 0 0 12 2Z" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-xl text-white mb-2">ChatGPT</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed mb-4">
                    Conversational synthesis delivering direct conceptual summaries over fragmented links.
                  </p>
                  <span className="font-['Geist_Mono'] text-xs text-white/50 tracking-wider uppercase mt-auto">
                    NODE 01 // SYNTHESIS
                  </span>
                </motion.div>

                {/* Perplexity Card */}
                <motion.div
                  {...fadeUp(0.3)}
                  className="liquid-glass rounded-2xl p-8 flex flex-col items-center text-center group hover:bg-white/[0.04] transition-colors"
                >
                  <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <svg viewBox="0 0 24 24" className="w-12 h-12 fill-none stroke-white stroke-2" aria-label="Perplexity">
                      <rect x="4" y="4" width="16" height="16" rx="4" />
                      <line x1="12" y1="4" x2="12" y2="20" />
                      <line x1="4" y1="12" x2="20" y2="12" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-xl text-white mb-2">Perplexity</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed mb-4">
                    Source-grounded retrieval engine prioritizing authority, live citations, and mathematical proofs.
                  </p>
                  <span className="font-['Geist_Mono'] text-xs text-white/50 tracking-wider uppercase mt-auto">
                    NODE 02 // CITATION
                  </span>
                </motion.div>

                {/* Google Gemini Card */}
                <motion.div
                  {...fadeUp(0.4)}
                  className="liquid-glass rounded-2xl p-8 flex flex-col items-center text-center group hover:bg-white/[0.04] transition-colors"
                >
                  <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <svg viewBox="0 0 24 24" className="w-12 h-12 fill-none stroke-white stroke-2" aria-label="Google AI">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-xl text-white mb-2">Gemini & Overviews</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed mb-4">
                    Multimodal generative pipelines parsing vision, code, and live streams in real time.
                  </p>
                  <span className="font-['Geist_Mono'] text-xs text-white/50 tracking-wider uppercase mt-auto">
                    NODE 03 // MULTIMODAL
                  </span>
                </motion.div>
              </div>

              <div className="p-6 rounded-xl border border-white/15 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                <span className="text-neutral-300 font-['Geist_Mono'] text-sm">
                  ⚡ STATUS: If your content is not engineered for reasoning engines, your reach is zero.
                </span>
                <a
                  href="#contact"
                  className="text-xs uppercase tracking-widest font-bold text-white hover:underline flex items-center gap-1 shrink-0"
                >
                  Calibrate Feed <ArrowUpRight size={14} />
                </a>
              </div>
            </section>

            {/* 4. Mission Section with Scroll-driven Word Reveal */}
            <section ref={missionSectionRef} className="py-28 sm:py-36 px-6 max-w-5xl mx-auto flex flex-col items-center border-t border-white/10">
              {/* Monolithic Video Display */}
              <div className="w-full max-w-[760px] aspect-square rounded-3xl overflow-hidden mb-16 border border-white/15 shadow-[0_20px_80px_rgba(0,0,0,0.8)]">
                <video
                  src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260325_132944_a0d124bb-eaa1-4082-aa30-2310efb42b4b.mp4"
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              </div>

              {/* Scroll Driven Kinetic Typography */}
              <div className="text-center max-w-4xl mx-auto">
                <p className="text-2xl sm:text-4xl lg:text-5xl font-semibold tracking-[-0.03em] leading-snug">
                  {p1Words.map((word, i) => {
                    const start = (i / (p1Words.length + p2Words.length)) * 0.7;
                    const end = start + 0.08;
                    const isHighlight = ['curiosity', 'clarity', 'intelligence', 'depth', 'paradigm'].some(w =>
                      word.toLowerCase().includes(w)
                    );
                    return (
                      <WordSpan
                        key={`p1-${i}`}
                        word={word}
                        progress={scrollYProgress}
                        range={[start, end]}
                        highlight={isHighlight}
                      />
                    );
                  })}
                </p>

                <p className="text-xl sm:text-3xl font-medium mt-10 leading-snug text-neutral-400">
                  {p2Words.map((word, i) => {
                    const start = 0.45 + (i / p2Words.length) * 0.5;
                    const end = start + 0.08;
                    return (
                      <WordSpan
                        key={`p2-${i}`}
                        word={word}
                        progress={scrollYProgress}
                        range={[start, end]}
                        highlight={false}
                      />
                    );
                  })}
                </p>
              </div>
            </section>

            {/* 5. Benefits & Solution Grid with Cinematic Wide Asset */}
            <section id="benefits" className="py-28 sm:py-36 px-6 max-w-6xl mx-auto border-t border-white/10">
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
                <div>
                  <span className="text-xs font-['Geist_Mono'] tracking-[3px] uppercase text-neutral-400 block mb-2">
                    CORE SYSTEM ARCHITECTURE
                  </span>
                  <h2 className="text-4xl sm:text-6xl font-semibold text-white tracking-[-0.03em]">
                    The substrate for <span className="font-['Instrument_Serif'] font-normal italic">meaningful</span> depth
                  </h2>
                </div>
                <div className="font-['Geist_Mono'] text-xs text-neutral-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-white" />
                  DIAMOND CLUB VIP // LEVEL 5
                </div>
              </div>

              {/* Wide 3:1 aspect ratio filmic video */}
              <div className="rounded-2xl overflow-hidden aspect-[3/1] w-full mb-16 border border-white/15">
                <video
                  src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260325_125119_8e5ae31c-0021-4396-bc08-f7aebeb877a2.mp4"
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              </div>

              {/* 4 Feature Columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
                {[
                  {
                    num: "01",
                    title: "Curated Neural Feed",
                    desc: "Hand-picked intelligence streams engineered for high signal-to-noise ratio without algorithmic traps."
                  },
                  {
                    num: "02",
                    title: "Immaculate Typography",
                    desc: "Precision optical kerning, instrument serif rhythm, and liquid glass HUD components built for clarity."
                  },
                  {
                    num: "03",
                    title: "Encrypted Syndication",
                    desc: "Zero-knowledge cryptographic distribution directly feeding verified AI agents and citations."
                  },
                  {
                    num: "04",
                    title: "Autonomous 404 Recovery",
                    desc: "Dynamic failover states with embedded cinematic backups ensuring continuity across all endpoints."
                  },
                ].map((item, idx) => (
                  <motion.div key={item.title} {...fadeUp(0.1 * idx)} className="flex flex-col border-l border-white/10 pl-5">
                    <span className="font-['Geist_Mono'] text-xs text-neutral-500 mb-2">{item.num}</span>
                    <h3 className="font-semibold text-lg text-white mb-2">{item.title}</h3>
                    <p className="text-neutral-400 text-sm leading-relaxed">{item.desc}</p>
                  </motion.div>
                ))}
              </div>
            </section>

            {/* 6. Curated Visual Archive (Prmpt High-Contrast Gallery) */}
            <section className="py-24 px-6 border-t border-white/10 max-w-6xl mx-auto">
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
                <div>
                  <span className="text-xs font-['Geist_Mono'] tracking-[3px] uppercase text-neutral-400 block mb-1">
                    THE DIAMOND // VAULT ARCHIVE
                  </span>
                  <h3 className="text-3xl sm:text-5xl font-semibold tracking-tight">
                    Exclusive Suites & Visual Gallery
                  </h3>
                </div>
                <p className="text-neutral-400 text-sm max-w-sm">
                  Curated architectural perspectives and high-roller private salon records. Pure black and white aesthetic.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {GALLERY_IMAGES.map((imgUrl, i) => (
                  <motion.div
                    key={i}
                    {...fadeUp(0.05 * i)}
                    className="group relative aspect-[3/4] rounded-xl overflow-hidden border border-white/15 bg-neutral-900"
                  >
                    <img
                      src={imgUrl}
                      alt={`Archive record ${i + 1}`}
                      className="w-full h-full object-cover grayscale transition-transform duration-500 group-hover:scale-110 group-hover:grayscale-0"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                      <span className="font-['Geist_Mono'] text-xs text-white uppercase tracking-wider">
                        REC // #{String(i + 1).padStart(3, '0')}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>

            {/* 7. CTA Section with HLS Streaming Background Video (Mindloop Mux) */}
            <section
              id="secure"
              className="relative py-36 sm:py-48 px-6 border-t border-white/10 overflow-hidden flex flex-col items-center justify-center text-center"
            >
              {/* Background HLS Video */}
              <video
                ref={ctaVideoRef}
                className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none opacity-60"
                muted
                loop
                playsInline
              />

              {/* Gradient & Overlay */}
              <div className="absolute inset-0 bg-black/60 z-[1] pointer-events-none" />

              {/* CTA Center Box */}
              <div className="relative z-10 flex flex-col items-center max-w-2xl mx-auto">
                {/* The Diamond Casino Logo badge */}
                <div className="flex items-center justify-center mb-6">
                  <img
                    src="/diamond_casino_logo.png"
                    alt="The Diamond Casino & Resort"
                    className="h-16 sm:h-20 w-auto object-contain drop-shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                  />
                </div>

                <h2 className="text-4xl sm:text-6xl md:text-7xl font-semibold text-white tracking-tight mb-4">
                  Step Into the <span className="font-['Instrument_Serif'] font-normal italic">Diamond</span> Experience
                </h2>
                <p className="text-neutral-300 text-base sm:text-lg leading-relaxed mb-10 max-w-lg">
                  Experience the unified standard in autonomous publishing, intelligence discovery, and cryptographic clarity.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-4">
                  <button
                    onClick={() => {
                      const homeEl = document.getElementById('home');
                      if (homeEl) homeEl.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="bg-white text-black font-semibold rounded-full px-8 py-4 text-sm hover:bg-neutral-200 transition-transform active:scale-95 cursor-pointer shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                  >
                    Subscribe to Feed
                  </button>
                  <a
                    href="https://discord.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="liquid-glass rounded-full px-8 py-4 text-white text-sm font-medium hover:bg-white/10 transition-transform active:scale-95 cursor-pointer flex items-center gap-2"
                  >
                    Join Discord
                  </a>
                </div>
              </div>
            </section>

            {/* 8. Footer */}
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
                <button onClick={() => setView404(true)} className="hover:text-white transition-colors">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WordSpan({
  word,
  progress,
  range,
  highlight,
}: {
  word: string;
  progress: any;
  range: [number, number];
  highlight: boolean;
}) {
  const opacity = useTransform(progress, range, [0.15, 1]);
  return (
    <motion.span
      style={{ opacity }}
      className={`inline-block mr-[0.25em] transition-colors duration-300 ${
        highlight ? 'text-white underline decoration-white/30 underline-offset-8' : 'text-neutral-400'
      }`}
    >
      {word}
    </motion.span>
  );
}
