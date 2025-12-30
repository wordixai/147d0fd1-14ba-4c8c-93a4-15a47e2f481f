import { useEffect, useRef, useCallback, useState } from 'react';

// Game constants
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 700;
const PLAYER_WIDTH = 40;
const PLAYER_HEIGHT = 30;
const PLAYER_SPEED = 8;
const BULLET_SPEED = 12;
const BULLET_WIDTH = 4;
const BULLET_HEIGHT = 12;
const ENEMY_WIDTH = 36;
const ENEMY_HEIGHT = 28;
const SHOOT_COOLDOWN = 150;
const INITIAL_LIVES = 3;

// Types
interface Entity {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Bullet extends Entity {
  active: boolean;
}

interface Enemy extends Entity {
  active: boolean;
  type: number;
  health: number;
  speed: number;
  direction: number;
  hitFlash: number;
}

interface Explosion {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
}

interface GameState {
  player: Entity;
  bullets: Bullet[];
  enemies: Enemy[];
  explosions: Explosion[];
  score: number;
  lives: number;
  level: number;
  gameOver: boolean;
  levelComplete: boolean;
  levelTransition: boolean;
  transitionTimer: number;
  paused: boolean;
  started: boolean;
}

// Wave patterns for each level
const generateWave = (level: number): Omit<Enemy, 'active' | 'hitFlash'>[] => {
  const enemies: Omit<Enemy, 'active' | 'hitFlash'>[] = [];
  const baseEnemies = 4 + Math.floor(level * 1.5);
  const rows = Math.min(2 + Math.floor(level / 3), 4);
  const cols = Math.ceil(baseEnemies / rows);
  const spacing = 60;
  const startX = (CANVAS_WIDTH - (cols - 1) * spacing) / 2;
  const startY = 60;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (enemies.length >= baseEnemies) break;
      const type = row % 3;
      enemies.push({
        x: startX + col * spacing,
        y: startY + row * 50,
        width: ENEMY_WIDTH,
        height: ENEMY_HEIGHT,
        type,
        health: 1 + Math.floor(level / 4),
        speed: 1 + level * 0.15,
        direction: 1,
      });
    }
  }
  return enemies;
};

