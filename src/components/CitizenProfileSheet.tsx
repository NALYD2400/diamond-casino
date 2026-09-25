import { GAME_LABELS } from '../lib/gamesConfig';
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Check,
  Copy,
  Disc,
  Coins,
  Crown,
  ShieldAlert,
  Code,
  Trees,
  Phone,
  Calendar,
  History,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  Minus,
  FileText,
  Trophy,
  Clock,
  Search,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  UserCheck,
  Edit2,
  Unlock,
  CheckCircle2,
} from 'lucide-react';
import type { MockCitizen, AdminLogEntry } from '../context/CasinoAdminContext';
import { mapTransaction, type CasinoTransaction, type CasinoUser } from '../context/CasinoUserContext';
import { dbFetchBetsHistory, dbFetchAdminLogs, dbFetchTransactions, type SupabaseBetEntry } from '../lib/supabase';
import { getDefaultDiscordAvatar } from '../lib/discord';

export type CitizenModalTab = 'profile' | 'transactions' | 'wins' | 'logs';

interface CitizenProfileSheetProps {
  citizen: MockCitizen;
  onClose: () => void;
  onSave: (updated: MockCitizen) => void;
  onUpdateLive?: (updated: MockCitizen) => void;
  onResetCooldown: (citizenId: string) => Promise<boolean> | void;
  onAdjustBalance: (chipsDelta: number, reason: string) => Promise<boolean>;
  adminLogs: AdminLogEntry[];
  onAddLog: (action: string, category: 'WHEEL' | 'ECONOMY' | 'CITIZEN' | 'SYSTEM', detail: string) => void;
  showToast: (msg: string) => void;
  currentUser?: CasinoUser | null;
}

