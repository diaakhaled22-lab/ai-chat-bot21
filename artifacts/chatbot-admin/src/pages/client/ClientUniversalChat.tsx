import { useState, useMemo, useRef, useEffect } from "react";
import { useListClientChatLogs, getListClientChatLogsQueryKey, useMarkClientLogAsRead, useGetClientChatLogRetention } from "@workspace/api-client-react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Search, MessageCircle, MessageSquare, Globe, ArrowLeft, User, Bot, Send, Loader2, CheckCircle2, Zap, Trash2, UserCheck, Inbox, Sparkles, Clock, CalendarRange, LifeBuoy, AlertTriangle } from 'lucide-react';

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";

function cleanDisplayMessage(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/提供/g, "تقديم")
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, "")
    .replace(/^(\s*)[\*]\s+/gm, "$1• ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*{1,3}/g, "")
    .replace(/[ \t]+([؟!\?.,،:])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "بك", "بكم", "فيك", "وسهلا", "وسهلاً", "الخير", "النور", "عزيزي", "عزيزتي", 
  "أخي", "اخي", "اختي", "أختي", "الجميع", "الكل", "يا", "تمام", "شكرا", "شكراً", 
  "نعم", "لا", "أهلاً", "اهلا", "مرحبا", "مرحباً", "السلام", "عليكم", "صباح", 
  "مساء", "خدمة", "العملاء", "دعم", "فني", "مشكلة", "استفسار", "سؤال", "طلب", 
  "حجز", "شراء", "تفاصيل", "hello", "there", "you", "friend", "sir", "hi", "hey"
]);

