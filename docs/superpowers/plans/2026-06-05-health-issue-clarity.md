# Health Issue Clarity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw CLI health tokens with plain-English findings — what's wrong, why it matters, exact score impact, and inline (safely-confirmed) fix actions — in both the Health panel and the Overview's attention list.

**Architecture:** A pure translation module (`src/utils/healthIssues.ts`) is the single source of truth for the CLI's scoring-token vocabulary; `HealthPanel.vue` is reworked to group findings by worktree with explanations, severity rationale, a scoring explainer, and wired actions; the Overview's `AttentionPanel.vue` reuses the same translations. A two-line zsh fix in `grove-cli` repairs the issue-splitting bug at the source (Grove's parser tolerates both shapes, so order doesn't matter).

**Tech Stack:** Vue 3 `<script setup>` + TypeScript strict, Pinia, Vitest + @vue/test-utils, existing Tauri commands via `useWt()`; zsh for the grove-cli fix.

**Spec:** `docs/superpowers/specs/2026-06-05-health-issue-clarity-design.md`

**Working branch:** `feature/health-issue-clarity` (already created; spec committed at `2f28134`).

**Git conventions:** stage exact file paths (`git add <paths>` — never `git add .`/`-A`); conventional commit messages; never mention AI/Claude in commits. The grove-cli repo (`/Users/dannyharding/Development/Code/Project/grove-cli`) is a **separate git repository** whose `main` is write-protected by a hook — Task 4 creates a branch there and merges it.

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/utils/healthIssues.ts` | Token → finding translation: titles, explanations, score impact, actions, severity copy, scoring reference data |
| `src/utils/healthIssues.test.ts` | Parser unit tests |
| `src/components/HealthPanel.test.ts` | Component tests for the reworked panel |
| `src/components/overview/AttentionPanel.test.ts` | Component test for translated health items |

**Modify:**

| File | Change |
|---|---|
| `src/components/HealthPanel.vue` | Grouped findings, explanations, severity legend, scoring explainer, inline actions, delete dialog |
| `src/components/overview/AttentionPanel.vue` | Translated health sub-line + severity tooltip |
| `grove-cli/lib/commands/info.sh:996,1062` | zsh explicit comma-splitting (separate repo, Task 4) |
| `grove-cli/CHANGELOG.md` | Fixed entry under `[Unreleased]` |

---

### Task 1: Health issue translation module

**Files:**
- Create: `src/utils/healthIssues.ts`
- Test: `src/utils/healthIssues.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/healthIssues.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  parseHealthIssueMessage,
  severityExplanation,
  SCORING_RULES,
  GRADE_BANDS,
  SEVERITY_BRACKETS,
} from './healthIssues'

describe('parseHealthIssueMessage', () => {
  describe('token translation', () => {
    it('translates behind tokens with threshold-correct score impact', () => {
      const six = parseHealthIssueMessage('behind:6')[0]
      expect(six.kind).toBe('behind')
      expect(six.value).toBe(6)
      expect(six.title).toBe('6 commits behind base')
      expect(six.scoreImpact).toBe(-10)
      expect(six.actions.map((a) => a.id)).toEqual(['pull', 'sync'])

      expect(parseHealthIssueMessage('behind:21')[0].scoreImpact).toBe(-20)
      expect(parseHealthIssueMessage('behind:51')[0].scoreImpact).toBe(-30)
      expect(parseHealthIssueMessage('behind:1')[0].title).toBe('1 commit behind base')
    })

    it('translates changes tokens with threshold-correct score impact', () => {
      const one = parseHealthIssueMessage('changes:1')[0]
      expect(one.kind).toBe('changes')
      expect(one.title).toBe('1 uncommitted change')
      expect(one.scoreImpact).toBe(-5)
      expect(one.actions.map((a) => a.id)).toEqual(['open-editor', 'view-worktree'])

      expect(parseHealthIssueMessage('changes:6')[0].scoreImpact).toBe(-10)
      expect(parseHealthIssueMessage('changes:21')[0].scoreImpact).toBe(-20)
      expect(parseHealthIssueMessage('changes:37')[0].title).toBe('37 uncommitted changes')
      expect(parseHealthIssueMessage('changes:37')[0].scoreImpact).toBe(-20)
    })

    it('translates age tokens, stripping the trailing d', () => {
      const finding = parseHealthIssueMessage('age:105d')[0]
      expect(finding.kind).toBe('age')
      expect(finding.value).toBe(105)
      expect(finding.title).toBe('No commits for 105 days')
      expect(finding.scoreImpact).toBe(-25)
      expect(finding.actions.map((a) => a.id)).toEqual(['view-worktree', 'remove'])

      expect(parseHealthIssueMessage('age:15d')[0].scoreImpact).toBe(-5)
      expect(parseHealthIssueMessage('age:31d')[0].scoreImpact).toBe(-15)
    })

    it('marks the remove action as destructive', () => {
      const remove = parseHealthIssueMessage('age:105d')[0].actions.find((a) => a.id === 'remove')
      expect(remove?.destructive).toBe(true)
      // Non-destructive actions carry no destructive flag
      const pull = parseHealthIssueMessage('behind:6')[0].actions.find((a) => a.id === 'pull')
      expect(pull?.destructive).toBeUndefined()
    })

    it('translates unmerged and untracked tokens', () => {
      const unmerged = parseHealthIssueMessage('unmerged')[0]
      expect(unmerged.kind).toBe('unmerged')
      expect(unmerged.title).toBe('Not merged into base')
      expect(unmerged.scoreImpact).toBe(-10)

      const untracked = parseHealthIssueMessage('untracked:14')[0]
      expect(untracked.kind).toBe('untracked')
      expect(untracked.title).toBe('14 untracked files')
      expect(untracked.scoreImpact).toBe(-5)
    })
  })

  describe('comma-joined messages (CLI split bug tolerance)', () => {
    it('splits comma-joined tokens into separate findings', () => {
      const findings = parseHealthIssueMessage('changes:37,age:105d')
      expect(findings).toHaveLength(2)
      expect(findings[0].title).toBe('37 uncommitted changes')
      expect(findings[1].title).toBe('No commits for 105 days')
    })

    it('handles single tokens identically (post-CLI-fix shape)', () => {
      expect(parseHealthIssueMessage('changes:37')).toHaveLength(1)
    })

    it('ignores empty segments and whitespace', () => {
      expect(parseHealthIssueMessage(' changes:2 , ,age:20d ')).toHaveLength(2)
      expect(parseHealthIssueMessage('')).toEqual([])
      expect(parseHealthIssueMessage('   ')).toEqual([])
    })
  })

  describe('unknown tokens', () => {
    it('falls back to the raw token without crashing', () => {
      const finding = parseHealthIssueMessage('mystery:9000')[0]
      expect(finding.kind).toBe('unknown')
      expect(finding.title).toBe('mystery:9000')
      expect(finding.scoreImpact).toBe(0)
      expect(finding.actions.map((a) => a.id)).toEqual(['view-worktree'])
    })

    it('treats malformed values as unknown', () => {
      expect(parseHealthIssueMessage('behind:lots')[0].kind).toBe('unknown')
      expect(parseHealthIssueMessage('age:soon')[0].kind).toBe('unknown')
    })
  })
})

