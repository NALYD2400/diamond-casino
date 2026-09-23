import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { fadeUp } from '../constants/animations';

export const Hero: React.FC = () => {
  const [emailInput, setEmailInput] = useState<string>('');
  const [subscribed, setSubscribed] = useState<boolean>(false);

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
            className="bg-white text-black font-bold text-xs tracking-wider uppercase rounded-full px-6 sm:px-8 py-3.5 transition-transform duration-200 hover:scale-105 active:scale-95 shrink-0 cursor-pointer"
          >
            {subscribed ? "SENT" : "SUBSCRIBE"}
          </button>
        </motion.form>
      </div>
    </section>
  );
};
