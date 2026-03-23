import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
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
import { motion, AnimatePresence } from 'motion/react';
import { Shield, ShieldAlert, Plus, X, Filter, TrendingUp, Clock, VenetianMask, BarChart3, Swords, Brain, Sparkles, Trophy, HelpCircle, Gift, User, LogIn, Loader2, Home } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

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
          const isAdminEmail = user.email === 'admin.loginmyauth118@gmail.com';
          
          const newProfile: UserProfile = {
            uid: user.uid,
            username,
            avatarUrl,
            role: isAdminEmail ? 'admin' : 'user',
            isPublic: true,
            streakCount: 0,
            createdAt: serverTimestamp(),
            stats: {
              totalPosts: 0,
              totalLikes: 0,
              totalViews: 0,
              totalRelatable: 0
            }
          };
          
          await setDoc(profileRef, newProfile);
          // Also claim username
          await setDoc(doc(db, 'usernames', username), { uid: user.uid });
        } else {
          // Check if admin role needs to be assigned
          const data = profileSnap.data() as UserProfile;
          const isAdminEmail = user.email === 'admin.loginmyauth118@gmail.com';
          if (isAdminEmail && data.role !== 'admin') {
            await updateDoc(profileRef, { role: 'admin' });
          }
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
      <header className="sticky top-0 z-50 glass border-b border-white/5 px-4 md:px-6 py-3 md:py-4 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div 
            className="flex items-center gap-2 md:gap-3 cursor-pointer group"
            onClick={() => { setView('feed'); setCategory('All'); setCommunityType('All'); setCommunityName(''); setMoodFilter('All'); setTargetUsername(undefined); }}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 bg-accent rounded-lg md:rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(255,78,0,0.3)] group-hover:scale-110 transition-transform">
              <VenetianMask className="text-white w-5 h-5 md:w-6 md:h-6" />
            </div>
            <h1 className="text-xl md:text-2xl font-serif italic tracking-tight">Cloak Confess</h1>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {(auth.currentUser?.isAnonymous !== false) && (
              <button
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="text-[10px] md:text-xs text-white/40 hover:text-white border border-white/10 px-2 md:px-3 py-1 md:py-1.5 rounded-lg transition-colors flex items-center gap-1 md:gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoggingIn ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogIn className="w-3 h-3" />}
                <span className="hidden sm:inline">{isLoggingIn ? 'Signing In...' : 'Sign In'}</span>
                <span className="sm:hidden">{isLoggingIn ? '...' : 'In'}</span>
              </button>
            )}
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => { setTargetUsername(undefined); setView('feed'); setCategory('All'); setCommunityType('All'); setCommunityName(''); setMoodFilter('All'); }}
                className={cn(
                  "p-2 rounded-full transition-all",
                  view === 'feed' && !targetUsername ? "bg-accent text-white" : "text-white/40 hover:text-white"
                )}
                title="Home"
              >
                <Home className="w-5 h-5" />
              </button>
              <button
                onClick={() => { setTargetUsername(undefined); setView('trusted' === view ? 'feed' : 'trusted'); }}
                className={cn(
                  "p-2 rounded-full transition-all",
                  view === 'trusted' ? "bg-accent text-white" : "text-white/40 hover:text-white"
                )}
                title="Trusted Circle"
              >
                <ShieldAlert className="w-5 h-5" />
              </button>
              <button
                onClick={() => { setTargetUsername(undefined); setView('battles' === view ? 'feed' : 'battles'); }}
                className={cn(
                  "p-2 rounded-full transition-all",
                  view === 'battles' ? "bg-accent text-white" : "text-white/40 hover:text-white"
                )}
                title="Confession Battles"
              >
                <Swords className="w-5 h-5" />
              </button>
              <button
                onClick={() => { setTargetUsername(undefined); setView('truth' === view ? 'feed' : 'truth'); }}
                className={cn(
                  "p-2 rounded-full transition-all",
                  view === 'truth' ? "bg-accent text-white" : "text-white/40 hover:text-white"
                )}
                title="Guess the Truth"
              >
                <Brain className="w-5 h-5" />
              </button>
              <button
                onClick={() => { setTargetUsername(undefined); setView('leaderboard' === view ? 'feed' : 'leaderboard'); }}
                className={cn(
                  "p-2 rounded-full transition-all",
                  view === 'leaderboard' ? "bg-accent text-white" : "text-white/40 hover:text-white"
                )}
                title="Leaderboard"
              >
                <Trophy className="w-5 h-5" />
              </button>
              <button
                onClick={() => { setTargetUsername(undefined); setView('stats' === view ? 'feed' : 'stats'); }}
                className={cn(
                  "p-2 rounded-full transition-all",
                  view === 'stats' ? "bg-accent text-white" : "text-white/40 hover:text-white"
                )}
                title="Your Stats"
              >
                <BarChart3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => { setTargetUsername(undefined); setView('profile' === view ? 'feed' : 'profile'); }}
                className={cn(
                  "p-2 rounded-full transition-all",
                  view === 'profile' && !targetUsername ? "bg-accent text-white" : "text-white/40 hover:text-white"
                )}
                title="Your Profile"
              >
                {userProfile ? (
                  <img 
                    src={userProfile.avatarUrl} 
                    alt={userProfile.username}
                    className="w-5 h-5 rounded-full bg-white/5"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <User className="w-5 h-5" />
                )}
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="bg-white text-black px-6 py-2 rounded-full font-medium hover:bg-white/90 transition-all flex items-center gap-2 ml-2"
              >
                <Plus className="w-4 h-4" />
                Confess
              </button>
            </div>

            {/* Mobile Actions (Minimal) */}
            <div className="md:hidden flex items-center gap-2">
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

      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-8 md:pt-12 pb-24 md:pb-12">
        <AnimatePresence mode="wait">
          {view === 'admin' ? (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <AdminDashboard />
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
                onViewChange={(v) => setView(v)}
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
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              <div className="text-center max-w-2xl mx-auto space-y-4">
                <h2 className="text-5xl md:text-7xl font-serif italic leading-tight">
                  Trusted <span className="text-accent">Circle</span>
                </h2>
                <p className="text-white/40 text-lg">
                  Confessions shared only with you and a few others.
                </p>
                {!auth.currentUser?.email && (
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl text-yellow-500 text-sm">
                    You must be signed in with Google to see private confessions you've been invited to.
                  </div>
                )}
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="glass h-64 rounded-2xl animate-pulse bg-white/5" />
                  ))}
                </div>
              ) : confessions.length === 0 ? (
                <div className="text-center py-20 opacity-40 italic font-serif text-xl">
                  No private whispers for you yet...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {confessions.map((c) => (
                    <ConfessionCard key={c.id} confession={c} onProfileClick={handleProfileClick} />
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="feed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-12"
            >
              {/* Hero Section */}
            <div className="text-center max-w-2xl mx-auto space-y-4">
              <h2 className="text-5xl md:text-7xl font-serif italic leading-tight">
                What's your <span className="text-accent">secret?</span>
              </h2>
              <p className="text-white/40 text-lg">
                The world is listening, but they don't know it's you.
              </p>
            </div>

            {/* Daily Prompt */}
            <DailyPromptSection onAnswer={() => { setInitialCategory('Daily Prompt'); setShowForm(true); }} />

            {/* Game Promotion */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setView('battles')}
                className="group relative overflow-hidden glass p-6 rounded-3xl border border-white/5 hover:border-accent/30 transition-all text-left"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Swords className="w-20 h-20" />
                </div>
                <div className="relative z-10 space-y-2">
                  <div className="flex items-center gap-2 text-accent font-mono text-[10px] uppercase tracking-widest">
                    <Sparkles className="w-3 h-3" />
                    New Game
                  </div>
                  <h3 className="text-xl font-serif italic">Confession Battles</h3>
                  <p className="text-white/40 text-sm">Vote on the most relatable secrets.</p>
                </div>
              </button>

              <button
                onClick={() => setView('leaderboard')}
                className="group relative overflow-hidden glass p-6 rounded-3xl border border-white/5 hover:border-accent/30 transition-all text-left"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Trophy className="w-20 h-20" />
                </div>
                <div className="relative z-10 space-y-2">
                  <div className="flex items-center gap-2 text-accent font-mono text-[10px] uppercase tracking-widest">
                    <TrendingUp className="w-3 h-3" />
                    Rankings
                  </div>
                  <h3 className="text-xl font-serif italic">Anonymous Leaderboard</h3>
                  <p className="text-white/40 text-sm">See who's the most relatable whisperer.</p>
                </div>
              </button>

              <button
                onClick={() => setView('truth')}
                className="group relative overflow-hidden glass p-6 rounded-3xl border border-white/5 hover:border-purple-500/30 transition-all text-left"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Brain className="w-20 h-20" />
                </div>
                <div className="relative z-10 space-y-2">
                  <div className="flex items-center gap-2 text-purple-400 font-mono text-[10px] uppercase tracking-widest">
                    <Sparkles className="w-3 h-3" />
                    AI Challenge
                  </div>
                  <h3 className="text-xl font-serif italic">Guess the Truth</h3>
                  <p className="text-white/40 text-sm">Can you spot the human among machines?</p>
                </div>
              </button>
            </div>

            {/* Mood Filter */}
            <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-4 scroll-smooth">
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMoodFilter(m.id)}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 rounded-2xl border transition-all whitespace-nowrap group",
                    moodFilter === m.id
                      ? "bg-accent text-white border-accent shadow-lg shadow-accent/20 scale-105"
                      : "bg-white/5 text-white/60 border-white/10 hover:border-white/30 hover:bg-white/10"
                  )}
                >
                  <span className="text-xl group-hover:scale-125 transition-transform">{m.emoji}</span>
                  <span className="text-sm font-medium">{m.label}</span>
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 glass p-4 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
                  <Filter className="w-4 h-4 text-white/20 mr-2 flex-shrink-0" />
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCategory(cat)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                        category === cat 
                          ? "bg-white text-black" 
                          : "text-white/40 hover:text-white hover:bg-white/5"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 bg-black/20 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={() => setSortBy('latest')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                      sortBy === 'latest' ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
                    )}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Latest
                  </button>
                  <button
                    onClick={() => setSortBy('trending')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all",
                      sortBy === 'trending' ? "bg-white/10 text-white" : "text-white/40 hover:text-white"
                    )}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    Trending
                  </button>
                </div>
              </div>

              {/* Community Filters */}
              <div className="flex flex-col md:flex-row items-center gap-4 glass p-4 rounded-2xl border border-white/5">
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] uppercase tracking-widest text-white/20 font-mono mr-2">Community</span>
                  {['All', 'College', 'City', 'Workplace'].map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setCommunityType(type as any);
                        if (type === 'All') setCommunityName('');
                      }}
                      className={cn(
                        "px-3 py-1 rounded-lg text-[10px] font-medium transition-all border",
                        communityType === type 
                          ? "bg-blue-500/20 text-blue-400 border-blue-500/30" 
                          : "text-white/30 border-white/5 hover:border-white/20"
                      )}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                {communityType !== 'All' && (
                  <div className="flex-1 w-full">
                    <input 
                      type="text"
                      value={communityName}
                      onChange={(e) => setCommunityName(e.target.value)}
                      placeholder={`Search ${communityType} name...`}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-1.5 text-xs focus:outline-none focus:border-blue-500/50 transition-colors"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Feed */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="glass h-64 rounded-2xl animate-pulse bg-white/5" />
                ))}
              </div>
            ) : confessions.length === 0 ? (
              <div className="text-center py-20 opacity-40 italic font-serif text-xl">
                The silence is deafening... be the first to speak.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {confessions.map((c) => (
                    <ConfessionCard key={c.id} confession={c} onProfileClick={handleProfileClick} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </main>

      {/* Post Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-0 md:p-6 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full h-full md:h-auto md:max-w-2xl relative bg-background md:rounded-3xl overflow-y-auto no-scrollbar"
            >
              <button
                onClick={() => setShowForm(false)}
                className="absolute top-4 right-4 md:-top-12 md:right-0 p-2 text-white/40 hover:text-white transition-colors z-10"
              >
                <X className="w-8 h-8" />
              </button>
              <div className="p-4 md:p-0">
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
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/5 px-4 py-3 flex items-center justify-around backdrop-blur-xl">
        <button
          onClick={() => { setTargetUsername(undefined); setView('feed'); setCategory('All'); setCommunityType('All'); setCommunityName(''); setMoodFilter('All'); }}
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            view === 'feed' && !targetUsername ? "text-accent" : "text-white/40"
          )}
        >
          <Home className="w-6 h-6" />
          <span className="text-[10px]">Home</span>
        </button>
        <button
          onClick={() => { setTargetUsername(undefined); setView('trusted' === view ? 'feed' : 'trusted'); }}
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            view === 'trusted' ? "text-accent" : "text-white/40"
          )}
        >
          <ShieldAlert className="w-6 h-6" />
          <span className="text-[10px]">Trusted</span>
        </button>
        <button
          onClick={() => { setTargetUsername(undefined); setView('battles' === view ? 'feed' : 'battles'); }}
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            view === 'battles' ? "text-accent" : "text-white/40"
          )}
        >
          <Swords className="w-6 h-6" />
          <span className="text-[10px]">Battles</span>
        </button>
        <button
          onClick={() => { setTargetUsername(undefined); setView('truth' === view ? 'feed' : 'truth'); }}
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            view === 'truth' ? "text-accent" : "text-white/40"
          )}
        >
          <Brain className="w-6 h-6" />
          <span className="text-[10px]">Truth</span>
        </button>
        <button
          onClick={() => { setTargetUsername(undefined); setView('profile' === view ? 'feed' : 'profile'); }}
          className={cn(
            "flex flex-col items-center gap-1 transition-all",
            view === 'profile' && !targetUsername ? "text-accent" : "text-white/40"
          )}
        >
          {userProfile ? (
            <img 
              src={userProfile.avatarUrl} 
              alt={userProfile.username}
              className={cn("w-6 h-6 rounded-full bg-white/5 border", view === 'profile' ? "border-accent" : "border-transparent")}
              referrerPolicy="no-referrer"
            />
          ) : (
            <User className="w-6 h-6" />
          )}
          <span className="text-[10px]">Profile</span>
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
