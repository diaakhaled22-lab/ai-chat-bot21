const fs = require('fs');

function updateStatCard(file) {
  let text = fs.readFileSync(file, 'utf8');

  const replacement = `function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground truncate pr-2">{label}</CardTitle>
        <div className={\`shrink-0 \${color.replace('bg-', 'text-').replace('/10', '')}\`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums truncate">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}`;

  const startStr = 'function StatCard({';
  const startIndex = text.indexOf(startStr);
  
  if (startIndex !== -1) {
    let currentIdx = startIndex;
    const endStr = '  );\n}';
    const endIdx = text.indexOf(endStr, currentIdx) + endStr.length;
    
    text = text.substring(0, startIndex) + replacement + text.substring(endIdx);
    fs.writeFileSync(file, text, 'utf8');
    console.log(file + ' updated');
  }
}

updateStatCard('artifacts/chatbot-admin/src/pages/client/ClientDashboard.tsx');
updateStatCard('artifacts/chatbot-admin/src/pages/admin/AdminDashboard.tsx');
