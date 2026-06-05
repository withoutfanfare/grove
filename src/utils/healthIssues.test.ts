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
