import { useState, useRef } from "react";
import { useListClients, useCreateClient, useDeleteClient, useUpdateClient, getListClientsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, MoreVertical, Search, Edit, Mail, Laptop } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Users, UserCheck, Clock, ShieldCheck } from "lucide-react";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  macAddress: z.string().optional().or(z.literal("")),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const editFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  macAddress: z.string().optional().or(z.literal("")),
  password: z.string().optional().refine(val => !val || val.length >= 6, {
    message: "Password must be at least 6 characters if provided",
  }),
});

export default function AdminClients() {
  const { data: clients, isLoading } = useListClients();
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any>(null);
  
  const createClient = useCreateClient();
  const deleteClient = useDeleteClient();
  const updateClient = useUpdateClient();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { lang } = useLanguage();

  const totalClients = clients?.length ?? 0;
  const configuredClients = clients?.filter((c: any) => c.hasCompany).length ?? 0;
  const pendingClients = totalClients - configuredClients;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      macAddress: "",
      password: "",
    },
  });

  const editForm = useForm<z.infer<typeof editFormSchema>>({
    resolver: zodResolver(editFormSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      macAddress: "",
      password: "",
    },
  });

  const onEditClick = (client: any) => {
    setEditingClient(client);
    editForm.reset({
      name: client.name,
      username: client.username,
      email: client.email || "",
      macAddress: client.macAddress || "",
      password: "",
    });
  };

  const onSubmitEdit = (values: z.infer<typeof editFormSchema>) => {
    if (!editingClient) return;
    const payload: any = { ...values };
    if (!payload.password) delete payload.password;
    if (!payload.email) payload.email = "";
    if (payload.macAddress !== undefined) {
      payload.macAddress = payload.macAddress ? payload.macAddress.trim() : null;
    }
    
    updateClient.mutate({ id: editingClient.id, data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        setEditingClient(null);
        editForm.reset();
        toast({ title: lang === "ar" ? "تم تحديث العميل بنجاح" : "Client updated successfully" });
      },
      onError: (error: any) => {
        toast({ title: lang === "ar" ? "فشل تحديث العميل" : "Failed to update client", description: error.message, variant: "destructive" });
      }
    });
  };

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const payload: any = { ...values };
    if (!payload.macAddress || !payload.macAddress.trim()) {
      delete payload.macAddress;
    } else {
      payload.macAddress = payload.macAddress.trim();
    }

    createClient.mutate({ data: payload }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        setIsDialogOpen(false);
        form.reset();
        toast({ title: lang === "ar" ? "تم إنشاء العميل بنجاح" : "Client created successfully" });
      },
      onError: (error: any) => {
        toast({ title: lang === "ar" ? "فشل إنشاء العميل" : "Failed to create client", description: error.message, variant: "destructive" });
      }
    });
  };

  const handleDelete = (id: number) => {
    
    deleteClient.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        toast({ title: "Client deleted" });
      }
    });
  };

  const filteredClients = clients?.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.username.toLowerCase().includes(search.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase())) ||
    (c.lastLoginIp && c.lastLoginIp.toLowerCase().includes(search.toLowerCase())) ||
    (c.macAddress && c.macAddress.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* ── Hero Operations Banner matching Bot Manager Login aesthetic ── */}
      <div
        className="relative overflow-hidden rounded-3xl p-6 sm:p-8 text-white shadow-xl shadow-blue-600/15 border border-white/10"
        style={{
          background: "linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #1d4ed8 100%)",
        }}
      >
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 -top-10 w-48 h-48 bg-blue-300/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.18)] flex items-center justify-center shrink-0">
              <i className="fa-solid fa-users text-2xl sm:text-3xl text-white"></i>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-blue-100 mb-1.5 border border-white/20">
                
                {lang === "ar" ? "بوابة حسابات العملاء" : "Clients & Accounts"}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                {lang === "ar" ? "إدارة حسابات العملاء" : "Clients Directory"}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100/90 mt-1 max-w-xl leading-relaxed">
                {lang === "ar"
                  ? "إدارة صلاحيات الدخول، الحسابات المسجلة، وربط الشركات بلوحة تحكم العملاء."
                  : "Manage client platform access, credentials, and company attachments."}
              </p>
            </div>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-white hover:bg-blue-50 text-blue-700 font-bold shadow-lg shadow-black/10 rounded-xl px-5 py-2.5 h-auto transition-all shrink-0 cursor-pointer">
                <Plus className="w-4 h-4 mr-2" />
                {lang === "ar" ? "إضافة عميل جديد" : "Add Client"}
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
              <DialogDescription>Create a new client account. They will be able to log in and configure their company.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{lang === "ar" ? "الاسم بالكامل" : "Full Name"}</FormLabel>
                    <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="username" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{lang === "ar" ? "اسم المستخدم" : "Username"}</FormLabel>
                    <FormControl><Input placeholder="johndoe" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{lang === "ar" ? "بريد Gmail / البريد الإلكتروني (اختياري)" : "Gmail / Email (Optional)"}</FormLabel>
                    <FormControl><Input placeholder="example@gmail.com" type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="macAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{lang === "ar" ? "عنوان MAC (اختياري - يتم التقاطه تلقائياً عند الدخول)" : "MAC Address (Optional - auto-captured on login)"}</FormLabel>
                    <FormControl><Input placeholder="00:1A:2B:3C:4D:5E" className="font-mono" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{lang === "ar" ? "كلمة المرور" : "Password"}</FormLabel>
                    <FormControl><PasswordInput placeholder="••••••••" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="submit" disabled={createClient.isPending}>
                    {createClient.isPending ? "Creating..." : "Create Client"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
        
        <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Client</DialogTitle>
              <DialogDescription>Update client details or change their password.</DialogDescription>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4">
                <FormField control={editForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{lang === "ar" ? "الاسم بالكامل" : "Full Name"}</FormLabel>
                    <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="username" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{lang === "ar" ? "اسم المستخدم" : "Username"}</FormLabel>
                    <FormControl><Input placeholder="johndoe" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{lang === "ar" ? "بريد Gmail / البريد الإلكتروني" : "Gmail / Email"}</FormLabel>
                    <FormControl><Input placeholder="example@gmail.com" type="email" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="macAddress" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{lang === "ar" ? "عنوان MAC" : "MAC Address"}</FormLabel>
                    <FormControl><Input placeholder="00:1A:2B:3C:4D:5E" className="font-mono" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={editForm.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{lang === "ar" ? "كلمة المرور الجديدة (اختياري)" : "New Password (Optional)"}</FormLabel>
                    <FormControl><PasswordInput placeholder="Leave blank to keep current" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="submit" disabled={updateClient.isPending}>
                    {updateClient.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800/80 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 shadow-inner">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight leading-tight">{isLoading ? "—" : totalClients}</p>
            <p className="text-xs text-muted-foreground font-medium mt-1">{lang === "ar" ? "إجمالي العملاء" : "Total Clients"}</p>
          </div>
        </div>

        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800/80 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shadow-inner">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight leading-tight">{isLoading ? "—" : configuredClients}</p>
            <p className="text-xs text-muted-foreground font-medium mt-1">{lang === "ar" ? "حسابات مربوطة بشركات" : "Configured Companies"}</p>
          </div>
        </div>

        <div className="bg-card border border-[#DCE7FF] dark:border-slate-800/80 rounded-2xl p-5 flex items-center gap-4 shadow-md shadow-[#2D5BE3]/15 hover:shadow-lg hover:shadow-[#2D5BE3]/25 transition-all border-l-4 border-l-[#2D5BE3]">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-inner">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums tracking-tight leading-tight">{isLoading ? "—" : pendingClients}</p>
            <p className="text-xs text-muted-foreground font-medium mt-1">{lang === "ar" ? "قيد الإعداد (بدون شركة)" : "Pending Setup"}</p>
          </div>
        </div>
      </div>

      {/* ── Search Bar ── */}
      <div className="flex items-center space-x-2 bg-card px-4 py-3 rounded-2xl border border-[#DCE7FF] dark:border-slate-800 shadow-md shadow-[#2D5BE3]/15 border-l-4 border-l-[#2D5BE3]">
        <Search className="w-5 h-5 text-muted-foreground" />
        <Input 
          placeholder={lang === "ar" ? "بحث بالاسم، اسم المستخدم، بريد Gmail، عنوان IP، أو عنوان MAC..." : "Search clients by name, username, email, IP, or MAC..."} 
          className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-card rounded-2xl border border-[#DCE7FF] dark:border-slate-800 shadow-md shadow-[#2D5BE3]/15 overflow-hidden border-l-4 border-l-[#2D5BE3]">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[140px] font-semibold">{lang === "ar" ? "عنوان IP" : "IP"}</TableHead>
              <TableHead className="w-[160px] font-semibold">{lang === "ar" ? "عنوان MAC" : "MAC Address"}</TableHead>
              <TableHead className="font-semibold">{lang === "ar" ? "الاسم" : "Name"}</TableHead>
              <TableHead className="font-semibold">{lang === "ar" ? "اسم المستخدم" : "Username"}</TableHead>
              <TableHead className="font-semibold">{lang === "ar" ? "بريد Gmail" : "Gmail"}</TableHead>
              <TableHead className="font-semibold">{lang === "ar" ? "الحالة" : "Status"}</TableHead>
              <TableHead className="font-semibold">{lang === "ar" ? "تاريخ الإنشاء" : "Created"}</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))
            ) : filteredClients?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {lang === "ar" ? "لم يتم العثور على أي عملاء." : "No clients found."}
                </TableCell>
              </TableRow>
            ) : (
              filteredClients?.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    {client.lastLoginIp ? (
                      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-muted/80 text-foreground border border-border/60 inline-flex items-center gap-1.5" title={lang === "ar" ? "آخر عنوان IP لتسجيل الدخول" : "Last login IP"}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        {client.lastLoginIp}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs" title={lang === "ar" ? "لم يسجل الدخول بعد" : "No login recorded yet"}>
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {client.macAddress ? (
                      <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-muted/80 text-foreground border border-border/60 inline-flex items-center gap-1.5" title={lang === "ar" ? "عنوان MAC للجهاز" : "Device MAC address"}>
                        <Laptop className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        {client.macAddress}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs" title={lang === "ar" ? "لم يسجل بعد" : "Not recorded yet"}>
                        —
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>{client.username}</TableCell>
                  <TableCell>
                    {client.email ? (
                      <a
                        href={`mailto:${client.email}`}
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-mono"
                        dir="ltr"
                      >
                        <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        {client.email}
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {client.hasCompany ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500">
                        {lang === "ar" ? "تم الإعداد" : "Configured"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500">
                        {lang === "ar" ? "قيد الإعداد" : "Pending Setup"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{new Date(client.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditClick(client)}>
                          <Edit className="w-4 h-4 mr-2" />
                          {lang === "ar" ? "تعديل" : "Edit"}
                        </DropdownMenuItem>
                        <ConfirmDeleteDialog onConfirm={() => handleDelete(client.id)}>
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive focus:text-destructive">
                            <Trash2 className="w-4 h-4 mr-2" />
                            {lang === "ar" ? "حذف" : "Delete"}
                          </DropdownMenuItem>
                        </ConfirmDeleteDialog>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
