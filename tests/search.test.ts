import { describe, expect, it } from 'vitest'
import { tools } from '../app/config/tools'
import type { Tool } from '../app/config/tools'
import { filterTools, matchTool, normalize } from '../app/utils/search'

// 构造测试用工具数据
function makeTool(partial: Partial<Tool> & Pick<Tool, 'id'>): Tool {
  return {
    name: partial.id,
    desc: '',
    icon: 'lucide:box',
    categories: [],
    keywords: [],
    path: `/${partial.id}`,
    ...partial,
  }
}

const list: Tool[] = [
  makeTool({ id: 'json-formatter', name: 'JSON 格式化', desc: 'JSON 美化与校验', categories: ['common', 'json'], keywords: ['beautify'] }),
  makeTool({ id: 'base64', name: 'Base64 编解码', desc: '文本与 Base64 互转', categories: ['encode'], keywords: ['encode', 'decode'] }),
  makeTool({ id: 'timestamp', name: '时间戳转换', desc: 'Unix 时间戳与日期互转', categories: ['common', 'datetime'], keywords: ['unix', 'shijianchuo'] }),
]

describe('normalize', () => {
  it('去除首尾空白并转小写', () => {
    expect(normalize('  JSON  ')).toBe('json')
  })
})

describe('matchTool', () => {
  it('空搜索词匹配所有工具', () => {
    expect(matchTool(list[0]!, '')).toBe(true)
    expect(matchTool(list[0]!, '   ')).toBe(true)
  })

  it('按名称匹配且忽略大小写', () => {
    expect(matchTool(list[0]!, 'json')).toBe(true)
    expect(matchTool(list[1]!, 'BASE64')).toBe(true)
  })

  it('按描述匹配', () => {
    expect(matchTool(list[0]!, '校验')).toBe(true)
    expect(matchTool(list[2]!, '日期')).toBe(true)
  })

  it('按关键词匹配', () => {
    expect(matchTool(list[0]!, 'beautify')).toBe(true)
    expect(matchTool(list[2]!, 'shijianchuo')).toBe(true)
  })

  it('多个词需全部命中', () => {
    expect(matchTool(list[2]!, 'unix 日期')).toBe(true)
    expect(matchTool(list[2]!, 'unix json')).toBe(false)
  })

  it('不相关的词不匹配', () => {
    expect(matchTool(list[1]!, '二维码')).toBe(false)
  })
})

describe('filterTools', () => {
  it('默认返回全部工具', () => {
    expect(filterTools(list)).toHaveLength(3)
  })

  it('按分类筛选', () => {
    expect(filterTools(list, { tab: 'common' }).map(t => t.id)).toEqual(['json-formatter', 'timestamp'])
    expect(filterTools(list, { tab: 'encode' }).map(t => t.id)).toEqual(['base64'])
    expect(filterTools(list, { tab: 'image' })).toEqual([])
  })

  it('收藏 Tab 按收藏顺序返回，并忽略不存在的 id', () => {
    const result = filterTools(list, { tab: 'favorites', favorites: ['timestamp', 'not-exist', 'base64'] })
    expect(result.map(t => t.id)).toEqual(['timestamp', 'base64'])
  })

  it('收藏为空时返回空列表', () => {
    expect(filterTools(list, { tab: 'favorites' })).toEqual([])
  })

  it('搜索在当前 Tab 范围内生效', () => {
    expect(filterTools(list, { tab: 'all', query: '转' }).map(t => t.id)).toEqual(['base64', 'timestamp'])
    expect(filterTools(list, { tab: 'common', query: '转' }).map(t => t.id)).toEqual(['timestamp'])
    expect(filterTools(list, { tab: 'favorites', query: 'json', favorites: ['base64'] })).toEqual([])
  })
})

describe('工具注册表', () => {
  it('id 唯一且 path 与 id 对应', () => {
    const ids = tools.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of tools) expect(t.path).toBe(`/${t.id}`)
  })

  it('每个工具都至少属于一个非「常用」分类', () => {
    for (const t of tools) expect(t.categories.some(c => c !== 'common')).toBe(true)
  })

  it('真实数据可被搜索到', () => {
    expect(filterTools(tools, { query: 'md5' }).map(t => t.id)).toContain('hash-crypto')
    expect(filterTools(tools, { query: '二维码' }).map(t => t.id)).toContain('qrcode-generator')
  })
})
