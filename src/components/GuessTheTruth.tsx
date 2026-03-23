import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { Confession } from '../types';
import { generateFakeConfession } from '../services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { Brain, RefreshCw, CheckCircle2, XCircle, Sparkles, User, Bot } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface GameItem {
  id: string;
  content: string;
  isReal: boolean;
}

export default function GuessTheTruth() {
  const [items, setItems] = useState<GameItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);

  const fetchGame = async () => {
    setLoading(true);
    setSelectedId(null);
    setShowResult(false);
    try {
      // Get one random real confession
      const q = query(
        collection(db, 'confessions'),
        where('status', '==', 'published'),
        limit(20)
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Confession));
      
      if (docs.length > 0) {
        const real = docs[Math.floor(Math.random() * docs.length)];
        
        // Generate fake one
        const fakeContent = await generateFakeConfession(real.content);
        
        const gameItems: GameItem[] = [
          { id: real.id, content: real.content, isReal: true },
          { id: 'fake-' + Date.now(), content: fakeContent, isReal: false }
        ];
        
        // Shuffle
        setItems(gameItems.sort(() => 0.5 - Math.random()));
      }
    } catch (err) {
      console.error("Error fetching game:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGame();
  }, []);

  const handleGuess = (id: string) => {
    if (showResult) return;
    setSelectedId(id);
    setShowResult(true);
    
    const selected = items.find(i => i.id === id);
    if (selected?.isReal) {
      setScore(prev => prev + 1);
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-8 h-8 text-accent animate-spin" />
        <p className="text-white/40 font-mono text-sm uppercase tracking-widest">Generating deception...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-12 space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-mono uppercase tracking-widest">
          <Brain className="w-3.5 h-3.5" />
          Guess the Truth
        </div>
        <h2 className="text-4xl md:text-5xl font-serif italic">Human or <span className="text-accent">AI?</span></h2>
        <p className="text-white/40">One is a real human secret. The other was born in a machine. Can you tell?</p>
        
        <div className="flex items-center justify-center gap-2 text-accent font-mono text-sm">
          <Sparkles className="w-4 h-4" />
          Streak: {score}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <AnimatePresence mode="wait">
          {items.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "relative group cursor-pointer",
                showResult && !item.isReal && "opacity-60"
              )}
              onClick={() => handleGuess(item.id)}
            >
              <div className={cn(
                "h-full glass p-8 rounded-3xl border transition-all duration-500 flex flex-col justify-between min-h-[300px]",
                showResult 
                  ? item.isReal 
                    ? "border-green-500/50 bg-green-500/5" 
                    : "border-red-500/50 bg-red-500/5"
                  : "border-white/5 hover:border-white/20"
              )}>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/20 font-mono uppercase tracking-widest">Confession {idx + 1}</span>
                    {showResult && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className={cn(
                          "flex items-center gap-1 text-xs font-mono",
                          item.isReal ? "text-green-400" : "text-red-400"
                        )}
                      >
                        {item.isReal ? (
                          <>
                            <User className="w-3 h-3" />
                            Real Human
                          </>
                        ) : (
                          <>
                            <Bot className="w-3 h-3" />
                            AI Generated
                          </>
                        )}
                      </motion.div>
                    )}
                  </div>
                  <p className="text-xl md:text-2xl font-serif leading-relaxed italic text-white/90">
                    "{item.content}"
                  </p>
                </div>

                {showResult && selectedId === item.id && (
                  <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-center">
                    {item.isReal ? (
                      <div className="flex items-center gap-2 text-green-400 font-mono text-sm uppercase tracking-widest">
                        <CheckCircle2 className="w-5 h-5" />
                        Correct!
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-400 font-mono text-sm uppercase tracking-widest">
                        <XCircle className="w-5 h-5" />
                        Deceived!
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-20 flex justify-center">
        <button
          onClick={fetchGame}
          disabled={loading}
          className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-white text-black font-medium hover:bg-accent hover:text-white transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
          {showResult ? "Play Again" : "Generate New Challenge"}
        </button>
      </div>
    </div>
  );
}
