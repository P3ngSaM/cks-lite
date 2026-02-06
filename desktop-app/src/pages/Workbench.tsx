import { useCallback, useEffect, useMemo } from 'react'
import { ChatHistorySidebar } from '@/components/layout/ChatHistorySidebar'
import { MessageList, ChatInput } from '@/components/chat'
import { PermissionApprovalDialog } from '@/components/chat/PermissionApprovalDialog'
import { AgentService } from '@/services/agentService'
import { classifyRisk, describeToolRequest, executeDesktopTool } from '@/services/desktopToolBridge'
import { useChatStore, useUserStore, usePermissionStore, waitForPermissionDecision, resolvePermissionDecision } from '@/stores'
import type { Message, SearchResult, ToolCallInfo } from '@/types/chat'

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

// Desktop tool names that require permission bridging
const DESKTOP_TOOL_NAMES = new Set(['run_command', 'read_file', 'list_directory', 'write_file', 'get_file_info'])

// Extract name from user message
const extractName = (message: string): string | null => {
  // Match patterns like "我叫XXX", "我的名字是XXX", "叫我XXX", "XXX" (after greeting)
  const patterns = [
    /(?:我叫|叫我|我的名字是|我是)\s*([^\s，。！？,.!?]+)/,
    /^([^\s，。！？,.!?]+)$/
  ]

  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }

  return null
}

