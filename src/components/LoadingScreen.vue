<script setup lang="ts">
/**
 * LoadingScreen Component
 *
 * Premium animated loading screen displayed during app initialisation.
 * Features micro-animations, gradient effects, and a polished design.
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'

defineProps<{
  /** Loading message to display */
  message?: string
}>()

// Animated dots for loading text
const dotCount = ref(0)
let dotInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  dotInterval = setInterval(() => {
    dotCount.value = (dotCount.value + 1) % 4
  }, 400)
})

onUnmounted(() => {
  if (dotInterval) {
    clearInterval(dotInterval)
  }
})
</script>

<template>
  <div class="loading-screen" @mousedown.left="getCurrentWindow().startDragging()">
    <!-- Animated background gradient -->
    <div class="loading-bg" />
    
    <!-- Floating orbs for visual interest -->
    <div class="orb orb-1" />
    <div class="orb orb-2" />
    <div class="orb orb-3" />
    
    <!-- Main content -->
    <div class="loading-content">
      <!-- Logo/Icon with pulse animation -->
      <div class="logo-container">
        <div class="logo-glow" />
        <div class="logo">
          <!-- Tree/Branch icon representing git worktrees -->
          <svg class="logo-icon" viewBox="0 0 48 48" fill="none">
            <!-- Trunk -->
            <path 
              d="M24 42V22" 
              stroke="currentColor" 
              stroke-width="3" 
              stroke-linecap="round"
              class="trunk"
            />
            <!-- Main branch left -->
            <path 
              d="M24 30C20 30 14 26 10 20" 
              stroke="currentColor" 
              stroke-width="2.5" 
              stroke-linecap="round"
              class="branch branch-1"
            />
            <!-- Main branch right -->
            <path 
              d="M24 26C28 26 34 22 38 16" 
              stroke="currentColor" 
              stroke-width="2.5" 
              stroke-linecap="round"
              class="branch branch-2"
            />
            <!-- Top branch -->
            <path 
              d="M24 22C24 18 24 12 24 6" 
              stroke="currentColor" 
              stroke-width="2.5" 
              stroke-linecap="round"
              class="branch branch-3"
            />
            <!-- Leaf nodes -->
            <circle cx="10" cy="18" r="4" class="leaf leaf-1" fill="currentColor" />
            <circle cx="38" cy="14" r="4" class="leaf leaf-2" fill="currentColor" />
            <circle cx="24" cy="6" r="4" class="leaf leaf-3" fill="currentColor" />
            <!-- Small accent nodes -->
            <circle cx="16" cy="24" r="2.5" class="node node-1" fill="currentColor" />
            <circle cx="32" cy="20" r="2.5" class="node node-2" fill="currentColor" />
          </svg>
        </div>
      </div>
      
      <!-- App name with gradient text -->
      <h1 class="app-name">Grove</h1>
      
      <!-- Loading indicator -->
      <div class="loading-indicator">
        <div class="spinner">
          <div class="spinner-ring" />
          <div class="spinner-ring spinner-ring-2" />
        </div>
      </div>
      
      <!-- Loading message -->
      <p class="loading-message">
        {{ message || 'Initialising' }}<span class="dots">{{ '.'.repeat(dotCount) }}</span>
      </p>
    </div>
    
    <!-- Version badge -->
    <div class="version-badge">
      <span class="version-label">Git Worktree Manager</span>
    </div>
  </div>
</template>

<style scoped>
.loading-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-base);
  overflow: hidden;
  z-index: 9999;
  -webkit-app-region: drag;
  app-region: drag;
}

/* Animated gradient background */
.loading-bg {
  position: absolute;
  inset: -50%;
  background: conic-gradient(
    from 0deg at 50% 50%,
    var(--color-surface-base) 0deg,
    var(--color-accent-muted) 60deg,
    var(--color-surface-base) 120deg,
    rgba(34, 197, 94, 0.08) 180deg,
    var(--color-surface-base) 240deg,
    var(--color-accent-muted) 300deg,
    var(--color-surface-base) 360deg
  );
  animation: rotate-bg 20s linear infinite;
  opacity: 0.5;
}

@keyframes rotate-bg {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Floating orbs */
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.4;
  animation: float 8s ease-in-out infinite;
}

.orb-1 {
  width: 300px;
  height: 300px;
  background: var(--color-accent);
  top: 10%;
  left: 20%;
  animation-delay: 0s;
}

