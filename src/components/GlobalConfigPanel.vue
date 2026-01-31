<script setup lang="ts">
/**
 * GlobalConfigPanel Component
 *
 * Form-based editor for the global wt configuration file (~/.wtrc).
 * Reads config entries and presents them as structured form fields,
 * saving changes back via per-key updates to avoid user error.
 */
import { ref, computed, watch } from 'vue'
import { useWt, useToast } from '../composables'
import type { ConfigEntry, ConfigKeyUpdate } from '../types'
import { Panel, Button } from './ui'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { readConfigFile, updateConfigKeys } = useWt()
const { toast } = useToast()

// State
const loading = ref(false)
const saving = ref(false)
const entries = ref<ConfigEntry[]>([])
const formValues = ref<Record<string, string>>({})
const formCommented = ref<Record<string, boolean>>({})
const originalValues = ref<Record<string, string>>({})
const originalCommented = ref<Record<string, boolean>>({})

// Custom key addition
const showAddKey = ref(false)
const newKeyName = ref('')
const newKeyValue = ref('')

// Known config keys grouped
const knownKeys = [
  {
    group: 'Core Settings',
    icon: 'cog',
    fields: [
      { key: 'DEFAULT_BASE', label: 'Default Base Branch', type: 'text' as const, placeholder: 'origin/staging' },
      { key: 'PROTECTED_BRANCHES', label: 'Protected Branches', type: 'text' as const, placeholder: 'main staging production' },
      { key: 'BRANCH_PATTERN', label: 'Branch Pattern', type: 'text' as const, placeholder: 'feature/$USER/$BRANCH' },
    ],
  },
  {
    group: 'Hooks',
    icon: 'code',
    fields: [
      { key: 'WT_HOOKS_ENABLED', label: 'Hooks Enabled', type: 'boolean' as const, placeholder: '' },
      { key: 'WT_HOOKS_DIR', label: 'Hooks Directory', type: 'text' as const, placeholder: '~/.wt/hooks' },
      { key: 'WT_TEMPLATES_DIR', label: 'Templates Directory', type: 'text' as const, placeholder: '~/.wt/templates' },
    ],
  },
  {
    group: 'Database',
    icon: 'database',
    fields: [
      { key: 'DB_CREATE', label: 'Auto-create Database', type: 'boolean' as const, placeholder: '' },
      { key: 'DB_HOST', label: 'Database Host', type: 'text' as const, placeholder: '127.0.0.1' },
      { key: 'DB_USER', label: 'Database User', type: 'text' as const, placeholder: 'root' },
      { key: 'DB_PASSWORD', label: 'Database Password', type: 'password' as const, placeholder: '' },
    ],
  },
]

const allKnownKeyNames = computed(() =>
  knownKeys.flatMap(g => g.fields.map(f => f.key))
)

// Unknown entries (present in file but not in known keys)
const unknownEntries = computed(() =>
  entries.value.filter(e => !allKnownKeyNames.value.includes(e.key))
)

// Track dirty state
const hasChanges = computed(() => {
  for (const key of Object.keys(formValues.value)) {
    if (formValues.value[key] !== (originalValues.value[key] ?? '')) return true
    if (formCommented.value[key] !== (originalCommented.value[key] ?? true)) return true
  }
  return false
})

// Load config when panel opens
watch(() => props.isOpen, async (open) => {
  if (open) {
    await loadConfig()
  }
})

async function loadConfig() {
  loading.value = true
  try {
    const result = await readConfigFile('global')
    entries.value = result.entries

    // Populate form from entries
    const vals: Record<string, string> = {}
    const commented: Record<string, boolean> = {}
    for (const entry of result.entries) {
      vals[entry.key] = entry.value
      commented[entry.key] = entry.commented
    }
    formValues.value = { ...vals }
    formCommented.value = { ...commented }
    originalValues.value = { ...vals }
    originalCommented.value = { ...commented }
  } catch (e) {
    console.error('Failed to load config:', e)
    toast.error('Failed to load configuration')
  } finally {
    loading.value = false
  }
}

function getFieldValue(key: string): string {
  return formValues.value[key] ?? ''
}

function setFieldValue(key: string, value: string) {
  formValues.value[key] = value
  // If setting a value on a previously-unknown key, ensure it's not commented
  if (formCommented.value[key] === undefined) {
    formCommented.value[key] = false
  }
}

function isFieldCommented(key: string): boolean {
  return formCommented.value[key] ?? true
}

function toggleFieldEnabled(key: string) {
  const wasCommented = formCommented.value[key] ?? true
  formCommented.value[key] = !wasCommented
}

