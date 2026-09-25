import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Sliders,
  Play,
  RotateCcw,
  Check,
  AlertCircle,
  TrendingUp,
  Percent,
  Coins,
  ShieldCheck,
  Plus,
  Trash2,
  HelpCircle,
  Zap,
  Crown,
} from 'lucide-react';
import { useCasinoAdmin } from '../../context/CasinoAdminContext';
import {
  simulateMachineRTP,
  type SlotMachineConfig,
  type SlotSymbolConfig,
  type SlotVolatility,
  type SlotSimulationReport,
} from '../slots/slotsEngine';
import { SlotIcon } from '../slots/SlotIcons';

interface SlotsAdminPanelProps {
  showToast: (msg: string) => void;
}

export const SlotsAdminPanel: React.FC<SlotsAdminPanelProps> = ({ showToast }) => {
  const {
    slotMachines,
    updateSlotMachine,
    updateSlotSymbol,
    addSlotMachine,
    deleteSlotMachine,
    resetSlotMachinesDefaults,
  } = useCasinoAdmin();

  const [selectedMachineId, setSelectedMachineId] = useState<string>(() => {
    return slotMachines[0]?.id || 'diamond-royale';
  });

  const machine = useMemo(() => {
    return slotMachines.find((m) => m.id === selectedMachineId) || slotMachines[0];
  }, [slotMachines, selectedMachineId]);

  // Simulation test bench results
  const [simulationReport, setSimulationReport] = useState<SlotSimulationReport | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Symbol modal editor or direct inline
  const [editingSymbol, setEditingSymbol] = useState<SlotSymbolConfig | null>(null);

  // Run Monte Carlo audit
  const handleRunSimulation = (spins = 10000) => {
    if (!machine) return;
    setIsSimulating(true);
    setTimeout(() => {
      try {
        const report = simulateMachineRTP(machine, spins);
        setSimulationReport(report);
        showToast(`Simulation de ${spins.toLocaleString('fr-FR')} tours terminée (${report.simulatedRtp}% RTP)`);
      } catch (e) {
        showToast('Erreur lors de la simulation');
      } finally {
        setIsSimulating(false);
      }
    }, 50);
  };

  // Add new machine
  const handleCreateNewMachine = () => {
    const id = `slot-custom-${Date.now().toString(36)}`;
    const newMachine: SlotMachineConfig = {
      ...machine,
      id,
      name: 'Nouvelle Machine Custom',
      subtitle: 'Configuration Personnalisée · 5x3',
      tagline: 'MACHINE // CRÉATION ADMIN',
      enabled: true,
      rtpTarget: 96.5,
      defaultBet: 100,
    };
    addSlotMachine(newMachine);
    setSelectedMachineId(id);
    showToast('Nouvelle machine créée');
  };

  if (!machine) {
    return (
      <div className="p-8 text-center text-neutral-500 font-mono">
        Aucune machine configurée.
        <button
          onClick={resetSlotMachinesDefaults}
          className="ml-4 px-4 py-2 bg-amber-400 text-black rounded-xl font-bold"
        >
          Rétablir les machines par défaut
        </button>
      </div>
    );
  }

  // Calculate total symbol weight on this machine for probability %
  const totalWeight = machine.symbols.reduce((acc, s) => acc + s.weight, 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Top Banner: Fleet Switcher & Global Actions */}
      <div className="p-6 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent backdrop-blur-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-400">
                PARC DE MACHINES À SOUS
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-neutral-300">
                {slotMachines.length} MACHINE{slotMachines.length > 1 ? 'S' : ''}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Paramétrage & Moteur de Gains (RTP / Paytables)
            </h2>
            <p className="text-xs text-neutral-400 mt-1">
              Ajustez les pourcentages de redistribution, les rouleaux, les multiplicateurs de symboles et lancez des simulations mathématiques instantanées.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCreateNewMachine}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>Nouvelle Machine</span>
            </button>
            <button
              onClick={() => {
                if (confirm('Rétablir toutes les machines aux valeurs d’usine ?')) {
                  resetSlotMachinesDefaults();
                  showToast('Paramètres d’usine rétablis');
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-red-500/10 hover:text-red-400 border border-white/10 text-neutral-400 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw size={14} />
              <span>Défaut Constructeur</span>
            </button>
          </div>
        </div>

        {/* Machine Selection Pills */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
          {slotMachines.map((m) => {
            const isSelected = m.id === machine.id;
            return (
              <div
                key={m.id}
                onClick={() => setSelectedMachineId(m.id)}
                className={`group px-4 py-2.5 rounded-2xl border text-xs font-medium cursor-pointer transition-all flex items-center gap-3 ${
                  isSelected
                    ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.3)] font-bold'
                    : 'bg-black/40 text-neutral-400 border-white/10 hover:border-white/20 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      m.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'
                    }`}
                  />
                  <span>{m.name}</span>
                  <span className="text-[10px] font-mono px-1 rounded bg-black/20">
                    {m.reelsCount}x3 · {m.rtpTarget}%
                  </span>
                </div>

                {slotMachines.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Supprimer la machine "${m.name}" ?`)) {
                        deleteSlotMachine(m.id);
                        showToast(`Machine supprimée`);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity p-0.5"
                    title="Supprimer la machine"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: CORE MACHINE CONFIGURATION                                     */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: General & Gameplay Specs */}
        <div className="lg:col-span-2 p-6 rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders size={18} className="text-amber-400" />
              <span>Paramètres Généraux de la Machine</span>
            </h3>

            {/* Enable / Disable toggle */}
            <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
              <span className={machine.enabled ? 'text-emerald-400 font-bold' : 'text-neutral-500'}>
                {machine.enabled ? 'ACTIVE EN JEU' : 'MAINTENANCE'}
              </span>
              <input
                type="checkbox"
                checked={machine.enabled}
                onChange={(e) => {
                  updateSlotMachine(machine.id, { enabled: e.target.checked });
                  showToast(`Statut : ${e.target.checked ? 'Active' : 'Maintenance'}`);
                }}
                className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-mono text-neutral-400 block mb-1">
                Nom de la machine :
              </label>
              <input
                type="text"
                value={machine.name}
                onChange={(e) => updateSlotMachine(machine.id, { name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono text-neutral-400 block mb-1">
                Sous-titre / Thème :
              </label>
              <input
                type="text"
                value={machine.subtitle}
                onChange={(e) => updateSlotMachine(machine.id, { subtitle: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono text-neutral-400 block mb-1">
                Format Grille Rouleaux :
              </label>
              <select
                value={machine.reelsCount}
                onChange={(e) => {
                  const val = Number(e.target.value) as 5 | 3;
                  updateSlotMachine(machine.id, {
                    reelsCount: val,
                    paylinesCount: val === 5 ? 20 : 5,
                  });
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value={5}>5 Rouleaux x 3 Rangées (20 Lignes)</option>
                <option value={3}>3 Rouleaux x 3 Rangées (5 Lignes)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-mono text-neutral-400 block mb-1">
                Volatilité Mathématique :
              </label>
              <select
                value={machine.volatility}
                onChange={(e) =>
                  updateSlotMachine(machine.id, { volatility: e.target.value as SlotVolatility })
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/15 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value="LOW">Faible (Gains fréquents, faibles multiplicateurs)</option>
                <option value="MEDIUM">Moyenne (Équilibré casino standard)</option>
                <option value="HIGH">Haute (Moins fréquent, gros jackpots)</option>
                <option value="EXTREME">Extrême (Haute tension salon VIP)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-mono text-neutral-400 block mb-1">
                Mise Minimum (Jetons) :
              </label>
              <input
                type="number"
                value={machine.minBet}
                onChange={(e) => updateSlotMachine(machine.id, { minBet: Number(e.target.value) || 10 })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/15 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono text-neutral-400 block mb-1">
                Mise Maximum (Jetons) :
              </label>
              <input
                type="number"
                value={machine.maxBet}
                onChange={(e) => updateSlotMachine(machine.id, { maxBet: Number(e.target.value) || 500000 })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-white/15 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Bonus Features: Wild & Free Spins */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5 space-y-4">
            <span className="text-xs font-mono font-bold text-neutral-300 block uppercase">
              Fonctionnalités Spéciales
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10">
                <input
                  type="checkbox"
                  checked={machine.freeSpinsEnabled}
                  onChange={(e) =>
                    updateSlotMachine(machine.id, { freeSpinsEnabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-amber-400"
                />
                <div>
                  <span className="font-bold text-white block">Tours Gratuits</span>
                  <span className="text-[10px] text-neutral-400">
                    {machine.freeSpinsAwarded} tours (x{machine.freeSpinsMultiplier})
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer bg-white/5 p-3 rounded-xl border border-white/10">
                <input
                  type="checkbox"
                  checked={machine.jackpotEnabled}
                  onChange={(e) =>
                    updateSlotMachine(machine.id, { jackpotEnabled: e.target.checked })
                  }
                  className="w-4 h-4 accent-amber-400"
                />
                <div>
                  <span className="font-bold text-white block">Jackpot Progressif</span>
                  <span className="text-[10px] text-neutral-400">
                    {machine.jackpotContributionPct}% prélevés / mise
                  </span>
                </div>
              </label>

              <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                <span className="font-bold text-white block text-[11px]">Multiplicateur Wild Max</span>
                <select
                  value={machine.wildMultiplierMax}
                  onChange={(e) =>
                    updateSlotMachine(machine.id, { wildMultiplierMax: Number(e.target.value) })
                  }
                  className="w-full mt-1 bg-black text-amber-400 font-mono text-xs rounded border border-white/15 px-2 py-1"
                >
                  <option value={1}>x1 (Standard)</option>
                  <option value={2}>x2 (Double)</option>
                  <option value={3}>x3 (Triple)</option>
                  <option value={5}>x5 (Méga Wild)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Target RTP & Monte Carlo Audit Bench */}
        <div className="p-6 rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl flex flex-col justify-between space-y-6">
          <div>
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Percent size={18} className="text-amber-400" />
                <span>RTP Théorique & Marge</span>
              </h3>
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                RTP CIBLE : {machine.rtpTarget}%
              </span>
            </div>

            {/* Slider */}
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-xs font-mono text-neutral-400">
                <span>Réglementaire (88%)</span>
                <span>Casino Standard (96.5%)</span>
                <span>Généreux (99%)</span>
              </div>
              <input
                type="range"
                min="85.0"
                max="99.5"
                step="0.1"
                value={machine.rtpTarget}
                onChange={(e) =>
                  updateSlotMachine(machine.id, { rtpTarget: Number(e.target.value) })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
              <div className="p-3 rounded-xl bg-black/60 border border-white/10 flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-400">Marge Brute Casino (House Edge) :</span>
                <strong className="text-emerald-400 text-sm">
                  {(100 - machine.rtpTarget).toFixed(2)}%
                </strong>
              </div>
            </div>

            {/* Monte Carlo Simulator */}
            <div className="p-4 rounded-2xl bg-black/50 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-sky-400" />
                  <span>Audit Monte Carlo en direct</span>
                </span>
                <button
                  onClick={() => handleRunSimulation(10000)}
                  disabled={isSimulating}
                  className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-[11px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <Play size={11} fill="currentColor" />
                  <span>{isSimulating ? 'Audit en cours...' : 'Tester 10 000 spins'}</span>
                </button>
              </div>

              {simulationReport ? (
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-neutral-400">RTP Réel Observé :</span>
                    <strong
                      className={
                        simulationReport.simulatedRtp >= 95
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }
                    >
                      {simulationReport.simulatedRtp}%
                    </strong>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-neutral-400">Fréquence de Gain (Hit Rate) :</span>
                    <span className="text-white">{simulationReport.hitRatePct}%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-neutral-400">Taux de Big Wins (&gt;=15x) :</span>
                    <span className="text-white">{simulationReport.bigWinRatePct}%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-neutral-400">Déclenchements Free Spins :</span>
                    <span className="text-sky-400">{simulationReport.freeSpinsTriggers}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-neutral-400">Multiplicateur Max Vu :</span>
                    <span className="text-amber-400 font-bold">
                      x{simulationReport.maxMultiplierHit}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-neutral-500 font-mono">
                  Cliquez sur "Tester 10 000 spins" pour vérifier mathématiquement la stabilité et la conformité du modèle économique.
                </p>
              )}
            </div>
          </div>

          <div className="text-[10px] font-mono text-neutral-500 border-t border-white/5 pt-3">
            Toutes les modifications sont synchronisées instantanément avec Supabase et visibles en temps réel par les joueurs dans /slots.
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: SYMBOLS & PAYTABLE CONFIGURATOR                                */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-3xl border border-white/10 bg-white/[0.02] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Crown size={20} className="text-amber-400" />
              <span>Table des Symboles, Poids & Multiplicateurs de Ligne</span>
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              Modifiez le poids de tirage (fréquence d'apparition) et les gains accordés pour 3, 4 et 5 symboles alignés.
            </p>
          </div>
          <span className="text-xs font-mono text-neutral-400">
            Poids total cumulé : <strong className="text-white">{totalWeight}</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/10 text-neutral-400 pb-3">
                <th className="py-2.5">Symbole</th>
                <th className="py-2.5">Rôle</th>
                <th className="py-2.5">Poids Relatif (Slider)</th>
                <th className="py-2.5">Proba / Case</th>
                <th className="py-2.5">Gain 3x</th>
                {machine.reelsCount === 5 && (
                  <>
                    <th className="py-2.5">Gain 4x</th>
                    <th className="py-2.5">Gain 5x</th>
                  </>
                )}
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {machine.symbols.map((sym) => {
                const probaPct = ((sym.weight / totalWeight) * 100).toFixed(1);

                return (
                  <tr key={sym.id} className="hover:bg-white/[0.02]">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-1 shrink-0">
                          <SlotIcon id={sym.id} className="w-7 h-7" />
                        </div>
                        <div>
                          <span className="font-bold text-white block">{sym.name}</span>
                          <span className="text-[10px] text-neutral-500">{sym.shortCode}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3">
                      {sym.isWild ? (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                          WILD
                        </span>
                      ) : sym.isScatter ? (
                        <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold border border-sky-500/30">
                          SCATTER
                        </span>
                      ) : (
                        <span className="text-neutral-400">Standard</span>
                      )}
                    </td>

                    {/* Weight Adjustment */}
                    <td className="py-3 w-48">
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="1"
                          max="80"
                          value={sym.weight}
                          onChange={(e) => {
                            updateSlotSymbol(machine.id, sym.id, {
                              weight: Number(e.target.value),
                            });
                          }}
                          className="w-28 accent-amber-400 cursor-pointer"
                        />
                        <span className="font-bold text-white min-w-6 text-right">
                          {sym.weight}
                        </span>
                      </div>
                    </td>

                    {/* Proba % */}
                    <td className="py-3">
                      <span className="text-neutral-300 font-bold">{probaPct}%</span>
                    </td>

                    {/* 3 of a kind multiplier */}
                    <td className="py-3">
                      <input
                        type="number"
                        value={sym.payout3}
                        onChange={(e) =>
                          updateSlotSymbol(machine.id, sym.id, {
                            payout3: Math.max(0, Number(e.target.value)),
                          })
                        }
                        className="w-16 px-2 py-1 rounded bg-black border border-white/15 text-xs text-amber-400 font-bold text-center"
                      />
                    </td>

                    {/* 4 and 5 of a kind (5x3 machines) */}
                    {machine.reelsCount === 5 && (
                      <>
                        <td className="py-3">
                          <input
                            type="number"
                            value={sym.payout4}
                            onChange={(e) =>
                              updateSlotSymbol(machine.id, sym.id, {
                                payout4: Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="w-16 px-2 py-1 rounded bg-black border border-white/15 text-xs text-white font-bold text-center"
                          />
                        </td>
                        <td className="py-3">
                          <input
                            type="number"
                            value={sym.payout5}
                            onChange={(e) =>
                              updateSlotSymbol(machine.id, sym.id, {
                                payout5: Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="w-20 px-2 py-1 rounded bg-black border border-white/15 text-xs text-amber-300 font-bold text-center"
                          />
                        </td>
                      </>
                    )}

                    <td className="py-3 text-right">
                      <button
                        onClick={() => {
                          showToast(`Symbole "${sym.name}" sauvegardé`);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                        title="Sauvegarder"
                      >
                        <Check size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
