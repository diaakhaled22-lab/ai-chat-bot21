import sys
with open('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
banner = '''
      {/* Retention Policy Banner */}
      <Card className="bg-card border-border shrink-0">
        <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">{lang === 'ar' ? '????? ???????? ?????????' : 'Data Retention Policy'}</p>
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 font-medium">
                  {lang === 'ar' ? '??????? ??????' : 'Configured by Administrator'}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {retentionLoading ? (
                  <Skeleton className="h-3 w-48 mt-1" />
                ) : lang === 'ar' ? (
                  \??? ??? ?????? ??????? ????????? ???????? ??? \ \ ??? ??????? ??????.\
                ) : (
                  \Leads are automatically deleted after \ day\ as set by your administrator.\
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
                \\ \\
              )}
            </div>
          </div>
        </div>
      </Card>
'''

search_str = '<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">'
content = content.replace(search_str, banner + '\n        ' + search_str)
with open('artifacts/chatbot-admin/src/pages/client/ClientLeads.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
