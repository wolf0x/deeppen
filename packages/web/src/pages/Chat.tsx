import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import Markdown from "react-markdown";
import { useModels } from "../hooks/useModels.js";
import { useChatSessions, useChatMessages } from "../hooks/useChat.js";
import type { ChatMessage, ChatSession } from "../hooks/useChat.js";

export function Chat() {
  const { models } = useModels();
  const { sessions, loading: sessionsLoading, createSession, deleteSession } = useChatSessions();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const { messages, sending, error, taskCreated, sendMessage, stopSending } = useChatMessages(activeSessionId);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-select first model
  useEffect(() => {
    if (models.length > 0 && !selectedModelId) {
      setSelectedModelId(models[0].id);
    }
  }, [models, selectedModelId]);

  const handleNewChat = async () => {
    const session = await createSession(selectedModelId || undefined);
    setActiveSessionId(session.id);
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput("");
    await sendMessage(msg, selectedModelId || undefined);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteSession(id);
    if (activeSessionId === id) setActiveSessionId(null);
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex h-full">
      {/* Session sidebar */}
      <div className="w-64 bg-bg-surface border-r border-border flex flex-col">
        <div className="p-3 border-b border-border">
          <button onClick={handleNewChat}
            className="w-full px-3 py-2 bg-accent-blue text-bg-primary rounded text-sm font-medium hover:opacity-90">
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {sessionsLoading ? (
            <p className="text-text-secondary text-xs p-2">Loading...</p>
          ) : sessions.length === 0 ? (
            <p className="text-text-secondary text-xs p-2">No conversations yet</p>
          ) : (
            sessions.map((s) => (
              <div key={s.id}
                onClick={() => setActiveSessionId(s.id)}
                className={`group flex items-center justify-between px-3 py-2 rounded text-sm cursor-pointer mb-1 ${
                  activeSessionId === s.id
                    ? "bg-bg-elevated text-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-elevated"
                }`}>
                <span className="truncate flex-1">{s.title}</span>
                <button onClick={(e) => handleDeleteSession(s.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-accent-red text-xs ml-2 hover:underline">
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat main area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-bg-surface">
          <div>
            <h1 className="text-lg font-bold">Chat</h1>
            {activeSession && (
              <p className="text-xs text-text-secondary">{activeSession.title}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-text-secondary">Model:</label>
            <select value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)}
              className="px-2 py-1 bg-bg-elevated border border-border rounded text-sm text-text-primary focus:border-accent-blue focus:outline-none">
              {models.length === 0 && <option value="">No models configured</option>}
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.modelId})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {!activeSessionId ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-4xl mb-4">💬</p>
                <p className="text-text-secondary text-lg mb-2">Start a conversation</p>
                <p className="text-text-secondary text-sm">Create a new chat to discuss CTF challenges with the AI assistant</p>
                {models.length === 0 && (
                  <Link to="/config/models" className="inline-block mt-4 px-4 py-2 bg-accent-blue text-bg-primary rounded text-sm font-medium">
                    Configure a Model First
                  </Link>
                )}
              </div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-2xl mb-2">🏴‍☠️</p>
                <p className="text-text-secondary">Describe your CTF challenge and I'll help you get started</p>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <ChatBubble key={msg.id} message={msg} />
            ))
          )}

          {/* Task created notification */}
          {taskCreated && (
            <div className="flex justify-center">
              <Link to={`/tasks/${taskCreated.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-accent-green/10 border border-accent-green/30 rounded-lg text-accent-green text-sm hover:bg-accent-green/20 transition-colors">
                ✅ Task created: {taskCreated.name} — Click to view →
              </Link>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-2 bg-accent-red/10 border border-accent-red/30 rounded text-accent-red text-sm">
              {error}
            </div>
          )}

          {/* Sending indicator */}
          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-accent-blue/20 flex items-center justify-center text-sm">🤖</div>
              <div className="bg-bg-surface border border-border rounded-lg px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-text-secondary rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        {activeSessionId && (
          <div className="px-6 py-4 border-t border-border bg-bg-surface">
            <div className="flex gap-3">
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your CTF challenge..."
                rows={1}
                disabled={sending}
                className="flex-1 px-4 py-2 bg-bg-elevated border border-border rounded-lg text-text-primary resize-none focus:border-accent-blue focus:outline-none disabled:opacity-50"
                style={{ minHeight: "42px", maxHeight: "120px" }}
              />
              {sending ? (
                <button onClick={stopSending}
                  className="px-4 py-2 bg-accent-red text-bg-primary rounded-lg font-medium hover:opacity-90 flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-bg-primary border-t-transparent rounded-full animate-spin" />
                  Stop
                </button>
              ) : (
                <button onClick={handleSend} disabled={!input.trim()}
                  className="px-4 py-2 bg-accent-blue text-bg-primary rounded-lg font-medium disabled:opacity-50 hover:opacity-90">
                  Send
                </button>
              )}
            </div>
            <p className="text-xs text-text-secondary mt-1">Press Enter to send, Shift+Enter for new line</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
        isUser ? "bg-accent-purple/20" : "bg-accent-blue/20"
      }`}>
        {isUser ? "👤" : "🤖"}
      </div>
      <div className={`max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? "bg-accent-blue/10 border border-accent-blue/20"
          : "bg-bg-surface border border-border"
      }`}>
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <div className="chat-markdown break-words">
            <Markdown
              components={{
                h1: ({children}) => <h1 className="text-lg font-bold mb-2 text-text-primary">{children}</h1>,
                h2: ({children}) => <h2 className="text-base font-bold mb-2 text-text-primary">{children}</h2>,
                h3: ({children}) => <h3 className="text-sm font-bold mb-1 text-text-primary">{children}</h3>,
                p: ({children}) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
                li: ({children}) => <li className="text-text-primary">{children}</li>,
                code: ({className, children, ...props}) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-bg-elevated px-1.5 py-0.5 rounded text-accent-orange text-xs font-mono" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className="block bg-bg-elevated p-3 rounded text-xs font-mono overflow-x-auto mb-2" {...props}>
                      {children}
                    </code>
                  );
                },
                pre: ({children}) => <pre className="bg-bg-elevated p-3 rounded overflow-x-auto mb-2">{children}</pre>,
                table: ({children}) => <table className="border-collapse mb-2 text-xs w-full">{children}</table>,
                thead: ({children}) => <thead className="border-b border-border">{children}</thead>,
                th: ({children}) => <th className="text-left px-2 py-1 text-text-secondary font-medium">{children}</th>,
                td: ({children}) => <td className="px-2 py-1 border-b border-border/50">{children}</td>,
                blockquote: ({children}) => (
                  <blockquote className="border-l-2 border-accent-blue pl-3 mb-2 text-text-secondary italic">{children}</blockquote>
                ),
                a: ({href, children}) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">{children}</a>
                ),
                strong: ({children}) => <strong className="font-bold text-text-primary">{children}</strong>,
                em: ({children}) => <em className="italic text-text-secondary">{children}</em>,
                hr: () => <hr className="border-border my-2" />,
              }}
            >
              {message.content}
            </Markdown>
          </div>
        )}
        <div className={`text-xs mt-1 ${isUser ? "text-accent-blue/50" : "text-text-secondary"}`}>
          {new Date(message.createdAt).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
