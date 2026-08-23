import { describe, expect, it } from 'vitest'
import { normalizeBasePath, routerBasename } from './basePath'

describe('normalizeBasePath', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['netrin', '/netrin/'],
    ['/netrin', '/netrin/'],
    ['/netrin/', '/netrin/'],
    [' /nested/site/ ', '/nested/site/']
  ])('normalizes %s', (input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected)
  })

  it.each(['https://example.com/netrin', '../netrin', '/netrin?debug=1', '\\netrin']) (
    'rejects non-path input %s',
    (input) => {
      expect(() => normalizeBasePath(input)).toThrow()
    }
  )

  it('produces the React Router basename', () => {
    expect(routerBasename('/')).toBeUndefined()
    expect(routerBasename('/netrin/')).toBe('/netrin')
  })
})
