import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { moderateContent } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Loader2, CheckCircle2, AlertCircle, ShieldAlert, Target, Mic, Square, Palette, Music, Sparkles, BarChart3, User, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { UserProfile, ConfessionTheme, ConfessionMood } from '../types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CATEGORIES = ['General', 'Love', 'Work', 'Regret', 'Secret', 'Funny', 'Daily Prompt'];
const PERSONAS = ['None', 'The Overthinker', 'Secret Lover', 'Broken Hero', 'The Dreamer', 'Silent Observer'];
const MOODS: { id: ConfessionMood; label: string; emoji: string }[] = [
  { id: 'sad', label: 'Sad', emoji: '😭' },
  { id: 'love', label: 'Love', emoji: '❤️' },
  { id: 'drama', label: 'Drama', emoji: '🤯' },
  { id: 'funny', label: 'Funny', emoji: '😂' },
];
const COMMUNITY_TYPES = ['General', 'College', 'City', 'Workplace'] as const;
const THEMES: { id: ConfessionTheme; label: string; bg: string; text: string }[] = [
  { id: 'default', label: 'Default', bg: 'bg-white/5', text: 'text-white' },
  { id: 'sad', label: 'Sad', bg: 'bg-blue-900/20', text: 'text-blue-200' },
  { id: 'aesthetic', label: 'Aesthetic', bg: 'bg-purple-900/20', text: 'text-purple-200' },
  { id: 'neon', label: 'Neon', bg: 'bg-pink-900/20', text: 'text-pink-200' },
  { id: 'dark', label: 'Dark', bg: 'bg-black', text: 'text-white/80' },
];

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