export const Workbench = () => {
  const currentSessionId = useChatStore((state) => state.currentSessionId)
  const sessions = useChatStore((state) => state.sessions)
  const isStreaming = useChatStore((state) => state.isStreaming)
  const addMessage = useChatStore((state) => state.addMessage)
  const updateMessage = useChatStore((state) => state.updateMessage)
  const setStreaming = useChatStore((state) => state.setStreaming)
  const createSession = useChatStore((state) => state.createSession)

  const profile = useUserStore((state) => state.profile)
  const hasUserName = useUserStore((state) => state.hasUserName)
  const setUserName = useUserStore((state) => state.setUserName)

  const permissionRequests = usePermissionStore((state) => state.pendingRequests)
  const addPermissionRequest = usePermissionStore((state) => state.addRequest)
  const autoApproveAll = usePermissionStore((state) => state.autoApproveAll)
  const setAutoApproveAll = usePermissionStore((state) => state.setAutoApproveAll)

  // 响应式获取当前会话的消息
  const messages = useMemo(() => {
    if (!currentSessionId || !sessions[currentSessionId]) return []
    return sessions[currentSessionId].messages
  }, [currentSessionId, sessions])

  // Create initial session and ask for user name if needed
  useEffect(() => {
    if (!currentSessionId) {
      createSession('新对话')
    }

    // Check if we need to ask for user name
    if (currentSessionId && messages.length === 0 && profile && !hasUserName()) {
      // Add greeting message from AI
      const greetingMessage: Message = {
        id: generateId(),
        role: 'assistant',
        content: `您好，我是 ${profile.agentName}，可以告诉我你的名字吗？`,
        timestamp: Date.now(),
        status: 'sent'
      }
      addMessage(greetingMessage)
    }
  }, []) // Only run once on mount

  const handleSendMessage = useCallback(async (content: string) => {
    // Reset auto-approve for each new user message
    setAutoApproveAll(false)

    // Check if user is telling their name (for first conversation)
    if (!hasUserName()) {
      const extractedName = extractName(content)
      if (extractedName) {
        // Save user name to memory
        try {
          await AgentService.saveMemory({
            user_id: 'default-user',
            content: `用户的名字是${extractedName}`,
            memory_type: 'user_info'
          })
          // Also save to local store
          setUserName(extractedName)
        } catch (error) {
          console.error('Failed to save user name:', error)
        }
      }
    }

    // Add user message
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      status: 'sent'
    }

    addMessage(userMessage)

    // Create assistant message placeholder
    const assistantMessageId = generateId()
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'sending'
    }

    addMessage(assistantMessage)
    setStreaming(true, assistantMessageId)

    try {
      // Stream response from Agent SDK
      let accumulatedContent = ''
      let currentSearchResults: SearchResult[] = []
      let currentToolCalls: ToolCallInfo[] = []

      for await (const chunk of AgentService.chatStream({
        user_id: 'default-user',
        message: content,
        session_id: currentSessionId || 'default',
        use_memory: true
      })) {
        // Handle different chunk types based on type field
        // Only throw for fatal errors, not for search_error which is recoverable
        if (chunk.error && chunk.type !== 'search_error' && chunk.type !== 'tool_result') {
          throw new Error(chunk.error)
        }

        if (chunk.type === 'text' && chunk.content) {
          // Streaming text content
          accumulatedContent += chunk.content
          // Update message content in real-time
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            isSearching: false,
            searchResults: currentSearchResults.length > 0 ? currentSearchResults : undefined,
            toolCalls: currentToolCalls.length > 0 ? [...currentToolCalls] : undefined
          })
        } else if (chunk.type === 'tool_start') {
          // Tool/skill execution started
          const isDesktop = DESKTOP_TOOL_NAMES.has(chunk.tool)
          currentToolCalls.push({
            tool: chunk.tool,
            input: chunk.input,
            status: 'running',
            isDesktopTool: isDesktop,
          })
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })
        } else if (chunk.type === 'desktop_tool_request') {
          // Desktop tool request — needs user permission
          const requestId = chunk.request_id as string
          const tool = chunk.tool as string
          const input = chunk.input as Record<string, any>

          // Update existing tool call status
          const isAutoApprove = usePermissionStore.getState().autoApproveAll
          const initialStatus = isAutoApprove ? 'running' : 'pending_approval'

          const idx = currentToolCalls.findIndex(
            (tc) => tc.tool === tool && tc.status === 'running'
          )
          if (idx !== -1) {
            currentToolCalls[idx] = {
              ...currentToolCalls[idx],
              status: initialStatus,
              requestId,
              isDesktopTool: true,
            }
          } else {
            currentToolCalls.push({
              tool,
              input,
              status: initialStatus,
              requestId,
              isDesktopTool: true,
            })
          }
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })

          // Check auto-approve or show dialog
          let decision: { approved: boolean }

          if (usePermissionStore.getState().autoApproveAll) {
            // Auto-approve: skip dialog
            decision = { approved: true }
          } else {
            // Show permission dialog and wait for user decision
            addPermissionRequest({
              id: requestId,
              tool,
              input,
              description: describeToolRequest(tool, input),
              risk_level: classifyRisk(tool, input),
              timestamp: Date.now(),
            })
            decision = await waitForPermissionDecision(requestId)
          }

          let toolResult: { success: boolean; content: string; error?: string }

          if (decision.approved) {
            // User approved — execute via Tauri
            toolResult = await executeDesktopTool(tool, input)
            // Update tool call status
            const callIdx = currentToolCalls.findIndex((tc) => tc.requestId === requestId)
            if (callIdx !== -1) {
              currentToolCalls[callIdx] = {
                ...currentToolCalls[callIdx],
                status: toolResult.success ? 'success' : 'error',
                message: toolResult.success ? toolResult.content.slice(0, 200) : toolResult.error,
              }
            }
          } else {
            // User denied
            toolResult = { success: false, content: '', error: '用户拒绝了此操作' }
            const callIdx = currentToolCalls.findIndex((tc) => tc.requestId === requestId)
            if (callIdx !== -1) {
              currentToolCalls[callIdx] = {
                ...currentToolCalls[callIdx],
                status: 'denied',
                message: '用户拒绝了此操作',
              }
            }
          }

          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })

          // POST result back to Agent SDK so Claude can continue
          await AgentService.submitDesktopToolResult(requestId, toolResult)

        } else if (chunk.type === 'tool_result') {
          // Tool/skill execution completed
          const idx = currentToolCalls.findIndex(
            (tc) => tc.tool === chunk.tool && tc.status === 'running'
          )
          if (idx !== -1) {
            currentToolCalls[idx] = {
              ...currentToolCalls[idx],
              status: chunk.success ? 'success' : 'error',
              message: chunk.message,
              data: chunk.data
            }
          }
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending',
            toolCalls: [...currentToolCalls]
          })
        } else if (chunk.type === 'skill') {
          // Skill context loaded - record skill names for deduplication
          // Don't create cards here; the tool_start/tool_result flow will show cards if the model calls the skill
        } else if (chunk.type === 'memory') {
          // Memory info received
        } else if (chunk.type === 'search_start') {
          // Web search started - update message to show searching state
          updateMessage(assistantMessageId, {
            isSearching: true
          })
        } else if (chunk.type === 'search_done') {
          // Web search completed - store results for the message
          if (chunk.results && chunk.results.length > 0) {
            currentSearchResults = chunk.results
            updateMessage(assistantMessageId, {
              isSearching: false,
              searchResults: currentSearchResults
            })
          } else {
            updateMessage(assistantMessageId, {
              isSearching: false
            })
          }
        } else if (chunk.type === 'search_error') {
          // Web search error - don't stop, just log and continue
          updateMessage(assistantMessageId, {
            isSearching: false
          })
          console.warn('Search error (continuing without search results):', chunk.error)
        } else if (chunk.type === 'done') {
          // Stream complete
          break
        } else if (chunk.content) {
          // Fallback for direct content
          accumulatedContent += chunk.content
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending'
          })
        } else if (chunk.message) {
          // Fallback for message field
          accumulatedContent = chunk.message
          updateMessage(assistantMessageId, {
            content: accumulatedContent,
            status: 'sending'
          })
        }
      }

      // Mark as sent when stream completes
      updateMessage(assistantMessageId, {
        status: 'sent',
        isSearching: false,
        searchResults: currentSearchResults.length > 0 ? currentSearchResults : undefined,
        toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined
      })
    } catch (error) {
      console.error('Chat error:', error)

      // Update message with error
      updateMessage(assistantMessageId, {
        status: 'error',
        error: error instanceof Error ? error.message : '发送失败'
      })
    } finally {
      setStreaming(false)
    }
  }, [addMessage, updateMessage, setStreaming, addPermissionRequest, setAutoApproveAll])

  return (
    <div className="flex h-screen bg-black">
      {/* Chat History Sidebar */}
      <ChatHistorySidebar />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="h-14 border-b border-neutral-800 flex items-center px-6 flex-shrink-0">
          <div className="flex-1">
            <h1 className="text-base font-semibold text-white">
              对话工作台
            </h1>
            <p className="text-xs text-neutral-600 mt-0.5">
              与 CKS Assistant 智能对话
            </p>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 min-h-0">
          <MessageList messages={messages} isLoading={false} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0">
          <ChatInput onSend={handleSendMessage} disabled={isStreaming} />
        </div>
      </div>

      {/* Permission Approval Dialog */}
      {permissionRequests.length > 0 && (
        <PermissionApprovalDialog
          request={permissionRequests[0]}
          onApprove={() => resolvePermissionDecision(permissionRequests[0].id, true)}
          onDeny={() => resolvePermissionDecision(permissionRequests[0].id, false)}
          onApproveAll={() => {
            setAutoApproveAll(true)
            resolvePermissionDecision(permissionRequests[0].id, true)
          }}
        />
      )}
    </div>
  )
}
