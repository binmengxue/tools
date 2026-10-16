import { describe, expect, it } from 'vitest'
import { pushRecent } from '../app/utils/storage'

describe('pushRecent', () => {
  it('新记录放在最前面', () => {
    expect(pushRecent(['a', 'b'], 'c', 5)).toEqual(['c', 'a', 'b'])
  })

  it('已存在的记录移到最前面且不重复', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b', 5)).toEqual(['b', 'a', 'c'])
  })

  it('超出上限时截断', () => {
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
  })
})