export default function ConfessionForm({ onComplete, initialCategory }: { onComplete: () => void, initialCategory?: string }) {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState(initialCategory || 'General');
  const [mood, setMood] = useState<ConfessionMood>('sad');
  const [persona, setPersona] = useState('None');
  const [communityType, setCommunityType] = useState<typeof COMMUNITY_TYPES[number]>('General');
  const [communityName, setCommunityName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [invitedEmails, setInvitedEmails] = useState('');
  const [invitedUsernames, setInvitedUsernames] = useState('');
  const [theme, setTheme] = useState<ConfessionTheme>('default');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'checking' | 'allowed' | 'blocked' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  
  // Poll State
  const [hasPoll, setHasPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['Yes', 'No']);
  
  // Simple Math CAPTCHA
  const [captcha, setCaptcha] = useState({ num1: 0, num2: 0, result: 0 });
  const [captchaInput, setCaptchaInput] = useState('');

  useEffect(() => {
    generateCaptcha();
    fetchUserProfile();
  }, []);

  const fetchUserProfile = async () => {
    if (!auth.currentUser) return;
    try {
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      if (userDoc.exists()) {
        setUserProfile(userDoc.data() as UserProfile);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${auth.currentUser.uid}`);
    }
  };

  const generateCaptcha = () => {
    const n1 = Math.floor(Math.random() * 10) + 1;
    const n2 = Math.floor(Math.random() * 10) + 1;
    setCaptcha({ num1: n1, num2: n2, result: n1 + n2 });
    setCaptchaInput('');
  };

  const updateStreak = async () => {
    if (!auth.currentUser) return;
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    try {
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          uid: auth.currentUser.uid,
          role: 'user',
          streakCount: 1,
          lastConfessionDate: serverTimestamp()
        });
        return;
      }

      const data = userDoc.data() as UserProfile;
      const lastDate = data.lastConfessionDate?.toDate();
      
      if (!lastDate) {
        await updateDoc(userRef, { streakCount: 1, lastConfessionDate: serverTimestamp() });
        return;
      }

      const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
      const diffDays = Math.floor((today.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Consecutive day
        await updateDoc(userRef, { 
          streakCount: (data.streakCount || 0) + 1, 
          lastConfessionDate: serverTimestamp() 
        });
      } else if (diffDays > 1) {
        // Streak broken
        await updateDoc(userRef, { 
          streakCount: 1, 
          lastConfessionDate: serverTimestamp() 
        });
      }
      // If diffDays === 0, already posted today, don't update streak
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${auth.currentUser.uid}`);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      console.error("Error starting recording:", err);
      setErrorMsg("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!content.trim() && !audioBlob) || !auth.currentUser) return;
    if (parseInt(captchaInput) !== captcha.result) {
      setErrorMsg('Incorrect CAPTCHA answer.');
      return;
    }

    setIsSubmitting(true);
    setStatus('checking');
    setErrorMsg('');

    try {
      let finalContent = content;
      let audioUrl = '';

      // 1. Convert audio to base64 if exists (for prototype)
      if (audioBlob) {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
        });
        reader.readAsDataURL(audioBlob);
        audioUrl = await base64Promise;
        
        if (!finalContent.trim()) {
          finalContent = "[Audio Confession]";
        }
      }

      // 2. Moderate with Gemini
      const moderation = await moderateContent(finalContent);
      
      if (moderation.status === 'blocked') {
        setStatus('blocked');
        setErrorMsg(moderation.reason || 'Content blocked due to safety guidelines.');
        setIsSubmitting(false);
        return;
      }

      // 3. Save to Firestore
      const anonymousId = Math.random().toString(36).substring(2, 10);
      const emailsList = invitedEmails.split(',').map(e => e.trim()).filter(e => e.length > 0);
      const usernamesList = invitedUsernames.split(',').map(u => u.trim()).filter(u => u.length > 0);

      await addDoc(collection(db, 'confessions'), {
        content: finalContent,
        category,
        mood,
        tags: moderation.tags || [],
        persona: persona === 'None' ? null : persona,
        isPrivate,
        invitedEmails: emailsList,
        invitedUsernames: usernamesList,
        community: {
          type: communityType,
          name: communityType === 'General' ? 'Global' : communityName
        },
        status: moderation.status,
        reportsCount: 0,
        commentsCount: 0,
        viewsCount: 0,
        score: 0,
        reactions: {
          relatable: 0,
          dead: 0,
          shocking: 0,
          love: 0
        },
        createdAt: serverTimestamp(),
        anonymousId,
        authorUid: auth.currentUser.uid,
        theme,
        audioUrl: audioUrl || null,
        poll: hasPoll ? {
          question: pollQuestion || "Should I?",
          options: pollOptions.filter(o => o.trim()).map(o => ({ text: o, votes: 0 })),
          voters: []
        } : null
      });

      // 4. Update Streak and Stats
      await updateStreak();
      if (auth.currentUser) {
        const userRef = doc(db, 'users', auth.currentUser.uid);
        await updateDoc(userRef, {
          'stats.totalPosts': (userProfile?.stats?.totalPosts || 0) + 1
        });
      }

      setStatus('allowed');
      setContent('');
      generateCaptcha();
      setTimeout(() => {
        setStatus('idle');
        onComplete();
      }, 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `confessions`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-8">
        <div className="space-y-2">
          <h2 className="text-4xl md:text-5xl font-serif italic leading-tight text-white">
            Share your <br /> <span className="text-white">secret...</span>
          </h2>
          <p className="text-white/40 text-sm md:text-base font-light max-w-[200px] md:max-w-xs">
            Your words are safe in the shadows of Cloak.
          </p>
        </div>
        {userProfile && userProfile.streakCount > 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 border border-white/20 px-4 py-3 rounded-2xl"
          >
            <Sparkles className="w-4 h-4 text-white/60" />
            <span className="text-[10px] font-bold text-white uppercase tracking-[0.2em]">
              {userProfile.streakCount} Day Streak
            </span>
          </motion.div>
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Main Input Card */}
        <div className="bg-zinc-900/50 border border-white/5 rounded-[2.5rem] p-1 overflow-hidden">
          <section className="p-6 pb-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's weighing on your soul? Write it here, anonymously..."
              className="w-full h-32 md:h-40 bg-transparent text-white/80 text-lg md:text-xl font-serif leading-relaxed focus:outline-none transition-all resize-none placeholder:text-white/20"
              maxLength={2000}
              required
            />
          </section>
        </div>

        {/* Mood Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">The Mood</label>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {MOODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMood(m.id)}
                className={cn(
                  "px-4 py-4 rounded-2xl text-xs transition-all border flex items-center justify-center gap-3 group",
                  mood === m.id 
                    ? "bg-white text-black border-white" 
                    : "bg-white/5 text-white/40 border-white/10 hover:border-white/30"
                )}
              >
                <span className="text-xl group-hover:scale-110 transition-transform">{m.emoji}</span>
                <span className="font-medium">{m.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Category Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center">
              <Target className="w-4 h-4 text-white" />
            </div>
            <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">The Category</label>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={cn(
                  "px-5 py-2.5 rounded-xl text-[10px] font-medium transition-all border",
                  category === cat 
                    ? "bg-white text-black border-white" 
                    : "bg-white/5 text-white/40 border-white/10 hover:border-white/30"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Persona & Community Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Your Persona</label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PERSONAS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPersona(p)}
                  className={cn(
                    "px-3 py-3 rounded-xl border text-[9px] font-mono uppercase tracking-widest transition-all text-center",
                    persona === p 
                      ? "bg-white text-black border-white" 
                      : "bg-white/5 border-white/10 text-white/30 hover:border-white/30"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center">
                <Users className="w-4 h-4 text-white" />
              </div>
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">The Community</label>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {COMMUNITY_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setCommunityType(type)}
                    className={cn(
                      "px-3 py-3 rounded-xl border text-[9px] font-mono uppercase tracking-widest transition-all text-center",
                      communityType === type 
                        ? "bg-white text-black border-white" 
                        : "bg-white/5 border-white/10 text-white/30 hover:border-white/30"
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
              {communityType !== 'General' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <input
                    type="text"
                    value={communityName}
                    onChange={(e) => setCommunityName(e.target.value)}
                    placeholder={`Enter ${communityType} name...`}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs focus:outline-none focus:border-white/40 transition-all placeholder:text-white/20"
                    required
                  />
                </motion.div>
              )}
            </div>
          </section>
        </div>

        {/* Interactive Modules */}
        <div className="grid grid-cols-1 gap-4">
          {/* Poll Module */}
          <section className={cn(
            "p-5 rounded-[2rem] border transition-all duration-500",
            hasPoll ? "bg-accent/5 border-accent/30" : "bg-white/[0.02] border-white/5"
          )}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center border transition-all",
                  hasPoll ? "bg-accent text-white border-accent" : "bg-white/5 text-white/40 border-white/10"
                )}>
                  <BarChart3 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif italic text-lg">Add a Poll</h4>
                  <p className="text-[9px] text-white/30 uppercase tracking-widest">Get feedback</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHasPoll(!hasPoll)}
                className={cn(
                  "w-9 h-5 rounded-full transition-all relative shrink-0 border border-white/10",
                  hasPoll ? "bg-accent" : "bg-white/5"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm",
                  hasPoll ? "left-[1.25rem]" : "left-0.5"
                )} />
              </button>
            </div>

            <AnimatePresence>
              {hasPoll && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="What should the world decide?"
                    className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-sm focus:outline-none focus:border-accent/50 transition-all"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    {pollOptions.map((opt, idx) => (
                      <input
                        key={idx}
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...pollOptions];
                          newOpts[idx] = e.target.value;
                          setPollOptions(newOpts);
                        }}
                        placeholder={`Option ${idx + 1}`}
                        className="bg-black/40 border border-white/10 rounded-xl p-3 text-xs focus:outline-none focus:border-accent/50"
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Trusted Circle Module */}
          <section className={cn(
            "p-5 rounded-[2rem] border transition-all duration-500",
            isPrivate ? "bg-accent/5 border-accent/30" : "bg-white/[0.02] border-white/5"
          )}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-xl flex items-center justify-center border transition-all",
                  isPrivate ? "bg-accent text-white border-accent" : "bg-white/5 text-white/40 border-white/10"
                )}>
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-serif italic text-lg">Trusted Circle</h4>
                  <p className="text-[9px] text-white/30 uppercase tracking-widest">Share with specific</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPrivate(!isPrivate)}
                className={cn(
                  "w-9 h-5 rounded-full transition-all relative shrink-0 border border-white/10",
                  isPrivate ? "bg-accent" : "bg-white/5"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all shadow-sm",
                  isPrivate ? "left-[1.25rem]" : "left-0.5"
                )} />
              </button>
            </div>

            <AnimatePresence>
              {isPrivate && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-4 overflow-hidden"
                >
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-white/30">Emails</label>
                    <input
                      type="text"
                      value={invitedEmails}
                      onChange={(e) => setInvitedEmails(e.target.value)}
                      placeholder="soul1@cloak.com, soul2@cloak.com"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-xs focus:outline-none focus:border-accent/50 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-mono uppercase tracking-widest text-white/30">Usernames</label>
                    <input
                      type="text"
                      value={invitedUsernames}
                      onChange={(e) => setInvitedUsernames(e.target.value)}
                      placeholder="whisperer_01, shadow_walker"
                      className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-xs focus:outline-none focus:border-accent/50 transition-all"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* Aesthetic Theme Section */}
        <section className="space-y-4 p-6 rounded-[2rem] bg-zinc-900/50 border border-white/5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-xl font-serif italic">Aesthetic Theme</h4>
              <p className="text-[9px] text-white/30 uppercase tracking-[0.2em]">Dress your secret in color</p>
            </div>
            <Palette className="w-5 h-5 text-white/20" />
          </div>
          <div className="flex flex-wrap gap-3">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={cn(
                  "group relative w-12 h-12 rounded-2xl border-2 transition-all overflow-hidden flex items-center justify-center",
                  theme === t.id ? "border-white scale-110" : "border-white/10 hover:border-white/30",
                  t.bg
                )}
              >
                <span className={cn("text-[8px] font-mono uppercase tracking-widest transition-all", theme === t.id ? "opacity-100" : "opacity-0 group-hover:opacity-40")}>
                  {t.label}
                </span>
                {theme === t.id && (
                  <motion.div 
                    layoutId="theme-active"
                    className="absolute inset-0 border-2 border-white rounded-2xl pointer-events-none"
                  />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Audio Section */}
        <section className="p-6 rounded-[2rem] bg-zinc-900/50 border border-white/5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                <Music className="w-5 h-5 text-white/60" />
              </div>
              <div>
                <h4 className="font-serif italic text-lg">Voice Whisper</h4>
                <p className="text-[9px] text-white/30 uppercase tracking-widest">Record your real voice, anonymously</p>
              </div>
            </div>
            {audioBlob && (
              <button 
                type="button" 
                onClick={() => setAudioBlob(null)}
                className="text-[9px] text-white/60 hover:text-white font-mono uppercase tracking-widest"
              >
                Discard
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                className="group flex items-center gap-3 bg-white/5 hover:bg-white/10 text-white px-6 py-3 rounded-2xl border border-white/10 transition-all"
              >
                <div className="w-3 h-3 rounded-full bg-red-500 group-hover:scale-125 transition-transform" />
                <span className="text-sm font-medium">Record Voice</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-3 bg-red-500 text-white px-6 py-3 rounded-2xl border border-red-500/30 animate-pulse transition-all"
              >
                <Square className="w-4 h-4 fill-current" />
                <span className="text-sm font-medium">Stop Recording</span>
              </button>
            )}
            
            {audioBlob && !isRecording && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex-1 h-14 bg-white/5 rounded-2xl border border-white/10 flex items-center px-6 gap-4"
              >
                <div className="w-2 h-2 rounded-full bg-white/60 animate-pulse" />
                <span className="text-xs text-white/60 font-medium">Voice captured.</span>
              </motion.div>
            )}
          </div>
        </section>

        {/* Submit Section */}
        <div className="space-y-3">
          <div className="bg-zinc-900/50 border border-white/5 rounded-2xl px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/30">Proof of Soul:</span>
              <span className="text-lg font-serif italic text-white/80">{captcha.num1} + {captcha.num2} =</span>
            </div>
            <input
              type="number"
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value)}
              className="w-20 bg-transparent border-b border-white/20 focus:outline-none focus:border-white/40 text-center text-lg font-serif text-white"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || (!content.trim() && !audioBlob)}
            className="w-full bg-black hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-base py-5 rounded-2xl transition-all flex items-center justify-center gap-3 group border border-white/5"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 text-white/60 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />}
            <span>{isSubmitting ? 'Whispering...' : 'Post Anonymously'}</span>
          </button>
        </div>

        {/* Status Messages */}
        <AnimatePresence>
          {status !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={cn(
                "fixed bottom-24 md:bottom-32 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] md:w-full max-w-lg p-4 md:p-6 rounded-2xl md:rounded-3xl flex items-center gap-3 md:gap-4 text-sm z-50 shadow-2xl backdrop-blur-xl",
                status === 'checking' && "bg-blue-500/20 text-blue-200 border border-blue-500/30",
                status === 'allowed' && "bg-green-500/20 text-green-200 border border-green-500/30",
                status === 'blocked' && "bg-red-500/20 text-red-200 border border-red-500/30",
                status === 'error' && "bg-yellow-500/20 text-yellow-200 border border-yellow-500/30"
              )}
            >
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl flex items-center justify-center bg-white/10 shrink-0">
                {status === 'checking' && <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" />}
                {status === 'allowed' && <CheckCircle2 className="w-5 h-5 md:w-6 md:h-6" />}
                {status === 'blocked' && <ShieldAlert className="w-5 h-5 md:w-6 md:h-6" />}
                {status === 'error' && <AlertCircle className="w-5 h-5 md:w-6 md:h-6" />}
              </div>
              
              <div className="flex-1 min-w-0">
                <p className="font-serif italic text-lg md:text-xl truncate">
                  {status === 'checking' && 'Whispering...'}
                  {status === 'allowed' && 'Whisper accepted.'}
                  {status === 'blocked' && 'Whisper rejected.'}
                  {status === 'error' && 'The shadows are silent.'}
                </p>
                {errorMsg && <p className="opacity-60 text-[10px] md:text-xs mt-0.5 md:mt-1 font-mono uppercase tracking-widest truncate">{errorMsg}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
