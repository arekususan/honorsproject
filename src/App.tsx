/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Timer, Users, RotateCcw, ArrowUp, ArrowLeft, ArrowRight, ArrowDown, Zap, Music, Skull, TrendingUp, Volume2, Shield, Box, Coins, Info, HelpCircle, Monitor, Grid, Download, AlertTriangle, Hexagon, Triangle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { generateMaze, MazeData, Player, CELL_SIZE, PLAYER_RADIUS, TRAP_CYCLE_TIME, TrapSquare, PHASE_DURATION, SHOP_DURATION, PRACTICE_DURATION, DISTRACTOR_DURATION } from './types';
import { AudioSurvey, AudioSurveyData, Genre } from './components/AudioSurvey';
import { AudioEngine } from './services/AudioEngine';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const ROOM_ID = "global-race";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [maze, setMaze] = useState<MazeData | null>(null);
  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [aiPos, setAiPos] = useState<Player | null>(null);
  const [myId] = useState(() => Math.random().toString(36).substring(7));
  const [myPos, setMyPos] = useState({ x: 0, y: 0, angle: 0 });
  const [targetAngle, setTargetAngle] = useState(0);
  const [gameState, setGameState] = useState<'lobby' | 'tutorial' | 'practice' | 'playing' | 'shop' | 'distractor' | 'won' | 'lost' | 'respawning' | 'gameover'>('lobby');
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  const [tutorialStep, setTutorialStep] = useState<'intro' | 'example' | 'practice' | 'phase2' | 'phase3'>('intro');
  const [safeZonesVisible, setSafeZonesVisible] = useState(false);
  const [phase2FlashType, setPhase2FlashType] = useState<'red' | 'yellow'>('yellow');
  const [phase2FreezeTimer, setPhase2FreezeTimer] = useState(0);
  const [wipeTimer, setWipeTimer] = useState(30);
  const wipeTimerRef = useRef(wipeTimer);
  useEffect(() => { wipeTimerRef.current = wipeTimer; }, [wipeTimer]);
  const [phase, setPhase] = useState(1);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const [phaseTime, setPhaseTime] = useState(PHASE_DURATION);
  const [shopTimer, setShopTimer] = useState(SHOP_DURATION);
  const [distractorTimer, setDistractorTimer] = useState(DISTRACTOR_DURATION);
  const [shopStartTime, setShopStartTime] = useState<number | null>(null);
  const [practiceTimer, setPracticeTimer] = useState(PRACTICE_DURATION);
  const [coins, setCoins] = useState(0);
  const [debugMode, setDebugMode] = useState(false);
  const [difficulty, setDifficulty] = useState(1);
  const difficultyRef = useRef(difficulty);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  const [mazesCompleted, setMazesCompleted] = useState(0);
  const [phaseMazes, setPhaseMazes] = useState(0);
  const [surveyData, setSurveyData] = useState<AudioSurveyData | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [currentGenre, setCurrentGenre] = useState<Genre | null>(null);
  const [shopLatencies, setShopLatencies] = useState<number[]>([]);

  // Initialize Audio Engine
  useEffect(() => {
    const engine = AudioEngine.getInstance();
    return () => engine.stopMusic();
  }, []);
  const [shopChoiceTime, setShopChoiceTime] = useState<number | null>(null);
  const [winner, setWinner] = useState<{ id: string, time: number } | null>(null);
  const [time, setTime] = useState(0);
  const timeRef = useRef(time);
  useEffect(() => { timeRef.current = time; }, [time]);
  const [trapTimer, setTrapTimer] = useState(TRAP_CYCLE_TIME);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);
  const trapCycleRef = useRef<number | null>(null);
  const phase3ShownRef = useRef(false);

  // Initialize Game
  const initGame = useCallback((newDifficulty?: number, targetState: typeof gameState = 'playing') => {
    const d = newDifficulty ?? difficulty;
    const size = 12 + Math.floor(d * 1.5); // Slightly smaller mazes for better flow
    const newMaze = generateMaze(size, size, d);
    setMaze(newMaze);
    const startX = newMaze.start.x * CELL_SIZE + CELL_SIZE / 2;
    const startY = newMaze.start.y * CELL_SIZE + CELL_SIZE / 2;
    setMyPos({ x: startX, y: startY, angle: 0 });
    setTargetAngle(0);
    setGameState(targetState);
    setTime(0);
    setTrapTimer(TRAP_CYCLE_TIME + Math.floor(d / 2));
    setWinner(null);
    setAiPos(null);
    setShopChoiceTime(null);
    setShopStartTime(null);
    setDistractorTimer(DISTRACTOR_DURATION);
    
    // Only show safe zones at the very start of Phase 3
    if (phase === 3 && targetState === 'playing' && !phase3ShownRef.current) {
      setSafeZonesVisible(true);
      phase3ShownRef.current = true;
      setTimeout(() => setSafeZonesVisible(false), 10000);
    }
    setWipeTimer(10 + Math.floor(d / 2));

    // Dynamic Audio
    if (surveyData) {
      const engine = AudioEngine.getInstance();
      const isTutorial = targetState === 'practice' || targetState === 'tutorial';
      
      if (targetState === 'playing' && phaseMazes === 0) {
        // New Phase Start: Pick Genre
        const pool = [surveyData.best, surveyData.worst, surveyData.neutral];
        const genre = pool[Math.floor(Math.random() * pool.length)];
        setCurrentGenre(genre);
        engine.setGenre(genre, false);
      } else if (isTutorial) {
        engine.setGenre('Pop', true); // Dummy genre for tutorial (SFX only)
      }
    }

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'JOIN_ROOM',
        roomId: ROOM_ID,
        playerId: myId,
        maze: newMaze,
        x: startX,
        y: startY,
        color: '#10b981'
      }));
    }
  }, [myId, difficulty]);

  // Respawn logic
  const respawn = useCallback(() => {
    if (!maze) return;
    const targetState = gameStateRef.current === 'practice' ? 'practice' : 'playing';
    setGameState('respawning');
    setTimeout(() => {
      const startX = maze.start.x * CELL_SIZE + CELL_SIZE / 2;
      const startY = maze.start.y * CELL_SIZE + CELL_SIZE / 2;
      setMyPos({ x: startX, y: startY, angle: 0 });
      setTargetAngle(0);
      setGameState(targetState);
    }, 1000);
  }, [maze]);

  // WebSocket Setup
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'PLAYER_JOINED':
          setPlayers(data.players);
          if (data.maze && !maze) setMaze(data.maze);
          break;
        case 'STATE_UPDATE':
          setPlayers(prev => ({ ...prev, ...data.players }));
          break;
        case 'PLAYER_LEFT':
          setPlayers(prev => {
            const next = { ...prev };
            delete next[data.playerId];
            return next;
          });
          break;
        case 'GAME_OVER':
          setGameState(data.winnerId === myId ? 'won' : 'lost');
          setWinner({ id: data.winnerId, time: data.time });
          if (data.winnerId === myId) {
            setDifficulty(prev => Math.min(prev + 0.5, 10)); // Scale difficulty
          }
          break;
      }
    };

    return () => socket.close();
  }, [myId, maze]);

  const myPosRef = useRef(myPos);
  useEffect(() => { myPosRef.current = myPos; }, [myPos]);

  const mazeRef = useRef(maze);
  useEffect(() => { mazeRef.current = maze; }, [maze]);

  const respawnRef = useRef(respawn);
  useEffect(() => { respawnRef.current = respawn; }, [respawn]);

  const downloadCSV = useCallback(() => {
    const headers = ['SubjectID', 'FinalPhase', 'FinalCoins', 'FinalDifficulty', 'TotalTime', 'Shop1Latency', 'Shop2Latency', 'Timestamp'];
    const row = [
      subjectId,
      phase,
      coins,
      difficulty.toFixed(1),
      time.toFixed(1),
      shopLatencies[0] || '',
      shopLatencies[1] || '',
      new Date().toISOString()
    ];
    const csvContent = "data:text/csv;charset=utf-8," + headers.join(',') + '\n' + row.join(',');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `spatio_maze_results_${subjectId || 'unknown'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [subjectId, phase, coins, difficulty, time, shopLatencies]);

  // Timer & Game Logic
  useEffect(() => {
    if (gameState !== 'playing' && gameState !== 'practice' && gameState !== 'shop' && gameState !== 'distractor') {
      if (timerRef.current) clearInterval(timerRef.current);
      if (trapCycleRef.current) clearInterval(trapCycleRef.current);
      return;
    }

    const interval = window.setInterval(() => {
      if (gameState === 'playing' || gameState === 'practice') {
        // Phase 3 Wipe Logic
        if (phase === 3) {
          setWipeTimer(w => {
            if (w <= 0.1) {
              const currentPos = myPosRef.current;
              const currentMaze = mazeRef.current;
              const gx = Math.floor(currentPos.x / CELL_SIZE);
              const gy = Math.floor(currentPos.y / CELL_SIZE);
              const inSafeZone = currentMaze?.safeZones.some(sz => sz.x === gx && sz.y === gy);
              if (!inSafeZone) {
                AudioEngine.getInstance().playSFX('trap');
                respawnRef.current();
              }
              // Tightened wipe timer, scales with difficulty (less prevalent if doing well)
              return 10 + Math.floor(difficultyRef.current / 2);
            }
            return w - 0.1;
          });
        }

        // Trap Cycle & Phase 2 Freeze (No Toggle)
        setTrapTimer(prev => {
          if (prev <= 0.1) {
            if (phase === 2) {
              setPhase2FlashType(Math.random() > 0.5 ? 'red' : 'yellow');
              AudioEngine.getInstance().playSFX('move');
            }
            return TRAP_CYCLE_TIME + Math.floor(difficultyRef.current / 2);
          }
          
          if (phase === 2) {
            const freezeThreshold = phase2FlashType === 'yellow' ? 3 : 1;
            if (prev <= freezeThreshold && prev > freezeThreshold - 0.1) {
              AudioEngine.getInstance().playSFX('trap');
            }
          }
          
          return prev - 0.1;
        });
      }

      if (gameState === 'playing') {
        setTime(t => t + 0.1);
        
        // Phase Time
        setPhaseTime(p => {
          if (p <= 0.1) {
            if (phase < 3) {
              setGameState('shop');
              setShopTimer(SHOP_DURATION);
              return PHASE_DURATION;
            } else {
              setGameState('gameover');
              if (window.parent) {
                window.parent.postMessage({ 
                  type: 'SPATIO_MAZE_COMPLETE', 
                  payload: { 
                    subjectId,
                    finalPhase: phase, 
                    finalCoins: coins, 
                    finalDifficulty: difficulty,
                    totalTime: time,
                    shopLatencies,
                    timestamp: new Date().toISOString()
                  } 
                }, '*');
              }
              return 0;
            }
          }
          return p - 0.1;
        });
      } else if (gameState === 'practice') {
        setPracticeTimer(p => {
          if (p <= 0.1) {
            initGame(undefined, 'playing');
            return 0;
          }
          return p - 0.1;
        });
      } else if (gameState === 'shop') {
        if (shopStartTime === null) setShopStartTime(Date.now());
        setShopTimer(s => {
          if (s <= 0.1) {
            setGameState('distractor');
            if (phase === 2) AudioEngine.getInstance().playSFX('calm');
            return 0;
          }
          return s - 0.1;
        });
      } else if (gameState === 'distractor') {
        setDistractorTimer(d => {
          if (phase === 2 && Math.abs(d - 60) < 0.05) {
            AudioEngine.getInstance().playSFX('calm');
          }
          if (d <= 0.1) {
            const nextPhase = phase + 1;
            setPhase(nextPhase);
            setPhaseMazes(0);
            if (nextPhase === 2) {
              setGameState('tutorial');
              setTutorialStep('phase2');
            } else if (nextPhase === 3) {
              setGameState('tutorial');
              setTutorialStep('phase3');
            } else {
              initGame();
            }
            return 0;
          }
          return d - 0.1;
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [gameState, phase]);

  // Qualtrics / External Engine Communication
  useEffect(() => {
    const handleExternalMessage = (event: MessageEvent) => {
      const { type, payload } = event.data;
      if (type === 'RENPY_COMMAND' || type === 'QUALTRICS_COMMAND') {
        if (payload === 'SKIP_PHASE') {
          setDebugMode(true);
          if (gameState === 'playing') setPhaseTime(0.1);
          else if (gameState === 'shop') setShopTimer(0.1);
        } else if (payload === 'GET_METRICS') {
          if (window.parent) {
            window.parent.postMessage({ 
              type: 'SPATIO_MAZE_METRICS', 
              payload: { phase, coins, difficulty, totalTime: time, gameState, shopLatencies } 
            }, '*');
          }
        }
      }
    };
    window.addEventListener('message', handleExternalMessage);
    
    // Continuous heartbeat for real-time tracking
    if (window.parent) {
      window.parent.postMessage({ 
        type: 'SPATIO_MAZE_HEARTBEAT', 
        payload: { gameState, phase, coins, difficulty, time, shopLatencies } 
      }, '*');
    }
    return () => window.removeEventListener('message', handleExternalMessage);
  }, [gameState, phase, coins, difficulty, time]);

  // Debug Keystroke (Ctrl + Shift + S to skip)
  useEffect(() => {
    const handleDebug = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        console.log("DEBUG: Skipping current phase/timer...");
        setDebugMode(true);
        if (gameState === 'playing') {
          setPhaseTime(0.1);
        } else if (gameState === 'shop') {
          setShopTimer(0.1);
        } else if (gameState === 'practice') {
          setPracticeTimer(0.1);
        } else if (gameState === 'distractor') {
          setDistractorTimer(0.1);
        }
      }

      if (e.ctrlKey && e.shiftKey && e.key === 'C') {
        console.log("DEBUG: Adding 10 coins...");
        setCoins(prev => prev + 10);
      }
    };
    window.addEventListener('keydown', handleDebug);
    return () => window.removeEventListener('keydown', handleDebug);
  }, [gameState]);

  // Trap Logic
  useEffect(() => {
    if ((gameState !== 'playing' && gameState !== 'practice') || !maze || phase !== 1) return;

    const gx = Math.floor(myPos.x / CELL_SIZE);
    const gy = Math.floor(myPos.y / CELL_SIZE);
    
    const currentTrap = maze.traps.find(t => t.x === gx && t.y === gy);
    if (currentTrap) {
      if (trapTimer < 0.5) {
        AudioEngine.getInstance().playSFX('trap');
        respawn();
      }
    }
  }, [trapTimer, myPos, maze, gameState, respawn, phase]);

  // Phase 3 Wipe Timer
  // (Consolidated into main timer)

  const keysRef = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((gameStateRef.current !== 'playing' && gameStateRef.current !== 'practice') || !mazeRef.current) return;
      keysRef.current[e.key] = true;
      
      if (e.repeat) return;
      
      let newTargetAngle = targetAngle;
      if (e.key === 'ArrowUp' || e.key === 'w') {
        newTargetAngle = targetAngle;
      } else if (e.key === 'ArrowDown' || e.key === 's') {
        newTargetAngle = targetAngle + Math.PI;
      } else if (e.key === 'ArrowLeft' || e.key === 'a') {
        newTargetAngle = targetAngle - Math.PI / 2;
      } else if (e.key === 'ArrowRight' || e.key === 'd') {
        newTargetAngle = targetAngle + Math.PI / 2;
      } else {
        return;
      }

      // Normalize
      while (newTargetAngle <= -Math.PI) newTargetAngle += Math.PI * 2;
      while (newTargetAngle > Math.PI) newTargetAngle -= Math.PI * 2;
      
      setTargetAngle(newTargetAngle);
      AudioEngine.getInstance().playSFX('move');
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [targetAngle]);

  // Smooth Rotation Interpolation & Continuous Movement
  useEffect(() => {
    if (gameState !== 'playing' && gameState !== 'practice') return;
    const interval = setInterval(() => {
      setMyPos(prev => {
        // Normalize angles to prevent spinning the long way around
        let diff = targetAngle - prev.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        
        const lerpFactor = 0.15; // Smoother lerp
        let newAngle = prev.angle;
        if (Math.abs(diff) >= 0.01) {
          newAngle = prev.angle + diff * lerpFactor;
        } else {
          newAngle = targetAngle;
        }

        // Handle Movement
        const isMoving = keysRef.current['ArrowUp'] || keysRef.current['w'] ||
                         keysRef.current['ArrowDown'] || keysRef.current['s'] ||
                         keysRef.current['ArrowLeft'] || keysRef.current['a'] ||
                         keysRef.current['ArrowRight'] || keysRef.current['d'];

        if (isMoving && mazeRef.current) {
          const baseSpeed = 4; // Adjusted for 16ms interval
          const speed = baseSpeed * (1 + (difficultyRef.current - 1) * 0.05);
          
          // Always move in the direction of targetAngle
          const dx = Math.sin(targetAngle) * speed;
          const dy = -Math.cos(targetAngle) * speed;

          let nextX = prev.x + dx;
          let nextY = prev.y + dy;

          if (checkCollision(nextX, prev.y, mazeRef.current)) nextX = prev.x;
          if (checkCollision(prev.x, nextY, mazeRef.current)) nextY = prev.y;

          if (phaseRef.current === 2) {
            const freezeThreshold = phase2FlashType === 'yellow' ? 3 : 1;
            if (trapTimer <= freezeThreshold) {
              // Player moved during freeze
              AudioEngine.getInstance().playSFX('trap');
              respawnRef.current();
              return { ...prev, angle: newAngle };
            }
          }

          // Check Win
          const gx = Math.floor(nextX / CELL_SIZE);
          const gy = Math.floor(nextY / CELL_SIZE);
          if (gx === mazeRef.current.end.x && gy === mazeRef.current.end.y) {
            if (gameStateRef.current === 'practice') {
              AudioEngine.getInstance().playSFX('win');
              respawnRef.current();
            } else if (gameStateRef.current === 'playing') {
              AudioEngine.getInstance().playSFX('win');
              const earned = Math.max(1, Math.min(5, Math.floor(30 / (timeRef.current + 1))));
              setCoins(c => c + earned);
              setMazesCompleted(c => c + 1);
              setPhaseMazes(c => {
                const next = c + 1;
                const engine = AudioEngine.getInstance();
                const threshold = phaseRef.current === 1 ? 4 : phaseRef.current === 2 ? 2 : 1;
                const stemsPerMaze = 4 / threshold;
                const activeStems = Math.min(4, Math.floor(next * stemsPerMaze));
                engine.updateStems(activeStems, next >= threshold);
                return next;
              });
              setGameState('won');
              setWinner({ id: myId, time: timeRef.current });
              const timeThreshold = 20;
              const bonus = timeRef.current < timeThreshold ? 1.0 : 0.5;
              setDifficulty(d => Math.min(d + bonus, 10));
              if (window.parent) {
                window.parent.postMessage({ type: 'SPATIO_MAZE_WIN', payload: { time: timeRef.current, phase: phaseRef.current, coins: coins + earned } }, '*');
              }
              if (socketRef.current?.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({ type: 'WIN', time: timeRef.current }));
              }
            }
          }

          // Sync
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({
              type: 'UPDATE_POSITION',
              x: nextX, y: nextY, angle: targetAngle
            }));
          }

          return { x: nextX, y: nextY, angle: newAngle };
        }

        return { ...prev, angle: newAngle };
      });
    }, 16);
    return () => clearInterval(interval);
  }, [targetAngle, gameState, phase2FlashType, trapTimer, myId, coins]);

  const checkCollision = (x: number, y: number, maze: MazeData) => {
    const margin = PLAYER_RADIUS + 2;
    const corners = [
      { x: x - margin, y: y - margin },
      { x: x + margin, y: y - margin },
      { x: x - margin, y: y + margin },
      { x: x + margin, y: y + margin },
    ];

    for (const p of corners) {
      const gx = Math.floor(p.x / CELL_SIZE);
      const gy = Math.floor(p.y / CELL_SIZE);
      if (gx < 0 || gy < 0 || gx >= maze.width || gy >= maze.height || maze.grid[gy][gx] === 1) {
        return true;
      }
    }
    return false;
  };

  // AI Opponent Logic
  useEffect(() => {
    if ((gameState !== 'playing' && gameState !== 'practice') || !maze) return;
    
    // Only run AI if we are alone or want a consistent challenge
    const aiInterval = setInterval(() => {
      setAiPos(prev => {
        const currentPhase = phaseRef.current;
        const currentWipeTimer = wipeTimerRef.current;
        const currentMyPos = myPosRef.current;
        
        const targetX = currentPhase === 3 ? currentMyPos.x : maze.end.x * CELL_SIZE + CELL_SIZE / 2;
        const targetY = currentPhase === 3 ? currentMyPos.y : maze.end.y * CELL_SIZE + CELL_SIZE / 2;
        
        const currentX = prev?.x ?? (currentPhase === 3 ? maze.end.x * CELL_SIZE + CELL_SIZE / 2 : maze.start.x * CELL_SIZE + CELL_SIZE / 2);
        const currentY = prev?.y ?? (currentPhase === 3 ? maze.end.y * CELL_SIZE + CELL_SIZE / 2 : maze.start.y * CELL_SIZE + CELL_SIZE / 2);
        
        const dx = targetX - currentX;
        const dy = targetY - currentY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 10) {
          if (gameStateRef.current === 'practice') {
            respawnRef.current();
            return prev;
          }
          setGameState('lost');
          setWinner({ id: 'AI-GHOST', time: timeRef.current });
          if (window.parent) {
            window.parent.postMessage({ type: 'SPATIO_MAZE_LOSS', payload: { phase: currentPhase, time: timeRef.current } }, '*');
          }
          return prev;
        }

        // Simple AI: move towards goal
        // Scale AI speed based on phase and difficulty
        const baseAiSpeed = 0.8 + (currentPhase * 0.3); 
        let aiSpeed = baseAiSpeed + (difficulty * 0.2);

        // Slow down AI ghost during wipe warning to make it fair
        if (currentPhase === 3 && currentWipeTimer < 5) {
          aiSpeed *= 0.2; // 80% slower
        }
        
        const angle = Math.atan2(dy, dx);
        
        // Snap AI angle to cardinal directions for visual consistency with the player
        let cardinalAngle = 0;
        if (Math.abs(dx) > Math.abs(dy)) {
          cardinalAngle = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          cardinalAngle = dy > 0 ? Math.PI : 0;
        }
        
        return {
          id: 'AI-GHOST',
          x: currentX + Math.cos(angle) * aiSpeed,
          y: currentY + Math.sin(angle) * aiSpeed,
          angle: cardinalAngle,
          color: '#ef4444'
        };
      });
    }, 50);

    return () => clearInterval(aiInterval);
  }, [gameState, maze, difficulty]);

  // Rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !maze) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      // Auto-rotation relative to player heading
      ctx.rotate(-myPos.angle);
      ctx.translate(-myPos.x, -myPos.y);

      // Draw Floor
      ctx.fillStyle = '#0f172a';
      if (phase === 3 && wipeTimer < 5 && Math.floor(Date.now() / 200) % 2 === 0) {
        ctx.fillStyle = '#450a0a'; // Dark red flash
      }
      ctx.fillRect(0, 0, maze.width * CELL_SIZE, maze.height * CELL_SIZE);

      // Draw Traps (Phase 1 & 2)
      if (phase === 1) {
        maze.traps.forEach(trap => {
          if (trapTimer < 0.5) {
            ctx.fillStyle = '#ef4444'; // Collapsed
            ctx.fillRect(trap.x * CELL_SIZE + 2, trap.y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
          } else if (trapTimer < 2.5) {
            ctx.fillStyle = '#f59e0b'; // Warning
            ctx.fillRect(trap.x * CELL_SIZE + 2, trap.y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
          } else {
            // Safe - draw as a subtle outline so it doesn't look like a wall
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
            ctx.lineWidth = 2;
            ctx.strokeRect(trap.x * CELL_SIZE + 4, trap.y * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8);
          }
          
          // Trap Glow
          if (trapTimer < 2.5) {
            ctx.shadowBlur = 10;
            ctx.shadowColor = trapTimer < 0.5 ? '#ef4444' : '#f59e0b';
            ctx.strokeStyle = trapTimer < 0.5 ? '#ef4444' : '#f59e0b';
            ctx.lineWidth = 2;
            ctx.strokeRect(trap.x * CELL_SIZE + 2, trap.y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
            ctx.shadowBlur = 0;
          }
        });
      } else if (phase === 2) {
        const freezeThreshold = phase2FlashType === 'yellow' ? 3 : 1;
        if (trapTimer <= freezeThreshold) {
          ctx.fillStyle = phase2FlashType === 'yellow' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)';
          ctx.fillRect(0, 0, maze.width * CELL_SIZE, maze.height * CELL_SIZE);
        }
      }

      // Draw Safe Zones (Phase 3)
      if (phase === 3) {
        maze.safeZones.forEach(sz => {
          ctx.save();
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2;
          ctx.strokeRect(sz.x * CELL_SIZE + 4, sz.y * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8);

          if (safeZonesVisible || wipeTimer < 5) {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
            if (wipeTimer < 5 && Math.floor(Date.now() / 200) % 2 === 0) {
              ctx.fillStyle = 'rgba(16, 185, 129, 0.6)';
            }
            ctx.fillRect(sz.x * CELL_SIZE + 4, sz.y * CELL_SIZE + 4, CELL_SIZE - 8, CELL_SIZE - 8);
          }
          ctx.restore();
        });
      }

      // Draw Walls
      ctx.fillStyle = '#1e293b';
      for (let y = 0; y < maze.height; y++) {
        for (let x = 0; x < maze.width; x++) {
          if (maze.grid[y][x] === 1) {
            ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            // Wall detailing
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
          }
        }
      }

      // Draw Start/End
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.fillRect(maze.start.x * CELL_SIZE, maze.start.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      
      // Goal Object (Rotating Cube-like)
      ctx.save();
      ctx.translate(maze.end.x * CELL_SIZE + CELL_SIZE / 2, maze.end.y * CELL_SIZE + CELL_SIZE / 2);
      ctx.rotate(Date.now() / 500);
      ctx.fillStyle = '#ef4444';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#ef4444';
      ctx.fillRect(-10, -10, 20, 20);
      ctx.restore();

      // Draw Other Players (Opponents)
      (Object.values(players) as Player[]).concat(aiPos ? [aiPos] : []).forEach(p => {
        if (p.id === myId) return;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        
        // Opponent Icon
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(0, -PLAYER_RADIUS - 5);
        ctx.lineTo(PLAYER_RADIUS, PLAYER_RADIUS);
        ctx.lineTo(-PLAYER_RADIUS, PLAYER_RADIUS);
        ctx.closePath();
        ctx.fill();
        
        // Name tag
        if (p.id !== 'AI-GHOST') {
          ctx.rotate(-p.angle + myPos.angle); // Keep text upright relative to screen
          ctx.fillStyle = 'white';
          ctx.font = '10px JetBrains Mono';
          ctx.textAlign = 'center';
          ctx.fillText('OPPONENT', 0, -20);
        }
        ctx.restore();
      });

      // Draw Me
      ctx.save();
      ctx.translate(myPos.x, myPos.y);
      ctx.rotate(myPos.angle);
      
      // Player Icon (Arrow/Triangle)
      ctx.fillStyle = '#10b981';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#10b981';
      ctx.beginPath();
      ctx.moveTo(0, -PLAYER_RADIUS - 5);
      ctx.lineTo(PLAYER_RADIUS, PLAYER_RADIUS);
      ctx.lineTo(-PLAYER_RADIUS, PLAYER_RADIUS);
      ctx.closePath();
      ctx.fill();
      
      ctx.restore();

      ctx.restore();
      
      requestAnimationFrame(render);
    };

    const animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [maze, myPos, players, myId, trapTimer]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden flex flex-col">
      
      {/* Header */}
      <AnimatePresence>
        {gameState !== 'playing' && (
          <motion.header 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="p-6 border-b border-white/10 flex justify-between items-center bg-black/50 backdrop-blur-md z-10"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Zap className="text-black fill-current" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight uppercase italic">Spatial Race</h1>
                <p className="text-[10px] text-white/40 font-mono tracking-widest uppercase">Adaptive Flow Protocol</p>
              </div>
            </div>

            <div className="flex gap-8 items-center">
              {debugMode && (
                <div className="px-3 py-1 bg-red-500/20 border border-red-500/50 rounded text-[10px] font-mono text-red-500 animate-pulse">
                  DEBUG_MODE_ACTIVE
                </div>
              )}
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-lg border border-white/10 shadow-lg">
                  <TrendingUp size={14} className="text-emerald-500" />
                  <span className="font-mono text-lg font-bold">{difficulty.toFixed(1)}</span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-lg border border-white/10 shadow-lg">
                  <Timer size={14} className="text-emerald-500" />
                  <span className="font-mono text-lg font-bold">{Math.floor(phaseTime / 60)}:{(phaseTime % 60).toFixed(0).padStart(2, '0')}</span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-lg border border-white/10 shadow-lg">
                  <Skull size={14} className={cn((trapTimer < 2.5 || (phase === 3 && wipeTimer < 5)) ? "text-red-500 animate-pulse" : "text-amber-500")} />
                  <span className="font-mono text-lg font-bold">
                    {(phase === 3 ? wipeTimer : trapTimer).toFixed(1)}s
                  </span>
                  {phase === 2 && (
                    <div className="flex items-center gap-1 ml-2 pl-2 border-l border-white/20">
                      {phase2FlashType === 'yellow' ? (
                        <Triangle size={14} className="text-amber-500" />
                      ) : (
                        <Hexagon size={14} className="text-red-500" />
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-lg border border-white/10 shadow-lg">
                  <Timer size={14} className="text-emerald-500" />
                  <span className="font-mono text-lg font-bold">{time.toFixed(1)}s</span>
                </div>
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Main Game Area */}
      <main className="flex-1 relative flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={window.innerWidth}
          height={window.innerHeight - 100}
          className="w-full h-full cursor-none"
        />

        {/* Phase 2 Freeze Overlay */}
        <AnimatePresence>
          {(gameState === 'playing' || gameState === 'practice') && phase === 2 && trapTimer <= (phase2FlashType === 'yellow' ? 5 : 3) && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-40"
            >
              <div className={cn(
                "relative flex items-center justify-center",
                trapTimer <= (phase2FlashType === 'yellow' ? 3 : 1) ? "animate-none" : "animate-pulse",
                phase2FlashType === 'yellow' ? "text-amber-500" : "text-red-500"
              )}>
                {phase2FlashType === 'yellow' ? (
                  <Triangle size={160} className="fill-current opacity-40" />
                ) : (
                  <Hexagon size={160} className="fill-current opacity-40" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* HUD Overlays */}
        <AnimatePresence>
          {gameState !== 'playing' && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-8 left-8 p-4 border border-white/10 bg-black/80 backdrop-blur-md rounded-xl font-mono text-xs space-y-3 shadow-2xl z-50"
            >
              <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 p-1.5 rounded-md border border-emerald-500/20">
                <Music size={12} />
                <span className="uppercase font-bold">{currentGenre || '...'}</span>
              </div>
              <div className="h-[1px] bg-white/10 w-full" />
              <div className="flex justify-between gap-8 items-center bg-white/5 p-1.5 rounded-md">
                <ArrowRight size={12} className="text-white/60" />
                <span className="font-bold">{myPos.x.toFixed(0)}</span>
              </div>
              <div className="flex justify-between gap-8 items-center bg-white/5 p-1.5 rounded-md">
                <ArrowDown size={12} className="text-white/60" />
                <span className="font-bold">{myPos.y.toFixed(0)}</span>
              </div>
              <div className="flex justify-between gap-8 items-center bg-white/5 p-1.5 rounded-md">
                <RotateCcw size={12} className="text-white/60" />
                <span className="font-bold">{((myPos.angle * 180) / Math.PI).toFixed(0)}°</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Respawn Overlay */}
        <AnimatePresence mode="wait">
          {gameState === 'respawning' && (
            <motion.div
              key="respawning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-40 bg-red-500/20 backdrop-blur-sm flex items-center justify-center"
            >
              <div className="text-center">
                <Skull size={64} className="text-red-500 mx-auto mb-4" />
                <h2 className="text-4xl font-bold uppercase italic">Structural Failure</h2>
                <p className="text-white/60 font-mono">RECALIBRATING POSITION...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game State Modals */}
        <AnimatePresence mode="wait">
          {gameState === 'lobby' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]/80 backdrop-blur-xl"
            >
              <div className="max-w-md w-full p-12 border border-white/10 bg-zinc-900/50 rounded-3xl text-center space-y-8">
                <div className="space-y-2">
                  <h2 className="text-4xl font-bold italic uppercase tracking-tighter">Spatial Test</h2>
                  <p className="text-white/40 text-sm">Adaptive Flow Protocol // Phase {phase}</p>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <input 
                    type="text" 
                    value={subjectId} 
                    onChange={e => setSubjectId(e.target.value)} 
                    placeholder="ENTER SUBJECT ID" 
                    className="w-full bg-black/50 border border-white/20 rounded-xl p-4 text-center font-mono text-white uppercase focus:border-emerald-500 outline-none transition-colors"
                  />
                  <button
                    disabled={!subjectId}
                    onClick={() => {
                      setGameState('tutorial');
                      setTutorialStep('intro');
                    }}
                    className="py-4 bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-400 text-black font-bold rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-emerald-500/20 uppercase tracking-widest"
                  >
                    Initialize Protocol
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {gameState === 'tutorial' && (
            <motion.div
              key="tutorial"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-md"
            >
              <div className="max-w-lg w-full p-8 border border-white/10 bg-zinc-900 rounded-3xl space-y-6">
                <h3 className="text-2xl font-bold italic uppercase tracking-tight text-emerald-500">
                  {tutorialStep === 'intro' ? 'Training Protocol' : 
                   tutorialStep === 'phase2' ? 'Phase 2: Control Shift' :
                   tutorialStep === 'phase3' ? 'Phase 3: Memory Wipe' :
                   'Example Simulation'}
                </h3>
                
                {tutorialStep === 'intro' ? (
                  <div className="space-y-4 text-sm text-white/70">
                    <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl">
                      <div className="p-2 bg-emerald-500/20 rounded-lg"><ArrowUp size={20} className="text-emerald-500" /></div>
                      <div>
                        <p className="font-bold text-white">Screen-Relative Controls</p>
                        <p>
                          The Arrow Keys (or WASD) always move you relative to your <span className="text-emerald-400">screen</span>. 
                          <br/><br/>
                          <span className="text-white font-bold">UP</span> always moves you towards the top of your view. 
                          The maze then <span className="text-emerald-400">automatically rotates</span> to align with your new heading.
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl">
                      <div className="p-2 bg-amber-500/20 rounded-lg"><Info size={20} className="text-amber-500" /></div>
                      <div>
                        <p className="font-bold text-white">Spatial Challenge</p>
                        <p>
                          Because the maze rotates, your sense of direction will be tested. 
                          If you want to turn a corner in the maze, press the direction you want to go <span className="text-amber-400">relative to your current view</span>.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4 p-4 bg-white/5 rounded-xl">
                      <div className="p-2 bg-amber-500/20 rounded-lg"><Box size={20} className="text-amber-500" /></div>
                      <div>
                        <p className="font-bold text-white">The Armory Gamble</p>
                        <p>
                          Between phases, you can spend coins. The <span className="text-amber-400">Mystery Cube</span> is a gamble: 
                          it costs 5 coins and will either <span className="text-emerald-400">DOUBLE</span> your remaining coins or <span className="text-red-400">WIPE</span> them all.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : tutorialStep === 'phase2' ? (
                  <div className="space-y-4 text-sm text-white/70">
                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                      <p className="font-bold text-emerald-500 mb-2 uppercase">New Challenge: Freeze</p>
                      <p>Every time the Trap Cycle completes, you must <span className="text-emerald-400">FREEZE</span>.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex flex-col items-center text-center">
                        <Hexagon size={32} className="text-red-500 mb-2" />
                        <p className="font-bold text-white mb-1">Red Hexagon</p>
                        <p className="text-xs text-white/60">Stop moving for 1 second.</p>
                      </div>
                      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex flex-col items-center text-center">
                        <Triangle size={32} className="text-amber-500 mb-2" />
                        <p className="font-bold text-white mb-1">Yellow Triangle</p>
                        <p className="text-xs text-white/60">Stop moving for 3 seconds.</p>
                      </div>
                    </div>
                    <p className="italic text-white/40 text-center">Moving during a freeze will reset your position!</p>
                  </div>
                ) : tutorialStep === 'phase3' ? (
                  <div className="space-y-4 text-sm text-white/70">
                    <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <p className="font-bold text-red-500 mb-2 uppercase">New Challenge: Memory Wipe</p>
                      <p>At the start of this phase, <span className="text-red-400">Safe Zones</span> will flash green for 10 seconds. Memorize them.</p>
                    </div>
                    <div className="p-4 bg-white/5 rounded-xl flex items-center gap-4">
                      <Skull className="text-red-500" />
                      <div>
                        <p className="font-bold text-white">The Wipe</p>
                        <p>Every 30 seconds, a system wipe occurs. If you are not standing on a Safe Zone, you will fall.</p>
                      </div>
                    </div>
                    <p className="italic text-white/40">The zones will flash again 5 seconds before each wipe.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="aspect-square w-full bg-white/5 rounded-2xl flex items-center justify-center relative overflow-hidden">
                      <div className="w-12 h-12 bg-emerald-500 rounded-lg animate-bounce flex items-center justify-center">
                        <ArrowUp className="text-black" />
                      </div>
                      <div className="absolute top-4 right-4 text-[10px] font-mono text-white/40">SIMULATION ACTIVE</div>
                    </div>
                    <p className="text-center text-sm text-white/60 italic">"The world moves with you. Stay focused."</p>
                  </div>
                )}

                <button
                  onClick={() => {
                    if (tutorialStep === 'intro') setTutorialStep('example');
                    else if (tutorialStep === 'example' || tutorialStep === 'phase2' || tutorialStep === 'phase3') {
                      initGame(undefined, 'practice');
                      setPracticeTimer(PRACTICE_DURATION);
                    } else {
                      initGame();
                    }
                  }}
                  className="w-full py-4 bg-white text-black font-bold rounded-xl uppercase tracking-widest"
                >
                  {tutorialStep === 'intro' ? 'Next' : (tutorialStep === 'example' || tutorialStep === 'phase2' || tutorialStep === 'phase3') ? 'Enter Practice' : 'Initialize Phase'}
                </button>
              </div>
            </motion.div>
          )}

          {gameState === 'practice' && (
            <motion.div
              key="practice"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none flex flex-col items-end justify-start p-12 z-40"
            >
              <div className="p-4 bg-black/80 backdrop-blur-md border border-white/20 rounded-2xl text-center shadow-2xl">
                <p className="text-emerald-500 font-bold uppercase tracking-widest mb-2">Practice</p>
                <p className="text-white text-xs font-mono font-bold">{practiceTimer.toFixed(1)}s</p>
              </div>
              
              {practiceTimer <= 10 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-8 flex flex-col items-center"
                >
                  <p className="text-amber-500 font-bold uppercase tracking-widest mb-4">Phase {phase} Imminent</p>
                  <motion.div 
                    animate={practiceTimer <= 5 ? { opacity: [1, 0, 1] } : {}}
                    transition={practiceTimer <= 5 ? { duration: 0.5, repeat: Infinity } : {}}
                    className="w-16 h-16 rounded-full border-4 border-amber-500 flex items-center justify-center"
                  >
                    <div className="w-8 h-8 rounded-full bg-amber-500" />
                  </motion.div>
                </motion.div>
              )}
            </motion.div>
          )}

          {gameState === 'shop' && (
            <motion.div
              key="shop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-[70] flex items-center justify-center bg-black/95 backdrop-blur-2xl"
            >
              <div className="max-w-2xl w-full p-12 border border-white/10 bg-zinc-900/50 rounded-[3rem] text-center space-y-12">
                {phase === 1 ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3 text-emerald-500">
                      <Coins size={24} />
                      <span className="text-3xl font-mono font-bold">{coins}</span>
                    </div>
                    <h2 className="text-4xl font-bold italic uppercase tracking-tighter">Armory Access</h2>
                    <p className="text-white/40 text-sm">Select one enhancement. Your choice will be integrated into the next phase protocol.</p>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-3 text-emerald-500">
                    <div className="flex gap-1 flex-wrap justify-center max-w-xs">
                      {Array.from({ length: coins }).map((_, i) => (
                        <div key={i} className="w-4 h-4 rounded-full bg-amber-600 border border-amber-400/50" />
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-8">
                  <button
                    disabled={coins < 2 || shopChoiceTime !== null}
                    onClick={() => {
                      const now = Date.now();
                      const latency = now - (shopStartTime || now);
                      setShopChoiceTime(latency);
                      setShopLatencies(prev => [...prev, latency]);
                      setCoins(prev => prev - 2);
                      setTimeout(() => {
                        setGameState('distractor');
                        if (phase === 2) AudioEngine.getInstance().playSFX('calm');
                      }, 500);
                    }}
                    className={cn(
                      "p-8 border rounded-3xl flex flex-col items-center gap-6 transition-all group relative overflow-hidden",
                      coins >= 2 && shopChoiceTime === null ? "border-white/10 hover:bg-white/5 hover:border-emerald-500/50" : "opacity-40 border-white/5 cursor-not-allowed",
                      shopChoiceTime !== null && "border-emerald-500 bg-emerald-500/10"
                    )}
                  >
                    <div className="w-20 h-20 bg-black/50 rounded-2xl flex items-center justify-center border border-white/5">
                      <Shield size={48} className="text-emerald-500 group-hover:scale-110 transition-transform" />
                    </div>
                    {phase === 1 ? (
                      <div className="flex items-center gap-2 text-amber-500 font-mono">
                        <Coins size={14} />
                        <span>2</span>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <div className="w-3 h-3 rounded-full bg-amber-800" />
                        <div className="w-3 h-3 rounded-full bg-amber-800" />
                      </div>
                    )}
                  </button>

                  <button
                    disabled={coins < 5 || shopChoiceTime !== null}
                    onClick={() => {
                      const now = Date.now();
                      const latency = now - (shopStartTime || now);
                      setShopChoiceTime(latency);
                      setShopLatencies(prev => [...prev, latency]);
                      const win = Math.random() > 0.5;
                      if (win) setCoins(prev => prev * 2);
                      else setCoins(0);
                      setTimeout(() => {
                        setGameState('distractor');
                        if (phase === 2) AudioEngine.getInstance().playSFX('calm');
                      }, 500);
                    }}
                    className={cn(
                      "p-8 border rounded-3xl flex flex-col items-center gap-6 transition-all group relative overflow-hidden",
                      coins >= 5 && shopChoiceTime === null ? "border-white/10 hover:bg-white/5 hover:border-amber-500/50" : "opacity-40 border-white/5 cursor-not-allowed",
                      shopChoiceTime !== null && "border-amber-500 bg-amber-500/10"
                    )}
                  >
                    <div className="w-20 h-20 bg-black/50 rounded-2xl flex items-center justify-center border border-white/5 relative">
                      <Box size={48} className="text-amber-500 group-hover:scale-110 transition-transform" />
                      <HelpCircle size={20} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-black font-bold" />
                    </div>
                    {phase === 1 ? (
                      <div className="flex items-center gap-2 text-amber-500 font-mono">
                        <Coins size={14} />
                        <span>5</span>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(i => (
                          <div key={i} className="w-3 h-3 rounded-full bg-amber-600" />
                        ))}
                      </div>
                    )}
                  </button>
                </div>

                {phase === 1 && (
                  <div className="space-y-4">
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: "100%" }}
                        animate={{ width: "0%" }}
                        transition={{ duration: SHOP_DURATION, ease: "linear" }}
                        className="h-full bg-emerald-500"
                      />
                    </div>
                    <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
                      Time Remaining: {shopTimer.toFixed(1)}s // Latency: {shopChoiceTime ? `${shopChoiceTime}ms` : 'PENDING'}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {gameState === 'gameover' && (
            <motion.div
              key="gameover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-[100] flex items-center justify-center bg-[#0a0a0a] text-center p-12"
            >
              <div className="max-w-md space-y-8">
                <Trophy size={80} className="text-emerald-500 mx-auto" />
                <h2 className="text-5xl font-bold italic uppercase tracking-tighter">Protocol Complete</h2>
                <div className="space-y-2 font-mono text-white/60">
                  <p>SUBJECT ID: {subjectId}</p>
                  <p>FINAL COINS: {coins}</p>
                  <p>PHASES COMPLETED: 3</p>
                  <p>SYSTEM STATUS: ARCHIVED</p>
                </div>
                <div className="space-y-4">
                  <button
                    onClick={downloadCSV}
                    className="w-full py-4 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                  >
                    <Download size={20} />
                    Download CSV Data
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-all uppercase tracking-widest"
                  >
                    Restart System
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {gameState === 'distractor' && (
            <motion.div
              key="distractor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-[80] flex items-center justify-center bg-black/95 backdrop-blur-3xl"
            >
              <div className="max-w-xl w-full p-12 border border-white/10 bg-zinc-900/50 rounded-[3rem] text-center space-y-8">
                {phase === 1 ? (
                  distractorTimer > 60 ? (
                    <>
                      <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                        <Timer className="text-emerald-500" size={40} />
                      </div>
                      <h2 className="text-3xl font-bold italic uppercase tracking-tighter text-white">Cognitive Calibration</h2>
                      <div className="p-6 bg-black/40 rounded-2xl border border-white/10 shadow-inner">
                        <p className="text-xl text-emerald-400 font-bold mb-4 uppercase">Task Protocol:</p>
                        <p className="text-lg text-white/80 leading-relaxed">
                          Please count back from <span className="text-white font-bold">100</span> by <span className="text-white font-bold">7s</span> out loud.
                          <br />
                          (100, 93, 86, ...)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-white/40 text-xs font-mono uppercase tracking-widest">System Reset in Progress</p>
                        <div className="text-5xl font-mono font-bold text-white">
                          {Math.floor((distractorTimer - 60) / 60)}:{((distractorTimer - 60) % 60).toFixed(0).padStart(2, '0')}
                        </div>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-4">
                          <motion.div 
                            className="h-full bg-emerald-500"
                            initial={{ width: "100%" }}
                            animate={{ width: "0%" }}
                            transition={{ duration: 60, ease: "linear" }}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-8">
                      <h2 className="text-3xl font-bold italic uppercase tracking-tighter text-white">Internal Calibration</h2>
                      <div className="w-24 h-24 bg-black/40 rounded-full flex items-center justify-center mx-auto border border-white/10 shadow-inner">
                        <Skull className="text-white/40" size={40} />
                      </div>
                      <p className="text-xl text-white/80 leading-relaxed uppercase tracking-widest font-bold">
                        Close your eyes.
                        <br />
                        Count to yourself.
                      </p>
                      <div className="text-5xl font-mono font-bold text-white/20">
                        {distractorTimer.toFixed(0)}s
                      </div>
                    </div>
                  )
                ) : (
                  distractorTimer > 60 ? (
                    <div className="space-y-12">
                      <h2 className="text-3xl font-bold italic uppercase tracking-tighter text-white/40">Respiratory Sync</h2>
                      <div className="relative flex items-center justify-center">
                        <motion.div 
                          animate={{ 
                            scale: [1, 1.5, 1.5, 1, 1],
                            opacity: [0.3, 0.8, 0.8, 0.3, 0.3]
                          }}
                          transition={{ 
                            duration: 16, 
                            repeat: Infinity,
                            times: [0, 0.25, 0.5, 0.75, 1],
                            ease: "easeInOut"
                          }}
                          className="w-48 h-48 rounded-full bg-emerald-500/20 border border-emerald-500/50"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl font-mono font-bold text-white uppercase tracking-widest">
                            {(() => {
                              const cycle = (120 - distractorTimer) % 16;
                              if (cycle < 4) return "Inhale";
                              if (cycle < 8) return "Hold";
                              if (cycle < 12) return "Exhale";
                              return "Hold";
                            })()}
                          </span>
                        </div>
                      </div>
                      <div className="text-5xl font-mono font-bold text-white/20">
                        {(distractorTimer - 60).toFixed(0)}s
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <h2 className="text-3xl font-bold italic uppercase tracking-tighter text-white">Internal Calibration</h2>
                      <div className="w-24 h-24 bg-black/40 rounded-full flex items-center justify-center mx-auto border border-white/10 shadow-inner">
                        <Skull className="text-white/40" size={40} />
                      </div>
                      <p className="text-xl text-white/80 leading-relaxed uppercase tracking-widest font-bold">
                        Close your eyes.
                        <br />
                        Count to yourself.
                      </p>
                      <div className="text-5xl font-mono font-bold text-white/20">
                        {distractorTimer.toFixed(0)}s
                      </div>
                    </div>
                  )
                )}
              </div>
            </motion.div>
          )}

          {/* Audio Survey Overlay */}
          {!surveyData && gameState !== 'lobby' && (
            <AudioSurvey 
              key="audio-survey"
              onComplete={(data) => {
                setSurveyData(data);
                setPracticeTimer(PRACTICE_DURATION);
                initGame(undefined, 'practice');
              }} 
            />
          )}

          {(gameState === 'won' || gameState === 'lost') && (
            <motion.div
              key={gameState}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]/90 backdrop-blur-2xl"
            >
              <div className="max-w-md w-full p-12 border border-white/10 bg-zinc-900/50 rounded-3xl text-center space-y-8">
                <div className="flex justify-center">
                  <div className={cn(
                    "w-20 h-20 rounded-full flex items-center justify-center shadow-2xl",
                    gameState === 'won' ? "bg-emerald-500 shadow-emerald-500/40" : "bg-red-500 shadow-red-500/40"
                  )}>
                    <Trophy className="text-black" size={40} />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="text-4xl font-bold italic uppercase tracking-tighter">
                    {gameState === 'won' ? 'Protocol Success' : 'Protocol Failed'}
                  </h2>
                  <p className="text-white/40 text-sm">
                    {gameState === 'won' 
                      ? `Target reached in ${winner?.time.toFixed(2)}s. Difficulty increased.`
                      : `Opponent reached the beacon first.`}
                  </p>
                </div>
                <button
                  onClick={() => initGame()}
                  className="w-full py-4 border border-white/20 hover:bg-white/10 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
                >
                  <RotateCcw size={18} />
                  Next Iteration
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer / Status Bar */}
      <footer className="p-4 border-t border-white/5 bg-black/50 backdrop-blur-md flex justify-between items-center px-8">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">System Online</span>
          </div>
          <div className="flex items-center gap-2 text-white/40">
            <Volume2 size={12} />
            <span className="text-[10px] font-mono uppercase tracking-widest">Audio Sync Active</span>
          </div>
        </div>
        <div className="text-[10px] font-mono text-white/20 uppercase tracking-widest">
          © 2026 SPATIAL-DYNAMICS-CORP // FLOW-STATE-ENGINE-V2
        </div>
      </footer>
    </div>
  );
}
