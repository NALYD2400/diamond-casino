/**
 * Fond vidéo de l'Espace Membre (la même vidéo de diamants que l'accueil et
 * la page Collections), assombri pour garder le texte lisible. À placer en
 * premier enfant d'un conteneur « relative isolate ».
 */
import React from 'react';

export const MemberBackdrop: React.FC = () => (
  <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
    <video src="/hero_diamants.mp4" className="w-full h-full object-cover opacity-35" autoPlay loop muted playsInline />
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(217,178,95,0.14),rgba(0,0,0,0.82)_55%,#000_100%)]" />
  </div>
);
