const fs = require('fs');

function fixFile(file) {
  if (!fs.existsSync(file)) return;
  let c = fs.readFileSync(file, 'utf8');

  // Replace simple Trash2 buttons calling handleDelete
  // E.g. <button onClick={() => handleDelete(log.id)} ...> <Trash2 /> </button>
  const simpleButtonRegex = /<button[^>]*?onClick=\{\(\)\s*=>\s*handleDelete\([^)]+\)\}[^>]*?>[\s\S]*?<Trash2[^>]*?>[\s\S]*?<\/button>/g;
  c = c.replace(simpleButtonRegex, (match) => {
    const idMatch = match.match(/handleDelete\(([^)]+)\)/);
    if (!idMatch) return match;
    const id = idMatch[1];
    
    // strip onClick from button
    const newButton = match.replace(/onClick=\{[^}]+\}/, '');
    
    return `<ConfirmDeleteDialog onConfirm={() => handleDelete(${id})}>\n${newButton}\n</ConfirmDeleteDialog>`;
  });

  // also handle `handleDeleteSession` if it exists
  const sessionButtonRegex = /<button[^>]*?onClick=\{async\s*\(e\)\s*=>\s*\{[\s\S]*?deleteChatLog\.mutateAsync\(\{ id: log\.id \}\)[\s\S]*?\}\}[^>]*?>[\s\S]*?<Trash2[^>]*?>[\s\S]*?<\/button>/g;
  c = c.replace(sessionButtonRegex, (match) => {
    // strip onClick from button
    const newButton = match.replace(/onClick=\{async[\s\S]*?\}\}/, '');
    
    return `<ConfirmDeleteDialog onConfirm={async () => {
      try {
        await Promise.all(session.messages.map((log) => deleteChatLog.mutateAsync({ id: log.id })));
        queryClient.invalidateQueries({ queryKey: getListAllChatLogsQueryKey() });
        toast({ title: "Conversation deleted" });
        if (selectedSessionId === session.id) { setSelectedSessionId(null); }
      } catch (err) { toast({ title: "Failed to delete some messages", variant: "destructive" }); }
    }}>\n${newButton}\n</ConfirmDeleteDialog>`;
  });

  // ClientChatLogs `handleDeleteSession` replacement if needed
  const clientSessionButtonRegex = /<button[^>]*?onClick=\{async\s*\(e\)\s*=>\s*\{[\s\S]*?getListClientChatLogsQueryKey[\s\S]*?\}\}[^>]*?>[\s\S]*?<Trash2[^>]*?>[\s\S]*?<\/button>/g;
  c = c.replace(clientSessionButtonRegex, (match) => {
    const newButton = match.replace(/onClick=\{async[\s\S]*?\}\}/, '');
    return `<ConfirmDeleteDialog onConfirm={async () => {
      try {
        await Promise.all(session.messages.map((log) => deleteChatLog.mutateAsync({ id: log.id })));
        queryClient.invalidateQueries({ queryKey: getListClientChatLogsQueryKey() });
        toast({ title: lang === "ar" ? "تم حذف المحادثة بنجاح" : "Conversation deleted" });
        if (selectedSessionId === session.id) { setSelectedSessionId(null); }
      } catch (err) { toast({ title: "Failed to delete some messages", variant: "destructive" }); }
    }}>\n${newButton}\n</ConfirmDeleteDialog>`;
  });

  fs.writeFileSync(file, c, 'utf8');
}

[
  'artifacts/chatbot-admin/src/pages/admin/AdminChatLogs.tsx',
].forEach(fixFile);

console.log("Fixed AdminChatLogs.tsx");
