import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import DosView from '@/views/dos-view.vue';
import MainView from '@/views/main-view.vue';
import GameView from '@/views/game-view.vue';

const routes: Array<RouteRecordRaw> = [
  {
    // The app opens straight into the DOS game.
    path: '/',
    name: 'dos',
    component: DosView
  },
  {
    // The full management page stays reachable for imports, backups and the Windows edition.
    path: '/setup',
    name: 'main',
    component: MainView
  },
  {
    path: '/game/:gameType',
    name: 'game',
    component: GameView
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: { name: 'dos' }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
