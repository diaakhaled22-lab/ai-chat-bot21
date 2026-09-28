const fs = require('fs');

let content = fs.readFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', 'utf8');

const lines = content.split('\n');
const newLines = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('const queryClient = useQueryClient();')) {
    skip = true;
  }
  
  if (skip && line.includes('const { data: retentionData, isLoading: retentionLoading } = useGetClientChatLogRetention();')) {
    skip = false;
    // Insert the block here exactly once
    newLines.push(`  const queryClient = useQueryClient();

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
  };`);
    newLines.push(line);
    continue;
  }
  
  if (!skip) {
    newLines.push(line);
  }
}

fs.writeFileSync('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', newLines.join('\n'));
console.log("Fixed duplicates!");
