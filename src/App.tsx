import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDoc, doc, setDoc, updateDoc, serverTimestamp, or, and } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { Confession, UserProfile, ConfessionMood } from './types';
import { generateRandomUsername, generateAvatarUrl } from './utils/profile';
import ConfessionCard from './components/ConfessionCard';
import ConfessionForm from './components/ConfessionForm';
import AdminDashboard from './components/AdminDashboard';
import UserStats from './components/UserStats';
import UserProfilePage from './components/UserProfilePage';
import ConfessionBattles from './components/ConfessionBattles';
import GuessTheTruth from './components/GuessTheTruth';
import Leaderboard from './components/Leaderboard';
import DailyPromptSection from './components/DailyPromptSection';
import SurpriseConfessionDrop from './components/SurpriseConfessionDrop';
import Logo from './components/Logo';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, ShieldAlert, Plus, X, Filter, TrendingUp, Clock, BarChart3, Swords, Brain, Sparkles, Trophy, HelpCircle, Gift, User, LogIn, Loader2, Home } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CATEGORIES = ['All', 'General', 'Love', 'Work', 'Regret', 'Secret', 'Funny'];
const MOODS: { id: ConfessionMood | 'All'; label: string; emoji: string }[] = [
  { id: 'All', label: 'All', emoji: '✨' },
  { id: 'sad', label: 'Sad', emoji: '😭' },
  { id: 'love', label: 'Love', emoji: '❤️' },
  { id: 'drama', label: 'Drama', emoji: '🤯' },
  { id: 'funny', label: 'Funny', emoji: '😂' },
];

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 text-center">
          <div className="glass p-8 rounded-2xl max-w-md">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-serif italic mb-4">Something went wrong</h2>
            <p className="text-white/40 text-sm mb-6">
              {this.state.error?.message?.startsWith('{') 
                ? "A database error occurred. Please check your connection."
                : "An unexpected error occurred."}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-accent text-white px-6 py-2 rounded-full font-medium"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [view, setView] = useState<'feed' | 'admin' | 'stats' | 'profile' | 'battles' | 'truth' | 'leaderboard' | 'trusted'>('feed');
  const [targetUsername, setTargetUsername] = useState<string | undefined>();
  const [showForm, setShowForm] = useState(false);
  const [initialCategory, setInitialCategory] = useState<string | undefined>();
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('All');
  const [moodFilter, setMoodFilter] = useState<ConfessionMood | 'All'>('All');
  const [communityType, setCommunityType] = useState<'All' | 'College' | 'City' | 'Workplace'>('All');
  const [communityName, setCommunityName] = useState('');
  const [sortBy, setSortBy] = useState<'latest' | 'trending'>('latest');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Scroll Lock for Modal
  useEffect(() => {
    if (showForm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showForm]);

  useEffect(() => {
    if (!isAuthReady || !auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        setUserProfile(doc.data() as UserProfile);
      }
    }, (error) => {
      console.error("User profile snapshot error:", error);
    });
    return () => unsubscribe();
  }, [isAuthReady]);

  const handleProfileClick = (username: string) => {
    setTargetUsername(username);
    setView('profile');
  };

  const handleGoogleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code !== 'auth/cancelled-popup-request' && err.code !== 'auth/popup-closed-by-user') {
        console.error("Google login failed:", err);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (err: any) {
          if (err.code === 'auth/admin-restricted-operation') {
            console.warn("Anonymous Auth is disabled in Firebase Console.");
          } else {
            console.error("Anonymous auth failed:", err);
          }
        }
      } else {
        // Check for profile
        const profileRef = doc(db, 'users', user.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (!profileSnap.exists()) {
          const username = generateRandomUsername();
          const avatarUrl = generateAvatarUrl(username);
          const isAdminEmail = user.email === 'dhandamarket@gmail.com' || user.email === 'admin.loginmyauth118@gmail.com' || user.email === 'team.tgprimetime@gmail.com';
          
          const newProfile: UserProfile = {
            uid: user.uid,
            email: user.email,
            username,
            username_lower: username.toLowerCase(),
            avatarUrl,
            role: isAdminEmail ? 'admin' : 'user',
            isPublic: true,
            streakCount: 0,
            createdAt: serverTimestamp(),
            lastActive: serverTimestamp(),
            displayName: user.displayName,
            photoURL: user.photoURL,
            stats: {
              totalPosts: 0,
              totalLikes: 0,
              totalViews: 0,
              totalRelatable: 0
            }
          };
          
          await setDoc(profileRef, newProfile);
          // Also claim username
          await setDoc(doc(db, 'usernames', username.toLowerCase()), { uid: user.uid });
        } else {
          // Update lastActive and sync profile info
          const data = profileSnap.data() as UserProfile;
          const isAdminEmail = user.email === 'dhandamarket@gmail.com' || user.email === 'admin.loginmyauth118@gmail.com' || user.email === 'team.tgprimetime@gmail.com';
          
          const updates: any = {
            lastActive: serverTimestamp(),
            displayName: user.displayName,
            photoURL: user.photoURL
          };

          if (isAdminEmail && data.role !== 'admin') {
            updates.role = 'admin';
          }

          await updateDoc(profileRef, updates);
        }
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !auth.currentUser || view === 'admin') return;

    setLoading(true);
    let q;
    
    if (view === 'trusted') {
      const email = auth.currentUser?.email;
      const username = userProfile?.username;

      if (!email && !username) {
        setConfessions([]);
        setLoading(false);
        return;
      }

      const conditions = [];
      if (email) conditions.push(where('invitedEmails', 'array-contains', email));
      if (username) conditions.push(where('invitedUsernames', 'array-contains', username));

      q = query(
        collection(db, 'confessions'),
        and(
          where('status', '==', 'published'),
          where('isPrivate', '==', true),
          or(...conditions)
        )
      );
    } else {
      q = query(
        collection(db, 'confessions'),
        where('status', '==', 'published'),
        where('isPrivate', '==', false)
      );
    }

    if (category !== 'All' && view !== 'trusted') {
      q = query(q, where('category', '==', category));
    }

    if (moodFilter !== 'All' && view !== 'trusted') {
      q = query(q, where('mood', '==', moodFilter));
    }

    if (communityType !== 'All' && view !== 'trusted') {
      q = query(q, where('community.type', '==', communityType));
      if (communityName.trim()) {
        q = query(q, where('community.name', '==', communityName.trim()));
      }
    }

    // Remove orderBy from query to avoid index requirement
    q = query(q, limit(100)); // Fetch more to allow client-side sorting

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Confession));
      
      // Sort client-side
      if (sortBy === 'latest') {
        data.sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
      } else {
        data.sort((a, b) => {
          if (b.score !== a.score) return (b.score || 0) - (a.score || 0);
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
      }

      setConfessions(data.slice(0, 30)); // Keep only top 30
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'confessions');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthReady, view, category, moodFilter, communityType, communityName, sortBy]);

  return (
    <div className="min-h-screen relative overflow-x-hidden pb-20">
      <div className="atmosphere" />
      
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-white/5 backdrop-blur-xl transition-all duration-300">
        <div className="max-w-7xl mx-auto flex items-center h-14 md:h-20 px-4 md:px-8">
          {/* Logo */}
          <div className="flex items-center shrink-0">
            <div 
              className="flex items-center gap-2 md:gap-4 cursor-pointer group shrink-0"
              onClick={() => { setView('feed'); setCategory('All'); setCommunityType('All'); setCommunityName(''); setMoodFilter('All'); setTargetUsername(undefined); }}
            >
              <div className="w-8 h-8 md:w-12 md:h-12 bg-accent/10 rounded-lg md:rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(255,78,0,0.2)] group-hover:scale-110 group-hover:rotate-6 transition-all duration-300 overflow-hidden p-1.5 md:p-2.5">
                <Logo className="w-full h-full" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg md:text-3xl font-serif italic tracking-tight leading-none">Cloak Confess</h1>
                <span className="text-[8px] md:text-xs text-white/30 font-mono uppercase tracking-[0.2em] mt-0.5 md:mt-1">Anonymous Whispers</span>
              </div>
            </div>
          </div>

          {/* Desktop Search - Centered */}
          <div className="hidden md:flex flex-1 justify-center min-w-0">
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 md:gap-6 shrink-0">
            {(auth.currentUser?.isAnonymous !== false) && (
              <button
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="hidden lg:flex items-center gap-2 text-xs text-white/60 hover:text-white border border-white/10 px-4 py-2 rounded-xl transition-all hover:bg-white/5 disabled:opacity-50"
              >
                {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                <span>{isLoggingIn ? 'Signing In...' : 'Sign In'}</span>
              </button>
            )}
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10">
              {[
                { id: 'feed', icon: Home, label: 'Home', action: () => { setTargetUsername(undefined); setView('feed'); setCategory('All'); setCommunityType('All'); setCommunityName(''); setMoodFilter('All'); } },
                { id: 'trusted', icon: ShieldAlert, label: 'Trusted', action: () => { setTargetUsername(undefined); setView('trusted' === view ? 'feed' : 'trusted'); } },
                { id: 'battles', icon: Swords, label: 'Battles', action: () => { setTargetUsername(undefined); setView('battles' === view ? 'feed' : 'battles'); } },
                { id: 'truth', icon: Brain, label: 'Truth', action: () => { setTargetUsername(undefined); setView('truth' === view ? 'feed' : 'truth'); } },
                { id: 'leaderboard', icon: Trophy, label: 'Top', action: () => { setTargetUsername(undefined); setView('leaderboard' === view ? 'feed' : 'leaderboard'); } },
                { id: 'stats', icon: BarChart3, label: 'Stats', action: () => { setTargetUsername(undefined); setView('stats' === view ? 'feed' : 'stats'); } },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={item.action}
                  className={cn(
                    "flex items-center gap-2 px-3 xl:px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                    view === item.id && !targetUsername 
                      ? "bg-accent text-white shadow-lg shadow-accent/20" 
                      : "text-white/40 hover:text-white hover:bg-white/5"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="hidden xl:inline">{item.label}</span>
                </button>
              ))}

              <button
                onClick={() => { setTargetUsername(undefined); setView('profile' === view ? 'feed' : 'profile'); }}
                className={cn(
                  "flex items-center gap-2 px-3 xl:px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                  view === 'profile' && !targetUsername ? "bg-accent text-white shadow-lg shadow-accent/20" : "text-white/40 hover:text-white hover:bg-white/5"
                )}
              >
                {userProfile ? (
                  <img 
                    src={userProfile.avatarUrl} 
                    alt={userProfile.username}
                    className="w-4 h-4 rounded-full bg-white/5"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <User className="w-4 h-4" />
                )}
                <span className="hidden xl:inline">Profile</span>
              </button>
            </nav>

            <button
              onClick={() => setShowForm(true)}
              className="hidden md:flex items-center gap-2 bg-white text-black px-8 py-3 rounded-2xl font-bold hover:bg-accent hover:text-white transition-all shadow-xl active:scale-95"
            >
              <Plus className="w-5 h-5" />
              Confess
            </button>

            {/* Mobile Actions (Minimal) */}
            <div className="md:hidden flex items-center gap-2">
              <button
                onClick={() => { setTargetUsername(undefined); setView('leaderboard' === view ? 'feed' : 'leaderboard'); }}
                className={cn(
                  "p-2 rounded-full transition-all",
                  view === 'leaderboard' ? "bg-accent text-white" : "text-white/40 hover:text-white"
                )}
              >
                <Trophy className="w-5 h-5" />
              </button>
               <button
                onClick={() => { setTargetUsername(undefined); setView('stats' === view ? 'feed' : 'stats'); }}
                className={cn(
                  "p-2 rounded-full transition-all",
                  view === 'stats' ? "bg-accent text-white" : "text-white/40 hover:text-white"
                )}
              >
                <BarChart3 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 pt-10 md:pt-20 pb-24 md:pb-20">
        <AnimatePresence mode="wait">
          {view === 'feed' ? (
            <motion.div
              key="feed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 md:space-y-12"
            >
              {!targetUsername && (
                <>
                  {/* Hero Section */}
                  <section className="relative overflow-hidden rounded-[1.25rem] md:rounded-[1.5rem] bg-gradient-to-br from-accent/20 via-accent/5 to-transparent p-3 md:p-6 border border-white/5 shadow-2xl">
                    <div className="relative z-10 max-w-xl">
                      <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 }}
                      >
                        <div className="inline-flex items-center gap-1.5 md:gap-2 bg-accent/10 px-1.5 py-0.5 rounded-full border border-accent/20 mb-1.5 md:mb-2">
                          <Sparkles className="w-2.5 h-2.5 md:w-3 md:h-3 text-accent animate-pulse" />
                          <span className="text-[7px] md:text-[8px] font-mono text-accent uppercase tracking-[0.2em]">The World's Safest Secret Community</span>
                        </div>
                        <h2 className="text-xl md:text-3xl font-serif italic mb-2 md:mb-3 leading-tight tracking-tight">
                          Your secrets are <span className="text-accent underline decoration-accent/20 underline-offset-[6px] md:underline-offset-[8px]">safe</span> with us.
                        </h2>
                        <p className="text-xs md:text-base text-white/40 mb-3 md:mb-4 leading-relaxed font-light max-w-md">
                          Join thousands of others sharing their deepest thoughts anonymously. No tracking, no judgment, just pure expression.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button 
                            onClick={() => setShowForm(true)}
                            className="bg-accent text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-bold text-[10px] md:text-sm hover:scale-105 transition-all shadow-[0_10px_20px_rgba(255,78,0,0.3)] active:scale-95 group flex items-center gap-1.5 md:gap-2"
                          >
                            <span>Start Confessing</span>
                            <Plus className="w-3 h-3 md:w-3.5 md:h-3.5 group-hover:rotate-90 transition-transform" />
                          </button>
                          <button className="bg-white/5 backdrop-blur-2xl border border-white/10 text-white px-3 py-1.5 md:px-4 md:py-2 rounded-lg font-bold text-[10px] md:text-sm hover:bg-white/10 transition-all active:scale-95">
                            Explore Stories
                          </button>
                        </div>
                      </motion.div>
                    </div>
                    <div className="absolute top-0 right-0 w-1/2 md:w-2/3 h-full opacity-[0.03] md:opacity-[0.05] pointer-events-none flex items-center justify-center">
                      <Logo className="w-full h-full rotate-12 translate-x-1/4 -translate-y-1/4" />
                    </div>
                  </section>

                  {/* Daily Prompt */}
                  {isAuthReady && (
                    <DailyPromptSection onAnswer={() => { setInitialCategory('Daily Prompt'); setShowForm(true); }} />
                  )}

                      {/* Game Promotion Grid */}
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {[
                          { id: 'battles', icon: Swords, title: 'Confession Battles', desc: 'Vote on the most relatable secrets.', color: 'text-accent', bg: 'hover:border-accent/30' },
                          { id: 'leaderboard', icon: Trophy, title: 'Top Whisperers', desc: 'See who\'s the most relatable.', color: 'text-yellow-500', bg: 'hover:border-yellow-500/30' },
                          { id: 'truth', icon: Brain, title: 'Guess the Truth', desc: 'Can you spot the human?', color: 'text-purple-400', bg: 'hover:border-purple-500/30' }
                        ].map((game) => (
                          <button
                            key={game.id}
                            onClick={() => setView(game.id as any)}
                            className={cn(
                              "group relative overflow-hidden glass p-6 rounded-[2rem] border border-white/5 transition-all text-left",
                              game.bg
                            )}
                          >
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-20 transition-opacity">
                              <game.icon className="w-24 h-24" />
                            </div>
                            <div className="relative z-10 space-y-3">
                              <div className={cn("flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest", game.color)}>
                                <Sparkles className="w-3 h-3" />
                                Live Now
                              </div>
                              <h3 className="text-2xl font-serif italic">{game.title}</h3>
                              <p className="text-white/40 text-base font-light leading-relaxed">{game.desc}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                </>
              )}

              {/* Feed Controls */}
              <div className="space-y-12">
                <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-12">
                  <div className="space-y-4">
                    <h3 className="text-4xl md:text-6xl font-serif italic">
                      {targetUsername ? `Whispers from @${targetUsername}` : 'Recent Whispers'}
                    </h3>
                    <p className="text-xl text-white/30 font-light">
                      {targetUsername ? 'Exploring anonymous thoughts from this user' : 'What the world is thinking right now'}
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-1.5 md:gap-2 bg-white/5 p-1.5 md:p-2 rounded-xl md:rounded-2xl border border-white/10">
                      {['Latest', 'Trending'].map((s) => (
                        <button
                          key={s}
                          onClick={() => setSortBy(s.toLowerCase() as any)}
                          className={cn(
                            "px-4 md:px-8 py-2 md:py-3 rounded-lg md:rounded-xl text-[10px] md:text-sm font-medium transition-all",
                            sortBy === s.toLowerCase() ? "bg-white text-black shadow-xl" : "text-white/40 hover:text-white hover:bg-white/5"
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <button className="p-2.5 md:p-4 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all">
                      <Filter className="w-4 h-4 md:w-6 md:h-6" />
                    </button>
                  </div>
                </div>

                {/* Filters Bar */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  <div className="glass p-3 md:p-6 rounded-[1.25rem] md:rounded-[2.5rem] border border-white/5 flex items-center gap-3 md:gap-4 overflow-x-auto no-scrollbar">
                    <Filter className="w-3.5 h-3.5 md:w-5 md:h-5 text-white/20 flex-shrink-0" />
                    {CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className={cn(
                          "px-3 md:px-6 py-1.5 md:py-2.5 rounded-lg md:rounded-xl text-[10px] md:text-sm font-medium transition-all whitespace-nowrap",
                          category === cat 
                            ? "bg-white text-black shadow-lg" 
                            : "text-white/40 hover:text-white hover:bg-white/5"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="glass p-3 md:p-6 rounded-[1.25rem] md:rounded-[2.5rem] border border-white/5 flex items-center gap-4 md:gap-6">
                    <div className="flex items-center gap-2 md:gap-3 overflow-x-auto no-scrollbar">
                      <span className="text-[8px] md:text-[10px] uppercase tracking-[0.2em] text-white/20 font-mono">Community</span>
                      {['All', 'College', 'City', 'Workplace'].map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setCommunityType(type as any);
                            if (type === 'All') setCommunityName('');
                          }}
                          className={cn(
                            "px-2.5 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[9px] md:text-xs font-medium transition-all border",
                            communityType === type 
                              ? "bg-accent/20 text-accent border-accent/30" 
                              : "text-white/30 border-white/5 hover:border-white/20"
                          )}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                    {communityType !== 'All' && (
                      <div className="flex-1">
                        <input 
                          type="text"
                          value={communityName}
                          onChange={(e) => setCommunityName(e.target.value)}
                          placeholder={`Enter ${communityType} name...`}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-2 text-sm focus:outline-none focus:border-accent/50 transition-all placeholder:text-white/10"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Mood Filter */}
                <div className="flex items-center gap-2 md:gap-4 overflow-x-auto no-scrollbar pb-4">
                  {MOODS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMoodFilter(m.id)}
                      className={cn(
                        "flex items-center gap-2 md:gap-3 px-4 md:px-8 py-2 md:py-4 rounded-[1.25rem] md:rounded-[2rem] border transition-all whitespace-nowrap group",
                        moodFilter === m.id
                          ? "bg-accent text-white border-accent shadow-2xl shadow-accent/40 scale-105"
                          : "bg-white/5 text-white/60 border-white/10 hover:border-white/30 hover:bg-white/10"
                      )}
                    >
                      <span className="text-lg md:text-2xl group-hover:scale-125 transition-transform">{m.emoji}</span>
                      <span className="text-[10px] md:text-sm font-bold uppercase tracking-widest">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Feed Content */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="glass h-80 rounded-[2.5rem] animate-pulse bg-white/5" />
                  ))}
                </div>
              ) : confessions.length === 0 ? (
                <div className="text-center py-12 md:py-20 glass rounded-[1.5rem] md:rounded-[2rem] border-dashed border-2 border-white/5 mx-auto max-w-2xl">
                  <div className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 md:mb-6 opacity-20">
                    <Logo />
                  </div>
                  <h4 className="text-xl md:text-2xl font-serif italic text-white/40">The silence is deafening...</h4>
                  <p className="text-white/20 mt-2 md:mt-3 text-xs md:text-base">Be the first to speak in this shadow.</p>
                  <button 
                    onClick={() => setShowForm(true)}
                    className="mt-6 md:mt-8 bg-accent/10 text-accent px-6 py-2.5 md:px-8 md:py-3 rounded-lg md:rounded-xl border border-accent/20 hover:bg-accent hover:text-white transition-all font-bold text-xs md:text-sm"
                  >
                    Share a Secret
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8">
                  <AnimatePresence mode="popLayout">
                    {confessions.map((c) => (
                      <ConfessionCard 
                        key={c.id} 
                        confession={c} 
                        onProfileClick={handleProfileClick} 
                        currentUserProfile={userProfile}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </motion.div>
          ) : view === 'profile' ? (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <UserProfilePage 
                username={targetUsername} 
                onClose={() => setView('feed')} 
                onViewChange={(v) => setView(v as any)}
                currentUserProfile={userProfile}
              />
            </motion.div>
          ) : view === 'leaderboard' ? (
            <motion.div
              key="leaderboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Leaderboard />
            </motion.div>
          ) : view === 'trusted' ? (
            <motion.div
              key="trusted"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-16"
            >
              <div className="text-center max-w-3xl mx-auto space-y-6">
                <h2 className="text-6xl md:text-8xl font-serif italic leading-tight">
                  Trusted <span className="text-accent">Circle</span>
                </h2>
                <p className="text-white/40 text-2xl font-light">
                  Confessions shared only with you and a few other trusted souls.
                </p>
                {!auth.currentUser?.email && (
                  <div className="p-6 bg-yellow-500/10 border border-yellow-500/20 rounded-[2rem] text-yellow-500 text-lg flex items-center justify-center gap-4">
                    <ShieldAlert className="w-6 h-6" />
                    <span>You must be signed in with Google to see private confessions.</span>
                  </div>
                )}
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="glass h-80 rounded-[2.5rem] animate-pulse bg-white/5" />
                  ))}
                </div>
              ) : confessions.length === 0 ? (
                <div className="text-center py-12 md:py-20 glass rounded-[1.5rem] md:rounded-[2rem] border-dashed border-2 border-white/5 opacity-40 italic font-serif text-lg md:text-xl mx-auto max-w-2xl">
                  No private whispers for you yet...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                  {confessions.map((c) => (
                    <ConfessionCard key={c.id} confession={c} onProfileClick={handleProfileClick} currentUserProfile={userProfile} />
                  ))}
                </div>
              )}
            </motion.div>
          ) : view === 'battles' ? (
            <motion.div
              key="battles"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ConfessionBattles />
            </motion.div>
          ) : view === 'truth' ? (
            <motion.div
              key="truth"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <GuessTheTruth />
            </motion.div>
          ) : view === 'stats' ? (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <UserStats />
            </motion.div>
          ) : view === 'admin' ? (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <AdminDashboard onProfileClick={handleProfileClick} />
            </motion.div>
          ) : null}
      </AnimatePresence>
    </main>

      {/* Post Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-white/10 rounded-[2.5rem] w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl relative"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowForm(false)}
                className="absolute top-6 right-6 z-[110] p-2 text-white/40 hover:text-white transition-all hover:rotate-90 bg-white/5 rounded-full"
              >
                <X className="w-6 h-6" />
              </button>

              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
                <ConfessionForm 
                  onComplete={() => { setShowForm(false); setInitialCategory(undefined); }} 
                  initialCategory={initialCategory}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Surprise Drops */}
      <SurpriseConfessionDrop />

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/5 px-2 py-2 flex items-center justify-between gap-1 backdrop-blur-xl">
        <button
          onClick={() => { setTargetUsername(undefined); setView('feed'); setCategory('All'); setCommunityType('All'); setCommunityName(''); setMoodFilter('All'); }}
          className={cn(
            "flex flex-col items-center gap-0.5 transition-all flex-1",
            view === 'feed' && !targetUsername ? "text-accent" : "text-white/40"
          )}
        >
          <Home className="w-5 h-5" />
          <span className="text-[8px] font-medium">Home</span>
        </button>
        <button
          onClick={() => { setTargetUsername(undefined); setView('trusted' === view ? 'feed' : 'trusted'); }}
          className={cn(
            "flex flex-col items-center gap-0.5 transition-all flex-1",
            view === 'trusted' ? "text-accent" : "text-white/40"
          )}
        >
          <ShieldAlert className="w-5 h-5" />
          <span className="text-[8px] font-medium">Trusted</span>
        </button>
        <button
          onClick={() => { setTargetUsername(undefined); setView('battles' === view ? 'feed' : 'battles'); }}
          className={cn(
            "flex flex-col items-center gap-0.5 transition-all flex-1",
            view === 'battles' ? "text-accent" : "text-white/40"
          )}
        >
          <Swords className="w-5 h-5" />
          <span className="text-[8px] font-medium">Battles</span>
        </button>
        <button
          onClick={() => { setTargetUsername(undefined); setView('truth' === view ? 'feed' : 'truth'); }}
          className={cn(
            "flex flex-col items-center gap-0.5 transition-all flex-1",
            view === 'truth' ? "text-accent" : "text-white/40"
          )}
        >
          <Brain className="w-5 h-5" />
          <span className="text-[8px] font-medium">Truth</span>
        </button>
        <button
          onClick={() => { setTargetUsername(undefined); setView('leaderboard' === view ? 'feed' : 'leaderboard'); }}
          className={cn(
            "flex flex-col items-center gap-0.5 transition-all flex-1",
            view === 'leaderboard' ? "text-accent" : "text-white/40"
          )}
        >
          <Trophy className="w-5 h-5" />
          <span className="text-[8px] font-medium">Top</span>
        </button>
        <button
          onClick={() => { setTargetUsername(undefined); setView('profile' === view ? 'feed' : 'profile'); }}
          className={cn(
            "flex flex-col items-center gap-0.5 transition-all flex-1",
            view === 'profile' && !targetUsername ? "text-accent" : "text-white/40"
          )}
        >
          {userProfile ? (
            <img 
              src={userProfile.avatarUrl} 
              alt={userProfile.username}
              className={cn("w-5 h-5 rounded-full bg-white/5 border", view === 'profile' ? "border-accent" : "border-transparent")}
              referrerPolicy="no-referrer"
            />
          ) : (
            <User className="w-5 h-5" />
          )}
          <span className="text-[8px] font-medium">Profile</span>
        </button>
      </nav>

      {/* Floating Action Button (Mobile) */}
      <button
        onClick={() => setShowForm(true)}
        className="md:hidden fixed bottom-20 right-4 z-40 w-14 h-14 bg-accent text-white rounded-full shadow-[0_0_20px_rgba(255,78,0,0.5)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all"
      >
        <Plus className="w-8 h-8" />
      </button>

      {/* Footer */}
      <footer className="mt-20 py-12 border-t border-white/5 text-center">
        <p className="text-white/20 text-xs font-mono tracking-widest uppercase">
          Cloak Confess © 2026 • Anonymous & Secure
        </p>
      </footer>
    </div>
  );
}
