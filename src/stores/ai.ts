import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { i18n } from '../locales'

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
  timestamp: number
  error?: boolean
}

export interface AIConfig {
  enabled: boolean
  apiKey: string
  baseUrl: string
  model: string
  systemPrompt: string
  temperature: number
  maxTokens: number
}

const getDefaultSystemPrompt = (): string => i18n.global.t('rt.stAi.systemPrompt')

const createDefaultConfig = (): AIConfig => ({
  enabled: false,
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  systemPrompt: getDefaultSystemPrompt(),
  temperature: 0.7,
  maxTokens: 2048
})

export const useAIStore = defineStore('ai', () => {
  const messages = ref<AIMessage[]>([])
  const isLoading = ref(false)
  const isPanelOpen = ref(false)
  const panelPosition = ref({ x: 0, y: 0 })
  const config = ref<AIConfig>(createDefaultConfig())

  let abortController: AbortController | null = null

  const canSend = computed(() => {
    return config.value.enabled && 
           config.value.apiKey.trim() !== '' && 
           config.value.baseUrl.trim() !== '' && 
           config.value.model.trim() !== '' &&
           !isLoading.value
  })

  const canCancel = computed(() => isLoading.value)

  const loadConfig = () => {
    try {
      const saved = localStorage.getItem('zncl-ai-config')
      if (saved) {
        config.value = { ...createDefaultConfig(), ...JSON.parse(saved) }
      }
      const savedPos = localStorage.getItem('zncl-ai-panel-pos')
      if (savedPos) {
        panelPosition.value = JSON.parse(savedPos)
      }
    } catch (e) {
      console.error('加载 AI 配置失败:', e)
    }
  }

  const saveConfig = () => {
    try {
      localStorage.setItem('zncl-ai-config', JSON.stringify(config.value))
    } catch (e) {
      console.error('保存 AI 配置失败:', e)
    }
  }

  const savePanelPosition = (pos: { x: number; y: number }) => {
    panelPosition.value = pos
    try {
      localStorage.setItem('zncl-ai-panel-pos', JSON.stringify(pos))
    } catch (e) {
      console.error('保存面板位置失败:', e)
    }
  }

  const loadMessages = () => {
    try {
      const saved = localStorage.getItem('zncl-ai-messages')
      if (saved) {
        messages.value = JSON.parse(saved)
      }
    } catch (e) {
      console.error('加载 AI 对话历史失败:', e)
    }
  }

  const saveMessages = () => {
    try {
      localStorage.setItem('zncl-ai-messages', JSON.stringify(messages.value.slice(-100)))
    } catch (e) {
      console.error('保存 AI 对话历史失败:', e)
    }
  }

  const clearMessages = () => {
    messages.value = []
    saveMessages()
  }

  const addMessage = (role: AIMessage['role'], content: string, error = false, thinking = '') => {
    const msg: AIMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      role,
      content,
      thinking,
      timestamp: Date.now(),
      error
    }
    messages.value.push(msg)
    saveMessages()
    return msg
  }

  const stopGeneration = () => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  const sendMessage = async (content: string) => {
    if (!canSend.value) {
      if (!config.value.enabled) {
        addMessage('assistant', i18n.global.t('rt.stAi.enableFirst'), true)
      } else {
        addMessage('assistant', i18n.global.t('rt.stAi.incompleteConfig'), true)
      }
      return
    }

    const trimmedContent = content.trim()
    if (!trimmedContent) return

    addMessage('user', trimmedContent)
    isLoading.value = true

    const assistantMsg = addMessage('assistant', '')

    abortController = new AbortController()

    try {
      const apiMessages = [
        { role: 'system', content: config.value.systemPrompt },
        ...messages.value
          .filter(m => m.role !== 'system')
          .slice(-20)
          .map(m => ({ role: m.role, content: m.content }))
      ]

      const response = await fetch(`${config.value.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.value.apiKey}`
        },
        body: JSON.stringify({
          model: config.value.model,
          messages: apiMessages,
          temperature: config.value.temperature,
          max_tokens: config.value.maxTokens,
          stream: true
        }),
        signal: abortController.signal
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData?.error?.message || i18n.global.t('rt.stAi.requestFailed', { status: response.status }))
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error(i18n.global.t('rt.stAi.noResponseStream'))

      const decoder = new TextDecoder()
      let fullContent = ''
      let fullThinking = ''
      let inThinkingBlock = false
      let thinkingBuffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              const delta = parsed.choices?.[0]?.delta
              
              // 1. 优先处理 reasoning_content 字段（标准API格式）
              if (delta?.reasoning_content) {
                fullThinking += delta.reasoning_content
                assistantMsg.thinking = fullThinking
              }
              
              // 2. 处理 content 字段
              if (delta?.content) {
                let contentChunk = delta.content
                
                // 检测 <thinking> 标签（DeepSeek R1 等模型格式）
                while (contentChunk) {
                  if (inThinkingBlock) {
                    const endIdx = contentChunk.indexOf('</thinking>')
                    if (endIdx !== -1) {
                      thinkingBuffer += contentChunk.slice(0, endIdx)
                      fullThinking += thinkingBuffer
                      assistantMsg.thinking = fullThinking
                      thinkingBuffer = ''
                      inThinkingBlock = false
                      contentChunk = contentChunk.slice(endIdx + 11)
                    } else {
                      thinkingBuffer += contentChunk
                      contentChunk = ''
                    }
                  } else {
                    const startIdx = contentChunk.indexOf('<thinking>')
                    if (startIdx !== -1) {
                      fullContent += contentChunk.slice(0, startIdx)
                      inThinkingBlock = true
                      contentChunk = contentChunk.slice(startIdx + 10)
                    } else {
                      fullContent += contentChunk
                      contentChunk = ''
                    }
                  }
                }
                
                assistantMsg.content = fullContent
              }
              
              saveMessages()
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      if (!fullContent) {
        assistantMsg.content = i18n.global.t('rt.stAi.noContent')
        assistantMsg.error = true
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        if (!assistantMsg.content) {
          assistantMsg.content = i18n.global.t('rt.stAi.cancelled')
        }
      } else {
        console.error('AI 请求失败:', error)
        assistantMsg.content = i18n.global.t('rt.stAi.requestFailedDetail', {
          message: error?.message || i18n.global.t('rt.stAi.unknownError')
        })
        assistantMsg.error = true
      }
    } finally {
      isLoading.value = false
      abortController = null
      saveMessages()
    }
  }

  const togglePanel = () => {
    isPanelOpen.value = !isPanelOpen.value
  }

  const closePanel = () => {
    isPanelOpen.value = false
  }

  const openPanel = () => {
    isPanelOpen.value = true
  }

  const resetConfig = () => {
    config.value = createDefaultConfig()
    saveConfig()
  }

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
      e.preventDefault()
      togglePanel()
    }
    if (e.key === 'Escape' && isPanelOpen.value) {
      closePanel()
    }
  }

  loadConfig()
  loadMessages()

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown)
  }

  watch(config, () => {
    saveConfig()
  }, { deep: true })

  return {
    messages,
    isLoading,
    isPanelOpen,
    panelPosition,
    config,
    canSend,
    canCancel,
    sendMessage,
    stopGeneration,
    clearMessages,
    togglePanel,
    closePanel,
    openPanel,
    resetConfig,
    loadConfig,
    saveConfig,
    savePanelPosition
  }
})
