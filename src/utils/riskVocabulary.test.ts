import { describe, it, expect } from 'vitest'
import {
  LEDGER_UNKNOWN_LABEL,
  RAW_LEVEL_NAMES,
  RISK_UNKNOWN_LABEL,
  riskWords,
} from './riskVocabulary'

describe('riskVocabulary', () => {
  it('gives each level the word Waypoint already ships', () => {
    expect(riskWords('critical').label).toBe('At risk')
    expect(riskWords('warning').label).toBe('Needs a look')
    expect(riskWords('informational').label).toBe('Worth knowing')
  })

  it('says "Clear" when the check answered and found nothing', () => {
    // Only valid once `risk_available === true`. Callers own that check; this
    // function is told the answer, not asked to guess it.
    expect(riskWords(null).label).toBe('Clear')
    expect(riskWords(undefined).label).toBe('Clear')
  })

  it('carries severity in the variant as well as the word', () => {
    // Colour alone is not a message, and a word alone is not a severity. Both
    // travel together so a badge cannot show one without the other.
    expect(riskWords('critical').variant).toBe('error')
    expect(riskWords('warning').variant).toBe('warning')
    expect(riskWords('informational').variant).toBe('default')
    expect(riskWords(null).variant).toBe('default')
  })

  it('puts no raw level name in any word a human reads', () => {
    for (const level of [...RAW_LEVEL_NAMES, null]) {
      const words = riskWords(level)
      for (const raw of RAW_LEVEL_NAMES) {
        expect(words.label.toLowerCase()).not.toContain(raw)
        expect(words.description.toLowerCase()).not.toContain(raw)
      }
    }
  })

  it('keeps the two unknowns distinct from each other and from clear', () => {
    // "The ledger could not answer" and "the risk check could not answer" are
    // different facts, and neither is "nothing found".
    expect(RISK_UNKNOWN_LABEL).not.toBe(LEDGER_UNKNOWN_LABEL)
    expect(RISK_UNKNOWN_LABEL).not.toBe(riskWords(null).label)
    expect(LEDGER_UNKNOWN_LABEL).not.toBe(riskWords(null).label)
  })
})
