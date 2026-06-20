import { escapeHtml } from '../services/escape'

describe('escapeHtml', () => {
  it('neutralizes HTML/SVG-breaking characters', () => {
    expect(escapeHtml('</text><script>alert(1)</script>'))
      .toBe('&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;')
  })

  it('coerces null/undefined to empty string', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})
