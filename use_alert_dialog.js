const fs = require('fs');

let content = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', 'utf8');

// Add AlertDialog imports
if (!content.includes('AlertDialog')) {
  content = content.replace(
    'import { Input } from "@/components/ui/input";',
    'import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";\nimport { Input } from "@/components/ui/input";'
  );
}

// Remove handleDelete function
content = content.replace(/  const handleDelete = \(leadId: number\) => \{\n    if \(confirm[\s\S]*?\}\n  \};\n/g, '');

const oldRowEnd = `                      <td className="px-4 sm:px-6 py-4 text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 sm:px-6 py-4">
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(lead.id)} disabled={deleteLeadMutation.isPending}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>`;

const newRowEnd = `                      <td className="px-4 sm:px-6 py-4 text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 sm:px-6 py-4">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={deleteLeadMutation.isPending}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{lang === "ar" ? "هل أنت متأكد من حذف هذا العميل؟" : "Delete lead entry?"}</AlertDialogTitle>
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
                      </td>
                    </tr>`;

// Check if oldRowEnd exists, then replace
if (content.includes('onClick={() => handleDelete(lead.id)}')) {
  // Regex to flexibly match the button to avoid whitespace issues
  content = content.replace(
    /<td className="px-4 sm:px-6 py-4">\s*<Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive\/10" onClick=\{\(\) => handleDelete\(lead\.id\)\} disabled=\{deleteLeadMutation\.isPending\}>\s*<Trash2 className="w-4 h-4" \/>\s*<\/Button>\s*<\/td>/g,
    `<td className="px-4 sm:px-6 py-4">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" disabled={deleteLeadMutation.isPending}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{lang === "ar" ? "هل أنت متأكد من حذف هذا العميل؟" : "Delete lead entry?"}</AlertDialogTitle>
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
                      </td>`
  );
  fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', content);
  console.log("Updated to use AlertDialog!");
} else {
  console.log("Could not find the button to replace");
}