const ArcadeShooter = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState>({
    player: {
      x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2,
      y: CANVAS_HEIGHT - PLAYER_HEIGHT - 20,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
    },
    bullets: [],
    enemies: [],
    explosions: [],
    score: 0,
    lives: INITIAL_LIVES,
    level: 1,
    gameOver: false,
    levelComplete: false,
    levelTransition: false,
    transitionTimer: 0,
    paused: false,
    started: false,
  });

  const keysRef = useRef<Set<string>>(new Set());
  const lastShootRef = useRef(0);
  const animationFrameRef = useRef<number>(0);
  const [displayState, setDisplayState] = useState({
    score: 0,
    lives: INITIAL_LIVES,
    level: 1,
    gameOver: false,
    levelComplete: false,
    started: false,
  });

  // Initialize wave
  const initWave = useCallback((level: number) => {
    const waveData = generateWave(level);
    gameStateRef.current.enemies = waveData.map(e => ({
      ...e,
      active: true,
      hitFlash: 0,
    }));
    gameStateRef.current.levelComplete = false;
    gameStateRef.current.levelTransition = false;
  }, []);

  // Reset game
  const resetGame = useCallback(() => {
    const state = gameStateRef.current;
    state.player.x = CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2;
    state.bullets = [];
    state.explosions = [];
    state.score = 0;
    state.lives = INITIAL_LIVES;
    state.level = 1;
    state.gameOver = false;
    state.levelComplete = false;
    state.levelTransition = false;
    state.started = true;
    initWave(1);
    setDisplayState({
      score: 0,
      lives: INITIAL_LIVES,
      level: 1,
      gameOver: false,
      levelComplete: false,
      started: true,
    });
  }, [initWave]);

  // Spawn explosion
  const spawnExplosion = useCallback((x: number, y: number, size: number = 30, color: string = '#ff6600') => {
    gameStateRef.current.explosions.push({
      x,
      y,
      radius: 5,
      maxRadius: size,
      alpha: 1,
      color,
    });
  }, []);

  // Collision detection
  const checkCollision = (a: Entity, b: Entity): boolean => {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  };

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = () => {
      const state = gameStateRef.current;
      const now = Date.now();

      // Clear canvas
      ctx.fillStyle = '#0a0a12';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Draw grid
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.03)';
      ctx.lineWidth = 1;
      for (let i = 0; i < CANVAS_WIDTH; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, CANVAS_HEIGHT);
        ctx.stroke();
      }
      for (let i = 0; i < CANVAS_HEIGHT; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(CANVAS_WIDTH, i);
        ctx.stroke();
      }

      if (!state.started) {
        // Title screen
        ctx.fillStyle = '#00ffff';
        ctx.font = 'bold 42px Orbitron';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00ffff';
        ctx.shadowBlur = 20;
        ctx.fillText('VOID STRIKER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 60);

        ctx.shadowBlur = 10;
        ctx.font = '18px Orbitron';
        ctx.fillStyle = '#ff00ff';
        ctx.fillText('PRESS SPACE TO START', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);

        ctx.font = '14px Orbitron';
        ctx.fillStyle = '#888';
        ctx.shadowBlur = 0;
        ctx.fillText('← → MOVE   |   SPACE SHOOT', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70);

        animationFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      if (state.gameOver) {
        // Game over screen
        ctx.fillStyle = '#ff0044';
        ctx.font = 'bold 48px Orbitron';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff0044';
        ctx.shadowBlur = 20;
        ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 40);

        ctx.font = '24px Orbitron';
        ctx.fillStyle = '#00ffff';
        ctx.shadowColor = '#00ffff';
        ctx.fillText(`FINAL SCORE: ${state.score}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 20);

        ctx.font = '16px Orbitron';
        ctx.fillStyle = '#888';
        ctx.shadowBlur = 0;
        ctx.fillText('PRESS R TO RESTART', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 70);

        animationFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Level transition
      if (state.levelTransition) {
        state.transitionTimer -= 16;

        ctx.fillStyle = '#00ff88';
        ctx.font = 'bold 36px Orbitron';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#00ff88';
        ctx.shadowBlur = 25;
        ctx.fillText('LEVEL COMPLETE!', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 20);

        ctx.font = '20px Orbitron';
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.fillText(`LEVEL ${state.level + 1} INCOMING...`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);

        if (state.transitionTimer <= 0) {
          state.level++;
          initWave(state.level);
          setDisplayState(prev => ({ ...prev, level: state.level, levelComplete: false }));
        }

        animationFrameRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      // Handle input
      if (keysRef.current.has('ArrowLeft') || keysRef.current.has('a')) {
        state.player.x = Math.max(10, state.player.x - PLAYER_SPEED);
      }
      if (keysRef.current.has('ArrowRight') || keysRef.current.has('d')) {
        state.player.x = Math.min(CANVAS_WIDTH - PLAYER_WIDTH - 10, state.player.x + PLAYER_SPEED);
      }
      if (keysRef.current.has(' ') && now - lastShootRef.current > SHOOT_COOLDOWN) {
        state.bullets.push({
          x: state.player.x + PLAYER_WIDTH / 2 - BULLET_WIDTH / 2,
          y: state.player.y,
          width: BULLET_WIDTH,
          height: BULLET_HEIGHT,
          active: true,
        });
        lastShootRef.current = now;
      }

      // Update bullets
      state.bullets = state.bullets.filter(b => {
        b.y -= BULLET_SPEED;
        return b.y > -BULLET_HEIGHT && b.active;
      });

      // Update enemies
      let hitEdge = false;
      state.enemies.forEach(enemy => {
        if (!enemy.active) return;
        enemy.x += enemy.speed * enemy.direction;
        if (enemy.hitFlash > 0) enemy.hitFlash -= 0.1;
        if (enemy.x <= 10 || enemy.x >= CANVAS_WIDTH - ENEMY_WIDTH - 10) {
          hitEdge = true;
        }
      });

      if (hitEdge) {
        state.enemies.forEach(enemy => {
          if (enemy.active) {
            enemy.direction *= -1;
            enemy.y += 20;
          }
        });
      }

      // Bullet-enemy collision
      state.bullets.forEach(bullet => {
        if (!bullet.active) return;
        state.enemies.forEach(enemy => {
          if (!enemy.active) return;
          if (checkCollision(bullet, enemy)) {
            bullet.active = false;
            enemy.health--;
            enemy.hitFlash = 1;

            if (enemy.health <= 0) {
              enemy.active = false;
              state.score += 100 * state.level;
              spawnExplosion(enemy.x + ENEMY_WIDTH / 2, enemy.y + ENEMY_HEIGHT / 2, 35, '#ff00ff');
              setDisplayState(prev => ({ ...prev, score: state.score }));
            } else {
              spawnExplosion(bullet.x, bullet.y, 15, '#ffff00');
            }
          }
        });
      });

      // Player-enemy collision
      state.enemies.forEach(enemy => {
        if (!enemy.active) return;
        if (checkCollision(state.player, enemy) || enemy.y > CANVAS_HEIGHT - 100) {
          if (enemy.y > CANVAS_HEIGHT - 100) {
            enemy.active = false;
          }
          if (checkCollision(state.player, enemy)) {
            enemy.active = false;
            state.lives--;
            spawnExplosion(state.player.x + PLAYER_WIDTH / 2, state.player.y + PLAYER_HEIGHT / 2, 50, '#ff0044');
            setDisplayState(prev => ({ ...prev, lives: state.lives }));
            if (state.lives <= 0) {
              state.gameOver = true;
              setDisplayState(prev => ({ ...prev, gameOver: true }));
            }
          }
        }
      });

      // Check wave complete
      const activeEnemies = state.enemies.filter(e => e.active).length;
      if (activeEnemies === 0 && !state.levelComplete && !state.levelTransition) {
        state.levelComplete = true;
        state.levelTransition = true;
        state.transitionTimer = 2000;
        setDisplayState(prev => ({ ...prev, levelComplete: true }));
      }

      // Update explosions
      state.explosions = state.explosions.filter(exp => {
        exp.radius += 2;
        exp.alpha -= 0.04;
        return exp.alpha > 0;
      });

      // Draw bullets
      state.bullets.forEach(bullet => {
        if (!bullet.active) return;
        ctx.fillStyle = '#ffff00';
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 10;
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
      });

      // Draw enemies
      state.enemies.forEach(enemy => {
        if (!enemy.active) return;
        const colors = ['#ff00ff', '#ff4488', '#aa00ff'];
        const baseColor = colors[enemy.type % 3];

        ctx.shadowColor = baseColor;
        ctx.shadowBlur = enemy.hitFlash > 0 ? 30 : 15;
        ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : baseColor;

        // Draw enemy shape (hexagon-ish)
        ctx.beginPath();
        const cx = enemy.x + ENEMY_WIDTH / 2;
        const cy = enemy.y + ENEMY_HEIGHT / 2;
        ctx.moveTo(cx, enemy.y);
        ctx.lineTo(enemy.x + ENEMY_WIDTH, cy - 5);
        ctx.lineTo(enemy.x + ENEMY_WIDTH, cy + 5);
        ctx.lineTo(cx, enemy.y + ENEMY_HEIGHT);
        ctx.lineTo(enemy.x, cy + 5);
        ctx.lineTo(enemy.x, cy - 5);
        ctx.closePath();
        ctx.fill();

        // Enemy eye
        ctx.fillStyle = enemy.hitFlash > 0 ? baseColor : '#000';
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw player
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#00ffff';

      // Draw ship shape
      ctx.beginPath();
      const px = state.player.x + PLAYER_WIDTH / 2;
      const py = state.player.y;
      ctx.moveTo(px, py);
      ctx.lineTo(state.player.x + PLAYER_WIDTH, state.player.y + PLAYER_HEIGHT);
      ctx.lineTo(px, state.player.y + PLAYER_HEIGHT - 8);
      ctx.lineTo(state.player.x, state.player.y + PLAYER_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // Engine glow
      ctx.fillStyle = '#ff8800';
      ctx.shadowColor = '#ff4400';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.moveTo(px - 8, state.player.y + PLAYER_HEIGHT);
      ctx.lineTo(px, state.player.y + PLAYER_HEIGHT + 10 + Math.random() * 5);
      ctx.lineTo(px + 8, state.player.y + PLAYER_HEIGHT);
      ctx.closePath();
      ctx.fill();

      // Draw explosions
      ctx.shadowBlur = 0;
      state.explosions.forEach(exp => {
        const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${exp.alpha})`);
        gradient.addColorStop(0.3, `${exp.color}${Math.floor(exp.alpha * 255).toString(16).padStart(2, '0')}`);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.shadowBlur = 0;
      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [initWave, spawnExplosion]);

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', ' ', 'a', 'd'].includes(e.key)) {
        e.preventDefault();
      }
      keysRef.current.add(e.key);

      if (e.key === ' ' && !gameStateRef.current.started) {
        resetGame();
      }
      if (e.key === 'r' && gameStateRef.current.gameOver) {
        resetGame();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [resetGame]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
      <div className="relative">
        {/* HUD */}
        <div className="flex justify-between items-center w-full mb-3 px-2" style={{ width: CANVAS_WIDTH }}>
          <div className="hud-text text-primary text-lg font-bold">
            SCORE: <span className="text-accent">{displayState.score.toLocaleString()}</span>
          </div>
          <div className="hud-text-secondary text-secondary text-lg font-bold">
            LEVEL {displayState.level}
          </div>
          <div className="hud-text text-primary text-lg font-bold">
            LIVES: {Array(displayState.lives).fill('♦').join(' ')}
          </div>
        </div>

        {/* Game canvas */}
        <div className="relative rounded-lg overflow-hidden border-2 border-primary/30 scanlines">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="block"
          />
          {/* CRT overlay effect */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-background/20" />
        </div>

        {/* Controls hint */}
        <div className="text-center mt-3 text-muted-foreground text-sm font-medium">
          ← → or A D to move | SPACE to shoot
        </div>
      </div>
    </div>
  );
};

export default ArcadeShooter;
