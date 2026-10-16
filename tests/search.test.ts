import { describe, expect, it } from 'vitest'
import { categories } from '../app/config/categories'
import type { Category } from '../app/config/categories'
import { tools } from '../app/config/tools'
import type { Tool } from '../app/config/tools'
import { groupTools, matchTool, normalize } from '../app/utils/search'

// 构造测试用工具数据
function makeTool(partial: Partial<Tool> & Pick<Tool, 'id'>): Tool {
  return {
    name: partial.id,
    desc: '',
    icon: 'lucide:box',
    color: '',
    category: 'developer',
    keywords: [],
    path: `/${partial.id}`,
    ...partial,
  }
}

const groupList: Category[] = [
  { id: 'developer', name: '开发者工具' },
  { id: 'text', name: '文本工具' },
  { id: 'image', name: '图片工具' },
]

const list: Tool[] = [
  makeTool({ id: 'json-formatter', name: 'JSON 格式化', desc: '美化并校验 JSON', category: 'developer', keywords: ['beautify'] }),
  makeTool({ id: 'timestamp', name: '时间戳转换', desc: '时间戳与日期互转', category: 'developer', keywords: ['unix', 'shijianchuo'] }),
  makeTool({ id: 'text-diff', name: '文本对比', desc: '找出两段文本的差异', category: 'text', keywords: ['diff'] }),
  makeTool({ id: 'qrcode-generator', name: '二维码生成', desc: '文字或网址转二维码', category: 'image', keywords: ['qr'] }),
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
    expect(matchTool(list[3]!, 'QR')).toBe(true)
  })

  it('按描述匹配', () => {
    expect(matchTool(list[0]!, '校验')).toBe(true)
    expect(matchTool(list[1]!, '日期')).toBe(true)
  })

  it('按关键词匹配', () => {
    expect(matchTool(list[0]!, 'beautify')).toBe(true)
    expect(matchTool(list[1]!, 'shijianchuo')).toBe(true)
  })

  it('按额外文本（分组名）匹配', () => {
    expect(matchTool(list[3]!, '图片', '图片工具')).toBe(true)
    expect(matchTool(list[3]!, '图片')).toBe(false)
  })

  it('多个词需全部命中', () => {
    expect(matchTool(list[1]!, 'unix 日期')).toBe(true)
    expect(matchTool(list[1]!, 'unix json')).toBe(false)
  })
})

describe('groupTools', () => {
  it('无搜索词时按分组顺序返回全部工具', () => {
    const groups = groupTools(list, groupList)
    expect(groups.map(g => g.category.id)).toEqual(['developer', 'text', 'image'])
    expect(groups[0]!.tools.map(t => t.id)).toEqual(['json-formatter', 'timestamp'])
  })

  it('搜索时只返回有匹配工具的分组', () => {
    const groups = groupTools(list, groupList, '对比')
    expect(groups).toHaveLength(1)
    expect(groups[0]!.category.id).toBe('text')
    expect(groups[0]!.tools.map(t => t.id)).toEqual(['text-diff'])
  })

  it('搜索分组名返回该分组下全部工具', () => {
    const groups = groupTools(list, groupList, '开发者')
    expect(groups.map(g => g.category.id)).toEqual(['developer'])
    expect(groups[0]!.tools).toHaveLength(2)
  })

  it('没有匹配时返回空数组', () => {
    expect(groupTools(list, groupList, '不存在的工具')).toEqual([])
  })
})

describe('工具注册表', () => {
  it('第一版只有 6 个工具', () => {
    expect(tools).toHaveLength(6)
  })

  it('id 唯一且 path 与 id 对应', () => {
    const ids = tools.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of tools) expect(t.path).toBe(`/${t.id}`)
  })

  it('每个工具都属于已定义的分组', () => {
    const ids = categories.map(c => c.id)
    for (const t of tools) expect(ids).toContain(t.category)
  })

  it('真实数据可被搜索到', () => {
    const found = (q: string) => groupTools(tools, categories, q).flatMap(g => g.tools.map(t => t.id))
    expect(found('二维码')).toContain('qrcode-generator')
    expect(found('去空行')).toContain('word-counter')
    expect(found('unix')).toContain('timestamp')
  })
})
