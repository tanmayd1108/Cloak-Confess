import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp, doc, getDoc, setDoc } from 'firebase/firestore';
import { DailyPrompt, Confession } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { HelpCircle, Send, Sparkles, MessageCircle, Clock } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function DailyPromptSection({ onAnswer }: { onAnswer: () => void }) {
  const [prompt, setPrompt] = useState<DailyPrompt | null>(null);
  const [responses, setResponses] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResponses, setShowResponses] = useState(false);

  useEffect(() => {
    const fetchDailyPrompt = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const promptRef = doc(db, 'daily_prompts', today);
        const promptSnap = await getDoc(promptRef);

        if (promptSnap.exists()) {
          setPrompt({ id: promptSnap.id, ...promptSnap.data() } as DailyPrompt);
        } else {
          // Create a new one if it doesn't exist (simplified for demo)
          const questions = [
            "What's a secret you've never told anyone?",
            "What's your biggest regret from high school?",
            "What's something you're currently struggling with?",
            "What's the kindest thing a stranger has done for you?",
            "What's a lie you tell yourself every day?"
          ];
          const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
          const newPrompt = { question: randomQuestion, date: today };
          await setDoc(promptRef, newPrompt);
          setPrompt({ id: today, ...newPrompt } as DailyPrompt);
        }

        // Fetch some responses
        const q = query(
          collection(db, 'confessions'),
          where('category', '==', 'Daily Prompt'),
          where('status', '==', 'published'),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const snapshot = await getDocs(q);
        setResponses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Confession)));

      } catch (err) {
        console.error("Error fetching daily prompt:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchDailyPrompt();
  }, []);

  if (loading || !prompt) return null;

  return (
    <div className="glass p-8 rounded-3xl border border-white/5 space-y-6 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
        <HelpCircle className="w-32 h-32" />
      </div>

      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-accent font-mono text-[10px] uppercase tracking-widest">
            <Clock className="w-3 h-3" />
            Daily Question
          </div>
          <button
            onClick={onAnswer}
            className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent text-white text-[10px] font-bold uppercase tracking-widest hover:bg-accent/80 transition-all shadow-lg shadow-accent/20"
          >
            <Send className="w-3 h-3" />
            Answer
          </button>
        </div>
        <h3 className="text-2xl md:text-3xl font-serif italic text-white/90 leading-tight">
          "{prompt.question}"
        </h3>
        
        <div className="flex items-center gap-4 pt-4">
          <button 
            onClick={() => setShowResponses(!showResponses)}
            className="flex items-center gap-2 text-xs text-white/40 hover:text-white transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            {responses.length} responses
          </button>
          <div className="h-px flex-1 bg-white/5" />
          <div className="flex -space-x-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-6 h-6 rounded-full bg-white/10 border border-black flex items-center justify-center text-[8px] text-white/40">
                ?
              </div>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {showResponses && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-3 pt-4"
            >
              {responses.map((resp) => (
                <div key={resp.id} className="p-4 rounded-2xl bg-white/5 border border-white/5 text-sm italic text-white/70">
                  "{resp.content}"
                </div>
              ))}
              {responses.length === 0 && (
                <div className="text-center py-4 text-xs text-white/20 italic">
                  No responses yet. Be the first to answer.
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
