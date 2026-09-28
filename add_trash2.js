const fs = require('fs');

let content = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', 'utf8');

if (!content.includes('Trash2')) {
  content = content.replace(
    'import { Search, Download, Users, Clock, CalendarRange } from "lucide-react";',
    'import { Search, Download, Users, Clock, CalendarRange, Trash2 } from "lucide-react";'
  );
  
  if (!content.includes('useQueryClient')) {
    content = content.replace(
      'import { useQuery } from "@tanstack/react-query";',
      'import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";'
    );
  }

  const mutationCode = `
  const queryClient = useQueryClient();

  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: number) => {
      const res = await fetch(\`/api/client/leads/\${leadId}\`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to delete lead');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-leads"] });
    }
  });

  const handleDelete = (leadId: number) => {
    if (confirm(lang === "ar" ? "هل أنت متأكد من حذف هذا العميل؟" : "Are you sure you want to delete this lead?")) {
      deleteLeadMutation.mutate(leadId);
    }
  };
`;

  content = content.replace(
    '  const [search, setSearch] = useState("");',
    '  const [search, setSearch] = useState("");\n' + mutationCode
  );

  content = content.replace(
    '<th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "التاريخ" : "Date"}</th>',
    '<th className="px-4 sm:px-6 py-4 font-semibold">{lang === "ar" ? "التاريخ" : "Date"}</th>\n                  <th className="px-4 sm:px-6 py-4 font-semibold w-12"></th>'
  );

  content = content.replace(
    '<td className="px-4 sm:px-6 py-4"><Skeleton className="h-4 w-24" /></td>\n                    </tr>',
    '<td className="px-4 sm:px-6 py-4"><Skeleton className="h-4 w-24" /></td>\n                      <td className="px-4 sm:px-6 py-4"><Skeleton className="h-8 w-8 rounded-md" /></td>\n                    </tr>'
  );

  content = content.replace('colSpan={6}', 'colSpan={7}');

  const rowEndCode = `
                      <td className="px-4 sm:px-6 py-4 text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 sm:px-6 py-4">
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(lead.id)} disabled={deleteLeadMutation.isPending}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
`;

  content = content.replace(
    '<td className="px-4 sm:px-6 py-4 text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</td>\n                    </tr>',
    rowEndCode.trim() + '\n                    </tr>'
  );

  fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', content);
  console.log("Successfully added trash icon to ClientLeads.tsx");
} else {
  console.log("Already has Trash2");
}
