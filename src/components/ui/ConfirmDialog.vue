<script setup lang="ts">
/**
 * ConfirmDialog Component
 *
 * A simple confirmation dialog for destructive actions.
 */
import { Modal, Button } from '.'

defineProps<{
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'primary'
  loading?: boolean
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Modal :open="open" :title="title" size="sm" @close="emit('cancel')">
    <template #icon>
      <svg
        v-if="variant === 'danger'"
        class="w-5 h-5 text-danger"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <svg
        v-else-if="variant === 'warning'"
        class="w-5 h-5 text-warning"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <svg v-else class="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    </template>

    <p class="text-sm text-text-secondary">{{ message }}</p>

    <template #footer>
      <div class="flex items-center justify-end gap-3 w-full">
        <Button variant="ghost" :disabled="loading" @click="emit('cancel')">
          {{ cancelLabel || 'Cancel' }}
        </Button>
        <Button
          :variant="variant === 'danger' ? 'danger' : 'primary'"
          :loading="loading"
          @click="emit('confirm')"
        >
          {{ confirmLabel || 'Confirm' }}
        </Button>
      </div>
    </template>
  </Modal>
</template>
