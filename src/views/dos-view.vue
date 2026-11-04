<template>
  <div ref="container" class="dos-app" @pointerdown.capture="requestImmersive">
    <canvas ref="gameCanvas" width="1067" height="600" tabindex="0" aria-label="Lemmings">
      Your browser does not support the game canvas.
    </canvas>
    <div v-if="setupNeeded" class="setup" role="dialog" aria-labelledby="setup-title">
      <h1 id="setup-title">Lemmings</h1>
      <p>Choose your original DOS game files once. They stay on this device.</p>
      <button type="button" :disabled="busy" @click="chooseFiles">{{ busy ? 'Reading…' : 'Choose LEMMING.zip or the .dat files' }}</button>
      <input ref="fileInput" class="visually-hidden" type="file" multiple accept=".zip,.dat,application/zip" tabindex="-1" aria-hidden="true" @change="onFilesSelected">
      <p v-if="message" class="message" role="alert">{{ message }}</p>
    </div>
    <div v-else-if="error" class="setup" role="alert">
      <p class="message">{{ error }}</p>
      <button type="button" @click="retry">Try again</button>
    </div>
  </div>
</template>

<script lang="ts" src="./dos-view.ts"></script>

<style scoped>
.dos-app { position: fixed; inset: 0; overflow: hidden; background: #000; }
canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; touch-action: none; outline: none; -webkit-user-select: none; user-select: none; }
.setup { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 1.5rem; text-align: center; color: #e8e8e8; background: #000; font-family: monospace; }
.setup h1 { margin: 0; font-size: 2rem; color: #58d858; }
.setup p { margin: 0; max-width: 32rem; }
.setup button { min-height: 48px; padding: .6rem 1.2rem; border: 2px solid #58d858; border-radius: 0; color: #58d858; background: #000; font: inherit; font-size: 1rem; cursor: pointer; }
.setup button:disabled { opacity: .5; cursor: default; }
.message { color: #f0c040; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
