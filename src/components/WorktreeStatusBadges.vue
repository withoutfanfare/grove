<script setup lang="ts">
/**
 * WorktreeStatusBadges Component
 *
 * Displays status badges for worktree conditions:
 * - MERGED: Branch has been merged into the base branch (green tag)
 * - UNMERGED: Branch has not been merged into the base branch (orange warning)
 * - STALE: Worktree is >50 commits behind (orange clock icon)
 * - MISMATCH: Directory name doesn't match branch slug (yellow warning)
 * - LEDGER UNKNOWN / RISK UNKNOWN: the ledger, or its risk check, could not
 *   answer. Shown explicitly because the absence of a risk badge is read as
 *   "nothing at risk", so an unknown must never be silent.
 * - AGENT WORKING HERE: an agent session holds a live lease on this worktree.
 *
 * Each badge has a tooltip explaining its meaning.
 *
 * Every risk word here comes from `riskVocabulary`, never from the raw level
 * name — see that module for why.
 */
import { computed } from 'vue'
import { SBadge } from '@stuntrocket/ui'
import type { LedgerOverlay } from '../types/wt'
import { LEDGER_UNKNOWN_LABEL, RISK_UNKNOWN_LABEL, riskWords } from '../utils/riskVocabulary'

const props = defineProps<{
  /** Whether the branch has been merged into the base branch */
  merged?: boolean
  /** Whether the worktree is stale (>50 commits behind) */
  stale?: boolean
  /** Whether there's a mismatch between directory name and branch slug */
  mismatch?: boolean
  /** Worktree Ledger overlay; absent = integration off, render nothing */
  ledger?: LedgerOverlay
}>()

const showMerged = computed(() => props.merged === true)
const showUnmerged = computed(() => props.merged === false)
const showStale = computed(() => props.stale === true)
const showMismatch = computed(() => props.mismatch === true)
const ledgerUnknown = computed(() => props.ledger?.available === false)
// `risk` comes from `way worktree removal-check`, which the overlay now runs
// alongside `resume`. Only trusted when the check actually answered.
const ledgerRisk = computed(() =>
  props.ledger?.available && props.ledger.risk_available ? props.ledger.risk ?? null : null
)
// The gate ran for the worktree but could not establish its risk. This needs a
// badge of its own precisely BECAUSE the risk badge's absence is a positive
// claim — "no risk badge" reads as "nothing at risk", so silence here would
// render unknown as safe.
const riskUnknown = computed(
  () => props.ledger?.available === true && props.ledger.risk_available !== true
)
// The ledger answered, ran the risk check, and found nothing. Stated as "Clear"
// rather than left blank for the same reason as the badge above: an empty row
// is read as a verdict, so the verdict has to be the one the ledger gave.
const showClear = computed(
  () =>
    props.ledger?.available === true &&
    props.ledger.risk_available === true &&
    !ledgerRisk.value
)
const riskUnknownTitle = computed(() => {
  const base =
    'The ledger answered for this worktree but could not establish its risk — unknown, not clear.'
  const reason = props.ledger?.risk_unavailable_reason
  return reason ? `${base} ${reason}` : base
})
// A live lease means an agent session is working in this worktree right now.
// Only shown when the lease was actually read AND is live: an expired claim is
// history, and an unreadable one is unknown. Neither belongs on the row —
// unlike risk, the absence of this badge claims nothing.
const activeLease = computed(() =>
  props.ledger?.available === true &&
  props.ledger.lease_available === true &&
  props.ledger.lease_held === true
    ? props.ledger.lease ?? null
    : null
)
const leaseBadgeText = computed(() =>
  activeLease.value ? `${activeLease.value.tool} working here` : ''
)
const leaseBadgeTitle = computed(() => {
  const lease = activeLease.value
  if (!lease) return ''
  return `${lease.tool} session ${lease.session_id} holds this worktree on ${lease.machine_id} until ${lease.expires_at}.`
})
const showDrift = computed(
  () => props.ledger?.available === true && !ledgerRisk.value && props.ledger.drift === true
)
const showNoCheckpoint = computed(
  () =>
    props.ledger?.available === true &&
    !ledgerRisk.value &&
    props.ledger.drift !== true &&
    props.ledger.checkpoint_at == null
)
const ledgerUnknownTitle = computed(() => {
  const base = 'The worktree ledger could not answer for this worktree — its safety is unknown, not clear.'
  const reason = props.ledger?.unavailable_reason
  return reason ? `${base} ${reason}` : base
})
// One lookup drives the word, the colour and the tooltip, so no caller can pick
// a word the vocabulary does not own.
const riskBadge = computed(() => riskWords(ledgerRisk.value))
const clearBadge = riskWords(null)
const hasAnyBadge = computed(
  () =>
    showMerged.value ||
    showUnmerged.value ||
    showStale.value ||
    showMismatch.value ||
    ledgerUnknown.value ||
    !!ledgerRisk.value ||
    showClear.value ||
    riskUnknown.value ||
    !!activeLease.value ||
    showDrift.value ||
    showNoCheckpoint.value
)
</script>