function isBooleanTrue(key: string): boolean {
  const val = getFieldValue(key).toLowerCase()
  return val === 'true' || val === '1' || val === 'yes'
}

function toggleBoolean(key: string) {
  const current = isBooleanTrue(key)
  setFieldValue(key, current ? 'false' : 'true')
  // Ensure it's enabled when toggled
  formCommented.value[key] = false
}

function addCustomKey() {
  const key = newKeyName.value.trim().toUpperCase()
  if (!key) return
  formValues.value[key] = newKeyValue.value
  formCommented.value[key] = false
  originalValues.value[key] = originalValues.value[key] ?? ''
  originalCommented.value[key] = originalCommented.value[key] ?? true

  // Add to entries so it shows in unknown section
  entries.value.push({
    key,
    value: newKeyValue.value,
    raw_value: newKeyValue.value,
    commented: false,
    line: 0,
    sensitive: false,
  })

  newKeyName.value = ''
  newKeyValue.value = ''
  showAddKey.value = false
}

async function save() {
  saving.value = true
  try {
    const updates: ConfigKeyUpdate[] = []

    for (const key of Object.keys(formValues.value)) {
      const valueChanged = formValues.value[key] !== (originalValues.value[key] ?? '')
      const commentChanged = formCommented.value[key] !== (originalCommented.value[key] ?? true)

      if (valueChanged || commentChanged) {
        if (formCommented.value[key]) {
          // Comment out the key (set value to null)
          updates.push({ key, value: null })
        } else {
          updates.push({ key, value: formValues.value[key] })
        }
      }
    }

    if (updates.length === 0) {
      toast.info('No changes to save')
      return
    }

    await updateConfigKeys('global', updates)
    toast.success('Configuration saved')

    // Reload to get fresh state
    await loadConfig()
  } catch (e) {
    console.error('Failed to save config:', e)
    toast.error('Failed to save configuration')
  } finally {
    saving.value = false
  }
}

function handleClose() {
  showAddKey.value = false
  emit('close')
}
</script>