export const CitizenProfileSheet: React.FC<CitizenProfileSheetProps> = ({
  citizen,
  onClose,
  onSave,
  onUpdateLive,
  onResetCooldown,
  onAdjustBalance,
  adminLogs,
  onAddLog,
  showToast,
  currentUser,
}) => {
  const [activeTab, setActiveTab] = useState<CitizenModalTab>('profile');
  const [copiedId, setCopiedId] = useState<boolean>(false);
  const [copiedMatricule, setCopiedMatricule] = useState<boolean>(false);

  // Editable Draft State
  const [draft, setDraft] = useState<MockCitizen>(() => ({ ...citizen }));

  // Transactions State
  const [transactions, setTransactions] = useState<CasinoTransaction[]>([]);
  const [txFilter, setTxFilter] = useState<string>('ALL');
  const [txSearch, setTxSearch] = useState<string>('');

  // Quick transaction / deposit drawer state
  const [showDepositForm, setShowDepositForm] = useState<boolean>(false);
  const [depositType, setDepositType] = useState<'deposit' | 'withdrawal' | 'chips_buy' | 'bonus'>('deposit');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositNote, setDepositNote] = useState<string>('');

  // Wins / Bets State
  const [bets, setBets] = useState<SupabaseBetEntry[]>([]);
  const [isLoadingBets, setIsLoadingBets] = useState<boolean>(true);

  // Admin Note Input & Dossier State
  const [adminNote, setAdminNote] = useState<string>('');
  const [adminNoteSeverity, setAdminNoteSeverity] = useState<'surveillance' | 'warning' | 'info' | 'vip'>('surveillance');
  const [showNoteEditor, setShowNoteEditor] = useState<boolean>(false);

  // Live Supabase Admin & Audit Logs
  const [liveLogs, setLiveLogs] = useState<AdminLogEntry[]>(() => adminLogs || []);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [logScope, setLogScope] = useState<'citizen' | 'all'>('citizen');


  // Fetch real live logs directly from Supabase
  const loadLiveLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const cloudLogs = await dbFetchAdminLogs(150);
      if (cloudLogs && cloudLogs.length > 0) {
        const formatted: AdminLogEntry[] = cloudLogs.map((l) => ({
          id: l.id || `log_${Math.random()}`,
          timestamp: l.created_at
            ? new Date(l.created_at).toLocaleString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Récent',
          action: l.action,
          category: l.category,
          detail: l.detail,
          author: l.author || 'Console Admin',
        }));
        setLiveLogs(formatted);
      } else {
        setLiveLogs(adminLogs);
      }
    } catch {
      setLiveLogs(adminLogs);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const loadTransactions = async () => {
    try {
      const rows = await dbFetchTransactions(citizen.profileId, 200);
      setTransactions(rows.map(mapTransaction));
    } catch {
      setTransactions([]);
    }
  };

  // Initial load of transactions, Supabase bets & real audit logs
  useEffect(() => {
    void loadTransactions();

    setIsLoadingBets(true);
    dbFetchBetsHistory(citizen.profileId, 100)
      .then(setBets)
      .catch(() => setBets([]))
      .finally(() => setIsLoadingBets(false));

    void loadLiveLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citizen.profileId]);

  const displayDiscordId = draft.discordId || '';
  const matricule = draft.citizenId.startsWith('test_') ? '#test' : `#${draft.citizenId}`;
  const displayName = `${draft.rpFirstName} ${draft.rpLastName}`.trim();
  const avatar = draft.avatarUrl || getDefaultDiscordAvatar(displayDiscordId || draft.citizenId);

  const handleCopyDiscordId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!displayDiscordId) return;
    navigator.clipboard.writeText(displayDiscordId).catch(() => {});
    setCopiedId(true);
    showToast(`ID Discord ${displayDiscordId} copié`);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyMatricule = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(draft.citizenId).catch(() => {});
    setCopiedMatricule(true);
    showToast(`Matricule #${draft.citizenId} copié`);
    setTimeout(() => setCopiedMatricule(false), 2000);
  };

  const renderRoleBadge = (role: string) => {
    const r = (role || '').toUpperCase();
    if (r.includes('DÉV') || r.includes('DEV')) {
      return (
        <span className="bg-[#082f49] text-[#38bdf8] border border-[#0284c7]/40 font-semibold px-2.5 py-1 rounded-full text-xs inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(56,189,248,0.25)]">
          <Code size={12} className="text-sky-400" />
          Développeur
        </span>
      );
    }
    if (r.includes('FOND') || r.includes('PROPRIÉTAIRE') || r.includes('OWNER')) {
      return (
        <span className="bg-white/10 text-white border border-white/20 font-semibold px-2.5 py-1 rounded-full text-xs inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(255,255,255,0.15)]">
          <Crown size={12} className="text-white" />
          Fondateur
        </span>
      );
    }
    if (r.includes('ADMIN')) {
      return (
        <span className="bg-[#3f1212] text-[#f87171] border border-[#dc2626]/40 font-semibold px-2.5 py-1 rounded-full text-xs inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(248,113,113,0.25)]">
          <ShieldAlert size={12} className="text-red-400" />
          Admin
        </span>
      );
    }
    if (r.includes('VIP') || r.includes('ROLLER')) {
      return (
        <span className="bg-[#2e1065] text-[#c084fc] border border-[#7e22ce]/40 font-semibold px-2.5 py-1 rounded-full text-xs inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(192,132,252,0.25)]">
          <Crown size={12} className="text-purple-400" />
          {role}
        </span>
      );
    }
    return (
      <span className="bg-[#062c1e] text-[#34d399] border border-[#059669]/40 font-semibold px-2.5 py-1 rounded-full text-xs inline-flex items-center gap-1.5 shadow-[0_0_12px_rgba(52,211,153,0.25)]">
        <Trees size={12} className="text-emerald-400" />
        Citoyen
      </span>
    );
  };

  const formatDate = (dateStr?: string | number | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const formatDateTime = (dateStr?: string | number | null) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '—';
    }
  };

  // Reset Wheel Cooldown for this citizen (logged server-side)
  const handleUnlockWheel = async () => {
    const ok = await onResetCooldown(draft.citizenId);
    if (ok === false) return;
    setDraft((d) => ({ ...d, wheelCooldownRemaining: 'Disponible', lastSpinTimestamp: null }));
    showToast(`Tirage débloqué pour ${displayName} !`);
  };

  // Manual balance operation (server-side, recorded as a transaction)
  const handleCreateTransaction = async () => {
    const amt = Math.floor(Number(depositAmount));
    if (!amt || amt <= 0 || isNaN(amt)) {
      showToast('Veuillez entrer un montant valide');
      return;
    }

    let label = depositNote.trim();
    let chipsDelta = amt;
    if (depositType === 'withdrawal') {
      label = label || 'Débit / Retrait de Jetons';
      chipsDelta = -amt;
    } else if (depositType === 'bonus') {
      label = label || 'Bonus / Gratification Direction';
    } else {
      label = label || 'Achat / Crédit de Jetons Casino';
    }

    const ok = await onAdjustBalance(chipsDelta, label);
    if (!ok) return;

    setDraft((d) => ({ ...d, chips: Math.max(0, (d.chips || 0) + chipsDelta) }));
    await loadTransactions();
    setDepositAmount('');
    setDepositNote('');
    setShowDepositForm(false);
    showToast('Transaction enregistrée.');
  };

  // Add Admin Note to Logs & Citizen Dossier
  const handleAddAdminNote = async (customText?: string, customSeverity?: 'surveillance' | 'warning' | 'info' | 'vip') => {
    const note = (customText !== undefined ? customText : adminNote).trim();
    if (!note) return;

    const severity = customSeverity || adminNoteSeverity;
    const author = currentUser?.rpFirstName ? `${currentUser.rpFirstName} ${currentUser.rpLastName}` : 'Console Admin';
    const now = new Date().toISOString();

    const severityTag = severity.toUpperCase();
    const detail = `[${severityTag}] Fiche #${draft.citizenId} (${displayName}): ${note}`;

    const newDraft: MockCitizen = {
      ...draft,
      adminNote: note,
      adminNoteAuthor: author,
      adminNoteDate: now,
      adminNoteSeverity: severity,
    };

    setDraft(newDraft);
    onUpdateLive?.(newDraft);


    const newEntry: AdminLogEntry = {
      id: `log_note_${Date.now()}`,
      timestamp: now,
      action: 'Note Administrative',
      category: 'CITIZEN',
      detail,
      author,
    };

    setLiveLogs((prev) => [newEntry, ...prev]);
    onAddLog('Note Administrative', 'CITIZEN', detail);

    setAdminNote('');
    setShowNoteEditor(false);
    showToast(`Note consignée sur le dossier de ${displayName}.`);
  };

  // Clear / Resolve Admin Note
  const handleClearAdminNote = async () => {
    const previousNote = draft.adminNote;
    const author = currentUser?.rpFirstName ? `${currentUser.rpFirstName} ${currentUser.rpLastName}` : 'Console Admin';
    const now = new Date().toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const newDraft: MockCitizen = {
      ...draft,
      adminNote: undefined,
      adminNoteAuthor: undefined,
      adminNoteDate: undefined,
      adminNoteSeverity: undefined,
    };

    setDraft(newDraft);
    onUpdateLive?.(newDraft);


    const detail = `Note administrative levée pour #${draft.citizenId} (${displayName})${previousNote ? ` (Ancienne: "${previousNote}")` : ''}`;
    const newEntry: AdminLogEntry = {
      id: `log_note_cleared_${Date.now()}`,
      timestamp: now,
      action: 'Note Résolue',
      category: 'CITIZEN',
      detail,
      author,
    };

    setLiveLogs((prev) => [newEntry, ...prev]);
    onAddLog('Note Résolue', 'CITIZEN', detail);

    showToast(`Note administrative levée pour ${displayName}.`);
  };

  // Close safely preserving any live adjustments
  const handleClose = () => {
    onClose();
  };

  // Save all profile changes
  const handleSaveAll = () => {
    onSave(draft);
  };

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (txFilter === 'DEPOSIT') {
        const isDep = t.amountChips > 0;
        if (!isDep) return false;
      } else if (txFilter === 'WITHDRAWAL') {
        const isWith = t.amountChips < 0;
        if (!isWith) return false;
      } else if (txFilter === 'CHIPS') {
        if (!t.amountChips || t.amountChips === 0) return false;
      }

      if (!txSearch.trim()) return true;
      const q = txSearch.toLowerCase();
      return (
        t.label.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [transactions, txFilter, txSearch]);

  // Financial summary metrics
  const totalChipsAcquired = useMemo(() => {
    return transactions.reduce((acc, t) => {
      if (t.amountChips && t.amountChips > 0) return acc + t.amountChips;
      return acc;
    }, 0);
  }, [transactions]);

  // Combined Wins / Spins List
  const combinedWins = useMemo(() => {
    const list: Array<{
      id: string;
      label: string;
      type: string;
      value: string | number;
      date: string;
      source: string;
    }> = [];

    // From Supabase bets_history
    bets.forEach((b) => {
      const isWheel = b.game_id === 'lucky_wheel';
      const game = GAME_LABELS[b.game_id] ?? b.game_id;
      list.push({
        id: b.id || `bet_${Math.random()}`,
        label: isWheel
          ? b.result_data?.segment || 'Tirage Roue'
          : `${game} · mise ${Number(b.bet_amount).toLocaleString('fr-FR')} → ${
              b.win_amount > 0 ? `gain ${Number(b.win_amount).toLocaleString('fr-FR')}` : 'perdu'
            }`,
        type: isWheel ? b.result_data?.type || 'chips' : 'chips',
        value: isWheel ? ((b.result_data?.value as string | number | undefined) ?? b.win_amount) : b.win_amount - b.bet_amount,
        date: b.created_at,
        source: game,
      });
    });

    // Sort by date descending
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [bets]);

  // Filtered Logs for this citizen or full casino audit trail
  const citizenLogs = useMemo(() => {
    if (logScope === 'all') return liveLogs;

    const id = (draft.citizenId || '').trim().toLowerCase();
    const first = (draft.rpFirstName || '').trim().toLowerCase();
    const last = (draft.rpLastName || '').trim().toLowerCase();
    const discord = (draft.discordId || '').trim().toLowerCase();

    return liveLogs.filter((l) => {
      const d = (l.detail || '').toLowerCase();
      const a = (l.action || '').toLowerCase();
      const author = (l.author || '').toLowerCase();

      const matchesId = id.length > 0 && (d.includes(id) || d.includes(`#${id}`) || a.includes(id));
      const matchesFirst = first.length > 2 && (d.includes(first) || author.includes(first));
      const matchesLast = last.length > 2 && (d.includes(last) || author.includes(last));
      const matchesDiscord = discord.length > 5 && d.includes(discord);

      return matchesId || matchesFirst || matchesLast || matchesDiscord;
    });
  }, [liveLogs, draft, logScope]);

  // List of all notes for this citizen (combines draft note + logs)
  const citizenAdminNotes = useMemo(() => {
    const list: Array<{
      id: string;
      text: string;
      author: string;
      date: string;
      severity: 'surveillance' | 'warning' | 'info' | 'vip';
    }> = [];

    // 1. Current active draft note
    if (draft.adminNote && draft.adminNote.trim()) {
      list.push({
        id: 'active_draft_note',
        text: draft.adminNote.trim(),
        author: draft.adminNoteAuthor || (currentUser?.rpFirstName ? `${currentUser.rpFirstName} ${currentUser.rpLastName}` : 'Console Admin'),
        date: draft.adminNoteDate || 'Active',
        severity: draft.adminNoteSeverity || 'surveillance',
      });
    }

    // 2. Historical notes from citizenLogs
    citizenLogs.forEach((l) => {
      if (l.action === 'Note Administrative' || l.action.toLowerCase().includes('note')) {
        let cleanText = (l.detail || '')
          .replace(/^\[[^\]]+\]\s*/, '')
          .replace(/^Fiche\s*#[^:]+:\s*/i, '')
          .trim();

        if (!cleanText) return;

        let severity: 'surveillance' | 'warning' | 'info' | 'vip' = 'surveillance';
        const upper = (l.detail || '').toUpperCase();
        if (upper.includes('AVERTISSEMENT') || upper.includes('ALERT')) severity = 'warning';
        else if (upper.includes('VIP')) severity = 'vip';
        else if (upper.includes('INFO')) severity = 'info';

        if (!list.some((item) => item.text.toLowerCase() === cleanText.toLowerCase())) {
          list.push({
            id: l.id || `log_note_${Math.random()}`,
            text: cleanText,
            author: l.author || 'Staff Casino',
            date: l.timestamp,
            severity,
          });
        }
      }
    });

    return list;
  }, [draft.adminNote, draft.adminNoteAuthor, draft.adminNoteDate, draft.adminNoteSeverity, citizenLogs, currentUser]);

  // Active highlighted note for prominent alert banner and profile cards
  const activeNote = useMemo(() => {
    return citizenAdminNotes.length > 0 ? citizenAdminNotes[0] : null;
  }, [citizenAdminNotes]);

  // Severity styling configuration
  const getSeverityBadge = (severity: 'surveillance' | 'warning' | 'info' | 'vip') => {
    switch (severity) {
      case 'warning':
        return {
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
          badgeBg: 'bg-rose-500 text-white',
          label: 'AVERTISSEMENT',
          icon: ShieldAlert,
          border: 'border-rose-500/40',
        };
      case 'vip':
        return {
          bg: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
          badgeBg: 'bg-purple-500 text-white',
          label: 'NOTE VIP',
          icon: Crown,
          border: 'border-purple-500/40',
        };
      case 'info':
        return {
          bg: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
          badgeBg: 'bg-sky-500 text-white',
          label: 'REMARQUE',
          icon: FileText,
          border: 'border-sky-500/40',
        };
      case 'surveillance':
      default:
        return {
          bg: 'bg-white/10 border-white/20 text-white',
          badgeBg: 'bg-white text-black',
          label: 'SURVEILLANCE',
          icon: AlertTriangle,
          border: 'border-white/30',
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="w-full max-w-5xl h-[92vh] flex flex-col bg-neutral-950 border border-white/15 rounded-3xl overflow-hidden shadow-[0_0_80px_rgba(0,0,0,0.9),0_0_30px_rgba(255,255,255,0.06)]"
      >
        {/* MODAL HEADER */}
        <div className="p-5 sm:p-7 border-b border-white/10 bg-neutral-900/60 backdrop-blur-xl shrink-0 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            {/* Left: Avatar + Title & Badges */}
            <div className="flex items-center gap-4 sm:gap-5 min-w-0">
              {/* Avatar with Glow and Status Dot */}
              <div className="relative shrink-0">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-neutral-900 border-2 border-white/20 overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.1)] flex items-center justify-center">
                  <img
                    src={avatar}
                    alt={displayName}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const img = e.currentTarget;
                      const fallback = getDefaultDiscordAvatar(displayDiscordId);
                      if (img.src !== fallback) {
                        img.src = fallback;
                      }
                    }}
                  />
                </div>
                {/* Active Sync Pulse */}
                <span
                  className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-neutral-950 flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.8)]"
                  title="Connecté et synchronisé FiveM"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                </span>
              </div>

              {/* Citizen Details */}
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                    {displayName}
                  </h2>
                  {renderRoleBadge(draft.role)}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 mt-1.5 flex-wrap text-xs text-neutral-400 font-mono">
                  {/* Matricule Badge */}
                  <button
                    onClick={handleCopyMatricule}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 hover:border-white/25 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                    title="Cliquer pour copier le matricule RP"
                  >
                    <span>{matricule}</span>
                    {copiedMatricule ? (
                      <Check size={11} className="text-emerald-400" />
                    ) : (
                      <Copy size={11} className="text-neutral-500" />
                    )}
                  </button>

                  <span>•</span>

                  {/* Discord Snowflake */}
                  <button
                    onClick={handleCopyDiscordId}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 hover:border-white/25 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                    title="Cliquer pour copier l'ID Discord"
                  >
                    <span className="text-neutral-500">ID:</span>
                    <span>{displayDiscordId}</span>
                    {copiedId ? (
                      <Check size={11} className="text-emerald-400" />
                    ) : (
                      <Copy size={11} className="text-neutral-500" />
                    )}
                  </button>

                  <span className="hidden md:inline">•</span>

                  {/* Inscription date */}
                  <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-neutral-500">
                    <Calendar size={12} />
                    Inscrit le {formatDate(draft.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Close button */}
            <button
              onClick={handleClose}
              className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer shrink-0"
              title="Fermer la fiche citoyen"
            >
              <X size={18} />
            </button>
          </div>

          {/* TAB BAR NAVIGATION */}
          <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto pt-2 border-t border-white/5 -mb-2">
            {[
              { id: 'profile', icon: UserCheck, label: 'Profil & Identité' },
              { id: 'transactions', icon: Wallet, label: 'Dépôts & Transactions', count: transactions.length },
              { id: 'wins', icon: Trophy, label: 'Gains & Tirages (Wins)', count: combinedWins.length },
              { id: 'logs', icon: History, label: 'Journal & Audit', count: citizenLogs.length },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as CitizenModalTab)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.25)] font-bold'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'text-black' : 'text-neutral-400'} />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-black/15 text-black font-bold' : 'bg-white/10 text-neutral-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* PINNED ACTIVE NOTE BANNER (Visible across all tabs if an active note exists) */}
        {activeNote && (
          <div className="px-5 sm:px-7 pt-4 shrink-0">
            {(() => {
              const badgeInfo = getSeverityBadge(activeNote.severity);
              const NoteIcon = badgeInfo.icon;
              return (
                <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_4px_25px_rgba(0,0,0,0.5)] ${badgeInfo.bg} ${badgeInfo.border}`}>
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 shadow-md ${badgeInfo.badgeBg}`}>
                      <NoteIcon size={18} className={activeNote.severity === 'surveillance' ? 'text-black' : 'text-white'} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-md ${badgeInfo.badgeBg}`}>
                          NOTE ACTIVE • {badgeInfo.label}
                        </span>
                        <span className="text-[11px] font-mono text-neutral-400">
                          Rédigée par <strong className="text-white">{activeNote.author}</strong> • {activeNote.date}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-white mt-1.5 break-words leading-relaxed font-sans tracking-wide">
                        « {activeNote.text} »
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('logs');
                        setShowNoteEditor(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <Edit2 size={12} />
                      <span>Modifier</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAdminNote}
                      title="Lever cette note administrative"
                      className="px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <X size={13} />
                      <span className="hidden sm:inline">Lever</span>
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* MODAL BODY (SCROLLABLE TABS) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6">

          {/* ======================================================== */}
          {/* TAB 1: PROFIL & MODIFICATION                             */}
          {/* ======================================================== */}
          {activeTab === 'profile' && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">
              
              {/* Top Metric Cards: Solde Jetons + Roue */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Solde Jetons Card */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col justify-between gap-4 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-neutral-400 font-mono flex items-center gap-1.5">
                      <Coins size={14} className="text-white" />
                      Solde Jetons de Casino
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-white border border-white/20 font-bold">
                      ⛁ JETONS
                    </span>
                  </div>

                  <div>
                    <div className="text-2xl sm:text-3xl font-bold text-white font-mono tracking-tight">
                      {draft.chips.toLocaleString()} <span className="text-sm font-normal text-neutral-400">⛁</span>
                    </div>
                    <span className="text-[11px] text-neutral-500 mt-0.5 block">
                      Jetons disponibles pour la roulette, tables de jeux et tournois
                    </span>
                  </div>
                </div>

                {/* 3. Wheel Cooldown & Status Card */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col justify-between gap-4 shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-neutral-400 font-mono flex items-center gap-1.5">
                      <Disc size={14} className="text-white" />
                      Roue de la Fortune
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-neutral-400 border border-white/5">
                      COOLDOWN
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          draft.wheelCooldownRemaining === 'Disponible' || !draft.lastSpinTimestamp
                            ? 'bg-emerald-400 animate-pulse'
                            : 'bg-neutral-500'
                        }`}
                      />
                      <span className="text-lg font-bold text-white">
                        {draft.wheelCooldownRemaining === 'Disponible' || !draft.lastSpinTimestamp
                          ? 'Tirage Disponible'
                          : 'Cooldown Actif'}
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-500 mt-1 block font-mono">
                      {draft.lastSpinTimestamp
                        ? `Dernier tirage : ${formatDateTime(draft.lastSpinTimestamp)}`
                        : 'Aucun tirage en cours'}
                    </span>
                  </div>

                  {/* Reset Cooldown Action */}
                  <div className="pt-3 border-t border-white/5">
                    <button
                      type="button"
                      onClick={handleUnlockWheel}
                      className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs text-white font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      <Unlock size={14} className="text-white" />
                      <span>Débloquer le Tirage Immédiatement</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* DOSSIER & NOTE ADMINISTRATIVE DU JOUEUR */}
              <div className="p-5 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col gap-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-white" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                      Dossier & Note Administrative
                    </h3>
                  </div>
                  {activeNote ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/15 text-white border border-white/30 font-bold uppercase">
                      NOTE ACTIVE
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-neutral-500">
                      DOSSIER VIERGE
                    </span>
                  )}
                </div>

                {activeNote ? (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-neutral-900/80 border border-white/10">
                    <div className="flex items-start gap-3.5 min-w-0">
                      {(() => {
                        const badgeInfo = getSeverityBadge(activeNote.severity);
                        const NoteIcon = badgeInfo.icon;
                        return (
                          <>
                            <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${badgeInfo.badgeBg}`}>
                              <NoteIcon size={16} className={activeNote.severity === 'surveillance' ? 'text-black' : 'text-white'} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-400 mb-1 flex-wrap">
                                <span className={`text-[10px] font-mono px-2 py-0.2 rounded font-bold uppercase ${badgeInfo.badgeBg}`}>
                                  {badgeInfo.label}
                                </span>
                                <span>•</span>
                                <span>Par <strong className="text-neutral-200">{activeNote.author}</strong></span>
                                <span>•</span>
                                <span>{activeNote.date}</span>
                              </div>
                              <p className="text-sm font-semibold text-white leading-relaxed break-words font-sans">
                                « {activeNote.text} »
                              </p>
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('logs');
                          setShowNoteEditor(true);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs text-white font-semibold transition-colors cursor-pointer"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={handleClearAdminNote}
                        className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-xs text-red-300 hover:text-white font-semibold transition-colors cursor-pointer"
                      >
                        Lever
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-neutral-900/40 border border-dashed border-white/10 text-neutral-400">
                    <div className="flex items-center gap-2.5 text-xs">
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                      <span>Aucune mention disciplinaire ou consigne de surveillance enregistrée sur ce joueur.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('logs');
                        setShowNoteEditor(true);
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-xs text-white font-semibold transition-colors cursor-pointer shrink-0"
                    >
                      + Ajouter une note
                    </button>
                  </div>
                )}
              </div>

              {/* Profile Edit Fields Container */}
              <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/10 flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <Edit2 size={14} className="text-neutral-400" />
                    Informations & Identité Rôleplay
                  </h3>
                  <span className="text-[10px] font-mono text-neutral-500">MODIFICATION EN DIRECT</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {/* Prénom RP */}
                  <div>
                    <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1.5">
                      Prénom RP
                    </label>
                    <input
                      type="text"
                      value={draft.rpFirstName}
                      onChange={(e) => setDraft({ ...draft, rpFirstName: e.target.value })}
                      placeholder="Prénom"
                      className="w-full h-11 px-3.5 rounded-xl bg-neutral-900 border border-white/10 text-white focus:outline-none focus:border-white transition-colors"
                    />
                  </div>

                  {/* Nom RP */}
                  <div>
                    <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1.5">
                      Nom RP
                    </label>
                    <input
                      type="text"
                      value={draft.rpLastName}
                      onChange={(e) => setDraft({ ...draft, rpLastName: e.target.value })}
                      placeholder="Nom de famille"
                      className="w-full h-11 px-3.5 rounded-xl bg-neutral-900 border border-white/10 text-white focus:outline-none focus:border-white transition-colors"
                    />
                  </div>

                  {/* Rôle & Grade */}
                  <div>
                    <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1.5">
                      Rôle & Grade RP
                    </label>
                    <select
                      value={draft.role}
                      onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                      className="w-full h-11 px-3.5 rounded-xl bg-neutral-900 border border-white/10 text-white font-mono uppercase focus:outline-none focus:border-white cursor-pointer"
                    >
                      <option value="FONDATEUR" className="bg-black">FONDATEUR</option>
                      <option value="DÉVELOPPEUR" className="bg-black">DÉVELOPPEUR</option>
                      <option value="DIRECTEUR CASINO" className="bg-black">DIRECTEUR CASINO</option>
                      <option value="MEMBRE" className="bg-black">CITOYEN / MEMBRE</option>
                    </select>
                  </div>

                  {/* Téléphone */}
                  <div>
                    <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1.5">
                      Numéro de Téléphone FiveM
                    </label>
                    <div className="relative">
                      <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                      <input
                        type="text"
                        value={draft.phoneNumber || ''}
                        onChange={(e) => setDraft({ ...draft, phoneNumber: e.target.value })}
                        placeholder="555-0142"
                        className="w-full h-11 pl-9 pr-3.5 rounded-xl bg-neutral-900 border border-white/10 text-white font-mono focus:outline-none focus:border-white transition-colors"
                      />
                    </div>
                  </div>

                  {/* Matricule RP */}
                  <div>
                    <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1.5">
                      Matricule RP / Identifiant Citoyen
                    </label>
                    <input
                      type="text"
                      value={draft.citizenId}
                      onChange={(e) => setDraft({ ...draft, citizenId: e.target.value })}
                      placeholder="test ou 1042"
                      className="w-full h-11 px-3.5 rounded-xl bg-neutral-900 border border-white/10 text-white font-mono focus:outline-none focus:border-white transition-colors"
                    />
                  </div>

                  {/* Discord ID (Verrouillé / Non modifiable) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] font-mono text-neutral-400 uppercase">
                        Identifiant Discord Snowflake
                      </label>
                      <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-white/5 text-neutral-400 border border-white/10 flex items-center gap-1">
                        🔒 Non modifiable
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={draft.discordId || ''}
                        placeholder="Non lié"
                        title="Identifiant Snowflake Discord officiel (verrouillé, non modifiable)"
                        className="w-full h-11 px-3.5 pr-10 rounded-xl bg-neutral-950/80 border border-white/10 text-neutral-300 font-mono focus:outline-none cursor-not-allowed select-all"
                      />
                      <button
                        type="button"
                        onClick={handleCopyDiscordId}
                        title="Copier l'identifiant Discord"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                      >
                        {copiedId ? (
                          <Check size={14} className="text-emerald-400" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Solde Jetons */}
                  <div className="col-span-full">
                    <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1.5">
                      Solde Jetons de Casino (⛁)
                    </label>
                    <input
                      type="number"
                      value={draft.chips}
                      onChange={(e) => setDraft({ ...draft, chips: Math.max(0, parseInt(e.target.value) || 0) })}
                      placeholder="0"
                      className="w-full h-11 px-3.5 rounded-xl bg-neutral-900 border border-white/10 text-white font-mono focus:outline-none focus:border-white/40 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 2: TRANSACTIONS & DÉPÔTS                             */}
          {/* ======================================================== */}
          {activeTab === 'transactions' && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">
              
              {/* Financial Metrics Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                  <span className="text-[11px] font-mono uppercase text-neutral-400 block mb-1">
                    Total Jetons Acquis / Gagnés
                  </span>
                  <div className="text-2xl font-bold font-mono text-white">
                    +{totalChipsAcquired.toLocaleString()} ⛁
                  </div>
                  <span className="text-[10px] text-neutral-500 mt-1 block">Flux de jetons entrants</span>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                  <span className="text-[11px] font-mono uppercase text-neutral-400 block mb-1">
                    Solde Jetons Actuel
                  </span>
                  <div className="text-2xl font-bold font-mono text-white">
                    {draft.chips.toLocaleString()} ⛁
                  </div>
                  <span className="text-[10px] text-neutral-500 mt-1 block">Disponible immédiatement</span>
                </div>
              </div>

              {/* Action Bar: Search, Filter, New Deposit Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-md">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                      type="text"
                      value={txSearch}
                      onChange={(e) => setTxSearch(e.target.value)}
                      placeholder="Filtrer par motif ou ID..."
                      className="w-full h-10 pl-9 pr-3 rounded-xl bg-neutral-900 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/30"
                    />
                  </div>

                  <select
                    value={txFilter}
                    onChange={(e) => setTxFilter(e.target.value)}
                    className="h-10 px-3 rounded-xl bg-neutral-900 border border-white/10 text-xs text-neutral-300 focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">Toutes</option>
                    <option value="DEPOSIT">Crédits</option>
                    <option value="WITHDRAWAL">Débits</option>
                    <option value="CHIPS">Jetons</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDepositForm(!showDepositForm)}
                  className="px-4 py-2.5 rounded-xl bg-white text-black font-semibold text-xs uppercase tracking-wider hover:bg-neutral-200 transition-colors flex items-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                >
                  <Plus size={14} />
                  <span>Ajuster les Jetons</span>
                </button>
              </div>

              {/* New Deposit Form Accordion */}
              <AnimatePresence>
                {showDepositForm && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-5 rounded-2xl bg-neutral-900 border border-white/20 flex flex-col gap-4 overflow-hidden"
                  >
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-white">
                        Enregistrer une Transaction de Jetons
                      </span>
                      <button
                        onClick={() => setShowDepositForm(false)}
                        className="text-neutral-500 hover:text-white text-xs"
                      >
                        Annuler
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1">
                          Type d'Opération
                        </label>
                        <select
                          value={depositType}
                          onChange={(e) => setDepositType(e.target.value as any)}
                          className="w-full h-10 px-3 rounded-xl bg-black border border-white/10 text-white font-mono cursor-pointer"
                        >
                          <option value="chips_buy">Achat / Crédit Jetons (⛁)</option>
                          <option value="withdrawal">Débit / Retrait Jetons (⛁)</option>
                          <option value="bonus">Bonus Jetons (⛁)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1">
                          Montant en Jetons
                        </label>
                        <input
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="Montant (ex: 25000)"
                          className="w-full h-10 px-3 rounded-xl bg-black border border-white/10 text-white font-mono focus:outline-none focus:border-white/40"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-mono text-neutral-400 uppercase block mb-1">
                          Motif / Libellé
                        </label>
                        <input
                          type="text"
                          value={depositNote}
                          onChange={(e) => setDepositNote(e.target.value)}
                          placeholder="Ex: Virement caisse, Prêt RP..."
                          className="w-full h-10 px-3 rounded-xl bg-black border border-white/10 text-white focus:outline-none focus:border-white"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleCreateTransaction}
                        className="px-5 py-2 rounded-xl bg-white text-black font-semibold text-xs uppercase tracking-wider hover:bg-neutral-200 transition-colors cursor-pointer"
                      >
                        Valider & Appliquer
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Transactions List */}
              <div className="space-y-2.5">
                {filteredTransactions.length === 0 ? (
                  <div className="py-12 px-6 flex flex-col items-center justify-center text-center rounded-2xl bg-white/[0.02] border border-white/5">
                    <History size={28} className="text-neutral-600 mb-2" />
                    <h4 className="text-sm font-bold text-white">Aucune transaction correspondante</h4>
                    <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                      Les dépôts, achats de jetons ou retraits de ce citoyen apparaîtront ici.
                    </p>
                  </div>
                ) : (
                  filteredTransactions.map((tx, idx) => {
                    const isPositive = tx.amountChips >= 0;
                    return (
                      <div
                        key={`tx_${tx.id || idx}_${idx}`}
                        className="p-4 rounded-2xl bg-neutral-900/60 border border-white/5 hover:border-white/15 flex items-center justify-between gap-3 text-xs transition-colors"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            isPositive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {isPositive ? <ArrowDownRight size={18} /> : <ArrowUpRight size={18} />}
                          </div>

                          <div className="min-w-0">
                            <span className="font-bold text-white block truncate text-[13px]">
                              {tx.label}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400 font-mono">
                              <span>{formatDateTime(tx.date)}</span>
                              <span>•</span>
                              <span className="text-neutral-500">{tx.category}</span>
                              <span>•</span>
                              <span className="text-neutral-600 truncate max-w-[120px]">ID: {tx.id}</span>
                            </div>
                          </div>
                        </div>

                        {/* Amount & Status Badge */}
                        <div className="text-right shrink-0 flex flex-col items-end gap-1">
                          {tx.amountChips !== undefined && tx.amountChips !== 0 && (
                            <span className={`font-mono font-bold text-sm ${tx.amountChips > 0 ? 'text-white' : 'text-red-400'}`}>
                              {tx.amountChips > 0 ? `+${tx.amountChips.toLocaleString()}` : tx.amountChips.toLocaleString()} ⛁
                            </span>
                          )}
                          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-white/5 text-neutral-400 border border-white/10 uppercase">
                            {tx.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: GAINS & HISTORIQUE JEUX (WINS / SPINS)            */}
          {/* ======================================================== */}
          {activeTab === 'wins' && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">
              
              {/* Wins Overview Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                  <span className="text-[11px] font-mono uppercase text-neutral-400 block mb-1">
                    Tirages Enregistrés
                  </span>
                  <div className="text-2xl font-bold font-mono text-white">
                    {combinedWins.length}
                  </div>
                  <span className="text-[10px] text-sky-400 mt-1 block">Spins et parties jouées</span>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                  <span className="text-[11px] font-mono uppercase text-neutral-400 block mb-1">
                    Véhicules Podium Gagnés
                  </span>
                  <div className="text-2xl font-bold font-mono text-white">
                    {combinedWins.filter((w) => w.type === 'vehicle' || w.label.toUpperCase().includes('VÉHICULE')).length}
                  </div>
                  <span className="text-[10px] text-neutral-500 mt-1 block">Gros lots de prestige</span>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                  <span className="text-[11px] font-mono uppercase text-neutral-400 block mb-1">
                    Statut Synchronisation
                  </span>
                  <div className="text-sm font-bold font-mono text-emerald-400 mt-1.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Supabase bets_history OK
                  </div>
                  <span className="text-[10px] text-neutral-500 mt-1 block">Traçabilité FiveM active</span>
                </div>
              </div>

              {/* Wins History List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                    <Trophy size={14} className="text-white" />
                    Historique des Gains & Tirages
                  </h3>
                  <span className="text-[10px] font-mono text-neutral-500">
                    {combinedWins.length} ENREGISTREMENTS
                  </span>
                </div>

                {isLoadingBets ? (
                  <div className="py-12 flex flex-col items-center justify-center text-neutral-400 text-xs gap-2">
                    <RefreshCw size={20} className="animate-spin text-white" />
                    <span>Interrogation de la base de données...</span>
                  </div>
                ) : combinedWins.length === 0 ? (
                  <div className="py-12 px-6 flex flex-col items-center justify-center text-center rounded-2xl bg-white/[0.02] border border-white/5">
                    <Disc size={28} className="text-neutral-600 mb-2" />
                    <h4 className="text-sm font-bold text-white">Aucun gain répertorié</h4>
                    <p className="text-xs text-neutral-500 mt-1 max-w-sm">
                      Les récompenses obtenues à la Roue de la Fortune ou aux jeux s'inscriront ici en temps réel.
                    </p>
                  </div>
                ) : (
                  combinedWins.map((win, idx) => (
                    <div
                      key={`win_${win.id || idx}_${idx}`}
                      className="p-4 rounded-2xl bg-neutral-900/60 border border-white/5 hover:border-white/15 flex items-center justify-between gap-4 text-xs transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 text-white flex items-center justify-center shrink-0">
                          <Disc size={18} />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate text-[13px]">
                            {win.label}
                          </span>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400 font-mono">
                            <span>{formatDateTime(win.date)}</span>
                            <span>•</span>
                            <span className="text-neutral-500">{win.source}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex flex-col items-end gap-1">
                        <span className="font-mono font-bold text-sm text-white">
                          {typeof win.value === 'number' ? win.value.toLocaleString() : win.value}
                        </span>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                          Vérifié Supabase
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: JOURNAL D'AUDIT & LOGS DU JOUEUR                  */}
          {/* ======================================================== */}
          {activeTab === 'logs' && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-200">
              
              {/* DOSSIER & CONSIGNATION DE NOTES */}
              <div className="p-5 rounded-2xl bg-neutral-900/60 border border-white/10 flex flex-col gap-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-white" />
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                      Consigner une Note au Dossier du Joueur
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Staff Casino • Fiche #{draft.citizenId}
                  </span>
                </div>

                {/* Severity Pills */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-mono text-neutral-400 mr-1">Statut :</span>
                  {[
                    { id: 'surveillance', label: '⚠️ Surveillance', color: 'border-white/30 text-white bg-white/10' },
                    { id: 'warning', label: '🚨 Avertissement', color: 'border-rose-400/40 text-rose-300 bg-rose-400/10' },
                    { id: 'info', label: '📝 Remarque', color: 'border-sky-400/40 text-sky-300 bg-sky-400/10' },
                    { id: 'vip', label: '⭐ VIP / Confiance', color: 'border-purple-400/40 text-purple-300 bg-purple-400/10' },
                  ].map((btn) => (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => setAdminNoteSeverity(btn.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        adminNoteSeverity === btn.id
                          ? `${btn.color} ring-1 ring-white/30 font-bold scale-[1.02]`
                          : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>

                {/* Input and Submit */}
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="text"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddAdminNote();
                      }
                    }}
                    placeholder="Rédigez la note claire sur le joueur (ex: à surveiller, suspect gain roulette, accord VIP...)"
                    className="flex-1 h-11 px-4 rounded-xl bg-neutral-950 border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddAdminNote()}
                    disabled={!adminNote.trim()}
                    className={`px-5 h-11 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-md ${
                      adminNote.trim()
                        ? 'bg-white text-black hover:bg-neutral-200'
                        : 'bg-white/10 text-neutral-500 cursor-not-allowed'
                    }`}
                  >
                    Enregistrer la Note
                  </button>
                </div>

                {/* ACTIVE DOSSIER NOTES DISPLAY */}
                {citizenAdminNotes.length > 0 && (
                  <div className="mt-2 pt-3 border-t border-white/5 flex flex-col gap-2.5">
                    <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block">
                      Notes Actives au Dossier ({citizenAdminNotes.length}) :
                    </span>
                    <div className="space-y-2">
                      {citizenAdminNotes.map((noteItem, nIdx) => {
                        const badgeInfo = getSeverityBadge(noteItem.severity);
                        return (
                          <div
                            key={`note_card_${noteItem.id}_${nIdx}`}
                            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${badgeInfo.bg} ${badgeInfo.border}`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase shrink-0 mt-0.5 ${badgeInfo.badgeBg}`}>
                                {badgeInfo.label}
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white break-words">
                                  « {noteItem.text} »
                                </p>
                                <span className="text-[11px] font-mono text-neutral-400 mt-0.5 block">
                                  Par <strong className="text-neutral-200">{noteItem.author}</strong> • {noteItem.date}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={handleClearAdminNote}
                              className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer shrink-0 self-end sm:self-center"
                            >
                              Lever / Clôturer
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Logs Timeline List */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <History size={15} className="text-neutral-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                      Registre d'Audit & Événements Réels
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Scope Switcher */}
                    <div className="flex items-center p-0.5 rounded-lg bg-neutral-900 border border-white/10 text-[11px] font-medium">
                      <button
                        type="button"
                        onClick={() => setLogScope('citizen')}
                        className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                          logScope === 'citizen'
                            ? 'bg-white text-black font-bold shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        Ce Citoyen ({citizenLogs.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setLogScope('all')}
                        className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                          logScope === 'all'
                            ? 'bg-white text-black font-bold shadow-sm'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        Tous les Logs ({liveLogs.length})
                      </button>
                    </div>

                    {/* Refresh Button */}
                    <button
                      type="button"
                      onClick={loadLiveLogs}
                      disabled={isLoadingLogs}
                      title="Rafraîchir les logs depuis Supabase"
                      className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-neutral-300 hover:text-white text-[11px] font-mono flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw size={12} className={isLoadingLogs ? 'animate-spin text-white' : ''} />
                      <span className="hidden sm:inline">Actualiser</span>
                    </button>
                  </div>
                </div>

                {isLoadingLogs ? (
                  <div className="py-12 flex flex-col items-center justify-center text-neutral-400 text-xs gap-2">
                    <RefreshCw size={20} className="animate-spin text-white" />
                    <span>Récupération des logs en direct...</span>
                  </div>
                ) : citizenLogs.length === 0 ? (
                  <div className="py-12 px-6 flex flex-col items-center justify-center text-center rounded-2xl bg-white/[0.02] border border-white/5 gap-2">
                    <ShieldAlert size={28} className="text-neutral-600 mb-1" />
                    <h4 className="text-sm font-bold text-white">Aucun événement ciblé pour ce citoyen</h4>
                    <p className="text-xs text-neutral-500 max-w-sm">
                      Aucune action enregistrée sous le matricule #{draft.citizenId}. Vous pouvez consulter les événements généraux du casino.
                    </p>
                    <button
                      type="button"
                      onClick={() => setLogScope('all')}
                      className="mt-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Afficher les {liveLogs.length} logs globaux du casino
                    </button>
                  </div>
                ) : (
                  citizenLogs.map((log, idx) => {
                    const isNoteLog = log.action === 'Note Administrative' || log.action === 'Note Résolue';
                    const cat = log.category;
                    const catBadge =
                      isNoteLog
                        ? 'bg-white/20 text-white border-white/40'
                        : cat === 'WHEEL'
                        ? 'bg-white/10 text-white border-white/20'
                        : cat === 'CITIZEN'
                        ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
                        : cat === 'ECONOMY'
                        ? 'bg-sky-400/10 text-sky-400 border-sky-400/20'
                        : 'bg-purple-400/10 text-purple-400 border-purple-400/20';

                    // Clean presentation for note logs: strip messy technical prefixes
                    const cleanDetail = isNoteLog
                      ? log.detail.replace(/^\[[^\]]+\]\s*/, '').replace(/^Fiche\s*#[^:]+:\s*/i, '')
                      : log.detail;

                    return (
                      <div
                        key={`log_${log.id || idx}_${idx}`}
                        className={`p-3.5 rounded-2xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs ${
                          isNoteLog
                            ? 'bg-white/[0.06] border-white/25 shadow-sm'
                            : 'bg-neutral-900/60 border-white/5 hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-bold shrink-0 ${catBadge}`}>
                            {isNoteLog ? '📝 NOTE' : log.category}
                          </span>
                          <div className="min-w-0">
                            <div className={`font-semibold break-words ${isNoteLog ? 'text-white text-sm' : 'text-white'}`}>
                              {isNoteLog ? `« ${cleanDetail} »` : cleanDetail}
                            </div>
                            <span className="text-[11px] text-neutral-500">{log.action}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-xs font-mono text-neutral-400 shrink-0 self-end sm:self-auto">
                          <span>{log.author}</span>
                          <span className="text-neutral-600">•</span>
                          <span className="text-neutral-300">{log.timestamp}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 sm:p-6 border-t border-white/10 bg-neutral-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
            <span>Matricule actif :</span>
            <strong className="text-white">#{draft.citizenId}</strong>
            <span className="text-neutral-600">•</span>
            <span>{draft.role}</span>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-3 rounded-xl bg-white/5 border border-white/10 text-neutral-400 hover:text-white text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="flex-1 sm:flex-none px-6 py-3 rounded-xl bg-white text-black text-xs font-semibold uppercase tracking-wider hover:bg-neutral-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.2)] cursor-pointer"
            >
              Enregistrer les Modifications
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