<template>
  <div
    v-if="hasAnyBadge"
    class="flex items-center gap-1"
    role="group"
    aria-label="Worktree status badges"
  >
    <!-- MERGED badge -->
    <SBadge
      v-if="showMerged"
      variant="success"
      class="!border-transparent gap-1 compact-badge"
      title="This branch has been merged into the base branch and can be safely removed"
      role="status"
      aria-label="Branch merged into base"
    >
      <!-- Merge icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8 7a4 4 0 108 0 4 4 0 00-8 0zM12 14v7m-4-4l4 4 4-4"
        />
      </svg>
      Merged
    </SBadge>

    <!-- UNMERGED badge -->
    <SBadge
      v-if="showUnmerged"
      variant="warning"
      class="!border-transparent gap-1 compact-badge"
      title="This branch has not been merged into the base branch"
      role="status"
      aria-label="Branch not merged"
    >
      <!-- Branch icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
      Unmerged
    </SBadge>

    <!-- STALE badge -->
    <SBadge
      v-if="showStale"
      variant="warning"
      class="!border-transparent gap-1 compact-badge"
      title="This worktree is significantly behind the base branch (>50 commits). Consider syncing or removing it."
      role="status"
      aria-label="Worktree is stale"
    >
      <!-- Clock icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      Stale
    </SBadge>

    <!-- MISMATCH badge -->
    <SBadge
      v-if="showMismatch"
      variant="error"
      class="!border-transparent gap-1 compact-badge"
      title="The directory name does not match the branch name. This may cause confusion when navigating between worktrees."
      role="status"
      aria-label="Directory name mismatch"
    >
      <!-- Warning triangle icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      Mismatch
    </SBadge>

    <!-- LEDGER UNKNOWN badge -->
    <SBadge
      v-if="ledgerUnknown"
      variant="default"
      class="!border-transparent gap-1 compact-badge"
      :title="ledgerUnknownTitle"
      role="status"
      aria-label="Ledger status unknown"
    >
      <!-- Warning triangle icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      {{ LEDGER_UNKNOWN_LABEL }}
    </SBadge>

    <!-- LEDGER RISK badge -->
    <SBadge
      v-if="ledgerRisk"
      :variant="riskBadge.variant"
      class="!border-transparent gap-1 compact-badge"
      :title="riskBadge.description"
      role="status"
      :aria-label="`Ledger risk: ${riskBadge.label}`"
    >
      <!-- Warning triangle icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      {{ riskBadge.label }}
    </SBadge>

    <!-- LEDGER RISK CLEAR badge -->
    <SBadge
      v-if="showClear"
      :variant="clearBadge.variant"
      class="!border-transparent gap-1 compact-badge"
      :title="clearBadge.description"
      role="status"
      :aria-label="`Ledger risk: ${clearBadge.label}`"
    >
      <!-- Tick icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M5 13l4 4L19 7"
        />
      </svg>
      {{ clearBadge.label }}
    </SBadge>

    <!-- LEDGER RISK UNKNOWN badge -->
    <SBadge
      v-if="riskUnknown"
      variant="default"
      class="!border-transparent gap-1 compact-badge"
      :title="riskUnknownTitle"
      role="status"
      aria-label="Ledger risk unknown"
    >
      <!-- Question mark icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      {{ RISK_UNKNOWN_LABEL }}
    </SBadge>

    <!-- LEDGER ACTIVE LEASE badge -->
    <SBadge
      v-if="activeLease"
      variant="default"
      class="!border-transparent gap-1 compact-badge"
      :title="leaseBadgeTitle"
      role="status"
      :aria-label="`An agent is working here: ${activeLease.tool}`"
    >
      <!-- Person icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        />
      </svg>
      {{ leaseBadgeText }}
    </SBadge>

    <!-- LEDGER DRIFT badge -->
    <SBadge
      v-if="showDrift"
      variant="warning"
      class="!border-transparent gap-1 compact-badge"
      title="This worktree's state has changed since its last recorded checkpoint."
      role="status"
      aria-label="Drifted since last checkpoint"
    >
      <!-- Clock icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      Drifted
    </SBadge>

    <!-- LEDGER NO CHECKPOINT badge -->
    <SBadge
      v-if="showNoCheckpoint"
      variant="warning"
      class="!border-transparent gap-1 compact-badge"
      title="This worktree has never been checkpointed in the worktree ledger."
      role="status"
      aria-label="Never checkpointed"
    >
      <!-- Clock icon -->
      <svg
        class="w-3 h-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      No checkpoint
    </SBadge>
  </div>
</template>
