import type { Skill } from '@/types/agent'

const SKILL_NAME_ZH: Record<string, string> = {
  'demo-office-assistant': '办公演示助手',
  'find-skills': '技能发现',
  'find_skills': '技能发现',
  'openai-docs': 'OpenAI 文档检索',
  playwright: '浏览器自动化',
  screenshot: '屏幕截图',
  'security-best-practices': '安全最佳实践',
  spreadsheet: '表格处理',
  transcribe: '语音转写',
}

const SKILL_DESC_ZH: Record<string, string> = {
  'demo-office-assistant': '用于演示办公自动化：整理文件、总结文档、生成 PPT 大纲与邮件草稿。',
  'find-skills': '搜索并发现可安装的技能，支持社区技能检索。',
  'find_skills': '搜索并发现可安装的技能，支持社区技能检索。',
  'openai-docs': '检索 OpenAI 官方文档内容，辅助开发与排障。',
  playwright: '执行浏览器自动化操作，支持页面访问与交互。',
  screenshot: '进行截图相关处理与输出。',
  'security-best-practices': '提供安全相关建议与最佳实践指引。',
  spreadsheet: '进行表格读取、整理与数据处理。',
  transcribe: '将音频内容转写为文本。',
}

const CATEGORY_ZH: Record<string, string> = {
  community: '社区',
  document: '文档',
  productivity: '效率',
  communication: '沟通',
  automation: '自动化',
  enterprise: '企业',
  creative: '创意',
  'video-tools': '视频工具',
  uncategorized: '未分类',
}

const SKILL_ALIAS_STORAGE_KEY = 'cks.skill.aliases'

export const loadSkillAliasMap = (): Record<string, string> => {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(SKILL_ALIAS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(([k, v]) => typeof k === 'string' && typeof v === 'string')
    ) as Record<string, string>
  } catch {
    return {}
  }
}

export const saveSkillAlias = (skillName: string, alias: string) => {
  if (typeof window === 'undefined') return
  const map = loadSkillAliasMap()
  const value = (alias || '').trim()
  if (!value) {
    delete map[skillName]
  } else {
    map[skillName] = value
  }
  window.localStorage.setItem(SKILL_ALIAS_STORAGE_KEY, JSON.stringify(map))
}

export const localizeSkill = (skill: Skill, aliasMap?: Record<string, string>): Skill => {
  const key = (skill.name || '').toLowerCase()
  const categoryKey = (skill.category || '').toLowerCase()
  const customAlias = aliasMap?.[skill.name] || loadSkillAliasMap()[skill.name]
  const zhName = SKILL_NAME_ZH[key]
  const zhDesc = SKILL_DESC_ZH[key]
  const zhCategory = CATEGORY_ZH[categoryKey] || skill.category || '未分类'

  return {
    ...skill,
    display_name: customAlias || zhName || skill.display_name || skill.name,
    description: zhDesc || skill.description,
    category: zhCategory,
  }
}
