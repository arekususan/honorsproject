import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Music, Star, ChevronRight, Play, Pause } from 'lucide-react';

export type Genre = 'Rap' | 'Country' | 'Rock' | 'Classical' | 'Pop' | 'EDM';

export interface AudioSurveyData {
  rankings: Record<Genre, number>;
  ratings: Record<Genre, number>;
  best: Genre;
  worst: Genre;
  neutral: Genre;
}

interface AudioSurveyProps {
  onComplete: (data: AudioSurveyData) => void;
}

const GENRES: Genre[] = ['Rap', 'Country', 'Rock', 'Classical', 'Pop', 'EDM'];

export const AudioSurvey: React.FC<AudioSurveyProps> = ({ onComplete }) => {
  const [step, setStep] = useState<'ranking' | 'rating'>('ranking');
  const [rankings, setRankings] = useState<Record<Genre, number>>({
    Rap: 0, Country: 0, Rock: 0, Classical: 0, Pop: 0, EDM: 0
  });
  const [ratings, setRatings] = useState<Record<Genre, number>>({
    Rap: 0, Country: 0, Rock: 0, Classical: 0, Pop: 0, EDM: 0
  });
  const [playingSample, setPlayingSample] = useState<Genre | null>(null);
  const sampleRef = useRef<HTMLAudioElement | null>(null);

  const handleRank = (genre: Genre, rank: number) => {
    setRankings(prev => ({ ...prev, [genre]: rank }));
  };

  const handleRate = (genre: Genre, rating: number) => {
    setRatings(prev => ({ ...prev, [genre]: rating }));
  };

  const toggleSample = (genre: Genre) => {
    if (playingSample === genre) {
      sampleRef.current?.pause();
      setPlayingSample(null);
    } else {
      if (sampleRef.current) {
        sampleRef.current.pause();
      }
      const urls: Record<Genre, string> = {
        Rap: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        Country: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        Rock: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
        Classical: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
        Pop: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3',
        EDM: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3',
      };
      const audio = new Audio(urls[genre]);
      sampleRef.current = audio;
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.log("Playback interrupted or failed:", error);
        });
      }
      
      setPlayingSample(genre);
      audio.onended = () => setPlayingSample(null);
    }
  };

  const isRankingComplete = (Object.values(rankings) as number[]).every(r => r > 0) && 
    new Set(Object.values(rankings)).size === GENRES.length;

  const isRatingComplete = (Object.values(ratings) as number[]).every(r => r > 0);

  const finalize = () => {
    const sortedByRank = [...GENRES].sort((a, b) => rankings[a] - rankings[b]);
    const best = sortedByRank[0];
    const worst = sortedByRank[GENRES.length - 1];
    
    // Find neutral: closest to median of ratings
    const ratingValues = Object.values(ratings);
    const median = 3; // Median of 1-5 scale
    const neutral = GENRES.reduce((prev, curr) => {
      return Math.abs(ratings[curr] - median) < Math.abs(ratings[prev] - median) ? curr : prev;
    });

    onComplete({
      rankings,
      ratings,
      best,
      worst,
      neutral
    });
  };

  return (
    <div className="fixed inset-0 z-[200] bg-[#0a0a0a] flex items-center justify-center p-6 overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full bg-zinc-900 border border-white/10 rounded-[2rem] p-10 space-y-8"
      >
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold italic uppercase tracking-tighter text-emerald-500">Acoustic Calibration</h2>
          <p className="text-white/40 text-sm">Protocol requires baseline audio preferences for environmental synthesis.</p>
        </div>

        {step === 'ranking' ? (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-white/60 mb-4">
              <Music size={18} />
              <span className="text-sm font-mono uppercase tracking-widest">Step 1: Rank Genres (1 = Best, 6 = Worst)</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {GENRES.map(genre => (
                <div key={genre} className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5">
                  <span className="font-bold tracking-tight">{genre}</span>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5, 6].map(r => (
                      <button
                        key={r}
                        onClick={() => handleRank(genre, r)}
                        className={`w-8 h-8 rounded-lg font-mono text-xs transition-all ${
                          rankings[genre] === r ? 'bg-emerald-500 text-black font-bold' : 'bg-white/5 hover:bg-white/10 text-white/40'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button
              disabled={!isRankingComplete}
              onClick={() => setStep('rating')}
              className="w-full py-4 bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold rounded-xl uppercase tracking-widest flex items-center justify-center gap-2"
            >
              Continue to Ratings <ChevronRight size={18} />
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-white/60 mb-4">
              <Star size={18} />
              <span className="text-sm font-mono uppercase tracking-widest">Step 2: Rate Audio Samples (1-5 Stars)</span>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {GENRES.map(genre => (
                <div key={genre} className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => toggleSample(genre)}
                        className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 hover:bg-emerald-500/30 transition-colors"
                      >
                        {playingSample === genre ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                      <span className="font-bold tracking-tight">{genre} Sample</span>
                    </div>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(star => (
                        <button
                          key={star}
                          onClick={() => handleRate(genre, star)}
                          className={`p-1 transition-colors ${
                            ratings[genre] >= star ? 'text-amber-500' : 'text-white/10 hover:text-white/30'
                          }`}
                        >
                          <Star size={20} fill={ratings[genre] >= star ? 'currentColor' : 'none'} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <button
              disabled={!isRatingComplete}
              onClick={finalize}
              className="w-full py-4 bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold rounded-xl uppercase tracking-widest"
            >
              Initialize Simulation
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