.orb-2 {
  width: 200px;
  height: 200px;
  background: var(--color-success);
  bottom: 20%;
  right: 15%;
  animation-delay: -3s;
}

.orb-3 {
  width: 150px;
  height: 150px;
  background: var(--color-info);
  top: 60%;
  left: 10%;
  animation-delay: -5s;
}

@keyframes float {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  25% {
    transform: translate(20px, -20px) scale(1.05);
  }
  50% {
    transform: translate(-10px, 10px) scale(0.95);
  }
  75% {
    transform: translate(-20px, -10px) scale(1.02);
  }
}

/* Main content */
.loading-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

/* Logo container */
.logo-container {
  position: relative;
  width: 120px;
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-glow {
  position: absolute;
  inset: -20px;
  background: radial-gradient(
    circle,
    var(--color-accent-muted) 0%,
    transparent 70%
  );
  animation: pulse-glow 2s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 0.5; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
}

.logo {
  width: 80px;
  height: 80px;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-default);
  border-radius: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 
    0 0 0 1px var(--color-border-subtle),
    0 4px 24px rgba(0, 0, 0, 0.3),
    0 0 40px var(--color-accent-muted);
  animation: logo-float 3s ease-in-out infinite;
}

@keyframes logo-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.logo-icon {
  width: 44px;
  height: 44px;
  color: var(--color-accent);
}

/* Branch drawing animations */
.trunk {
  stroke-dasharray: 20;
  stroke-dashoffset: 20;
  animation: draw-trunk 0.8s ease-out forwards;
}

@keyframes draw-trunk {
  to { stroke-dashoffset: 0; }
}

.branch {
  stroke-dasharray: 30;
  stroke-dashoffset: 30;
}

.branch-1 {
  animation: draw-branch 0.6s ease-out 0.4s forwards;
}

.branch-2 {
  animation: draw-branch 0.6s ease-out 0.6s forwards;
}

.branch-3 {
  animation: draw-branch 0.6s ease-out 0.8s forwards;
}

@keyframes draw-branch {
  to { stroke-dashoffset: 0; }
}

/* Leaf animations */
.leaf {
  opacity: 0;
  transform-origin: center;
}

.leaf-1 {
  animation: pop-leaf 0.4s ease-out 1s forwards;
}

.leaf-2 {
  animation: pop-leaf 0.4s ease-out 1.1s forwards;
}

.leaf-3 {
  animation: pop-leaf 0.4s ease-out 1.2s forwards;
}

@keyframes pop-leaf {
  0% {
    opacity: 0;
    transform: scale(0);
  }
  60% {
    transform: scale(1.2);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

/* Node animations */
.node {
  opacity: 0;
}

.node-1 {
  animation: fade-node 0.3s ease-out 1.3s forwards;
}

.node-2 {
  animation: fade-node 0.3s ease-out 1.4s forwards;
}

@keyframes fade-node {
  to { opacity: 0.6; }
}

/* App name */
.app-name {
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  background: linear-gradient(
    135deg,
    var(--color-text-primary) 0%,
    var(--color-accent) 50%,
    var(--color-text-primary) 100%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradient-shift 3s ease-in-out infinite;
}

@keyframes gradient-shift {
  0%, 100% { background-position: 0% center; }
  50% { background-position: 100% center; }
}

/* Loading indicator */
.loading-indicator {
  position: relative;
  width: 48px;
  height: 48px;
}

.spinner {
  position: relative;
  width: 100%;
  height: 100%;
}

.spinner-ring {
  position: absolute;
  inset: 0;
  border: 2px solid transparent;
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1.2s linear infinite;
}

.spinner-ring-2 {
  inset: 6px;
  border-top-color: var(--color-accent-hover);
  animation-duration: 0.8s;
  animation-direction: reverse;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Loading message */
.loading-message {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  min-width: 140px;
  text-align: center;
}

.dots {
  display: inline-block;
  width: 24px;
  text-align: left;
}

/* Version badge */
.version-badge {
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-subtle);
  border-radius: 9999px;
  animation: fade-in 0.5s ease-out 1.5s backwards;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateX(-50%) translateY(10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.version-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .loading-bg,
  .orb,
  .logo-glow,
  .logo,
  .trunk,
  .branch,
  .leaf,
  .node,
  .app-name,
  .spinner-ring,
  .version-badge {
    animation: none;
  }
  
  .trunk,
  .branch {
    stroke-dashoffset: 0;
  }
  
  .leaf,
  .node {
    opacity: 1;
  }
}
</style>
