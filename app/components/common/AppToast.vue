<script setup lang="ts">
const { toasts } = useToast()

const icons = {
  success: 'lucide:circle-check',
  error: 'lucide:circle-x',
  info: 'lucide:info',
} as const
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-2 px-4"
    aria-live="polite"
  >
    <TransitionGroup
      enter-from-class="opacity-0 -translate-y-2"
      leave-to-class="opacity-0 -translate-y-2"
      enter-active-class="transition duration-200"
      leave-active-class="transition duration-200"
    >
      <div
        v-for="t in toasts"
        :key="t.id"
        class="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm shadow-lg"
      >
        <Icon
          :name="icons[t.type]"
          class="size-4"
          :class="{
            'text-emerald-500': t.type === 'success',
            'text-red-500': t.type === 'error',
            'text-primary': t.type === 'info',
          }"
        />
        {{ t.message }}
      </div>
    </TransitionGroup>
  </div>
</template>
