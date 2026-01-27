<script setup lang="ts">
/**
 * CodeEditor Component
 *
 * A code editor with syntax highlighting for shell scripts and config files.
 * Uses a layered approach: highlighted pre element behind transparent textarea.
 */
import { computed, ref, watch, nextTick } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  language?: 'shell' | 'config'
  placeholder?: string
  readonly?: boolean
}>(), {
  language: 'shell',
  placeholder: '',
  readonly: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'save'): void
  (e: 'cancel'): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const preRef = ref<HTMLPreElement | null>(null)

// Line numbers
const lineNumbers = computed(() => {
  if (!props.modelValue) return [1]
  return props.modelValue.split('\n').map((_, i) => i + 1)
})

// Sync scroll between textarea and pre
function syncScroll() {
  if (textareaRef.value && preRef.value) {
    preRef.value.scrollTop = textareaRef.value.scrollTop
    preRef.value.scrollLeft = textareaRef.value.scrollLeft
  }
}

// Syntax highlighting
const highlightedCode = computed(() => {
  const code = props.modelValue || ''
  if (props.language === 'shell') {
    return highlightShell(code)
  } else {
    return highlightConfig(code)
  }
})

function highlightShell(code: string): string {
  // Process line by line to handle comments correctly
  return code.split('\n').map(line => {
    // Check if line starts with # (comment)
    const trimmed = line.trimStart()
    if (trimmed.startsWith('#')) {
      const leadingSpace = line.substring(0, line.length - trimmed.length)
      // Highlight shebang differently
      if (trimmed.startsWith('#!')) {
        return `${escapeHtml(leadingSpace)}<span class="sh-shebang">${escapeHtml(trimmed)}</span>`
      }
      return `${escapeHtml(leadingSpace)}<span class="sh-comment">${escapeHtml(trimmed)}</span>`
    }
    
    // For non-comment lines, apply highlighting
    let result = line
    
    // Escape HTML first
    result = escapeHtml(result)
    
    // Keywords (must be whole words at start of statement or after ; or |)
    const keywords = ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'exit', 'local', 'export', 'readonly', 'declare', 'set', 'unset', 'shift', 'break', 'continue', 'in']
    keywords.forEach(kw => {
      // Match keyword at start, after whitespace, after ; or | or &&
      result = result.replace(
        new RegExp(`(^|\\s|;|\\||&&)(${kw})(\\s|$|;)`, 'g'),
        `$1<span class="sh-keyword">${kw}</span>$3`
      )
    })
    
    // Built-in commands
    const builtins = ['echo', 'cd', 'pwd', 'source', 'eval', 'exec', 'trap', 'wait', 'read', 'printf', 'test', 'true', 'false']
    builtins.forEach(cmd => {
      result = result.replace(
        new RegExp(`(^|\\s|;|\\||&&)(${cmd})(\\s|$)`, 'g'),
        `$1<span class="sh-builtin">${cmd}</span>$3`
      )
    })
    
    // Variables: $VAR, ${VAR}, $1, $@, etc
    result = result.replace(
      /(\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*|\$[0-9@#?*!-])/g,
      '<span class="sh-variable">$1</span>'
    )
    
    // Strings (double quotes) - simplified, doesn't handle escapes perfectly
    result = result.replace(
      /(&quot;[^&]*?&quot;)/g,
      '<span class="sh-string">$1</span>'
    )
    
    // Strings (single quotes)
    result = result.replace(
      /(&#39;[^&]*?&#39;)/g,
      '<span class="sh-string">$1</span>'
    )
    
    // Operators
    result = result.replace(
      /(&&|\|\||;;|&gt;&amp;|&lt;&amp;|&gt;&gt;|&lt;&lt;|&gt;|&lt;|\|)/g,
      '<span class="sh-operator">$1</span>'
    )
    
    // Flags: -x, --flag
    result = result.replace(
      /(\s)(--?[a-zA-Z][a-zA-Z0-9-]*)(\s|$|=)/g,
      '$1<span class="sh-flag">$2</span>$3'
    )
    
    return result
  }).join('\n')
}

function highlightConfig(code: string): string {
  // Process line by line
  return code.split('\n').map(line => {
    const trimmed = line.trimStart()
    const leadingSpace = line.substring(0, line.length - trimmed.length)
    
    // Comments
    if (trimmed.startsWith('#')) {
      return `${escapeHtml(leadingSpace)}<span class="cfg-comment">${escapeHtml(trimmed)}</span>`
    }
    
    // Key=value pairs
    const match = line.match(/^(\s*)([A-Z_][A-Z0-9_]*)(\s*=\s*)(.*)$/)
    if (match) {
      const [, space, key, equals, value] = match
      let highlightedValue = escapeHtml(value)
      
      // Highlight strings in value
      highlightedValue = highlightedValue.replace(
        /(&quot;[^&]*?&quot;)/g,
        '<span class="cfg-string">$1</span>'
      )
      
      // Highlight booleans
      highlightedValue = highlightedValue.replace(
        /\b(true|false|yes|no)\b/gi,
        '<span class="cfg-boolean">$1</span>'
      )
      
      // Highlight numbers
      highlightedValue = highlightedValue.replace(
        /\b(\d+)\b/g,
        '<span class="cfg-number">$1</span>'
      )
      
      return `${escapeHtml(space)}<span class="cfg-key">${escapeHtml(key)}</span><span class="cfg-equals">${escapeHtml(equals)}</span>${highlightedValue}`
    }
    
    return escapeHtml(line)
  }).join('\n')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Handle input
function handleInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

// Handle keyboard shortcuts
function handleKeydown(e: KeyboardEvent) {
  // Cmd/Ctrl+S to save
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    emit('save')
  }
  // Escape to cancel
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('cancel')
  }
  // Tab to insert spaces
  if (e.key === 'Tab') {
    e.preventDefault()
    const target = e.target as HTMLTextAreaElement
    const start = target.selectionStart
    const end = target.selectionEnd
    const newValue = props.modelValue.substring(0, start) + '  ' + props.modelValue.substring(end)
    emit('update:modelValue', newValue)
    // Move cursor after the inserted spaces
    nextTick(() => {
      target.selectionStart = target.selectionEnd = start + 2
    })
  }
}

// Keep pre scroll in sync when content changes
watch(() => props.modelValue, () => {
  nextTick(syncScroll)
})
</script>

<template>
  <div class="code-editor-container">
    <!-- Line numbers -->
    <div class="line-numbers">
      <div
        v-for="num in lineNumbers"
        :key="num"
        class="line-number"
      >
        {{ num }}
      </div>
    </div>
    
    <!-- Editor area -->
    <div class="editor-area">
      <!-- Syntax highlighted layer (behind) -->
      <pre
        ref="preRef"
        class="highlighted-code"
        aria-hidden="true"
        v-html="highlightedCode + '\n'"
      />
      
      <!-- Textarea (on top, transparent text) -->
      <textarea
        ref="textareaRef"
        :value="modelValue"
        class="editor-textarea"
        :placeholder="placeholder"
        :readonly="readonly"
        spellcheck="false"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        @input="handleInput"
        @scroll="syncScroll"
        @keydown="handleKeydown"
      />
    </div>
  </div>
</template>

<style scoped>
.code-editor-container {
  display: flex;
  height: 100%;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border-primary);
  overflow: hidden;
  background: var(--color-surface-base);
}

