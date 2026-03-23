import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { UserProfile } from '../types';
import { motion } from 'motion/react';
import { Trophy, Award, TrendingUp, Heart, Eye } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Leaderboard() {
  const [topUsers, setTopUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const q = query(
          collection(db, 'users'),
          where('isPublic', '==', true),
          orderBy('stats.totalRelatable', 'desc'),
          limit(10)
        );
        const snapshot = await getDocs(q);
        const users = snapshot.docs.map(doc => doc.data() as UserProfile);
        setTopUsers(users);
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  if (loading) {
    return <div className="animate-pulse space-y-4">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-16 glass rounded-2xl bg-white/5" />
      ))}
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div className="space-y-1">
          <h2 className="text-3xl font-serif italic">Hall of <span className="text-accent">Secrets</span></h2>
          <p className="text-white/40 text-sm">The most resonant voices in the shadows.</p>
        </div>
        <Trophy className="w-10 h-10 text-accent opacity-20" />
      </div>

      <div className="space-y-3">
        {topUsers.map((user, idx) => (
          <motion.div
            key={user.uid}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="glass p-4 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-accent/30 transition-all"
          >
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold",
                idx === 0 ? "bg-accent text-white" : 
                idx === 1 ? "bg-white/20 text-white" :
                idx === 2 ? "bg-white/10 text-white/60" : "text-white/20"
              )}>
                {idx + 1}
              </div>
              <div className="flex items-center gap-3">
                <img 
                  src={user.avatarUrl} 
                  alt="" 
                  className="w-10 h-10 rounded-xl bg-white/5 grayscale group-hover:grayscale-0 transition-all"
                />
                <div>
                  <div className="font-mono text-sm text-white/90">@{user.username}</div>
                  <div className="text-[10px] text-white/30 uppercase tracking-widest">Streak: {user.streakCount} days</div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="flex items-center gap-1 text-accent text-xs font-bold">
                  <Heart className="w-3 h-3" />
                  {user.stats?.totalRelatable || 0}
                </div>
                <div className="text-[8px] text-white/20 uppercase tracking-widest">Relatable</div>
              </div>
              <div className="text-center hidden sm:block">
                <div className="flex items-center gap-1 text-white/60 text-xs font-bold">
                  <Eye className="w-3 h-3" />
                  {user.stats?.totalViews || 0}
                </div>
                <div className="text-[8px] text-white/20 uppercase tracking-widest">Views</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
