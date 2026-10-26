<template>
  <div class="min-h-screen flex flex-col">
    <AppHeader />
    <main class="flex-1">
      <ImageToBeadPage />
    </main>
    <AppFooter />
  </div>
</template>

<script setup lang="ts">
// 单页应用：编辑器就是首页，不需要路由
import ImageToBeadPage from './pages/tool/image-to-bead.vue'
</script>
