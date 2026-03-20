import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { WorktreeTemplate } from '../types';

const STORAGE_KEY = 'wt-worktree-templates';

/**
 * Built-in templates for common branching workflows
 */
const BUILTIN_TEMPLATES: WorktreeTemplate[] = [
  {
    name: 'Feature',
    branch_prefix: 'feature/',
    default_base: 'origin/main',
    builtin: true,
  },
  {
    name: 'Hotfix',
    branch_prefix: 'hotfix/',
    default_base: 'origin/main',
    builtin: true,
  },
  {
    name: 'Release',
    branch_prefix: 'release/',
    default_base: 'origin/main',
    builtin: true,
  },
  {
    name: 'Bugfix',
    branch_prefix: 'bugfix/',
    default_base: 'origin/develop',
    builtin: true,
  },
];

function loadCustomTemplates(): WorktreeTemplate[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load custom templates from localStorage:', e);
  }
  return [];
}

function saveCustomTemplates(templates: WorktreeTemplate[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch (e) {
    console.warn('Failed to save custom templates to localStorage:', e);
  }
}

export const useTemplateStore = defineStore('templates', () => {
  const customTemplates = ref<WorktreeTemplate[]>(loadCustomTemplates());

  /**
   * All templates: built-in + custom
   */
  const allTemplates = computed<WorktreeTemplate[]>(() => [
    ...BUILTIN_TEMPLATES,
    ...customTemplates.value,
  ]);

  /**
   * Add a custom template
   */
  function addTemplate(template: Omit<WorktreeTemplate, 'builtin'>): void {
    const newTemplate: WorktreeTemplate = { ...template, builtin: false };
    customTemplates.value = [...customTemplates.value, newTemplate];
    saveCustomTemplates(customTemplates.value);
  }

  /**
   * Update a custom template
   */
  function updateTemplate(name: string, updates: Partial<WorktreeTemplate>): void {
    customTemplates.value = customTemplates.value.map((t) =>
      t.name === name ? { ...t, ...updates, builtin: false } : t
    );
    saveCustomTemplates(customTemplates.value);
  }

  /**
   * Remove a custom template
   */
  function removeTemplate(name: string): void {
    customTemplates.value = customTemplates.value.filter((t) => t.name !== name);
    saveCustomTemplates(customTemplates.value);
  }

  /**
   * Get a template by name
   */
  function getTemplate(name: string): WorktreeTemplate | undefined {
    return allTemplates.value.find((t) => t.name === name);
  }

  return {
    allTemplates,
    customTemplates,
    addTemplate,
    updateTemplate,
    removeTemplate,
    getTemplate,
  };
});

export { BUILTIN_TEMPLATES };
