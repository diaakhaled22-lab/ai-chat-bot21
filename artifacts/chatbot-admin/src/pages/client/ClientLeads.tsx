import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Search, Download, Users, Clock, CalendarRange, Trash2, Plus, 
  Edit3, Phone, MessageCircle, CheckCircle2, Clock3, AlertCircle, 
  XCircle, Stethoscope, Calendar, Building2, Sparkles, Filter, 
  Check, FileText, UserCheck, Activity
} from "lucide-react";
import { 
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, 
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle, DialogTrigger 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { useGetClientChatLogRetention } from "@workspace/api-client-react";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";

interface Lead {
  id: number;
  companyId: number;
  channel: string;
  sessionId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  interest?: string | null;
  appointmentDate?: string | null;
  doctor?: string | null;
  status?: string;
  bookingType?: string | null;
  notes?: string | null;
  createdAt: string;
}

export default function ClientLeads() {
  const { t, lang } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mode: "clinic" (سجل حجوزات ومرضى العيادات) vs "general" (الوضع العام للعملاء المحتملين)
  const [crmMode, setCrmMode] = useState<"clinic" | "general">(() => {
    return (localStorage.getItem("leads_crm_mode") as "clinic" | "general") || "clinic";
  });

  const handleModeChange = (mode: "clinic" | "general") => {
    setCrmMode(mode);
    localStorage.setItem("leads_crm_mode", mode);
  };

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bookingTypeFilter, setBookingTypeFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");

  // Create / Edit modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    interest: "",
    appointmentDate: "",
    doctor: "",
    bookingType: "new_checkup",
    status: "pending",
    channel: "manual",
    notes: "",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      phone: "",
      email: "",
      interest: "",
      appointmentDate: "",
      doctor: "",
      bookingType: "new_checkup",
      status: "pending",
      channel: "manual",
      notes: "",
    });
  };

  const openEdit = (lead: Lead) => {
    setEditingLead(lead);
    setFormData({
      name: lead.name || "",
      phone: lead.phone || "",
      email: lead.email || "",
      interest: lead.interest || "",
      appointmentDate: lead.appointmentDate || "",
      doctor: lead.doctor || "",
      bookingType: lead.bookingType || "new_checkup",
      status: lead.status || "pending",
      channel: lead.channel || "manual",
      notes: lead.notes || "",
    });
  };

  const { data: retentionData, isLoading: retentionLoading } = useGetClientChatLogRetention();
  const currentRetention = retentionData?.retentionDays ?? 7;

  // Fetch leads
  const { data: leads, isLoading } = useQuery<Lead[]>({
    queryKey: ["client-leads"],
    queryFn: async () => {
      const res = await fetch("/api/client/leads", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch leads");
      return res.json();
    },
  });

  // Create Lead Mutation
  const createLeadMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await fetch("/api/client/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create lead/appointment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-leads"] });
      setIsAddOpen(false);
      resetForm();
      toast({
        title: lang === "ar" ? "تم تسجيل الحجز بنجاح" : "Booking created successfully",
        description: lang === "ar" ? "تمت إضافة المريض إلى سجل العيادة" : "Patient added to clinic registry",
      });
    },
    onError: (err: any) => {
      toast({
        title: lang === "ar" ? "خطأ في التسجيل" : "Failed to create",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Update Lead Mutation
  const updateLeadMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Partial<Lead> }) => {
      const res = await fetch(`/api/client/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update lead/appointment");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-leads"] });
      setEditingLead(null);
      toast({
        title: lang === "ar" ? "تم التحديث بنجاح" : "Updated successfully",
      });
    },
    onError: (err: any) => {
      toast({
        title: lang === "ar" ? "خطأ في التحديث" : "Failed to update",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Delete Lead Mutation
  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await fetch(`/api/client/leads/${leadId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete lead");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-leads"] });
      toast({
        title: lang === "ar" ? "تم الحذف بنجاح" : "Deleted successfully",
      });
    },
    onError: (err: any) => {
      toast({
        title: lang === "ar" ? "خطأ في الحذف" : "Failed to delete",
        description: err.message,
        variant: "destructive",
      });
    },
  });

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

  const allowedDates = useMemo(() => {
    return new Set(dateOptions.map((opt) => opt.value));
  }, [dateOptions]);

  // KPIs
  const stats = useMemo(() => {
    if (!leads) return { total: 0, pending: 0, confirmed: 0, completed: 0, cancelled: 0 };
    return {
      total: leads.length,
      pending: leads.filter((l) => (l.status || "pending") === "pending").length,
      confirmed: leads.filter((l) => l.status === "confirmed").length,
      completed: leads.filter((l) => l.status === "completed").length,
      cancelled: leads.filter((l) => l.status === "cancelled").length,
    };
  }, [leads]);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    if (!leads) return [];
    return leads.filter((l) => {
      const q = search.toLowerCase();
      const matchesSearch =
        (l.name || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q) ||
        (l.phone || "").toLowerCase().includes(q) ||
        (l.interest || "").toLowerCase().includes(q) ||
        (l.doctor || "").toLowerCase().includes(q) ||
        (l.appointmentDate || "").toLowerCase().includes(q) ||
        (l.notes || "").toLowerCase().includes(q);

      // Status filter
      const leadStatus = l.status || "pending";
      const matchesStatus = statusFilter === "all" || leadStatus === statusFilter;

      // Booking type filter
      const matchesBookingType =
        bookingTypeFilter === "all" || (l.bookingType || "new_checkup") === bookingTypeFilter;

      // Channel filter
      const matchesChannel = channelFilter === "all" || l.channel === channelFilter;

      // Date filter
      let matchesDate = false;
      if (l.createdAt) {
        const leadDate = new Date(l.createdAt).toISOString().split("T")[0];
        if (dateFilter === "all") {
          matchesDate = allowedDates.size > 0 ? allowedDates.has(leadDate) : true;
        } else {
          matchesDate = leadDate === dateFilter;
        }
      } else {
        matchesDate = dateFilter === "all";
      }

      return matchesSearch && matchesStatus && matchesBookingType && matchesChannel && matchesDate;
    });
  }, [leads, search, dateFilter, statusFilter, bookingTypeFilter, channelFilter, allowedDates]);

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredLeads.length) return;
    const headers =
      crmMode === "clinic"
        ? [
            "Patient Name",
            "Phone",
            "Email",
            "Specialty / Symptoms",
            "Doctor",
            "Appointment Date",
            "Booking Type",
            "Status",
            "Channel",
            "Notes",
            "Created Date",
          ]
        : ["Name", "Email", "Phone", "Interest", "Channel", "Date"];

    const rows =
      crmMode === "clinic"
        ? filteredLeads.map((l) => [
            `"${l.name || ""}"`,
            `"${l.phone || ""}"`,
            `"${l.email || ""}"`,
            `"${l.interest || ""}"`,
            `"${l.doctor || ""}"`,
            `"${l.appointmentDate || ""}"`,
            `"${l.bookingType || "new_checkup"}"`,
            `"${l.status || "pending"}"`,
            `"${l.channel || ""}"`,
            `"${(l.notes || "").replace(/\n/g, " ")}"`,
            `"${new Date(l.createdAt).toLocaleString()}"`,
          ])
        : filteredLeads.map((l) => [
            `"${l.name || ""}"`,
            `"${l.email || ""}"`,
            `"${l.phone || ""}"`,
            `"${l.interest || ""}"`,
            `"${l.channel || ""}"`,
            `"${new Date(l.createdAt).toLocaleString()}"`,
          ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${crmMode === "clinic" ? "clinic_appointments" : "leads"}_export_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getChannelBadge = (channel: string) => {
    switch (channel) {
      case "whatsapp":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30 gap-1 font-medium">
            <i className="fa-brands fa-whatsapp text-xs"></i>
            {lang === "ar" ? "واتساب" : "WhatsApp"}
          </Badge>
        );
      case "telegram":
        return (
          <Badge className="bg-sky-500/10 text-sky-600 hover:bg-sky-500/20 border-sky-500/30 gap-1 font-medium">
            <i className="fa-brands fa-telegram text-xs"></i>
            {lang === "ar" ? "تليجرام" : "Telegram"}
          </Badge>
        );
      case "messenger":
        return (
          <Badge className="bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 border-indigo-500/30 gap-1 font-medium">
            <i className="fa-brands fa-facebook-messenger text-xs"></i>
            {lang === "ar" ? "ماسنجر" : "Messenger"}
          </Badge>
        );
      case "website":
        return (
          <Badge className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 border-blue-500/30 gap-1 font-medium">
            <i className="fa-solid fa-globe text-xs"></i>
            {lang === "ar" ? "الموقع" : "Website"}
          </Badge>
        );
      case "webhook":
        return (
          <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/30 gap-1 font-medium">
            <Activity className="w-3 h-3" />
            {lang === "ar" ? "ويب هوك" : "Webhook"}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1 font-medium">
            <UserCheck className="w-3 h-3" />
            {lang === "ar" ? "تسجيل يدوي" : "Manual"}
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: string = "pending", leadId?: number) => {
    const handleQuickStatusChange = (newStatus: string) => {
      if (leadId && newStatus !== status) {
        updateLeadMutation.mutate({ id: leadId, updates: { status: newStatus } });
      }
    };

    const statusConfig: Record<string, { labelAr: string; labelEn: string; color: string; icon: any }> = {
      pending: {
        labelAr: "قيد الانتظار",
        labelEn: "Pending",
        color: "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20",
        icon: Clock3,
      },
      confirmed: {
        labelAr: "حجز مؤكد",
        labelEn: "Confirmed",
        color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20",
        icon: CheckCircle2,
      },
      completed: {
        labelAr: "تم الكشف",
        labelEn: "Completed",
        color: "bg-blue-500/10 text-blue-600 border-blue-500/30 hover:bg-blue-500/20",
        icon: Stethoscope,
      },
      cancelled: {
        labelAr: "ملغي",
        labelEn: "Cancelled",
        color: "bg-rose-500/10 text-rose-600 border-rose-500/30 hover:bg-rose-500/20",
        icon: XCircle,
      },
    };

    const cfg = statusConfig[status] || statusConfig.pending;
    const Icon = cfg.icon;

    if (!leadId) {
      return (
        <Badge variant="outline" className={`${cfg.color} gap-1 font-medium px-2.5 py-1`}>
          <Icon className="w-3 h-3" />
          {lang === "ar" ? cfg.labelAr : cfg.labelEn}
        </Badge>
      );
    }

    return (
      <Select value={status} onValueChange={handleQuickStatusChange}>
        <SelectTrigger className={`h-8 text-xs font-semibold rounded-lg border ${cfg.color} px-2.5 py-1 w-[125px]`}>
          <div className="flex items-center gap-1.5 truncate">
            <Icon className="w-3 h-3 shrink-0" />
            <SelectValue>{lang === "ar" ? cfg.labelAr : cfg.labelEn}</SelectValue>
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">
            <div className="flex items-center gap-2 text-amber-600">
              <Clock3 className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "قيد الانتظار" : "Pending"}</span>
            </div>
          </SelectItem>
          <SelectItem value="confirmed">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "حجز مؤكد" : "Confirmed"}</span>
            </div>
          </SelectItem>
          <SelectItem value="completed">
            <div className="flex items-center gap-2 text-blue-600">
              <Stethoscope className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "تم الكشف" : "Completed"}</span>
            </div>
          </SelectItem>
          <SelectItem value="cancelled">
            <div className="flex items-center gap-2 text-rose-600">
              <XCircle className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "ملغي" : "Cancelled"}</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    );
  };

  const getBookingTypeBadge = (type?: string | null) => {
    switch (type) {
      case "follow_up":
        return (
          <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500/20 text-[11px]">
            {lang === "ar" ? "إعادة كشف / متابعة" : "Follow-up"}
          </Badge>
        );
      case "consultation":
        return (
          <Badge variant="outline" className="bg-cyan-500/10 text-cyan-600 border-cyan-500/20 text-[11px]">
            {lang === "ar" ? "استشارة طبية" : "Consultation"}
          </Badge>
        );
      case "new_checkup":
      default:
        return (
          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-[11px]">
            {lang === "ar" ? "كشف جديد" : "New Checkup"}
          </Badge>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-background/50 p-4 sm:p-6 space-y-4 sm:space-y-6 w-full max-w-full overflow-hidden">
      {/* ── Top Hero Operations Banner with Dual-Mode Switcher ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background:
            crmMode === "clinic"
              ? "linear-gradient(135deg, #0f766e 0%, #0d9488 50%, #14b8a6 100%)"
              : "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-teal-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              {crmMode === "clinic" ? (
                <Stethoscope className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
              ) : (
                <i className="fa-solid fa-users text-2xl sm:text-3xl text-white"></i>
              )}
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-white/90 mb-1.5 border border-white/20">
                <Sparkles className="w-3 h-3 text-amber-300" />
                {crmMode === "clinic"
                  ? lang === "ar"
                    ? "نظام حجوزات ومرضى العيادات الشامل"
                    : "Clinic & Appointments CRM"
                  : lang === "ar"
                  ? "قاعدة العملاء المحتملين"
                  : "AI Lead Generation"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {crmMode === "clinic"
                  ? lang === "ar"
                    ? "سجل حجوزات ومرضى العيادات (Clinic CRM)"
                    : "Clinic & Patients CRM"
                  : lang === "ar"
                  ? "العملاء المحتملين (Leads CRM)"
                  : "Leads CRM"}
              </h1>
              <p className="text-xs sm:text-sm text-white/90 mt-1 max-w-xl leading-relaxed">
                {crmMode === "clinic"
                  ? lang === "ar"
                    ? "إدارة مواعيد الكشف، الأطباء، وحجوزات المرضى الواردة تلقائياً عبر (واتساب، تليجرام، ماسنجر، الموقع، والويب هوك)."
                    : "Manage appointments, doctors, and patient bookings captured across WhatsApp, Telegram, Messenger, Widget & Webhook."
                  : lang === "ar"
                  ? "تتبع بيانات العملاء المهتمين التي يجمعها الذكاء الاصطناعي تلقائياً من كافة القنوات."
                  : "Track customer contact details collected automatically by AI across all channels."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Mode Switcher */}
            <div className="bg-black/20 p-1 rounded-2xl border border-white/20 backdrop-blur-md flex items-center">
              <Button
                variant={crmMode === "clinic" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleModeChange("clinic")}
                className={`rounded-xl text-xs font-semibold px-3 py-1.5 transition-all ${
                  crmMode === "clinic"
                    ? "bg-white text-teal-800 shadow-md hover:bg-white/90"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5 mr-1.5 ml-1.5" />
                {lang === "ar" ? "وضع العيادات والمواعيد" : "Clinic Mode"}
              </Button>
              <Button
                variant={crmMode === "general" ? "default" : "ghost"}
                size="sm"
                onClick={() => handleModeChange("general")}
                className={`rounded-xl text-xs font-semibold px-3 py-1.5 transition-all ${
                  crmMode === "general"
                    ? "bg-white text-blue-800 shadow-md hover:bg-white/90"
                    : "text-white/80 hover:text-white hover:bg-white/10"
                }`}
              >
                <Building2 className="w-3.5 h-3.5 mr-1.5 ml-1.5" />
                {lang === "ar" ? "الوضع العام" : "General Mode"}
              </Button>
            </div>

            {/* Add Appointment Button */}
            <Button
              onClick={() => {
                resetForm();
                setIsAddOpen(true);
              }}
              className="bg-white text-teal-900 hover:bg-white/90 font-bold rounded-xl text-xs sm:text-sm shadow-md"
            >
              <Plus className="w-4 h-4 mr-1.5 ml-1.5" />
              {crmMode === "clinic"
                ? lang === "ar"
                  ? "تسجيل كشف / مريض"
                  : "New Appointment"
                : lang === "ar"
                ? "إضافة عميل يدوي"
                : "Add Lead"}
            </Button>

            {/* Export CSV */}
            <Button
              onClick={handleExportCSV}
              disabled={!filteredLeads.length}
              className="bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-md font-semibold rounded-xl text-xs sm:text-sm shadow-sm"
            >
              <Download className="w-4 h-4 mr-1.5 ml-1.5" />
              {lang === "ar" ? "تصدير Excel" : "Export CSV"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Clinic KPIs Bar (Shown in Clinic Mode) ── */}
      {crmMode === "clinic" && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
          <Card className="p-3 sm:p-4 rounded-2xl border bg-card shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                {lang === "ar" ? "إجمالي الحجوزات" : "Total Bookings"}
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-foreground mt-0.5">{stats.total}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 flex items-center justify-center">
              <Stethoscope className="w-5 h-5" />
            </div>
          </Card>

          <Card className="p-3 sm:p-4 rounded-2xl border bg-card shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-amber-600">
                {lang === "ar" ? "قيد الانتظار" : "Pending"}
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-amber-600 mt-0.5">{stats.pending}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Clock3 className="w-5 h-5" />
            </div>
          </Card>

          <Card className="p-3 sm:p-4 rounded-2xl border bg-card shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-emerald-600">
                {lang === "ar" ? "حجوزات مؤكدة" : "Confirmed"}
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-emerald-600 mt-0.5">{stats.confirmed}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </Card>

          <Card className="p-3 sm:p-4 rounded-2xl border bg-card shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-blue-600">
                {lang === "ar" ? "تم الكشف" : "Completed"}
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-blue-600 mt-0.5">{stats.completed}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
          </Card>

          <Card className="p-3 sm:p-4 rounded-2xl border bg-card shadow-sm flex items-center justify-between col-span-2 sm:col-span-1">
            <div>
              <p className="text-[11px] font-medium text-rose-600">
                {lang === "ar" ? "ملغية" : "Cancelled"}
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-rose-600 mt-0.5">{stats.cancelled}</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
              <XCircle className="w-5 h-5" />
            </div>
          </Card>
        </div>
      )}

      {/* Retention Policy Banner */}
      <Card className="bg-card border border-border rounded-2xl shadow-sm shrink-0 border-l-4 border-l-teal-600">
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">
                  {lang === "ar" ? "سياسة الاحتفاظ بالبيانات وسجل الحجوزات" : "Data Retention Policy"}
                </p>
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium">
                  {lang === "ar" ? "إعدادات الإدارة" : "Configured by Administrator"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {retentionLoading ? (
                  <Skeleton className="h-3 w-48 mt-1" />
                ) : lang === "ar" ? (
                  `يتم أرشفة ومسح بيانات الحجوزات والعملاء تلقائياً بعد ${currentRetention} ${currentRetention === 1 ? "يوم" : currentRetention === 2 ? "يومين" : "أيام"} حسب سياسة الأمان.`
                ) : (
                  `Leads and bookings are automatically retained for ${currentRetention} day${currentRetention === 1 ? "" : "s"} as set by your administrator.`
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 bg-muted/50 border border-border px-3 py-1.5 rounded-lg flex items-center gap-2 self-start sm:self-auto">
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

      {/* ── Filters Bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 shrink-0 w-full">
        {/* Search */}
        <div className="lg:col-span-2 flex items-center bg-card px-3 py-1.5 rounded-xl border border-border">
          <Search className="w-4 h-4 ml-2 mr-2 text-muted-foreground shrink-0" />
          <Input
            placeholder={
              crmMode === "clinic"
                ? lang === "ar"
                  ? "ابحث باسم المريض، الهاتف، الطبيب، التخصص..."
                  : "Search patient, phone, doctor, specialty..."
                : lang === "ar"
                ? "ابحث بالاسم، الهاتف، الايميل، الاهتمام..."
                : "Search name, phone, email, interest..."
            }
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-xs sm:text-sm h-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-11 bg-card text-xs">
            <div className="flex items-center gap-2 truncate">
              <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder={lang === "ar" ? "حالة الحجز" : "Status"} />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كافة الحالات" : "All Statuses"}</SelectItem>
            <SelectItem value="pending">{lang === "ar" ? "⏳ قيد الانتظار" : "Pending"}</SelectItem>
            <SelectItem value="confirmed">{lang === "ar" ? "✅ مؤكد" : "Confirmed"}</SelectItem>
            <SelectItem value="completed">{lang === "ar" ? "🩺 تم الكشف" : "Completed"}</SelectItem>
            <SelectItem value="cancelled">{lang === "ar" ? "❌ ملغي" : "Cancelled"}</SelectItem>
          </SelectContent>
        </Select>

        {/* Channel Filter */}
        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="h-11 bg-card text-xs">
            <div className="flex items-center gap-2 truncate">
              <Activity className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder={lang === "ar" ? "القناة" : "Channel"} />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كافة القنوات" : "All Channels"}</SelectItem>
            <SelectItem value="whatsapp">WhatsApp (واتساب)</SelectItem>
            <SelectItem value="telegram">Telegram (تليجرام)</SelectItem>
            <SelectItem value="messenger">Messenger (ماسنجر)</SelectItem>
            <SelectItem value="website">Website (الموقع)</SelectItem>
            <SelectItem value="webhook">Webhook (ويب هوك)</SelectItem>
            <SelectItem value="manual">{lang === "ar" ? "تسجيل يدوي" : "Manual"}</SelectItem>
          </SelectContent>
        </Select>

        {/* Date Filter */}
        <Select value={dateFilter} onValueChange={setDateFilter}>
          <SelectTrigger className="h-11 bg-card text-xs">
            <div className="flex items-center gap-2 truncate">
              <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <SelectValue placeholder={lang === "ar" ? "كل الأيام" : "All Days"} />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "ar" ? "كل الأيام" : "All Days"}</SelectItem>
            {dateOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Main Leads / Bookings Table ── */}
      <div className="bg-card border border-[#DCE7FF] dark:border-slate-800 rounded-2xl overflow-hidden shadow-md shadow-[#2D5BE3]/10 flex-1 flex flex-col min-h-[400px] border-l-4 border-l-teal-600">
        <div className="overflow-x-auto flex-1 max-w-[100vw] sm:max-w-none">
          <table className="w-full text-xs sm:text-sm text-left whitespace-nowrap min-w-[950px]">
            <thead className="text-[11px] font-bold text-muted-foreground bg-muted/40 uppercase sticky top-0 border-b border-border">
              {crmMode === "clinic" ? (
                <tr>
                  <th className="px-4 py-3.5">{lang === "ar" ? "المريض" : "Patient"}</th>
                  <th className="px-4 py-3.5">{lang === "ar" ? "الهاتف والتواصل" : "Contact & Phone"}</th>
                  <th className="px-4 py-3.5">{lang === "ar" ? "الطبيب / التخصص" : "Doctor / Specialty"}</th>
                  <th className="px-4 py-3.5">{lang === "ar" ? "موعد الكشف المطلوب" : "Appointment Time"}</th>
                  <th className="px-4 py-3.5">{lang === "ar" ? "نوع الحجز" : "Booking Type"}</th>
                  <th className="px-4 py-3.5">{lang === "ar" ? "القناة" : "Channel"}</th>
                  <th className="px-4 py-3.5">{lang === "ar" ? "حالة الحجز" : "Status"}</th>
                  <th className="px-4 py-3.5">{lang === "ar" ? "تاريخ الطلب" : "Created"}</th>
                  <th className="px-4 py-3.5 text-center w-20">{lang === "ar" ? "إجراءات" : "Actions"}</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "الاسم" : "Name"}</th>
                  <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "الايميل" : "Email"}</th>
                  <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "رقم الهاتف" : "Phone"}</th>
                  <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "الاهتمام" : "Interest"}</th>
                  <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "القناة" : "Channel"}</th>
                  <th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "التاريخ" : "Date"}</th>
                  <th className="px-4 sm:px-6 py-4 font-semibold text-center w-20">{lang === "ar" ? "إجراءات" : "Actions"}</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-6 w-24 rounded-full" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-4 text-center"><Skeleton className="h-8 w-16 mx-auto rounded-md" /></td>
                  </tr>
                ))
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={crmMode === "clinic" ? 9 : 7} className="px-4 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      {crmMode === "clinic" ? (
                        <Stethoscope className="w-12 h-12 text-teal-600/30 mb-3" />
                      ) : (
                        <Users className="w-12 h-12 text-muted-foreground/30 mb-3" />
                      )}
                      <p className="text-sm font-semibold">
                        {crmMode === "clinic"
                          ? lang === "ar"
                            ? "لا توجد حجوزات أو مرضى مسجلين حتى الآن."
                            : "No clinic appointments or patients found yet."
                          : lang === "ar"
                          ? "لا يوجد عملاء محتملين مسجلين بعد."
                          : "No leads found yet."}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                        {lang === "ar"
                          ? "عندما يتواصل المرضى أو العملاء عبر واتساب، تليجرام، ماسنجر أو الموقع، سيقوم البوت باستخراج الحجوزات وتأكيدها هنا تلقائياً."
                          : "When customers chat via WhatsApp, Telegram, Messenger or Website, AI extracts appointments and lists them here automatically."}
                      </p>
                      <Button
                        size="sm"
                        onClick={() => {
                          resetForm();
                          setIsAddOpen(true);
                        }}
                        className="mt-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1 ml-1" />
                        {lang === "ar" ? "تسجيل مريض جديد يدوياً" : "Add Patient Manually"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) =>
                  crmMode === "clinic" ? (
                    <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
                      {/* Patient Name & Avatar */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 font-bold flex items-center justify-center text-xs shrink-0 border border-teal-500/20">
                            {(lead.name || "م")[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground text-xs sm:text-sm">
                              {lead.name || (lang === "ar" ? "مريض غير محدد" : "Unnamed Patient")}
                            </div>
                            {lead.notes && (
                              <div className="text-[11px] text-muted-foreground truncate max-w-[180px]" title={lead.notes}>
                                {lead.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact & Phone */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs text-foreground font-medium" dir="ltr">
                            {lead.phone || "-"}
                          </span>
                          {lead.phone && (
                            <>
                              <a
                                href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`}
                                target="_blank"
                                rel="noreferrer"
                                title={lang === "ar" ? "محادثة واتساب مباشرة" : "Chat on WhatsApp"}
                                className="w-6 h-6 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 flex items-center justify-center transition-colors"
                              >
                                <i className="fa-brands fa-whatsapp text-xs"></i>
                              </a>
                              <a
                                href={`tel:${lead.phone}`}
                                title={lang === "ar" ? "اتصال هاتفي" : "Direct Call"}
                                className="w-6 h-6 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 flex items-center justify-center transition-colors"
                              >
                                <Phone className="w-3 h-3" />
                              </a>
                            </>
                          )}
                        </div>
                        {lead.email && (
                          <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                            {lead.email}
                          </div>
                        )}
                      </td>

                      {/* Doctor / Specialty */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded bg-teal-500/10 text-teal-600 flex items-center justify-center shrink-0">
                            <Stethoscope className="w-3 h-3" />
                          </div>
                          <div>
                            <div className="font-medium text-xs text-foreground">
                              {lead.doctor || (lang === "ar" ? "عيادة عامة / لم يحدد" : "General Clinic")}
                            </div>
                            {lead.interest && (
                              <div className="text-[10px] text-teal-700 dark:text-teal-300 font-medium truncate max-w-[140px]" title={lead.interest}>
                                {lead.interest}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Appointment Time */}
                      <td className="px-4 py-3.5">
                        {lead.appointmentDate ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-800 dark:text-teal-200 text-xs font-semibold">
                            <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span dir="auto">{lead.appointmentDate}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs italic">
                            {lang === "ar" ? "لم يحدد بعد" : "Not specified"}
                          </span>
                        )}
                      </td>

                      {/* Booking Type */}
                      <td className="px-4 py-3.5">{getBookingTypeBadge(lead.bookingType)}</td>

                      {/* Channel */}
                      <td className="px-4 py-3.5">{getChannelBadge(lead.channel)}</td>

                      {/* Status */}
                      <td className="px-4 py-3.5">{getStatusBadge(lead.status, lead.id)}</td>

                      {/* Created At */}
                      <td className="px-4 py-3.5 text-xs text-muted-foreground">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(lead)}
                            title={lang === "ar" ? "تعديل الحجز" : "Edit booking"}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                                disabled={deleteLeadMutation.isPending}
                                title={lang === "ar" ? "حذف الحجز" : "Delete"}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {lang === "ar" ? "هل أنت متأكد من حذف هذا الحجز؟" : "Delete booking record?"}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {lang === "ar"
                                    ? `سيتم مسح حجز المريض "${lead.name || lead.phone || "المريض"}" نهائياً من قاعدة البيانات.`
                                    : "This will permanently remove this patient appointment record."}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteLeadMutation.mutate(lead.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {lang === "ar" ? "حذف" : "Delete"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    // General Mode Row
                    <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 sm:px-6 py-4 font-medium text-xs sm:text-sm">{lead.name || "-"}</td>
                      <td className="px-4 sm:px-6 py-4 text-muted-foreground text-xs">{lead.email || "-"}</td>
                      <td className="px-4 sm:px-6 py-4 font-mono text-xs">{lead.phone || "-"}</td>
                      <td className="px-4 sm:px-6 py-4 text-xs">{lead.interest || "-"}</td>
                      <td className="px-4 sm:px-6 py-4">{getChannelBadge(lead.channel)}</td>
                      <td className="px-4 sm:px-6 py-4 text-muted-foreground text-xs">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(lead)}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={deleteLeadMutation.isPending}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {lang === "ar" ? "هل أنت متأكد من حذف هذا العميل؟" : "Delete lead entry?"}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  {lang === "ar"
                                    ? "سيؤدي هذا إلى إزالة هذا العميل نهائياً من قاعدة البيانات. لا يمكن التراجع عن هذا الإجراء."
                                    : "This permanently removes this lead. This action cannot be undone."}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteLeadMutation.mutate(lead.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {lang === "ar" ? "حذف" : "Delete"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Dialog: Add New Booking / Patient ── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Stethoscope className="w-5 h-5 text-teal-600" />
              {lang === "ar" ? "تسجيل مريض / حجز كشف جديد" : "New Patient / Booking Entry"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar"
                ? "أدخل بيانات المريض وموعد الكشف لإضافته مباشرة إلى سجل العيادة ومتابعة حالته."
                : "Fill in patient and booking details to record the appointment directly into the CRM."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "اسم المريض *" : "Patient Name *"}
              </label>
              <Input
                placeholder={lang === "ar" ? "مثال: محمد أحمد علي" : "e.g. John Doe"}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "رقم الهاتف / واتساب *" : "Phone / WhatsApp *"}
              </label>
              <Input
                placeholder="01012345678"
                dir="ltr"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "البريد الإلكتروني" : "Email"}
              </label>
              <Input
                placeholder="patient@example.com"
                dir="ltr"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "الطبيب المعالج" : "Doctor / Specialist"}
              </label>
              <Input
                placeholder={lang === "ar" ? "مثال: د. أحمد فؤاد (باطنة)" : "e.g. Dr. John"}
                value={formData.doctor}
                onChange={(e) => setFormData({ ...formData, doctor: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "التخصص أو الشكوى" : "Specialty / Service"}
              </label>
              <Input
                placeholder={lang === "ar" ? "مثال: كشف أسنان، زراعة" : "e.g. Dental checkup"}
                value={formData.interest}
                onChange={(e) => setFormData({ ...formData, interest: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "موعد وتاريخ الكشف" : "Appointment Date & Time"}
              </label>
              <Input
                placeholder={lang === "ar" ? "مثال: غداً الساعة 6 مساءً أو 2026-10-30 18:00" : "e.g. 2026-10-30 18:00"}
                value={formData.appointmentDate}
                onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "نوع الحجز" : "Booking Type"}
              </label>
              <Select
                value={formData.bookingType}
                onValueChange={(val) => setFormData({ ...formData, bookingType: val })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_checkup">{lang === "ar" ? "كشف جديد" : "New Checkup"}</SelectItem>
                  <SelectItem value="follow_up">{lang === "ar" ? "إعادة كشف / متابعة" : "Follow-up"}</SelectItem>
                  <SelectItem value="consultation">{lang === "ar" ? "استشارة طبية" : "Consultation"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "حالة الحجز" : "Status"}
              </label>
              <Select
                value={formData.status}
                onValueChange={(val) => setFormData({ ...formData, status: val })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{lang === "ar" ? "قيد الانتظار" : "Pending"}</SelectItem>
                  <SelectItem value="confirmed">{lang === "ar" ? "حجز مؤكد" : "Confirmed"}</SelectItem>
                  <SelectItem value="completed">{lang === "ar" ? "تم الكشف" : "Completed"}</SelectItem>
                  <SelectItem value="cancelled">{lang === "ar" ? "ملغي" : "Cancelled"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "القناة" : "Channel"}
              </label>
              <Select
                value={formData.channel}
                onValueChange={(val) => setFormData({ ...formData, channel: val })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">{lang === "ar" ? "تسجيل يدوي (استقبال العيادة)" : "Manual (Reception)"}</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp (واتساب)</SelectItem>
                  <SelectItem value="telegram">Telegram (تليجرام)</SelectItem>
                  <SelectItem value="messenger">Messenger (ماسنجر)</SelectItem>
                  <SelectItem value="website">Website (الموقع)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "ملاحظات طبية أو أعراض المريض" : "Medical Notes / Symptoms"}
              </label>
              <Textarea
                placeholder={lang === "ar" ? "أدخل أية أعراض أو ملاحظات تخص المريض..." : "Any patient symptoms or doctor instructions..."}
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => createLeadMutation.mutate(formData)}
              disabled={createLeadMutation.isPending || (!formData.name && !formData.phone)}
              className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
            >
              {createLeadMutation.isPending ? (
                <Skeleton className="w-16 h-4" />
              ) : lang === "ar" ? (
                "حفظ الحجز"
              ) : (
                "Save Booking"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Edit Booking / Patient ── */}
      <Dialog open={Boolean(editingLead)} onOpenChange={(open) => !open && setEditingLead(null)}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Edit3 className="w-5 h-5 text-teal-600" />
              {lang === "ar" ? "تعديل بيانات الحجز / المريض" : "Edit Booking Details"}
            </DialogTitle>
            <DialogDescription>
              {lang === "ar" ? "تعديل موعد الكشف، الطبيب، الحالة، أو الملاحظات." : "Update appointment details, doctor, status, or notes."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "اسم المريض" : "Patient Name"}
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "رقم الهاتف" : "Phone"}
              </label>
              <Input
                dir="ltr"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "البريد الإلكتروني" : "Email"}
              </label>
              <Input
                dir="ltr"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "الطبيب المعالج" : "Doctor"}
              </label>
              <Input
                value={formData.doctor}
                onChange={(e) => setFormData({ ...formData, doctor: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "التخصص أو الشكوى" : "Specialty / Service"}
              </label>
              <Input
                value={formData.interest}
                onChange={(e) => setFormData({ ...formData, interest: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "موعد وتاريخ الكشف" : "Appointment Time"}
              </label>
              <Input
                value={formData.appointmentDate}
                onChange={(e) => setFormData({ ...formData, appointmentDate: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "نوع الحجز" : "Booking Type"}
              </label>
              <Select
                value={formData.bookingType}
                onValueChange={(val) => setFormData({ ...formData, bookingType: val })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_checkup">{lang === "ar" ? "كشف جديد" : "New Checkup"}</SelectItem>
                  <SelectItem value="follow_up">{lang === "ar" ? "إعادة كشف / متابعة" : "Follow-up"}</SelectItem>
                  <SelectItem value="consultation">{lang === "ar" ? "استشارة طبية" : "Consultation"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "حالة الحجز" : "Status"}
              </label>
              <Select
                value={formData.status}
                onValueChange={(val) => setFormData({ ...formData, status: val })}
              >
                <SelectTrigger className="h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{lang === "ar" ? "⏳ قيد الانتظار" : "Pending"}</SelectItem>
                  <SelectItem value="confirmed">{lang === "ar" ? "✅ حجز مؤكد" : "Confirmed"}</SelectItem>
                  <SelectItem value="completed">{lang === "ar" ? "🩺 تم الكشف" : "Completed"}</SelectItem>
                  <SelectItem value="cancelled">{lang === "ar" ? "❌ ملغي" : "Cancelled"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-foreground">
                {lang === "ar" ? "ملاحظات طبية أو أعراض المريض" : "Notes / Symptoms"}
              </label>
              <Textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingLead(null)}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              onClick={() => {
                if (editingLead) {
                  updateLeadMutation.mutate({
                    id: editingLead.id,
                    updates: {
                      name: formData.name,
                      phone: formData.phone,
                      email: formData.email,
                      doctor: formData.doctor,
                      interest: formData.interest,
                      appointmentDate: formData.appointmentDate,
                      bookingType: formData.bookingType,
                      status: formData.status,
                      notes: formData.notes,
                    },
                  });
                }
              }}
              disabled={updateLeadMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white font-semibold"
            >
              {updateLeadMutation.isPending ? (
                <Skeleton className="w-16 h-4" />
              ) : lang === "ar" ? (
                "حفظ التغييرات"
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
