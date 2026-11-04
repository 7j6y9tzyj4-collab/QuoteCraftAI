# Збирає українські рядки інтерфейсу з коду → lib/i18n/strings.json (ключі для перекладу EN).
# Шаблони `...${x}...` стають «...{0}...» (вкладені шаблони — окремими ключами). Запуск: python3 scripts/extract-ua.py
import re,os,json
CY=re.compile(r'[А-Яа-яІіЇїЄєҐґ]')
REGEXY=re.compile(r'\\b|\(\?|\\s|\\d|\[\^')
out=set()
def add(t):
  t=re.sub(r'\s+',' ',t).strip()
  if not t or not CY.search(t) or len(t)>400 or REGEXY.search(t):return
  if re.fullmatch(r'[^ ]*\|[^ ]*',t):return
  out.add(t)

def scan(s):
  """Прохід по коду: рядки '…', "…", шаблони `…${}…` (з вкладеністю), JSX-текст між > } і < {."""
  i=0;n=len(s)
  while i<n:
    c=s[i]
    if c=='/' and i+1<n and s[i+1]=='/':  # коментар до кінця рядка (але не в URL типу https://)
      if i>0 and s[i-1]==':':i+=2;continue
      j=s.find('\n',i);i=n if j<0 else j;continue
    if c=='/' and i+1<n and s[i+1]=='*':
      j=s.find('*/',i+2);i=n if j<0 else j+2;continue
    if c in '"\'':
      j=i+1;buf=''
      while j<n and s[j]!=c and s[j]!='\n':
        if s[j]=='\\' and j+1<n:buf+=s[j:j+2];j+=2;continue
        buf+=s[j];j+=1
      add(buf.replace('\\n','\n').replace('\\"','"').replace("\\'","'"));i=j+1;continue
    if c=='`':
      i=template(s,i+1);continue
    i+=1
def template(s,i):
  n=len(s);key='';k=0
  while i<n and s[i]!='`':
    if s[i]=='\\' and i+1<n:key+=s[i+1] if s[i+1]!='n' else '\n';i+=2;continue
    if s[i]=='$' and i+1<n and s[i+1]=='{':
      j=i+2;depth=1;start=j
      while j<n and depth:
        if s[j]=='`':j=template(s,j+1);continue
        if s[j] in '"\'':
          q=s[j];j+=1
          while j<n and s[j]!=q:
            j+=2 if s[j]=='\\' else 1
          j+=1;continue
        if s[j]=='{':depth+=1
        elif s[j]=='}':depth-=1
        j+=1
      scan(s[start:j-1])
      key+='{%d}'%k;k+=1;i=j;continue
    key+=s[i];i+=1
  add(key);return i+1

for d in ["components","app","lib"]:
  for dp,_,fs in os.walk(d):
    if dp.startswith("app/api") or dp.startswith("lib/i18n"):continue
    for f in fs:
      if not f.endswith((".tsx",".ts")) or f=="helpDocs.ts":continue
      s=open(os.path.join(dp,f),encoding="utf-8").read()
      scan(s)
      if f.endswith(".tsx"):
        s2=re.sub(r'\{/\*.*?\*/\}','',s,flags=re.S)
        for m in re.finditer(r'[>}]([^<>{}]+)[<{]',s2):
          t=m.group(1)
          if CY.search(t) and '//' not in t and 'from "' not in t and '`' not in t and not t.lstrip().startswith(';') and not re.search(r'[;=]\s*$|=>|\(\)|\?\s|&&',t):add(t)
json.dump(sorted(out),open("lib/i18n/strings.json","w",encoding="utf-8"),ensure_ascii=False,indent=0)
print(len(out),sum(len(x) for x in out))