.line-numbers {
  flex-shrink: 0;
  padding: 0.75rem 0.5rem;
  background: rgba(var(--color-surface-overlay-rgb), 0.3);
  border-right: 1px solid var(--color-border-subtle);
  user-select: none;
  overflow: hidden;
}

.line-number {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.625rem;
  line-height: 1.25rem;
  height: 1.25rem;
  color: var(--color-text-muted);
  text-align: right;
  min-width: 2ch;
}

.editor-area {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.highlighted-code,
.editor-textarea {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  padding: 0.75rem;
  margin: 0;
  border: none;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.875rem;
  line-height: 1.25rem;
  white-space: pre;
  overflow: auto;
  tab-size: 2;
}

.highlighted-code {
  background: transparent;
  color: var(--color-text-primary);
  pointer-events: none;
  word-wrap: normal;
}

.editor-textarea {
  background: transparent;
  color: transparent;
  caret-color: var(--color-text-primary);
  resize: none;
  outline: none;
  z-index: 1;
  -webkit-text-fill-color: transparent;
}

.editor-textarea::placeholder {
  color: var(--color-text-muted);
  -webkit-text-fill-color: var(--color-text-muted);
}

.editor-textarea::selection {
  background: rgba(var(--color-primary-rgb), 0.3);
  -webkit-text-fill-color: var(--color-text-primary);
}

/* Shell syntax highlighting */
:deep(.sh-comment) {
  color: #6b7280;
  font-style: italic;
}

:deep(.sh-shebang) {
  color: #9333ea;
  font-weight: 500;
}

:deep(.sh-keyword) {
  color: #c026d3;
  font-weight: 500;
}

:deep(.sh-builtin) {
  color: #2563eb;
}

:deep(.sh-variable) {
  color: #ea580c;
}

:deep(.sh-string) {
  color: #16a34a;
}

:deep(.sh-operator) {
  color: #dc2626;
}

:deep(.sh-flag) {
  color: #0891b2;
}

/* Config syntax highlighting */
:deep(.cfg-comment) {
  color: #6b7280;
  font-style: italic;
}

:deep(.cfg-key) {
  color: #2563eb;
  font-weight: 500;
}

:deep(.cfg-equals) {
  color: var(--color-text-muted);
}

:deep(.cfg-string) {
  color: #16a34a;
}

:deep(.cfg-boolean) {
  color: #c026d3;
}

:deep(.cfg-number) {
  color: #ea580c;
}

/* Dark mode adjustments */
@media (prefers-color-scheme: dark) {
  :deep(.sh-comment),
  :deep(.cfg-comment) {
    color: #9ca3af;
  }
  
  :deep(.sh-shebang) {
    color: #a78bfa;
  }
  
  :deep(.sh-keyword) {
    color: #e879f9;
  }
  
  :deep(.sh-builtin) {
    color: #60a5fa;
  }
  
  :deep(.sh-variable) {
    color: #fb923c;
  }
  
  :deep(.sh-string),
  :deep(.cfg-string) {
    color: #4ade80;
  }
  
  :deep(.sh-operator) {
    color: #f87171;
  }
  
  :deep(.sh-flag) {
    color: #22d3ee;
  }
  
  :deep(.cfg-key) {
    color: #60a5fa;
  }
  
  :deep(.cfg-boolean) {
    color: #e879f9;
  }
  
  :deep(.cfg-number) {
    color: #fb923c;
  }
}
</style>