describe('severityExplanation', () => {
  it('explains severities as score brackets', () => {
    expect(severityExplanation('critical')).toBe(
      "Critical: this worktree's overall health score is below 60."
    )
    expect(severityExplanation('warning')).toBe(
      "Warning: this worktree's overall health score is between 60 and 79."
    )
  })
})

describe('scoring reference data', () => {
  it('exposes the deduction table, grade bands and severity brackets', () => {
    expect(SCORING_RULES).toHaveLength(5)
    expect(GRADE_BANDS.map((b) => b.grade)).toEqual(['A', 'B', 'C', 'D', 'F'])
    expect(SEVERITY_BRACKETS.map((b) => b.label)).toEqual(['Healthy', 'Warning', 'Critical'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/healthIssues.test.ts`
Expected: FAIL — cannot resolve `./healthIssues`

- [ ] **Step 3: Implement the module**

Create `src/utils/healthIssues.ts`:

```ts
// Translation layer for grove CLI health scoring tokens.
//
// The CLI's calculate_health_score() emits compact tokens (behind:N,
// changes:N, age:Nd, unmerged, untracked:N) designed for one-line ls
// output. This module is the single source of truth for turning those
// tokens into human findings: what's wrong, why it matters, the exact
// score impact, and which actions fix it. It tolerates both single
// tokens and comma-joined messages (a zsh splitting bug in older CLI
// builds joins all of a worktree's tokens into one issue message).
import type { Severity, HealthGrade } from '../types';

export type HealthFindingKind =
  | 'behind'
  | 'changes'
  | 'age'
  | 'unmerged'
  | 'untracked'
  | 'unknown';

export type HealthActionId = 'pull' | 'sync' | 'open-editor' | 'view-worktree' | 'remove';

export interface HealthFindingAction {
  id: HealthActionId;
  label: string;
  /** True only for actions that delete things; the UI badges these */
  destructive?: boolean;
}

export interface HealthFinding {
  kind: HealthFindingKind;
  /** Numeric value parsed from the token (commits, files, or days) */
  value?: number;
  /** The raw token, always preserved (fallback display, keys, debugging) */
  raw: string;
  /** Short human title, e.g. "37 uncommitted changes" */
  title: string;
  /** One-sentence plain-English explanation of why it matters */
  explanation: string;
  /** Points this finding deducted from the worktree's score (negative; 0 for unknown) */
  scoreImpact: number;
  /** Suggested remedies, most relevant first */
  actions: HealthFindingAction[];
}

const ACTIONS: Record<HealthActionId, HealthFindingAction> = {
  pull: { id: 'pull', label: 'Pull' },
  sync: { id: 'sync', label: 'Sync' },
  'open-editor': { id: 'open-editor', label: 'Open in Editor' },
  'view-worktree': { id: 'view-worktree', label: 'Go to Worktree' },
  remove: { id: 'remove', label: 'Remove…', destructive: true },
};

// Deduction thresholds mirror calculate_health_score() in
// grove-cli/lib/commands/info.sh — keep them in sync.
function behindImpact(commits: number): number {
  if (commits > 50) return -30;
  if (commits > 20) return -20;
  return -10;
}

function changesImpact(changes: number): number {
  if (changes > 20) return -20;
  if (changes > 5) return -10;
  return -5;
}

function ageImpact(days: number): number {
  if (days > 60) return -25;
  if (days > 30) return -15;
  return -5;
}

function unknownFinding(token: string): HealthFinding {
  return {
    kind: 'unknown',
    raw: token,
    title: token,
    explanation: 'Reported by the grove CLI health check.',
    scoreImpact: 0,
    actions: [ACTIONS['view-worktree']],
  };
}

function parseToken(token: string): HealthFinding {
  const separator = token.indexOf(':');
  const key = separator === -1 ? token : token.slice(0, separator);
  const rawValue = separator === -1 ? '' : token.slice(separator + 1);

  if (key === 'behind') {
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(value)) return unknownFinding(token);
    return {
      kind: 'behind',
      value,
      raw: token,
      title: `${value} commit${value === 1 ? '' : 's'} behind base`,
      explanation:
        'The base branch has moved on; the longer you wait, the higher the conflict risk.',
      scoreImpact: behindImpact(value),
      actions: [ACTIONS.pull, ACTIONS.sync],
    };
  }

  if (key === 'changes') {
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(value)) return unknownFinding(token);
    return {
      kind: 'changes',
      value,
      raw: token,
      title: `${value} uncommitted change${value === 1 ? '' : 's'}`,
      explanation: 'Uncommitted work can be lost and blocks clean pulls and syncs.',
      scoreImpact: changesImpact(value),
      actions: [ACTIONS['open-editor'], ACTIONS['view-worktree']],
    };
  }

  if (key === 'age') {
    const value = Number.parseInt(rawValue.replace(/d$/, ''), 10);
    if (!Number.isFinite(value) || !/^\d+d?$/.test(rawValue)) return unknownFinding(token);
    return {
      kind: 'age',
      value,
      raw: token,
      title: `No commits for ${value} day${value === 1 ? '' : 's'}`,
      explanation: "This branch looks dormant. Resume it, or remove the worktree if it's done.",
      scoreImpact: ageImpact(value),
      actions: [ACTIONS['view-worktree'], ACTIONS.remove],
    };
  }

  if (token === 'unmerged') {
    return {
      kind: 'unmerged',
      raw: token,
      title: 'Not merged into base',
      explanation:
        "Work here hasn't landed in the base branch yet — expected for in-progress branches.",
      scoreImpact: -10,
      actions: [ACTIONS['view-worktree']],
    };
  }

  if (key === 'untracked') {
    const value = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(value)) return unknownFinding(token);
    return {
      kind: 'untracked',
      value,
      raw: token,
      title: `${value} untracked file${value === 1 ? '' : 's'}`,
      explanation: "Files git isn't tracking — commit, ignore, or tidy them.",
      scoreImpact: -5,
      actions: [ACTIONS['open-editor']],
    };
  }

  return unknownFinding(token);
}

/**
 * Parse a health issue message into structured findings.
 * Splits comma-joined messages (older CLI builds) and single tokens alike.
 */
export function parseHealthIssueMessage(message: string): HealthFinding[] {
  return message
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map(parseToken);
}

/** Severity is a worktree score bracket, not a per-issue property. */
export function severityExplanation(severity: Severity): string {
  return severity === 'critical'
    ? "Critical: this worktree's overall health score is below 60."
    : "Warning: this worktree's overall health score is between 60 and 79.";
}

/** Deduction table for the "How scoring works" explainer (mirrors the CLI) */
export const SCORING_RULES: { check: string; deduction: string }[] = [
  { check: 'Commits behind base', deduction: '−10 (>5), −20 (>20), −30 (>50)' },
  { check: 'Uncommitted changes', deduction: '−5 (any), −10 (>5), −20 (>20)' },
  { check: 'Days since last commit', deduction: '−5 (>14), −15 (>30), −25 (>60)' },
  { check: 'Not merged into base', deduction: '−10' },
  { check: 'More than 10 untracked files', deduction: '−5' },
];

export const GRADE_BANDS: { grade: HealthGrade; range: string }[] = [
  { grade: 'A', range: '90–100' },
  { grade: 'B', range: '80–89' },
  { grade: 'C', range: '70–79' },
  { grade: 'D', range: '60–69' },
  { grade: 'F', range: 'below 60' },
];

export const SEVERITY_BRACKETS: { label: string; range: string }[] = [
  { label: 'Healthy', range: 'score 80 or above' },
  { label: 'Warning', range: 'score 60–79' },
  { label: 'Critical', range: 'score below 60' },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/healthIssues.test.ts`
Expected: PASS

- [ ] **Step 5: Type check and commit**

Run: `npm run build`
Expected: PASS

```bash
git add src/utils/healthIssues.ts src/utils/healthIssues.test.ts
git commit -m "feat: add health issue translation module"
```

---

### Task 2: Translated health items in the Overview attention panel

**Files:**
- Modify: `src/components/overview/AttentionPanel.vue` (script imports/helpers; health item template ~lines 109–133)
- Test: `src/components/overview/AttentionPanel.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/components/overview/AttentionPanel.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AttentionPanel from './AttentionPanel.vue'
import { useOverviewStore } from '@/stores'
import type { Worktree, HealthResult } from '@/types'

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    path: '/repos/scooda/main',
    branch: 'main',
    sha: 'abc1234',
    dirty: false,
    ahead: 0,
    behind: 0,
    ...overrides,
  }
}

const healthFixture: HealthResult = {
  repo: 'scooda',
  overall_grade: 'F',
  overall_score: 55,
  worktree_count: 1,
  summary: { healthy: 0, warning: 0, critical: 1 },
  issues: [
    {
      severity: 'critical',
      worktree: 'enneagram-assessment',
      message: 'changes:37,age:105d',
    },
  ],
  worktrees: [],
}

describe('AttentionPanel health items', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('shows translated finding titles instead of raw tokens', () => {
    const store = useOverviewStore()
    store.setWorktreeSnapshot('scooda', [makeWorktree()], 1000)
    store.setHealth('scooda', healthFixture)

    const wrapper = mount(AttentionPanel)
    const text = wrapper.text()

    expect(text).toContain('37 uncommitted changes')
    expect(text).toContain('No commits for 105 days')
    expect(text).not.toContain('changes:37')
    expect(text).not.toContain('age:105d')
    wrapper.unmount()
  })

  it('explains severity on the dot tooltip', () => {
    const store = useOverviewStore()
    store.setWorktreeSnapshot('scooda', [makeWorktree()], 1000)
    store.setHealth('scooda', healthFixture)

    const wrapper = mount(AttentionPanel)
    const dot = wrapper.find('.severity-dot[title]')

    expect(dot.exists()).toBe(true)
    expect(dot.attributes('title')).toContain('below 60')
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/overview/AttentionPanel.test.ts`
Expected: FAIL — text contains `changes:37` (raw message) and the dot has no title

- [ ] **Step 3: Implement the changes**

In `src/components/overview/AttentionPanel.vue` script, after the existing imports add:

```ts
import { parseHealthIssueMessage, severityExplanation } from '../../utils/healthIssues'
```

After the `cleanupLabel` function, add:

```ts
/** Translate a raw CLI issue message into joined human titles */
function healthSummary(message: string): string {
  const titles = parseHealthIssueMessage(message).map((finding) => finding.title)
  return titles.length > 0 ? titles.join(' · ') : message
}
```

In the Health issues template block, change the severity dot line from:

```html
                <span class="severity-dot" :class="item.issue.severity === 'critical' ? 'bg-danger' : 'bg-warning'" />
```

to:

```html
                <span class="severity-dot" :class="item.issue.severity === 'critical' ? 'bg-danger' : 'bg-warning'"
                  :title="severityExplanation(item.issue.severity)" />
```

and the sub-line from:

```html
              <span class="attention-item-sub">{{ item.issue.message }}</span>
```

to:

```html
              <span class="attention-item-sub">{{ healthSummary(item.issue.message) }}</span>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/overview/AttentionPanel.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the wider suite, type check, commit**

Run: `npx vitest run && npm run build`
Expected: PASS (286 tests: 284 + 2 new — Task 1 added its own file too, so expect 284 + parser tests + these 2; read the summary line, everything green)

```bash
git add src/components/overview/AttentionPanel.vue src/components/overview/AttentionPanel.test.ts
git commit -m "feat: show translated health findings in overview attention panel"
```

---

### Task 3: HealthPanel rework — grouped findings, explanations, actions

**Files:**
- Modify: `src/components/HealthPanel.vue` (full rework of script + Issues/Worktrees sections; adds scoped styles)
- Test: `src/components/HealthPanel.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/components/HealthPanel.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HealthPanel from './HealthPanel.vue'
import { mockTauriInvoke, resetTauriMocks } from '@/test/setup'
import type { HealthResult, Worktree } from '@/types'

const healthFixture: HealthResult = {
  repo: 'scooda',
  overall_grade: 'F',
  overall_score: 55,
  worktree_count: 2,
  summary: { healthy: 0, warning: 0, critical: 2 },
  issues: [
    { severity: 'critical', worktree: 'enneagram-assessment', message: 'behind:12,changes:37' },
    { severity: 'critical', worktree: 'enneagram-assessment-fixup', message: 'changes:88,age:105d' },
  ],
  worktrees: [
    { branch: 'enneagram-assessment', grade: 'F', score: 55, issues: ['behind:12,changes:37'] },
    { branch: 'enneagram-assessment-fixup', grade: 'F', score: 55, issues: ['changes:88,age:105d'] },
  ],
}

const worktreeFixture: Worktree[] = [
  {
    path: '/repos/scooda/enneagram-assessment',
    branch: 'enneagram-assessment',
    sha: 'abc1234',
    dirty: true,
    ahead: 0,
    behind: 12,
  },
  {
    path: '/repos/scooda/enneagram-assessment-fixup',
    branch: 'enneagram-assessment-fixup',
    sha: 'def5678',
    dirty: true,
    ahead: 0,
    behind: 0,
  },
]

function mockCommands() {
  mockTauriInvoke.mockImplementation((command: string) => {
    if (command === 'get_repo_health') return Promise.resolve(healthFixture)
    if (command === 'list_worktrees') return Promise.resolve(worktreeFixture)
    if (command === 'pull_worktree') {
      return Promise.resolve({
        success: true,
        already_up_to_date: false,
        conflicts: false,
        commits_pulled: 12,
        message: 'Updated 12 commits',
      })
    }
    return Promise.resolve(undefined)
  })
}

async function mountOpenPanel() {
  const wrapper = mount(HealthPanel, {
    props: { isOpen: false, repoName: 'scooda' },
    global: {
      stubs: {
        DeleteWorktreeDialog: true,
        GradeBadge: true,
      },
    },
  })
  // The panel fetches when isOpen flips to true (watch, not immediate)
  await wrapper.setProps({ isOpen: true })
  await flushPromises()
  return wrapper
}

describe('HealthPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    resetTauriMocks()
    mockCommands()
  })

  it('renders translated findings grouped by worktree, never raw tokens', async () => {
    const wrapper = await mountOpenPanel()
    const text = wrapper.text()

    expect(text).toContain('12 commits behind base')
    expect(text).toContain('37 uncommitted changes')
    expect(text).toContain('88 uncommitted changes')
    expect(text).toContain('No commits for 105 days')
    expect(text).not.toContain('behind:12')
    expect(text).not.toContain('changes:37')
    expect(text).not.toContain('age:105d')
    wrapper.unmount()
  })

  it('shows score impact, severity legend and the scoring explainer', async () => {
    const wrapper = await mountOpenPanel()
    const text = wrapper.text()

    expect(text).toContain('-10 pts')
    expect(text).toContain('-25 pts')
    expect(text).toContain('score below 60')
    expect(text).toContain('How scoring works')
    expect(text).toContain('Commits behind base')
    wrapper.unmount()
  })

  it('explains severity on the chip tooltip', async () => {
    const wrapper = await mountOpenPanel()
    const chip = wrapper.find('[title*="below 60"]')

    expect(chip.exists()).toBe(true)
    wrapper.unmount()
  })

  it('runs the Pull action through pull_worktree and refreshes the report', async () => {
    const wrapper = await mountOpenPanel()
    const pullButton = wrapper.findAll('button').find((b) => b.text() === 'Pull')
    expect(pullButton).toBeDefined()

    await pullButton!.trigger('click')
    await flushPromises()

    const pullCalls = mockTauriInvoke.mock.calls.filter((call) => call[0] === 'pull_worktree')
    expect(pullCalls).toHaveLength(1)
    expect(pullCalls[0][1]).toMatchObject({ repo: 'scooda', branch: 'enneagram-assessment' })
    // Health refetched after the action (initial fetch + silent refresh)
    const healthCalls = mockTauriInvoke.mock.calls.filter((call) => call[0] === 'get_repo_health')
    expect(healthCalls.length).toBeGreaterThanOrEqual(2)
    wrapper.unmount()
  })

  it('routes the destructive Remove action through the delete dialog', async () => {
    const wrapper = await mountOpenPanel()
    const removeButton = wrapper.findAll('button').find((b) => b.text().includes('Remove'))
    expect(removeButton).toBeDefined()

    await removeButton!.trigger('click')
    await flushPromises()

    const dialog = wrapper.findComponent({ name: 'DeleteWorktreeDialog' })
    expect(dialog.props('isOpen')).toBe(true)
    expect(dialog.props('worktree')).toMatchObject({ branch: 'enneagram-assessment-fixup' })
    expect(dialog.props('repoName')).toBe('scooda')
    wrapper.unmount()
  })

  it('derives the summary tiles from the CLI worktree brackets', async () => {
    const wrapper = await mountOpenPanel()

    // summary: 0 healthy, 0 warning, 2 critical
    expect(wrapper.text()).toContain('Critical')
    const tile = wrapper.find('[title="Worktrees scoring below 60"]')
    expect(tile.exists()).toBe(true)
    wrapper.unmount()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/HealthPanel.test.ts`
Expected: FAIL — raw tokens rendered, no Pull button, no explainer

- [ ] **Step 3: Replace HealthPanel.vue**

Replace the **entire contents** of `src/components/HealthPanel.vue` with:

```vue
<script setup lang="ts">
/**
 * HealthPanel Component
 *
 * Sliding panel displaying a repository health report: overall grade,
 * worktree-bracket summary, issues grouped by worktree with plain-English
 * explanations, exact score impact and inline fix actions, a per-worktree
 * breakdown, and a "How scoring works" explainer.
 */
import { ref, watch, computed } from 'vue'
import { useWorktrees, useWt, useRepos, useToast } from '../composables'
import { useWorktreeStore } from '../stores'
import type { HealthResult, HealthGrade, HealthIssue, Worktree } from '../types'
import {
  parseHealthIssueMessage,
  severityExplanation,
  SCORING_RULES,
  GRADE_BANDS,
  SEVERITY_BRACKETS,
  type HealthFinding,
  type HealthFindingAction,
} from '../utils/healthIssues'
import { SPanel, SButton, SSkeleton, SSectionHeader } from '@stuntrocket/ui'
import GradeBadge from './GradeBadge.vue'
import DeleteWorktreeDialog from './DeleteWorktreeDialog.vue'

const props = defineProps<{
  isOpen: boolean
  repoName: string
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useWorktreeStore()
const { getRepoHealth, fetchWorktrees, openInEditor } = useWorktrees()
const { selectRepository } = useRepos()
const wtApi = useWt()
const { toast } = useToast()

const health = ref<HealthResult | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
// Branch → worktree map so findings can offer path-dependent actions
const worktreesByBranch = ref<Map<string, Worktree>>(new Map())

async function fetchHealth() {
  loading.value = true
  error.value = null

  try {
    const result = await getRepoHealth(props.repoName)
    if (result) {
      health.value = result
    } else {
      // M16: Display more helpful error message
      error.value = 'Unable to fetch health report. The repository may not have any worktrees.'
    }
  } catch (e) {
    // M16: Display actual error message from backend
    error.value = e instanceof Error ? e.message : 'An unexpected error occurred while fetching health report'
  }

  loading.value = false
}

/** Refetch after an action without the skeleton flash */
async function refreshHealthSilently() {
  try {
    const result = await getRepoHealth(props.repoName)
    if (result) health.value = result
  } catch {
    // Keep showing the previous report — the action toast already reported status
  }
}

async function fetchWorktreeMap() {
  try {
    const worktrees = await wtApi.listWorktrees(props.repoName)
    worktreesByBranch.value = new Map(worktrees.map((wt) => [wt.branch, wt]))
  } catch {
    worktreesByBranch.value = new Map()
  }
}

// Fetch health (and the worktree map for actions) when the panel opens
watch(() => props.isOpen, async (open) => {
  if (open && props.repoName) {
    await Promise.all([fetchHealth(), fetchWorktreeMap()])
  }
})

// Grade styling using design tokens
const gradeStyles: Record<HealthGrade, { text: string; bg: string; ring: string }> = {
  A: { text: 'text-success', bg: 'bg-success-muted', ring: 'ring-success/20' },
  B: { text: 'text-accent', bg: 'bg-accent-muted', ring: 'ring-accent/20' },
  C: { text: 'text-warning', bg: 'bg-warning-muted', ring: 'ring-warning/20' },
  D: { text: 'text-danger', bg: 'bg-danger-muted', ring: 'ring-danger/20' },
  F: { text: 'text-danger', bg: 'bg-danger-muted', ring: 'ring-danger/20' },
}

const overallGradeStyle = computed(() => {
  const grade = health.value?.overall_grade as HealthGrade | undefined
  return grade ? gradeStyles[grade] : { text: 'text-text-muted', bg: 'bg-surface-overlay', ring: 'ring-border-subtle' }
})

// Worktree counts per score bracket, straight from the CLI summary —
// the tiles describe worktrees (healthy ≥80, warning 60–79, critical <60),
// not issue rows, and stay correct regardless of how issues are split.
const issueCounts = computed(() => health.value?.summary ?? { healthy: 0, warning: 0, critical: 0 })

// ── Issues grouped by worktree ───────────────────────────────────────

interface WorktreeIssueGroup {
  branch: string
  severity: HealthIssue['severity']
  grade?: HealthGrade
  score?: number
  findings: HealthFinding[]
}

const issueGroups = computed<WorktreeIssueGroup[]>(() => {
  const result = health.value
  if (!result) return []
  const groups = new Map<string, WorktreeIssueGroup>()
  for (const issue of result.issues) {
    let group = groups.get(issue.worktree)
    if (!group) {
      const wtHealth = result.worktrees.find((wt) => wt.branch === issue.worktree)
      group = {
        branch: issue.worktree,
        severity: issue.severity,
        grade: wtHealth?.grade,
        score: wtHealth?.score,
        findings: [],
      }
      groups.set(issue.worktree, group)
    }
    // Critical outranks warning if entries disagree
    if (issue.severity === 'critical') group.severity = 'critical'
    group.findings.push(...parseHealthIssueMessage(issue.message))
  }
  return [...groups.values()]
})

const totalFindings = computed(() =>
  issueGroups.value.reduce((sum, group) => sum + group.findings.length, 0)
)

/** Parsed finding count for a worktree row (fixes the joined-token count) */
function worktreeFindingCount(issues: string[]): number {
  return issues.reduce((sum, issue) => sum + parseHealthIssueMessage(issue).length, 0)
}

/** Joined finding titles for a worktree row sub-line */
function worktreeFindingTitles(issues: string[]): string {
  return issues
    .flatMap((issue) => parseHealthIssueMessage(issue).map((finding) => finding.title))
    .join(' · ')
}

// ── Actions ──────────────────────────────────────────────────────────

const busyKeys = ref<string[]>([])

function isBusy(key: string): boolean {
  return busyKeys.value.includes(key)
}

function setBusy(key: string, busy: boolean) {
  if (busy) {
    if (!busyKeys.value.includes(key)) busyKeys.value.push(key)
  } else {
    busyKeys.value = busyKeys.value.filter((k) => k !== key)
  }
}

const showDeleteDialog = ref(false)
const worktreeToDelete = ref<Worktree | null>(null)

function worktreeFor(branch: string): Worktree | undefined {
  return worktreesByBranch.value.get(branch)
}

/** Hide path-dependent actions when the branch can't be resolved to a worktree */
function visibleActions(branch: string, actions: HealthFindingAction[]): HealthFindingAction[] {
  if (worktreeFor(branch)) return actions
  return actions.filter((action) => action.id !== 'open-editor' && action.id !== 'remove')
}

async function runAction(action: HealthFindingAction, branch: string) {
  switch (action.id) {
    case 'pull':
      await handlePull(branch)
      break
    case 'sync':
      await handleSync(branch)
      break
    case 'open-editor': {
      const wt = worktreeFor(branch)
      if (!wt) return
      const success = await openInEditor(wt.path)
      if (!success) toast.error('Failed to open in editor')
      break
    }
    case 'view-worktree':
      await handleViewWorktree(branch)
      break
    case 'remove': {
      const wt = worktreeFor(branch)
      if (!wt) return
      worktreeToDelete.value = wt
      showDeleteDialog.value = true
      break
    }
  }
}

async function handlePull(branch: string) {
  const key = `pull:${branch}`
  if (isBusy(key)) return
  setBusy(key, true)
  try {
    const result = await wtApi.pullWorktree(props.repoName, branch)
    if (result.conflicts) {
      toast.error(`${branch}: pull hit merge conflicts — resolve them in the editor`)
    } else if (!result.success) {
      toast.error(`${branch}: ${result.message || 'Pull failed'}`)
    } else if (result.already_up_to_date) {
      toast.info(`${branch} is already up to date`)
    } else {
      toast.success(`Pulled ${branch}`)
    }
    await Promise.all([refreshHealthSilently(), fetchWorktreeMap()])
  } catch (e) {
    toast.error(`${branch}: ${wtApi.toWtError(e).message}`)
  } finally {
    setBusy(key, false)
  }
}

async function handleSync(branch: string) {
  const key = `sync:${branch}`
  if (isBusy(key)) return
  setBusy(key, true)
  try {
    const result = await wtApi.syncWorktree(props.repoName, branch)
    if (result.conflicts) {
      toast.error(`${branch}: sync hit conflicts — resolve them in the editor`)
    } else if (!result.success) {
      toast.error(`${branch}: ${result.message || 'Sync failed'}`)
    } else {
      toast.success(`Synced ${branch} onto ${result.base}`)
    }
    await Promise.all([refreshHealthSilently(), fetchWorktreeMap()])
  } catch (e) {
    toast.error(`${branch}: ${wtApi.toWtError(e).message}`)
  } finally {
    setBusy(key, false)
  }
}

/** Navigate to the worktree in the main list view (same pattern as the overview) */
async function handleViewWorktree(branch: string) {
  const wasCached = store.isRepoLoaded(props.repoName)
  selectRepository(props.repoName)
  await fetchWorktrees({ silent: wasCached })
  store.focusWorktree(branch, true, true)
  emit('close')
}

async function handleDeleteClosed() {
  showDeleteDialog.value = false
  worktreeToDelete.value = null
  await Promise.all([refreshHealthSilently(), fetchWorktreeMap()])
}

function handleClose() {
  emit('close')
}

function getSeverityStyle(severity: string) {
  return severity === 'critical'
    ? { text: 'text-danger', bg: 'bg-danger-muted' }
    : { text: 'text-warning', bg: 'bg-warning-muted' }
}
</script>

<template>
  <SPanel
    :open="isOpen"
    title="Health Report"
    :subtitle="repoName"
    @close="handleClose"
  >
    <template #icon>
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    </template>

    <!-- Loading with skeleton content -->
    <div v-if="loading" class="space-y-6">
      <!-- Overall Grade Card skeleton -->
      <div class="p-5 rounded-xl bg-surface-overlay ring-1 ring-inset ring-border-subtle">
        <div class="flex items-center justify-between">
          <div class="space-y-2">
            <SSkeleton width="6rem" height="0.75rem" />
            <SSkeleton width="4rem" height="3rem" />
          </div>
          <div class="text-right space-y-2">
            <SSkeleton width="3rem" height="0.75rem" />
            <SSkeleton width="5rem" height="2rem" />
          </div>
        </div>
      </div>

      <!-- Summary Stats skeleton -->
      <div class="grid grid-cols-3 gap-3">
        <div v-for="i in 3" :key="i" class="rounded-lg p-4 bg-surface-overlay ring-1 ring-inset ring-border-subtle">
          <div class="flex flex-col items-center gap-2">
            <SSkeleton width="2rem" height="1.5rem" />
            <SSkeleton width="3rem" height="0.75rem" />
          </div>
        </div>
      </div>

      <!-- Issues List skeleton -->
      <div class="space-y-3">
        <SSkeleton width="5rem" height="0.75rem" />
        <div class="space-y-2">
          <div
            v-for="i in 2"
            :key="i"
            class="flex items-start gap-3 p-3 bg-surface-overlay rounded-lg border border-white/[0.04]"
          >
            <SSkeleton width="1.25rem" height="1.25rem" class="flex-shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0 space-y-1.5">
              <SSkeleton width="6rem" height="1rem" />
              <SSkeleton width="100%" height="0.75rem" />
            </div>
            <SSkeleton width="3.5rem" height="1.25rem" class="flex-shrink-0" />
          </div>
        </div>
      </div>

      <!-- Per-Worktree Health skeleton -->
      <div class="space-y-3">
        <SSkeleton width="7rem" height="0.75rem" />
        <div class="space-y-2">
          <div
            v-for="i in 3"
            :key="i"
            class="flex items-center justify-between p-3 bg-surface-overlay rounded-lg border border-white/[0.04]"
          >
            <div class="flex items-center gap-3 min-w-0">
              <SSkeleton width="2rem" height="1.25rem" />
              <SSkeleton width="8rem" height="1rem" />
            </div>
            <SSkeleton width="4rem" height="0.75rem" />
          </div>
        </div>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="p-4 bg-danger-muted rounded-lg border border-danger/20">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-danger flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="text-danger text-sm">{{ error }}</p>
      </div>
    </div>

    <!-- Health Report -->
    <div v-else-if="health" class="space-y-6">
      <!-- Overall Grade Card -->
      <div
        :class="[overallGradeStyle.bg, overallGradeStyle.ring]"
        class="p-5 rounded-xl ring-1 ring-inset"
      >
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Overall Health</p>
            <p :class="overallGradeStyle.text" class="text-5xl font-bold tracking-tight">
              {{ health.overall_grade }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Score</p>
            <p :class="overallGradeStyle.text" class="text-3xl font-semibold tabular-nums">
              {{ health.overall_score }}<span class="text-lg text-text-muted">/100</span>
            </p>
          </div>
        </div>
      </div>

      <!-- Summary Stats (worktree counts per score bracket) -->
      <div class="grid grid-cols-3 gap-3">
        <div class="bg-success-muted/50 rounded-lg p-4 text-center ring-1 ring-inset ring-success/10 cursor-help"
          title="Worktrees scoring 80 or above">
          <p class="text-2xl font-bold text-success tabular-nums">{{ issueCounts.healthy }}</p>
          <p class="text-2xs text-text-muted uppercase tracking-wider mt-1">Healthy</p>
        </div>
        <div class="bg-warning-muted/50 rounded-lg p-4 text-center ring-1 ring-inset ring-warning/10 cursor-help"
          title="Worktrees scoring 60–79">
          <p class="text-2xl font-bold text-warning tabular-nums">{{ issueCounts.warning }}</p>
          <p class="text-2xs text-text-muted uppercase tracking-wider mt-1">Warning</p>
        </div>
        <div class="bg-danger-muted/50 rounded-lg p-4 text-center ring-1 ring-inset ring-danger/10 cursor-help"
          title="Worktrees scoring below 60">
          <p class="text-2xl font-bold text-danger tabular-nums">{{ issueCounts.critical }}</p>
          <p class="text-2xs text-text-muted uppercase tracking-wider mt-1">Critical</p>
        </div>
      </div>

      <!-- Issues grouped by worktree -->
      <section v-if="issueGroups.length > 0" class="space-y-3">
        <SSectionHeader title="Issues" :count="totalFindings" />
        <div class="space-y-3">
          <div
            v-for="group in issueGroups"
            :key="group.branch"
            class="p-3 bg-surface-overlay rounded-lg border border-white/[0.04] space-y-2.5"
          >
            <!-- Group header -->
            <div class="flex items-center gap-3">
              <GradeBadge v-if="group.grade" :grade="group.grade" :score="group.score" />
              <span class="text-sm text-text-primary font-mono truncate flex-1 min-w-0">{{ group.branch }}</span>
              <span
                :class="[getSeverityStyle(group.severity).bg, getSeverityStyle(group.severity).text]"
                class="px-2 py-0.5 text-2xs font-medium rounded-md capitalize flex-shrink-0 cursor-help"
                :title="severityExplanation(group.severity)"
              >
                {{ group.severity }}
              </span>
            </div>

            <!-- Findings -->
            <div
              v-for="finding in group.findings"
              :key="finding.raw"
              class="space-y-1.5"
            >
              <div class="flex items-start gap-2.5">
                <svg
                  :class="getSeverityStyle(group.severity).text"
                  class="w-4 h-4 flex-shrink-0 mt-0.5"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-text-primary">{{ finding.title }}</p>
                  <p class="text-xs text-text-secondary mt-0.5 leading-relaxed">{{ finding.explanation }}</p>
                </div>
                <span
                  v-if="finding.scoreImpact < 0"
                  class="flex-shrink-0 px-1.5 py-0.5 text-2xs font-medium tabular-nums rounded bg-white/[0.04] text-text-muted"
                  title="Points deducted from this worktree's health score"
                >
                  {{ finding.scoreImpact }} pts
                </span>
              </div>
              <!-- Finding actions -->
              <div class="flex flex-wrap items-center gap-1.5 ml-[26px]">
                <button
                  v-for="action in visibleActions(group.branch, finding.actions)"
                  :key="action.id"
                  class="health-action"
                  :class="{ 'health-action-destructive': action.destructive }"
                  :disabled="isBusy(`${action.id}:${group.branch}`)"
                  :title="action.destructive ? 'Destructive — asks for confirmation first' : undefined"
                  @click="runAction(action, group.branch)"
                >
                  {{ action.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Severity legend -->
        <p class="text-2xs text-text-muted">
          <span class="text-danger font-medium">Critical</span>: score below 60 ·
          <span class="text-warning font-medium">Warning</span>: score 60–79
        </p>
      </section>

      <!-- Per-Worktree Health -->
      <section class="space-y-3">
        <SSectionHeader title="Worktrees" :count="health.worktree_count" />
        <div class="space-y-2">
          <div
            v-for="wt in health.worktrees"
            :key="wt.branch"
            class="flex items-center justify-between gap-3 p-3 bg-surface-overlay rounded-lg border border-white/[0.04] group hover:border-white/[0.06] transition-colors"
          >
            <div class="flex items-center gap-3 min-w-0">
              <GradeBadge :grade="wt.grade" :score="wt.score" />
              <div class="min-w-0">
                <span class="block text-sm text-text-primary font-mono truncate">{{ wt.branch }}</span>
                <span v-if="worktreeFindingTitles(wt.issues)" class="block text-2xs text-text-muted truncate mt-0.5">
                  {{ worktreeFindingTitles(wt.issues) }}
                </span>
              </div>
            </div>
            <span v-if="worktreeFindingCount(wt.issues) > 0" class="text-2xs text-text-muted flex-shrink-0">
              {{ worktreeFindingCount(wt.issues) }} finding{{ worktreeFindingCount(wt.issues) === 1 ? '' : 's' }}
            </span>
          </div>
        </div>
      </section>

      <!-- How scoring works -->
      <details class="scoring-details">
        <summary class="scoring-summary">How scoring works</summary>
        <div class="mt-3 space-y-3 text-xs text-text-secondary">
          <p>Every worktree starts at 100 points; each check below deducts points.</p>
          <table class="w-full text-left">
            <tbody>
              <tr v-for="rule in SCORING_RULES" :key="rule.check" class="border-t border-white/[0.04]">
                <td class="py-1.5 pr-2">{{ rule.check }}</td>
                <td class="py-1.5 text-text-muted tabular-nums whitespace-nowrap">{{ rule.deduction }}</td>
              </tr>
            </tbody>
          </table>
          <p>
            Grades:
            <template v-for="(band, index) in GRADE_BANDS" :key="band.grade">{{ index > 0 ? ' · ' : '' }}{{ band.grade }} {{ band.range }}</template>
          </p>
          <p>
            <template v-for="(bracket, index) in SEVERITY_BRACKETS" :key="bracket.label">{{ index > 0 ? ' · ' : '' }}{{ bracket.label }}: {{ bracket.range }}</template>
          </p>
        </div>
      </details>
    </div>

    <template v-if="health && !loading" #footer>
      <SButton variant="primary" class="w-full" @click="handleClose">
        Done
      </SButton>
    </template>
  </SPanel>

  <!-- Destructive Remove… goes through the existing confirmed flow -->
  <DeleteWorktreeDialog
    :is-open="showDeleteDialog"
    :worktree="worktreeToDelete"
    :repo-name="repoName"
    @close="handleDeleteClosed"
  />
</template>

<style scoped>
.health-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  transition: background-color 120ms ease, color 120ms ease;
}

.health-action:hover:not(:disabled) {
  color: var(--color-text-primary);
  background: rgba(255, 255, 255, 0.07);
}

.health-action:disabled {
  cursor: wait;
  opacity: 0.55;
}

.health-action-destructive {
  color: var(--color-danger);
  border-color: color-mix(in srgb, var(--color-danger) 25%, transparent);
}

.health-action-destructive:hover:not(:disabled) {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
}

.scoring-details {
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  padding: 12px 14px;
}

.scoring-summary {
  cursor: pointer;
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  user-select: none;
}

.scoring-summary:hover {
  color: var(--color-text-primary);
}
</style>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/HealthPanel.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Full suite + type check**

Run: `npx vitest run && npm run build`
Expected: PASS, no regressions (the panel's external contract — props/emits — is unchanged, so Dashboard/Overview tests stay green)

- [ ] **Step 6: Commit**

```bash
git add src/components/HealthPanel.vue src/components/HealthPanel.test.ts
git commit -m "feat: explain health findings with score impact and fix actions"
```

---

### Task 4: grove-cli — fix the zsh issue-splitting bug (separate repository)

**Files (in `/Users/dannyharding/Development/Code/Project/grove-cli`):**
- Modify: `lib/commands/info.sh:993-998` and `:1059-1067`
- Modify: `CHANGELOG.md` (`[Unreleased]` section)

grove-cli's `main` is write-protected by a hook — work on a branch and merge.

- [ ] **Step 1: Create a branch**

```bash
git -C /Users/dannyharding/Development/Code/Project/grove-cli checkout -b fix/health-issue-splitting
```

- [ ] **Step 2: Fix the all-issues loop**

In `lib/commands/info.sh`, the current block (lines ~993–998):

```zsh
      severity="warning"
      (( score < 60 )) && severity="critical"
      local IFS=','
      for issue in $issues; do
        all_issues+=("$severity|$branch|$issue")
      done
```

becomes (zsh does not word-split unquoted parameters, so `$issues` iterated once
with the full comma-joined string — split explicitly instead):

```zsh
      severity="warning"
      (( score < 60 )) && severity="critical"
      # zsh does not word-split unquoted parameters; split explicitly on commas
      for issue in ${(s:,:)issues}; do
        all_issues+=("$severity|$branch|$issue")
      done
```

- [ ] **Step 3: Fix the per-worktree issues loop**

The current block (lines ~1059–1067):

```zsh
      # Convert issues to array
      local first_wt_issue=true
      if [[ -n "$wt_issues" ]]; then
        local IFS=','
        for issue in $wt_issues; do
          [[ "$first_wt_issue" == true ]] || json+=", "
          json_escape "$issue"; json+="\"$REPLY\""
          first_wt_issue=false
        done
      fi
```

becomes:

```zsh
      # Convert issues to array
      local first_wt_issue=true
      if [[ -n "$wt_issues" ]]; then
        # zsh does not word-split unquoted parameters; split explicitly on commas
        for issue in ${(s:,:)wt_issues}; do
          [[ "$first_wt_issue" == true ]] || json+=", "
          json_escape "$issue"; json+="\"$REPLY\""
          first_wt_issue=false
        done
      fi
```

- [ ] **Step 4: Verify the fix manually**

```bash
cd /Users/dannyharding/Development/Code/Project/grove-cli && ./build.sh
./grove health <a-repo-with-issues> --json | python3 -m json.tool | head -40
```

Expected: each issue object carries a single token (e.g. `"message": "changes:37"`),
one object per token. (Pick any registered repo from `./grove repos`; if none has
issues, this check can be skipped — the unit suite in Step 5 still gates.)

- [ ] **Step 5: Run the CLI test suite**

```bash
cd /Users/dannyharding/Development/Code/Project/grove-cli && ./run-tests.sh
```

Expected: all tests pass. If a pre-existing failure unrelated to `info.sh` appears,
note it in the report; if any health/JSON test asserts the joined shape, update that
test to expect split issues (that was the bug).

- [ ] **Step 6: Update the grove-cli changelog**

In `CHANGELOG.md` under `## [Unreleased]`, add a `### Fixed` section if missing, with:

```markdown
### Fixed
- **Health issues split correctly in JSON output** - `grove health --json` now emits one issue object per finding; previously zsh's no-word-split default joined all of a worktree's findings into a single comma-separated message (and the per-worktree `issues` array had the same flaw)
```

(If a `### Fixed` heading already exists under `[Unreleased]`, append the bullet to it.)

- [ ] **Step 7: Commit and merge**

```bash
cd /Users/dannyharding/Development/Code/Project/grove-cli
git add lib/commands/info.sh CHANGELOG.md
git commit -m "fix: split health issues correctly in JSON output"
git checkout main
git merge fix/health-issue-splitting --no-edit
git branch -d fix/health-issue-splitting
```

- [ ] **Step 8: Refresh the Grove sidecar and confirm Grove still passes**

```bash
cd /Users/dannyharding/Development/Code/Project/grove && npm run prepare-sidecar
npx vitest run
```

Expected: sidecar copied; all Grove tests pass (the parser handles single-token
messages identically — covered by the "post-CLI-fix shape" test from Task 1).

---

### Task 5: Full verification

- [ ] **Step 1: Grove suite + type check**

Run: `npx vitest run && npm run build` (from the grove repo)
Expected: all tests pass (284 pre-existing + ~24 new across the three new test files), build clean

- [ ] **Step 2: Rust untouched**

Run: `git status --porcelain src-tauri/`
Expected: empty (no Rust changes in this feature)

- [ ] **Step 3: Manual smoke test**

Run: `npm run tauri dev`

Verify:
1. Open Health on a repo with issues: findings show plain-English titles with explanations and "−N pts" chips — no raw `changes:37` tokens anywhere.
2. Severity chips and summary tiles explain themselves on hover; the severity legend renders under the issues; "How scoring works" expands to the deduction table.
3. Pull / Sync / Open in Editor work from a finding; Remove… opens the delete confirmation (nothing deletes without it); the report refreshes after actions.
4. The Overview's health attention items show translated titles.
5. Issue counts now match reality (one finding per token after the CLI fix).
