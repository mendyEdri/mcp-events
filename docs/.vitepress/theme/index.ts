import DefaultTheme from 'vitepress/theme'
import HeroAnimation from './components/HeroAnimation.vue'
import type { Theme } from 'vitepress'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HeroAnimation', HeroAnimation)
  },
} satisfies Theme
