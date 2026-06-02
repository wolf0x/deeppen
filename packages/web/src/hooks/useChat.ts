import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../lib/api.js";

export interface ChatSession {
  id: string;
  modelConfigId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface TaskCreated {
  id: string;
  name: string;
}

export function useChatSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listChatSessions();
      setSessions(data);
    } catch (err) {
      console.error("Failed to load chat sessions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const createSession = useCallback(async (modelConfigId?: string) => {
    const session = await api.createChatSession(modelConfigId);
    await refresh();
    return session;
  }, [refresh]);

  const deleteSession = useCallback(async (id: string) => {
    await api.deleteChatSession(id);
    await refresh();
  }, [refresh]);

  return { sessions, loading, refresh, createSession, deleteSession };
}

export function useChatMessages(sessionId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taskCreated, setTaskCreated] = useState<TaskCreated | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const data = await api.getChatMessages(sessionId);
      setMessages(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    setMessages([]);
    setTaskCreated(null);
    setError(null);
    refresh();
  }, [sessionId, refresh]);

  const sendMessage = useCallback(async (content: string, modelConfigId?: string) => {
    if (!sessionId) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);
    setError(null);
    setTaskCreated(null);
    try {
      // Optimistically add user message
      const tempUserMsg: ChatMessage = {
        id: "temp-" + Date.now(),
        sessionId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempUserMsg]);

      const result = await api.sendChatMessage(sessionId, content, modelConfigId, controller.signal);

      // Replace temp message with real ones and add assistant response
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempUserMsg.id);
        return [...withoutTemp, result.userMessage, result.assistantMessage];
      });

      if (result.taskCreated) {
        setTaskCreated(result.taskCreated);
        // Notify other components (e.g. Dashboard) that a task was created
        window.dispatchEvent(new CustomEvent("task-created", { detail: result.taskCreated }));
      }
    } catch (err: any) {
      if (err.message === "Request cancelled") {
        // Remove optimistic message on cancel
        setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
      } else {
        setError(err.message);
        setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-")));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [sessionId]);

  const stopSending = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { messages, loading, sending, error, taskCreated, sendMessage, stopSending, refresh };
}
