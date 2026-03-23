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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl md:text-2xl font-serif italic text-accent">Share your secret...</h2>
        {userProfile && userProfile.streakCount > 0 && (
          <div className="flex items-center gap-2 bg-accent/10 px-3 py-1 rounded-full border border-accent/20">
            <Target className="w-4 h-4 text-accent" />
            <span className="text-[10px] md:text-xs font-medium text-accent">
              {userProfile.streakCount} day streak 👀
            </span>
          </div>
        )}
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6 pb-20 md:pb-0">
        <div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            className="w-full h-40 bg-black/30 border border-white/10 rounded-xl p-4 focus:outline-none focus:border-accent/50 transition-colors resize-none"
            maxLength={2000}
            required
          />
          <div className="text-right text-xs text-white/40 mt-1">
            {content.length}/2000
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs text-white/40 font-mono uppercase tracking-wider">Mood</label>
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMood(m.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm transition-all border flex items-center gap-2",
                    mood === m.id 
                      ? "bg-accent text-white border-accent" 
                      : "bg-white/5 text-white/60 border-white/10 hover:border-white/30"
                  )}
                >
                  <span>{m.emoji}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-white/40 font-mono uppercase tracking-wider">Category</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm transition-all border",
                    category === cat 
                      ? "bg-accent text-white border-accent" 
                      : "bg-white/5 text-white/60 border-white/10 hover:border-white/30"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs text-white/40 font-mono uppercase tracking-wider">Persona</label>
              <User className="w-4 h-4 text-white/20" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PERSONAS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPersona(p)}
                  className={cn(
                    "px-3 py-2 rounded-xl border text-[10px] font-medium transition-all text-center",
                    persona === p 
                      ? "bg-white text-black border-white" 
                      : "bg-white/5 border-white/10 text-white/40 hover:border-white/30"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs text-white/40 font-mono uppercase tracking-wider">Community</label>
              <Users className="w-4 h-4 text-white/20" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {COMMUNITY_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setCommunityType(type)}
                  className={cn(
                    "px-3 py-2 rounded-xl border text-[10px] font-medium transition-all text-center",
                    communityType === type 
                      ? "bg-white text-black border-white" 
                      : "bg-white/5 text-white/60 border-white/10 hover:border-white/30"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
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
                className="w-full bg-black/30 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-accent/50 transition-colors"
                required
              />
            </motion.div>
          )}
        </div>

        <div className="space-y-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">Add a Poll</span>
            </div>
            <button
              type="button"
              onClick={() => setHasPoll(!hasPoll)}
              className={cn(
                "w-12 h-6 rounded-full transition-all relative",
                hasPoll ? "bg-accent" : "bg-white/10"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                hasPoll ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          {hasPoll && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-3"
            >
              <input
                type="text"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="Poll Question (e.g., Should I confess?)"
                className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-accent/50"
              />
              <div className="grid grid-cols-2 gap-2">
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
                    className="bg-black/30 border border-white/10 rounded-xl p-2 text-xs focus:outline-none focus:border-accent/50"
                  />
                ))}
              </div>
            </motion.div>
          )}
        </div>

        <div className="space-y-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">Trusted Circle</span>
            </div>
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              className={cn(
                "w-12 h-6 rounded-full transition-all relative",
                isPrivate ? "bg-accent" : "bg-white/10"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                isPrivate ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          {isPrivate && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <p className="text-xs text-white/40">Enter emails (comma separated)</p>
                <input
                  type="text"
                  value={invitedEmails}
                  onChange={(e) => setInvitedEmails(e.target.value)}
                  placeholder="friend@example.com, colleague@example.com"
                  className="w-full bg-black/30 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs text-white/40">Enter usernames (comma separated)</p>
                <input
                  type="text"
                  value={invitedUsernames}
                  onChange={(e) => setInvitedUsernames(e.target.value)}
                  placeholder="cool_user123, anonymous_whisperer"
                  className="w-full bg-black/30 border border-white/10 rounded-xl p-3 focus:outline-none focus:border-accent/50 transition-colors"
                />
              </div>

              {!auth.currentUser?.email && (
                <p className="text-[10px] text-yellow-500/60 italic">
                  Note: Users must be logged in with their email to view private confessions.
                </p>
              )}
            </motion.div>
          )}
        </div>

        <div className="space-y-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <label className="text-xs text-white/40 font-mono uppercase tracking-wider">Aesthetic Theme</label>
            <Palette className="w-4 h-4 text-white/20" />
          </div>
          <div className="flex flex-wrap gap-3">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={cn(
                  "group relative w-12 h-12 rounded-xl border-2 transition-all overflow-hidden",
                  theme === t.id ? "border-accent scale-110" : "border-white/10 hover:border-white/30",
                  t.bg
                )}
                title={t.label}
              >
                {theme === t.id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-accent/20">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium">Audio Confession</span>
            </div>
            {audioBlob && (
              <button 
                type="button" 
                onClick={() => setAudioBlob(null)}
                className="text-[10px] text-red-400 hover:underline"
              >
                Remove Recording
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white/80 px-4 py-2 rounded-xl border border-white/10 transition-all"
              >
                <Mic className="w-4 h-4 text-red-500" />
                <span className="text-xs">Record Voice</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-xl border border-red-500/30 animate-pulse transition-all"
              >
                <Square className="w-4 h-4 fill-current" />
                <span className="text-xs">Stop Recording</span>
              </button>
            )}
            
            {audioBlob && !isRecording && (
              <div className="flex-1 h-10 bg-white/5 rounded-xl border border-white/10 flex items-center px-4 gap-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] text-white/40 truncate">Voice message recorded successfully</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-white/30 italic">Voice is recorded anonymously. No metadata is stored.</p>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
          <div className="flex-1 flex items-center gap-2 bg-white/5 px-4 py-3 md:py-2 rounded-xl border border-white/10">
            <span className="text-sm text-white/60">Solve: {captcha.num1} + {captcha.num2} =</span>
            <input
              type="number"
              value={captchaInput}
              onChange={(e) => setCaptchaInput(e.target.value)}
              className="w-16 bg-transparent border-b border-white/20 focus:outline-none focus:border-accent text-center"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !content.trim()}
            className="flex-1 bg-accent hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-4 md:py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            {isSubmitting ? 'Posting...' : 'Post Anonymously'}
          </button>
        </div>

        <AnimatePresence>
          {status !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={cn(
                "p-4 rounded-xl flex items-center gap-3 text-sm",
                status === 'checking' && "bg-blue-500/10 text-blue-400 border border-blue-500/20",
                status === 'allowed' && "bg-green-500/10 text-green-400 border border-green-500/20",
                status === 'blocked' && "bg-red-500/10 text-red-400 border border-red-500/20",
                status === 'error' && "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
              )}
            >
              {status === 'checking' && <Loader2 className="w-5 h-5 animate-spin" />}
              {status === 'allowed' && <CheckCircle2 className="w-5 h-5" />}
              {status === 'blocked' && <ShieldAlert className="w-5 h-5" />}
              {status === 'error' && <AlertCircle className="w-5 h-5" />}
              
              <div>
                <p className="font-medium">
                  {status === 'checking' && 'AI is checking your content...'}
                  {status === 'allowed' && 'Allowed! Your confession is live.'}
                  {status === 'blocked' && 'Blocked'}
                  {status === 'error' && 'Error'}
                </p>
                {errorMsg && <p className="opacity-80 text-xs mt-0.5">{errorMsg}</p>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
