import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { Confession } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Gift, Sparkles, X, Swords, Heart, Eye } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function SurpriseConfessionDrop() {
  const [confession, setConfession] = useState<Confession | null>(null);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Randomly trigger every 5 minutes (simplified for demo)
    const interval = setInterval(() => {
      const shouldTrigger = Math.random() > 0.7; // 30% chance
      if (shouldTrigger && !show) {
        fetchViralConfession();
      }
    }, 300000);

    return () => clearInterval(interval);
  }, [show]);

  const fetchViralConfession = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'confessions'),
        where('status', '==', 'published'),
        where('isPrivate', '==', false),
        where('score', '>', 50),
        limit(10)
      );
      const snapshot = await getDocs(q);
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Confession));
      
      if (docs.length > 0) {
        const random = docs[Math.floor(Math.random() * docs.length)];
        setConfession(random);
        setShow(true);
      }
    } catch (err) {
      console.error("Error fetching viral confession:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!show || !confession) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl"
      >
        <motion.div
          initial={{ scale: 0.8, y: 40, rotate: -5 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          exit={{ scale: 0.8, y: 40, rotate: 5 }}
          className="w-full max-w-lg relative"
        >
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 text-center space-y-2">
            <motion.div
              animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-20 h-20 bg-accent rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(255,78,0,0.5)] mx-auto"
            >
              <Gift className="w-10 h-10 text-white" />
            </motion.div>
            <h2 className="text-2xl font-serif italic text-accent">Surprise Drop!</h2>
            <p className="text-white/40 text-xs font-mono uppercase tracking-widest">You unlocked a hidden confession</p>
          </div>

          <div className="glass p-12 rounded-[40px] border border-accent/30 shadow-[0_0_100px_rgba(255,78,0,0.1)] space-y-8 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-accent to-transparent" />
            
            <p className="text-3xl md:text-4xl font-serif leading-tight italic text-white/90">
              "{confession.content}"
            </p>

            <div className="flex items-center justify-center gap-8 pt-8 border-t border-white/5">
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5 text-accent font-mono text-sm">
                  <Heart className="w-4 h-4" />
                  {confession.score}
                </div>
                <span className="text-[10px] text-white/20 uppercase tracking-widest">Relatability</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5 text-white/60 font-mono text-sm">
                  <Eye className="w-4 h-4" />
                  {confession.viewsCount}
                </div>
                <span className="text-[10px] text-white/20 uppercase tracking-widest">Views</span>
              </div>
            </div>

            <button
              onClick={() => setShow(false)}
              className="w-full py-4 rounded-2xl bg-white text-black font-bold hover:bg-accent hover:text-white transition-all uppercase tracking-widest text-xs"
            >
              Continue Exploring
            </button>
          </div>

          <button
            onClick={() => setShow(false)}
            className="absolute -top-12 -right-12 p-4 text-white/20 hover:text-white transition-colors"
          >
            <X className="w-10 h-10" />
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
