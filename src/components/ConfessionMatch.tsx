import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { Confession } from '../types';
import { motion } from 'motion/react';
import { Sparkles, Users } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ConfessionMatchProps {
  currentConfession: Confession;
  onConfessionClick?: (confession: Confession) => void;
}

export default function ConfessionMatch({ currentConfession, onConfessionClick }: ConfessionMatchProps) {
  const [matches, setMatches] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);
      try {
        // Simple matching logic:
        // 1. Try matching by tags (at least one common tag)
        // 2. Fallback to same mood if tags don't yield enough results
        
        let matchedDocs: Confession[] = [];
        
        if (currentConfession.tags && currentConfession.tags.length > 0) {
          const q = query(
            collection(db, 'confessions'),
            where('status', '==', 'published'),
            where('tags', 'array-contains-any', currentConfession.tags),
            limit(10)
          );
          const snapshot = await getDocs(q);
          matchedDocs = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Confession))
            .filter(c => c.id !== currentConfession.id);
        }

        // If not enough matches, try same mood
        if (matchedDocs.length < 3) {
          const moodQ = query(
            collection(db, 'confessions'),
            where('status', '==', 'published'),
            where('mood', '==', currentConfession.mood),
            limit(10)
          );
          const moodSnapshot = await getDocs(moodQ);
          const moodDocs = moodSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Confession))
            .filter(c => c.id !== currentConfession.id && !matchedDocs.find(m => m.id === c.id));
          
          matchedDocs = [...matchedDocs, ...moodDocs];
        }

        // Sort by score or date and take top 3
        setMatches(matchedDocs.slice(0, 3));
      } catch (err) {
        console.error("Error fetching matches:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMatches();
  }, [currentConfession.id, currentConfession.tags, currentConfession.mood]);

  if (loading) return null;
  if (matches.length === 0) return null;

  return (
    <div className="mt-8 pt-6 border-t border-white/5">
      <div className="flex items-center gap-2 mb-4 text-accent">
        <Users className="w-4 h-4" />
        <h4 className="text-sm font-serif italic">People who feel like you 👇</h4>
      </div>
      
      <div className="grid grid-cols-1 gap-3">
        {matches.map((match) => (
          <motion.button
            key={match.id}
            whileHover={{ x: 4 }}
            onClick={() => onConfessionClick?.(match)}
            className="text-left p-3 glass rounded-xl border border-white/5 hover:border-accent/30 transition-all group"
          >
            <p className="text-xs text-white/60 line-clamp-2 italic mb-2">"{match.content}"</p>
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {match.tags?.slice(0, 2).map(tag => (
                  <span key={tag} className="text-[8px] px-1.5 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10">
                    #{tag}
                  </span>
                ))}
              </div>
              <Sparkles className="w-3 h-3 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
