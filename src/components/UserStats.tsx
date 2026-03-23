import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { Confession, UserProfile } from '../types';
import { motion } from 'motion/react';
import { Trophy, BarChart3, Heart, Eye, MessageSquare, Award, Star, TrendingUp } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function UserStats() {
  const [stats, setStats] = useState<{
    totalLikes: number;
    totalViews: number;
    totalConfessions: number;
    topConfession: Confession | null;
    badges: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchStats = async () => {
      try {
        const q = query(
          collection(db, 'confessions'),
          where('authorUid', '==', auth.currentUser!.uid)
        );
        const snapshot = await getDocs(q);
        const confessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Confession));

        let totalLikes = 0;
        let totalViews = 0;
        let topConfession: Confession | null = null;

        confessions.forEach(c => {
          const likes = Object.values(c.reactions || {}).reduce((a, b) => a + b, 0);
          totalLikes += likes;
          totalViews += (c.viewsCount || 0);

          if (!topConfession || (likes + (c.commentsCount || 0)) > (Object.values(topConfession.reactions || {}).reduce((a, b) => a + b, 0) + (topConfession.commentsCount || 0))) {
            topConfession = c;
          }
        });

        // Badge Logic
        const badges = [];
        if (confessions.length >= 10) badges.push("Top Confessor");
        if (totalLikes >= 50) badges.push("Most Relatable");
        
        // Listener badge (requires querying comments)
        const cq = query(collection(db, 'comments'), where('authorUid', '==', auth.currentUser!.uid));
        const cSnapshot = await getDocs(cq);
        if (cSnapshot.size >= 20) badges.push("Listener");

        setStats({
          totalLikes,
          totalViews,
          totalConfessions: confessions.length,
          topConfession,
          badges
        });
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) return null;
  if (!stats) return null;

  return (
    <div className="space-y-6 mb-12">
      <div className="flex items-center gap-3 mb-4">
        <BarChart3 className="w-6 h-6 text-accent" />
        <h2 className="text-2xl font-serif italic text-white">Your Cloak Confess Journey</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-6 rounded-2xl border border-white/5 flex flex-col items-center text-center"
        >
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center mb-4">
            <Heart className="w-6 h-6 text-accent" />
          </div>
          <div className="text-3xl font-mono text-white mb-1">{stats.totalLikes}</div>
          <div className="text-xs text-white/40 uppercase tracking-widest">Total Reactions</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass p-6 rounded-2xl border border-white/5 flex flex-col items-center text-center"
        >
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-4">
            <Eye className="w-6 h-6 text-blue-400" />
          </div>
          <div className="text-3xl font-mono text-white mb-1">{stats.totalViews}</div>
          <div className="text-xs text-white/40 uppercase tracking-widest">Total Views</div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass p-6 rounded-2xl border border-white/5 flex flex-col items-center text-center"
        >
          <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mb-4">
            <MessageSquare className="w-6 h-6 text-purple-400" />
          </div>
          <div className="text-3xl font-mono text-white mb-1">{stats.totalConfessions}</div>
          <div className="text-xs text-white/40 uppercase tracking-widest">Confessions</div>
        </motion.div>
      </div>

      {stats.badges.length > 0 && (
        <div className="glass p-6 rounded-2xl border border-white/5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <span className="text-sm font-medium text-white/80">Earned Badges</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {stats.badges.map((badge) => (
              <div 
                key={badge}
                className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 px-4 py-2 rounded-xl"
              >
                <Award className="w-4 h-4 text-yellow-500" />
                <span className="text-sm font-medium text-yellow-500">{badge}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.topConfession && (
        <div className="glass p-6 rounded-2xl border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Star className="w-24 h-24 text-accent" />
          </div>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-accent" />
            <span className="text-sm font-medium text-white/80">Top Confession</span>
          </div>
          <p className="text-white/60 italic line-clamp-2 mb-4">"{stats.topConfession.content}"</p>
          <div className="flex items-center gap-4 text-[10px] text-white/30 font-mono uppercase">
            <span>{Object.values(stats.topConfession.reactions || {}).reduce((a, b) => a + b, 0)} Reactions</span>
            <span>{stats.topConfession.viewsCount} Views</span>
          </div>
        </div>
      )}
    </div>
  );
}