function cleanNameCandidate(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[،,\.!\?؟\(\)\[\]"':\/-]/g, " ").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(w => w.length > 1);
  if (words.length === 0 || words.length > 4) return null;
  const validWords = words.filter(w => !STOPWORDS.has(w.toLowerCase()));
  if (validWords.length === 0) return null;
  const finalName = validWords.join(" ");
  return finalName.length >= 2 ? finalName : null;
}

function extractUserName(messages: any[], leadName?: string | null): string | null {
  if (leadName && leadName.trim()) return leadName.trim();
  if (!messages || messages.length === 0) return null;

  // 1. Direct regex match & contextual match across all messages (identical to ClientChatLogs)
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg?.customerMessage) continue;

    const text = msg.customerMessage.trim();
    if (text.startsWith("/")) continue;
    if (/^\d+$/.test(text)) continue;

    // 1a. Direct regex match (handles Arabic & English: "My name is X", "Name: X", "اسمي X", "انا X", "أنا X", "الاسم: X", etc.)
    const directMatch = text.match(/(?:my name is|i am|i'm|name:|username:|اسمي هو|اسمي|انا|أنا|الاسم:|الاسم)\s+([A-Za-z\u0600-\u06FF]{2,15})(?:\s+([A-Za-z\u0600-\u06FF]{2,15}))?/i);
    if (directMatch) {
      const p1 = directMatch[1];
      const p2 = directMatch[2] ? " " + directMatch[2] : "";
      const forbidden = ["اريد", "أريد", "عايز", "عاوز", "ابغى", "احتاج", "أحتاج", "طلب", "شراء", "سؤال", "استفسار", "العميل", "الخدمة", "هنا", "في", "من", "looking", "want", "need", "here", "help"];
      if (!forbidden.includes(p1.toLowerCase())) {
        return (p1 + p2).trim();
      }
    }

    // 1b. Contextual match (bot asked for name in previous message, e.g. "ما اسمك", "الاسم الكريم", or any question with "اسم")
    if (i > 0) {
      const prevMsg = messages[i - 1];
      if (prevMsg?.botResponse) {
        const botText = prevMsg.botResponse.toLowerCase();
        if ((botText.includes("name") || botText.includes("اسم") || botText.includes("who are you")) && text.split(/\s+/).length <= 3) {
          if (!text.includes("?") && !text.includes("لا") && !text.includes("no") && !/^\d+$/.test(text)) {
            return text;
          }
        }
      }
    }

    // 1c. Short pure text that looks like a 2-word or 3-word name (e.g. "ضياء خالد", "Ahmed Ali")
    const words = text.split(/\s+/).filter(Boolean);
    if ((words.length === 2 || words.length === 3) && text.length <= 30) {
      const isPureAlpha = /^[\u0600-\u06FFA-Za-z\s]+$/.test(text);
      const commonPhrases = [
        "السلام عليكم", "صباح الخير", "مساء الخير", "أهلاً وسهلاً", "اهلا وسهلا", "شكراً جزيلاً", "شكرا جزيلا",
        "يعطيك العافية", "الله يعافيك", "لو سمحت", "من فضلك", "مرحبا بك", "أهلاً بك", "اهلا بك",
        "good morning", "good evening", "thank you", "hello there"
      ];
      const isCommonPhrase = commonPhrases.some(phrase => text.includes(phrase));
      if (isPureAlpha && !isCommonPhrase) {
        return text;
      }
    }
  }

  // 2. Check for secret [LEAD_DATA:] block in any botResponse
  for (let i = messages.length - 1; i >= 0; i--) {
    const resp = messages[i]?.botResponse;
    if (resp && resp.includes("[LEAD_DATA:")) {
      try {
        const match = resp.match(/\[LEAD_DATA:\s*([\s\S]*?)\s*\]/);
        if (match) {
          const parsed = JSON.parse(match[1].replace(/```json/g, "").replace(/```/g, "").trim());
          if (parsed.name && typeof parsed.name === "string" && parsed.name.trim()) {
            const cleaned = cleanNameCandidate(parsed.name);
            if (cleaned) return cleaned;
          }
        }
      } catch (e) {}
    }
  }

  // 3. Check if bot addressed the customer by name in any response (e.g. "مرحباً يا ضياء")
  const botGreetRegex = /(?:أهلاً\s+(?:بك\s+)?(?:يا\s+)?|مرحباً\s+(?:يا\s+)?|مرحبا\s+(?:يا\s+)?|حياك\s+الله\s+(?:يا\s+)?|تشرفت\s+بك\s+(?:يا\s+)?|أهلاً\s+(?:أستاذ|استاذ|دكتور|مهندس)\s+|Hello\s+|Welcome\s+)\s*([A-Za-z\u0600-\u06FF]{2,20}(?:\s+[A-Za-z\u0600-\u06FF]{2,20})?)/i;
  for (let i = 0; i < messages.length; i++) {
    const botMsg = messages[i]?.botResponse;
    if (botMsg) {
      const match = botMsg.match(botGreetRegex);
      if (match && match[1]) {
        const cleaned = cleanNameCandidate(match[1]);
        if (cleaned) return cleaned;
      }
    }
  }

  return null;
}

function formatFallbackUser(session: { id: string; channel: string }, lang: string): string {
  const isAr = lang === "ar";
  const id = session.id || "";
  
  const cleanPhone = id.replace(/^(whatsapp:|telegram:|web:)/, "");
  if (/^\+?\d{8,15}$/.test(cleanPhone)) {
    return cleanPhone.startsWith("+") ? cleanPhone : `+${cleanPhone}`;
  }
  
  switch (session.channel) {
    case "whatsapp": return isAr ? "مستخدم واتساب" : "WhatsApp User";
    case "telegram": return isAr ? "مستخدم تيليجرام" : "Telegram User";
    case "messenger": return isAr ? "مستخدم ماسنجر" : "Messenger User";
    case "website": return isAr ? "زائر الموقع" : "Website Visitor";
    default: return isAr ? "مستخدم" : "User";
  }
}


interface CannedResponse {
  id: number;
  companyId: number;
  title: string;
  content: string;
}

export default function ClientUniversalChat() {

  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [localReadSessions, setLocalReadSessions] = useState<Set<string>>(new Set());
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  
  const { data: logs, isLoading } = useListClientChatLogs();
  const { data: retentionData, isLoading: retentionLoading } = useGetClientChatLogRetention();
  const currentRetention = retentionData?.retentionDays ?? 3;
  const { data: cannedResponses = [] } = useQuery({
    queryKey: ["canned-responses"],
    queryFn: async () => {
      const { customFetch } = await import("@workspace/api-client-react");
      const res = await customFetch<CannedResponse[]>("/client/canned-responses");
      return Array.isArray(res) ? res : [];
    }
  });

  const { data: leads = [] } = useQuery({
    queryKey: ["client-leads"],
    queryFn: async () => {
      const { customFetch } = await import("@workspace/api-client-react");
      const res = await customFetch<Array<{ id: number; sessionId: string; name: string | null; phone: string | null; email: string | null }>>("/client/leads");
      return Array.isArray(res) ? res : [];
    }
  });

  const leadsBySession = useMemo(() => {
    const map = new Map<string, string>();
    leads.forEach(l => {
      if (l.sessionId && l.name?.trim()) {
        map.set(l.sessionId, l.name.trim());
      }
    });
    return map;
  }, [leads]);
  
  const showQuickReplies = replyText.startsWith("/");
  const filteredQuickReplies = showQuickReplies ? cannedResponses.filter(r => r.title.toLowerCase().includes(replyText.slice(1).toLowerCase())) : [];
  
  const handleSelectQuickReply = (content: string) => {
    setReplyText(content);
  };

  const markLogAsRead = useMarkClientLogAsRead();

  const deleteSessionMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await fetch(`/api/client/chat-logs/session/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete conversation");
      return res.json();
    },
    onSuccess: (_, deletedSessionId) => {
      if (selectedSessionId === deletedSessionId) {
        setSelectedSessionId(null);
      }
      queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
      toast({
        title: lang === "ar" ? "تم حذف المحادثة بنجاح" : "Conversation deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: lang === "ar" ? "خطأ" : "Error",
        description: lang === "ar" ? "فشل حذف المحادثة" : "Failed to delete conversation",
        variant: "destructive",
      });
    },
  });

  const handleDeleteSession = (sessionId: string) => {
    deleteSessionMutation.mutate(sessionId);
  };

  // ── MUTATION FOR REPLY / RESOLVE ───────────────────────────────────────────
  const useReplyMutation = useMutation({
    mutationFn: async ({ sessionId, message, resolveHandoff }: { sessionId: string; message: string; resolveHandoff: boolean }) => {
      const res = await fetch("/api/client/chat/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message, resolveHandoff }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
    },
    onError: () => {
      toast({ title: lang === "ar" ? "خطأ" : "Error", description: lang === "ar" ? "فشل إرسال الرسالة" : "Failed to send message", variant: "destructive" });
    }
  });

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedSessionId) return;
    useReplyMutation.mutate({ sessionId: selectedSessionId, message: replyText.trim(), resolveHandoff: false });
    setReplyText("");
  };

  const handleResolveHandoff = () => {
    if (!selectedSessionId) return;
    useReplyMutation.mutate({ sessionId: selectedSessionId, message: "", resolveHandoff: true });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  // ── SESSIONS PROCESSING ────────────────────────────────────────────────────
  const sessions = useMemo(() => {
    if (!logs) return [];

    const map = new Map<string, typeof logs>();
    logs.forEach(log => {
      const key = log.sessionId || `msg_${log.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(log);
    });

    return Array.from(map.values()).map(sessionLogs => {
      const sorted = [...sessionLogs].sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const lastMsg = sorted[sorted.length - 1];
      const sessionId = lastMsg.sessionId || `msg_${lastMsg.id}`;
      const leadName = leadsBySession.get(sessionId) || null;
      const userName = extractUserName(sorted, leadName);

      return {
        id: sessionId,
        channel: lastMsg.channel,
        userName,
        lastMessage: lastMsg.customerMessage || lastMsg.botResponse,
        updatedAt: lastMsg.createdAt,
        messages: sorted,
      };
    }).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [logs, leadsBySession]);

  
  // ── KPI Calculations ───────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!logs || !sessions) {
      return {
        totalSessions: 0,
        todaySessions: 0,
        activeHandoffCount: 0,
        ticketsCount: 0,
        unreadCount: 0,
        aiAutomatedRate: 100,
        channelCounts: { whatsapp: 0, telegram: 0, messenger: 0, website: 0 },
      };
    }

    const todayStr = new Date().toDateString();
    let todayCount = 0;
    let handoffCount = 0;
    let ticketsCount = 0;
    const channelCounts: Record<string, number> = { whatsapp: 0, telegram: 0, messenger: 0, website: 0 };

    sessions.forEach((s) => {
      if (new Date(s.updatedAt).toDateString() === todayStr) {
        todayCount++;
      }
      if (s.channel && channelCounts[s.channel] !== undefined) {
        channelCounts[s.channel]++;
      }
      if (s.id.startsWith("ticket_")) {
        ticketsCount++;
      }
      for (let i = s.messages.length - 1; i >= 0; i--) {
        if (s.messages[i].botResponse === "[HANDOFF_RESOLVED]") break;
        if ((s.messages[i] as any).isHandoff || s.id.startsWith("ticket_")) {
          handoffCount++;
          break;
        }
      }
    });

    const unread = logs.filter((l) => !l.isRead).length;
    const total = sessions.length;
    const aiRate = total > 0 ? Math.round(((total - handoffCount) / total) * 100) : 100;

    return {
      totalSessions: total,
      todaySessions: todayCount,
      activeHandoffCount: handoffCount,
      ticketsCount,
      unreadCount: unread,
      aiAutomatedRate: Math.max(0, aiRate),
      channelCounts,
    };
  }, [logs, sessions]);

  const dateOptions = useMemo(() => {
    const options = [];
    const today = new Date();
    for (let i = 0; i < currentRetention; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      let label = iso;
      if (i === 0) label = lang === "ar" ? `اليوم (${iso})` : `Today (${iso})`;
      else if (i === 1) label = lang === "ar" ? `أمس (${iso})` : `Yesterday (${iso})`;
      
      options.push({ value: iso, label });
    }
    return options;
  }, [currentRetention, lang]);

  const getChannelFilterIcon = (ch: string) => {
    switch (ch) {
      case "whatsapp": return <MessageSquare className="w-4 h-4 text-emerald-500 shrink-0" />;
      case "telegram": return <MessageCircle className="w-4 h-4 text-sky-500 shrink-0" />;
      case "messenger": return <MessageCircle className="w-4 h-4 text-blue-500 shrink-0" />;
      case "website": return <Globe className="w-4 h-4 text-purple-500 shrink-0" />;
      case "problems": return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
      case "tickets": return <LifeBuoy className="w-4 h-4 text-indigo-500 shrink-0" />;
      case "handoff": return <UserCheck className="w-4 h-4 text-amber-500 shrink-0" />;
      default: return <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
  };

  const allowedDates = useMemo(() => {
    return new Set(dateOptions.map((opt) => opt.value));
  }, [dateOptions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (channelFilter === "problems") {
        let isProblem = s.id.startsWith("ticket_");
        if (!isProblem) {
          for (let i = s.messages.length - 1; i >= 0; i--) {
            if (s.messages[i].botResponse === "[HANDOFF_RESOLVED]") break;
            if (
              (s.messages[i] as any).isHandoff ||
              (s.messages[i].customerMessage &&
                /مشكل|عطل|شكوى|توقف|خربان|معلق|تذكرة|problem|issue|broken|bug|error/i.test(s.messages[i].customerMessage!))
            ) {
              isProblem = true;
              break;
            }
          }
        }
        if (!isProblem) return false;
      } else if (channelFilter === "tickets") {
        if (!s.id.startsWith("ticket_")) return false;
      } else if (channelFilter === "handoff") {
        let hasHandoff = false;
        for (let i = s.messages.length - 1; i >= 0; i--) {
          if (s.messages[i].botResponse === "[HANDOFF_RESOLVED]") break;
          if ((s.messages[i] as any).isHandoff) {
            hasHandoff = true;
            break;
          }
        }
        if (!hasHandoff) return false;
      } else if (channelFilter !== "all" && s.channel !== channelFilter) {
        return false;
      }

      if (dateFilter === "all") {
        if (allowedDates.size > 0) {
          const matchesDate = (
            (s.updatedAt && allowedDates.has(s.updatedAt.slice(0, 10))) ||
            s.messages.some(m => m.createdAt && allowedDates.has(m.createdAt.slice(0, 10)))
          );
          if (!matchesDate) return false;
        }
      } else {
        const matchesDate = (
          (s.updatedAt && s.updatedAt.startsWith(dateFilter)) ||
          s.messages.some(m => m.createdAt && m.createdAt.startsWith(dateFilter))
        );
        if (!matchesDate) return false;
      }

      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matchesName = s.userName ? s.userName.toLowerCase().includes(query) : false;
        const matchesId = s.id ? s.id.toLowerCase().includes(query) : false;
        const matchesMsg = s.messages.some(m => 
          (m.customerMessage && m.customerMessage.toLowerCase().includes(query)) ||
          (m.botResponse && m.botResponse.toLowerCase().includes(query))
        );
        if (!matchesName && !matchesId && !matchesMsg) return false;
      }

      return true;
    });
  }, [sessions, channelFilter, dateFilter, search, allowedDates]);

  const selectedSession = useMemo(() => {
    return sessions.find(s => s.id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);

  const isHandoff = useMemo(() => {
    if (!selectedSession) return false;
    for (let i = selectedSession.messages.length - 1; i >= 0; i--) {
      if (selectedSession.messages[i].botResponse === "[HANDOFF_RESOLVED]") return false;
      if ((selectedSession.messages[i] as any).isHandoff) return true;
    }
    return false;
  }, [selectedSession]);

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setLocalReadSessions(prev => new Set(prev).add(sessionId));
    
    const session = sessions.find(s => s.id === sessionId);
    if (session && session.messages.some(m => !m.isRead)) {
      queryClient.setQueryData(
        getListClientChatLogsQueryKey(),
        (oldData: any) => {
          if (!oldData) return oldData;
          return oldData.map((log: any) => 
            (log.sessionId === sessionId || `msg_${log.id}` === sessionId) 
              ? { ...log, isRead: true } 
              : log
          );
        }
      );

      const unreadLogs = session.messages.filter(m => !m.isRead);
      Promise.all(unreadLogs.map(m => markLogAsRead.mutateAsync({ id: m.id })))
        .then(() => queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() }))
        .catch(() => queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() }));
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedSession?.messages, isHandoff]);

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "telegram": return <MessageCircle className="w-4 h-4 text-sky-500" />;
      case "whatsapp": return <MessageSquare className="w-4 h-4 text-emerald-500" />;
      case "website": return <Globe className="w-4 h-4 text-purple-500" />;
      default: return <MessageCircle className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6 flex flex-col flex-1 pb-10 h-full min-h-[700px]">
      {/* ── Bot Manager Hero Operations Banner ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10 shrink-0"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-56 h-56 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-comments text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Agent Desk & Human Handoff
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar" ? "المحادثة الشاملة والتدخل البشري" : "Universal Chat & Live Agent"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {lang === "ar" ? "إدارة المحادثات الحية، استقبال التدخل البشري، والرد الفوري على العملاء." : "Manage live conversations, human handoff, and immediate replies."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Retention Policy Banner */}
      <Card className="bg-card border-border shrink-0">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{t("chat_logs_retention_title")}</p>
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium">
                  {t("chat_logs_retention_admin_managed")}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {retentionLoading ? (
                  <Skeleton className="h-3 w-48 mt-1" />
                ) : lang === "ar" ? (
                  `يتم حذف سجلات الدردشة تلقائياً بعد ${currentRetention} ${currentRetention === 1 ? "يوم" : currentRetention === 2 ? "يومين" : "أيام"} وفقاً لما حدده مسؤول النظام.`
                ) : (
                  `Chat logs are automatically deleted after ${currentRetention} day${currentRetention === 1 ? "" : "s"} as set by your administrator.`
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 bg-muted/50 border border-border px-3 py-1.5 rounded-lg flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            <div className="text-sm font-bold tabular-nums">
              {retentionLoading ? (
                <Skeleton className="h-4 w-12" />
              ) : (
                `${currentRetention} ${lang === "ar" ? "أيام" : currentRetention === 1 ? "day" : "days"}`
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
        {/* Total Conversations */}
        <Card 
          onClick={() => setChannelFilter("all")}
          className={`p-4 border transition-all cursor-pointer hover:shadow-md ${channelFilter === "all" ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card/60"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {lang === "ar" ? "إجمالي المحادثات" : "Total Conversations"}
            </span>
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight tabular-nums">{kpis.totalSessions}</span>
            <span className="text-[11px] text-muted-foreground">
              {kpis.todaySessions} {lang === "ar" ? "اليوم" : "today"}
            </span>
          </div>
        </Card>

        {/* Active Problems / Handoffs */}
        <Card 
          onClick={() => setChannelFilter(channelFilter === "problems" ? "all" : "problems")}
          className={`p-4 border transition-all cursor-pointer hover:shadow-md ${channelFilter === "problems" ? "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/30" : kpis.activeHandoffCount > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-border bg-card/60"}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {lang === "ar" ? "المشاكل والشكاوى المعلقة" : "Pending Problems & Complaints"}
            </span>
            <div className={`p-2 rounded-lg ${kpis.activeHandoffCount > 0 ? "bg-amber-500/20 text-amber-500 animate-pulse" : "bg-muted text-muted-foreground"}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tracking-tight tabular-nums ${kpis.activeHandoffCount > 0 ? "text-amber-500" : ""}`}>
              {kpis.activeHandoffCount}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {kpis.activeHandoffCount > 0 
                ? (lang === "ar" ? "تتطلب التدخل" : "needs action")
                : (lang === "ar" ? "لا توجد معلقة" : "all resolved")}
            </span>
          </div>
        </Card>

        {/* Unread Messages */}
        <Card className="p-4 border border-border bg-card/60 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {lang === "ar" ? "رسائل غير مقروءة" : "Unread Messages"}
            </span>
            <div className={`p-2 rounded-lg ${kpis.unreadCount > 0 ? "bg-blue-500/20 text-blue-500" : "bg-muted text-muted-foreground"}`}>
              <Inbox className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-2xl font-bold tracking-tight tabular-nums ${kpis.unreadCount > 0 ? "text-blue-500" : ""}`}>
              {kpis.unreadCount}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {lang === "ar" ? "رسالة جديدة" : "new messages"}
            </span>
          </div>
        </Card>

        {/* AI Automation Rate */}
        <Card className="p-4 border border-border bg-card/60 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {lang === "ar" ? "أتمتة الذكاء الاصطناعي" : "AI Resolution Rate"}
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight tabular-nums text-emerald-500">
              {kpis.aiAutomatedRate}%
            </span>
            <span className="text-[11px] text-muted-foreground">
              {lang === "ar" ? "مكتملة آلياً" : "automated"}
            </span>
          </div>
        </Card>
      </div>

      {/* Search and Filters: Search Input, Channel Dropdown & Date Filter Dropdown */}
      <div className="flex flex-col md:flex-row gap-3 shrink-0">
        <div className="flex-1 flex items-center bg-card px-3 py-1.5 rounded-lg border border-border">
          <Search className="w-4 h-4 ml-1.5 text-muted-foreground shrink-0" />
          <Input 
            placeholder={lang === "ar" ? "ابحث في المحادثات بالاسم أو الرسالة..." : "Search conversations by name or message..."} 
            className="border-0 bg-transparent h-7 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full md:w-[200px]">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-10 bg-card">
              <div className="flex items-center gap-2 truncate">
                {getChannelFilterIcon(channelFilter)}
                <SelectValue placeholder={lang === "ar" ? "كل القنوات" : "All Channels"} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل القنوات والمحادثات" : "All Channels"} ({sessions.length})</SelectItem>
              <SelectItem value="problems">{lang === "ar" ? "⚠️ المشاكل والشكاوى" : "⚠️ Problems & Complaints"} ({kpis.activeHandoffCount})</SelectItem>
              <SelectItem value="tickets">{lang === "ar" ? "🎫 تذاكر الدعم" : "🎫 Support Tickets"} ({kpis.ticketsCount})</SelectItem>
              <SelectItem value="handoff">{lang === "ar" ? "تدخل بشري" : "Human Handoff"}</SelectItem>
              <SelectItem value="whatsapp">WhatsApp ({kpis.channelCounts.whatsapp || 0})</SelectItem>
              <SelectItem value="telegram">Telegram ({kpis.channelCounts.telegram || 0})</SelectItem>
              <SelectItem value="messenger">Messenger ({kpis.channelCounts.messenger || 0})</SelectItem>
              <SelectItem value="website">{lang === "ar" ? "الموقع الإلكتروني" : "Website"} ({kpis.channelCounts.website || 0})</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-[220px]">
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="h-10 bg-card">
              <div className="flex items-center gap-2 truncate">
                <CalendarRange className="w-4 h-4 text-muted-foreground shrink-0" />
                <SelectValue placeholder={lang === "ar" ? "كل الأيام" : "All Days"} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === "ar" ? "كل الأيام" : "All Days"}</SelectItem>
              {dateOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {(channelFilter !== "all" || dateFilter !== "all" || search) && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-10 text-xs text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => {
              setChannelFilter("all");
              setDateFilter("all");
              setSearch("");
            }}
          >
            {lang === "ar" ? "إعادة ضبط" : "Reset"}
          </Button>
        )}
      </div>

      {/* Inbox View Layout */}
      <Card className="flex-1 overflow-hidden flex border-border h-full">
        
        {/* Left Pane: Sessions List */}
        <div className={`w-full md:w-1/3 border-r border-border flex-col bg-muted/10 ${selectedSessionId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-border bg-card font-medium text-sm text-muted-foreground shrink-0">
            {lang === "ar" ? "المحادثات الأخيرة" : "Recent Conversations"}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
               Array.from({ length: 5 }).map((_, i) => (
                 <div key={i} className="p-4 border-b border-border"><Skeleton className="w-full h-10" /></div>
               ))
            ) : filteredSessions.length === 0 ? (
               <div className="p-8 text-center text-muted-foreground text-sm">
                 {lang === "ar" ? "لا توجد محادثات" : "No conversations found"}
               </div>
            ) : (
              filteredSessions.map((session) => {
                const isSelected = selectedSession?.id === session.id;
                const displayName = session.userName || extractUserName(session.messages, leadsBySession.get(session.id)) || formatFallbackUser(session, lang);
                const isTicket = session.id.startsWith("ticket_");
                let isSessionComplaint = isTicket;
                if (!isSessionComplaint) {
                  for (let i = session.messages.length - 1; i >= 0; i--) {
                    if (session.messages[i].botResponse === "[HANDOFF_RESOLVED]") break;
                    if (
                      (session.messages[i] as any).isHandoff ||
                      (session.messages[i].customerMessage &&
                        /مشكل|عطل|شكوى|توقف|خربان|معلق|تذكرة|problem|issue|broken|bug|error/i.test(session.messages[i].customerMessage!))
                    ) {
                      isSessionComplaint = true;
                      break;
                    }
                  }
                }
                return (
                  <div
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    role="button"
                    className={`w-full text-start p-4 border-b border-border transition-colors hover:bg-muted/50 flex items-start gap-3 relative cursor-pointer ${isSelected ? 'bg-muted border-l-4 border-l-primary' : ''}`}
                  >
                    <div className="mt-1 relative">
                      {isTicket ? (
                        <LifeBuoy className="w-4 h-4 text-indigo-500" />
                      ) : (
                        getChannelIcon(session.channel)
                      )}
                      {!localReadSessions.has(session.id) && session.messages.some(m => !m.isRead) && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-green-500 border-2 border-card rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-sm font-semibold truncate capitalize" title={displayName}>
                            {displayName}
                          </span>
                          {isTicket ? (
                            <Badge variant="outline" className="text-[9px] bg-indigo-500/10 text-indigo-500 border-indigo-500/20 font-semibold px-1 py-0 shrink-0">
                              🎫 {lang === "ar" ? "تذكرة مشكلة" : "Ticket"}
                            </Badge>
                          ) : isSessionComplaint ? (
                            <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-semibold px-1 py-0 shrink-0">
                              ⚠️ {lang === "ar" ? "مشكلة / شكوى" : "Complaint"}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(session.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <ConfirmDeleteDialog
                            title={lang === "ar" ? "حذف المحادثة" : "Delete Conversation"}
                            description={lang === "ar" ? "هل أنت متأكد من حذف هذه المحادثة بالكامل؟" : "Are you sure you want to delete this conversation?"}
                            onConfirm={() => handleDeleteSession(session.id)}
                          >
                            <button
                              type="button"
                              className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              title={lang === "ar" ? "حذف المحادثة" : "Delete conversation"}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </ConfirmDeleteDialog>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {session.lastMessage}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Right Pane: Active Chat View */}
        <div className={`flex-1 flex-col bg-card relative ${!selectedSessionId ? 'hidden md:flex' : 'flex'}`}>
          {!selectedSession ? (
             <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground h-full">
               <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
               <p>{lang === "ar" ? "اختر محادثة لعرض التفاصيل" : "Select a conversation to view"}</p>
             </div>
          ) : (
              <div className="flex flex-col h-full flex-1 min-h-0">
                {/* Chat Header */}
                <div className="p-4 border-b border-border flex items-center justify-between bg-muted/5 shadow-sm z-10 shrink-0">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setSelectedSessionId(null)}
                      className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                       {selectedSession.id.startsWith("ticket_") ? (
                         <LifeBuoy className="w-5 h-5 text-indigo-500" />
                       ) : (
                         getChannelIcon(selectedSession.channel)
                       )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm capitalize">
                        {selectedSession.userName || extractUserName(selectedSession.messages, leadsBySession.get(selectedSession.id)) || formatFallbackUser(selectedSession, lang)}
                      </h3>
                      <p className="text-xs text-muted-foreground">{selectedSession.messages.length} {lang === "ar" ? "رسالة" : "messages"}</p>
                    </div>
                  </div>
                  {selectedSession.id.startsWith("ticket_") ? (
                    <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/30 gap-1 font-semibold">
                      🎫 {lang === "ar" ? "تذكرة دعم فني" : "Support Ticket"}
                    </Badge>
                  ) : isHandoff ? (
                    <Badge variant="destructive" className="animate-pulse">
                      {lang === "ar" ? "تدخل بشري / شكوى نشطة" : "Active Handoff / Complaint"}
                    </Badge>
                  ) : null}
                </div>

                {selectedSession.id.startsWith("ticket_") && (
                  <div className="bg-indigo-500/10 border-b border-indigo-500/20 px-6 py-2.5 flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300 shrink-0">
                    <div className="flex items-center gap-2">
                      <LifeBuoy className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>{lang === "ar" ? "هذه المحادثة مرتبطة بتذكرة مشكلة مرسلة للدعم الفني. تظهر ردودك وحلول المشرفين هنا مباشرة." : "This conversation is linked to a customer problem ticket."}</span>
                    </div>
                  </div>
                )}

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {selectedSession.messages.map(log => (
                    <div key={log.id} className="space-y-4">
                      {log.customerMessage && (
                        <div className="flex items-end gap-2">
                          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-secondary-foreground/70" />
                          </div>
                          <div className="flex flex-col gap-1 max-w-[75%]">
                            <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                              {log.customerMessage}
                            </div>
                            <span className="text-[10px] text-muted-foreground ml-2">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {log.botResponse && log.botResponse !== `[HANDOFF_RESOLVED]` && (
                        <div className="flex items-end gap-2 flex-row-reverse">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Bot className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex flex-col gap-1 items-end max-w-[75%]">
                            <div className={`text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${(log as any).isHandoff ? 'bg-orange-500' : 'bg-primary'}`}>
                              {cleanDisplayMessage(log.botResponse)}
                            </div>
                            <span className="text-[10px] text-muted-foreground mr-2">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply Box */}
                <div className="p-4 border-t border-border bg-card flex flex-col gap-3 shrink-0">
                  {(isHandoff || selectedSession.id.startsWith("ticket_")) && (
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs text-muted-foreground">
                        {selectedSession.id.startsWith("ticket_")
                          ? (lang === "ar" ? "يمكنك الرد المباشر على التذكرة أو تأكيد حلها وإغلاقها." : "You can reply to this ticket or resolve and close it.")
                          : (lang === "ar" ? "أنت تتحدث حالياً مع المستخدم مباشرة." : "You are currently speaking directly with the user.")}
                      </span>
                      <Button size="sm" variant={selectedSession.id.startsWith("ticket_") ? "default" : "outline"} onClick={handleResolveHandoff} disabled={useReplyMutation.isPending}>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        {selectedSession.id.startsWith("ticket_")
                          ? (lang === "ar" ? "حل المشكلة وإغلاقها" : "Resolve Problem")
                          : (lang === "ar" ? "إنهاء التدخل" : "Resolve Handoff")}
                      </Button>
                    </div>
                  )}
                  
                  {/* Quick Replies Dropdown */}
                  {showQuickReplies && filteredQuickReplies.length > 0 && (
                    <div className="mb-2 bg-popover border border-border rounded-lg shadow-lg overflow-hidden flex flex-col max-h-48 overflow-y-auto">
                      <div className="px-3 py-1.5 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground flex items-center gap-2">
                        <Zap className="w-3 h-3" />
                        {lang === "ar" ? "اختر رداً سريعاً" : "Select Quick Reply"}
                      </div>
                      {filteredQuickReplies.map(r => (
                        <button
                          key={r.id}
                          onClick={() => handleSelectQuickReply(r.content)}
                          className="flex flex-col text-start px-3 py-2 hover:bg-muted focus:bg-muted transition-colors border-b border-border/50 last:border-0"
                        >
                          <span className="font-medium text-sm text-primary">/{r.title}</span>
                          <span className="text-xs text-muted-foreground truncate w-full">{r.content}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 items-end">

                    <Textarea 
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={lang === "ar" ? "اكتب رسالتك هنا..." : "Type your message..."}
                      className="resize-none min-h-[42px] max-h-32 bg-muted/50"
                      rows={1}
                      disabled={useReplyMutation.isPending}
                    />
                    <Button 
                      onClick={handleSendReply} 
                      disabled={!replyText.trim() || useReplyMutation.isPending}
                      className="h-[42px] px-4"
                    >
                      {useReplyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
          )}
        </div>

      </Card>
    </div>
  );
}
