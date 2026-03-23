import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit, doc, updateDoc, increment } from 'firebase/firestore';
import { Confession } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Swords, RefreshCw, Trophy, Sparkles } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function ConfessionBattles() {
  const [pair, setPair] = useState<[Confession, Confession] | null>(null);
  const [loading, setLoading] = useState(true);
  const [votedId, setVotedId] = useState<string | null>(null);

  const fetchPair = async () => {
    setLoading(true);
    setVotedId(null);
    try {
      // Get random confessions
      const q = query(
        collection(db, 'confessions'),
        where('status', '==', 'published'),
        limit(20) // Get a pool
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Confession));
      
      if (docs.length >= 2) {
        // Shuffle and pick 2
        const shuffled = [...docs].sort(() => 0.5 - Math.random());
        setPair([shuffled[0], shuffled[1]]);
      }
    } catch (err) {
      console.error("Error fetching battle pair:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPair();
  }, []);

  const handleVote = async (id: string) => {
    if (votedId) return;
    setVotedId(id);
    
    try {
      const docRef = doc(db, 'confessions', id);
      await updateDoc(docRef, {
        score: increment(10), // Voting in a battle gives a score boost
        viewsCount: increment(1)
      });
    } catch (err) {
      console.error("Error voting:", err);
    }
  };

  if (loading && !pair) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <RefreshCw className="w-8 h-8 text-accent animate-spin" />
        <p className="text-white/40 font-mono text-sm uppercase tracking-widest">Finding worthy contenders...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="text-center mb-12 space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-mono uppercase tracking-widest">
          <Swords className="w-3.5 h-3.5" />
          Confession Battle
        </div>
        <h2 className="text-4xl md:text-5xl font-serif italic">Which is more <span className="text-accent">relatable?</span></h2>
        <p className="text-white/40">Cast your vote to crown the champion of vulnerability.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden md:block">
          <div className="w-12 h-12 rounded-full bg-black border border-white/10 flex items-center justify-center text-white/20 font-serif italic text-xl">
            vs
          </div>
        </div>

        <AnimatePresence mode="wait">
          {pair && pair.map((confession, idx) => (
            <motion.div
              key={confession.id}
              initial={{ opacity: 0, x: idx === 0 ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "relative group cursor-pointer",
                votedId && votedId !== confession.id && "opacity-40 grayscale"
              )}
              onClick={() => handleVote(confession.id)}
            >
              <div className={cn(
                "h-full glass p-8 rounded-3xl border transition-all duration-500 flex flex-col justify-between min-h-[300px]",
                votedId === confession.id ? "border-accent ring-4 ring-accent/10" : "border-white/5 hover:border-white/20"
              )}>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/20 font-mono uppercase tracking-widest">#{confession.anonymousId}</span>
                    {votedId === confession.id && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-1 text-accent text-xs font-mono"
                      >
                        <Trophy className="w-3 h-3" />
                        Voted
                      </motion.div>
                    )}
                  </div>
                  <p className="text-xl md:text-2xl font-serif leading-relaxed italic text-white/90">
                    "{confession.content}"
                  </p>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                  <div className="flex gap-2">
                    {confession.tags?.slice(0, 2).map(tag => (
                      <span key={tag} className="text-[10px] text-white/30">#{tag}</span>
                    ))}
                  </div>
                  <div className="text-[10px] text-white/20 uppercase tracking-widest">{confession.category}</div>
                </div>
              </div>

              {votedId === confession.id && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-accent flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span className="text-xs font-mono uppercase tracking-widest">+10 Relatability</span>
                </motion.div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-20 flex justify-center">
        <button
          onClick={fetchPair}
          disabled={loading}
          className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-white text-black font-medium hover:bg-accent hover:text-white transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("w-5 h-5", loading && "animate-spin")} />
          Next Battle
        </button>
      </div>
    </div>
  );
}