<template>
  <Panel
    :open="isOpen"
    title="Global Configuration"
    subtitle="~/.wtrc"
    size="md"
    @close="handleClose"
  >
    <template #icon>
      <svg class="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </template>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <div class="flex flex-col items-center gap-3">
        <div class="relative">
          <div class="w-10 h-10 rounded-full border-2 border-accent/20" />
          <div class="absolute inset-0 w-10 h-10 rounded-full border-2 border-transparent border-t-accent animate-spin" />
        </div>
        <span class="text-sm text-text-secondary">Loading configuration...</span>
      </div>
    </div>

    <!-- Form -->
    <form v-else class="space-y-6" @submit.prevent="save">
      <!-- Known key groups -->
      <section v-for="group in knownKeys" :key="group.group">
        <div class="flex items-center gap-2 mb-3">
          <!-- Group icons -->
          <div class="w-6 h-6 rounded-md flex items-center justify-center"
            :class="group.icon === 'cog' ? 'bg-accent/10' : group.icon === 'code' ? 'bg-info/10' : 'bg-warning/10'">
            <svg v-if="group.icon === 'cog'" class="w-3.5 h-3.5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <svg v-else-if="group.icon === 'code'" class="w-3.5 h-3.5 text-info" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <svg v-else class="w-3.5 h-3.5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          </div>
          <h4 class="text-xs font-semibold text-text-secondary uppercase tracking-wider">{{ group.group }}</h4>
        </div>

        <div class="space-y-3">
          <div
            v-for="field in group.fields"
            :key="field.key"
            class="config-field-row"
            :class="{ 'opacity-40': isFieldCommented(field.key) }"
          >
            <div class="flex items-center justify-between mb-1.5">
              <label :for="field.key" class="text-sm text-text-secondary font-medium">{{ field.label }}</label>
              <button
                v-if="formValues[field.key] !== undefined"
                type="button"
                class="text-2xs px-1.5 py-0.5 rounded transition-colors"
                :class="isFieldCommented(field.key)
                  ? 'text-text-muted hover:text-text-secondary'
                  : 'text-success hover:text-success'"
                @click="toggleFieldEnabled(field.key)"
              >
                {{ isFieldCommented(field.key) ? 'Disabled' : 'Enabled' }}
              </button>
            </div>

            <!-- Boolean toggle -->
            <div v-if="field.type === 'boolean'" class="flex items-center gap-3">
              <button
                type="button"
                class="toggle-switch"
                :class="{ 'toggle-on': !isFieldCommented(field.key) && isBooleanTrue(field.key) }"
                @click="toggleBoolean(field.key)"
              >
                <span class="toggle-thumb" />
              </button>
              <span class="text-xs text-text-muted">
                {{ isBooleanTrue(field.key) ? 'Yes' : 'No' }}
              </span>
            </div>

            <!-- Password input -->
            <input
              v-else-if="field.type === 'password'"
              :id="field.key"
              type="password"
              :value="getFieldValue(field.key)"
              :placeholder="field.placeholder"
              class="config-input"
              @input="setFieldValue(field.key, ($event.target as HTMLInputElement).value)"
            />

            <!-- Text input -->
            <input
              v-else
              :id="field.key"
              type="text"
              :value="getFieldValue(field.key)"
              :placeholder="field.placeholder"
              class="config-input"
              @input="setFieldValue(field.key, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </section>

      <!-- Unknown/custom entries -->
      <section v-if="unknownEntries.length > 0">
        <h4 class="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Other Settings</h4>
        <div class="space-y-3">
          <div
            v-for="entry in unknownEntries"
            :key="entry.key"
            class="config-field-row"
            :class="{ 'opacity-40': isFieldCommented(entry.key) }"
          >
            <div class="flex items-center justify-between mb-1.5">
              <label :for="entry.key" class="text-sm text-text-secondary font-medium font-mono">{{ entry.key }}</label>
              <button
                type="button"
                class="text-2xs px-1.5 py-0.5 rounded transition-colors"
                :class="isFieldCommented(entry.key)
                  ? 'text-text-muted hover:text-text-secondary'
                  : 'text-success hover:text-success'"
                @click="toggleFieldEnabled(entry.key)"
              >
                {{ isFieldCommented(entry.key) ? 'Disabled' : 'Enabled' }}
              </button>
            </div>
            <input
              :id="entry.key"
              :type="entry.sensitive ? 'password' : 'text'"
              :value="getFieldValue(entry.key)"
              class="config-input"
              @input="setFieldValue(entry.key, ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </section>

      <!-- Add custom key -->
      <section>
        <div v-if="!showAddKey">
          <button
            type="button"
            class="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
            @click="showAddKey = true"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Custom Setting
          </button>
        </div>

        <div v-else class="p-3 rounded-lg bg-surface-overlay/50 border border-border-subtle space-y-3">
          <div>
            <label class="text-xs text-text-secondary font-medium block mb-1">Key</label>
            <input
              v-model="newKeyName"
              type="text"
              placeholder="MY_SETTING"
              class="config-input font-mono uppercase"
              @keydown.enter.prevent="addCustomKey"
            />
          </div>
          <div>
            <label class="text-xs text-text-secondary font-medium block mb-1">Value</label>
            <input
              v-model="newKeyValue"
              type="text"
              placeholder="value"
              class="config-input"
              @keydown.enter.prevent="addCustomKey"
            />
          </div>
          <div class="flex items-center gap-2">
            <Button variant="primary" size="sm" @click="addCustomKey" :disabled="!newKeyName.trim()">Add</Button>
            <Button variant="ghost" size="sm" @click="showAddKey = false">Cancel</Button>
          </div>
        </div>
      </section>
    </form>

    <template #footer>
      <div class="flex items-center justify-between w-full">
        <span v-if="hasChanges" class="text-xs text-warning animate-pulse-subtle">Unsaved changes</span>
        <span v-else />
        <div class="flex items-center gap-2">
          <Button variant="ghost" @click="handleClose">Cancel</Button>
          <Button variant="primary" :disabled="saving || !hasChanges" @click="save">
            {{ saving ? 'Saving...' : 'Save' }}
          </Button>
        </div>
      </div>
    </template>
  </Panel>
</template>

<style scoped>
.config-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-lg);
  transition: all var(--duration-normal) var(--ease-out);
}

.config-input:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}

.config-input::placeholder {
  color: var(--color-text-muted);
}

.config-field-row {
  padding: 0.75rem;
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  transition: all var(--duration-normal) var(--ease-out);
}

.config-field-row:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
}

/* Toggle switch */
.toggle-switch {
  position: relative;
  width: 2.25rem;
  height: 1.25rem;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all var(--duration-normal) var(--ease-spring);
  cursor: pointer;
}

.toggle-switch.toggle-on {
  background: var(--color-accent);
  border-color: var(--color-accent);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: var(--radius-full);
  background: white;
  transition: transform var(--duration-normal) var(--ease-spring);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.toggle-on .toggle-thumb {
  transform: translateX(1rem);
}

@media (prefers-reduced-motion: reduce) {
  .toggle-thumb,
  .toggle-switch,
  .config-input,
  .config-field-row {
    transition: none !important;
  }
}
</style>
