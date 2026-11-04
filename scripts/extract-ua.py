# Збирає українські рядки інтерфейсу з коду → lib/i18n/strings.json (ключі для перекладу EN).
# Шаблони `...${x}...` стають «...{0}...». Запуск: python3 scripts/extract-ua.py
import re,os,json
CY=re.compile(r'[А-Яа-яІіЇїЄєҐґ]')
REGEXY=re.compile(r'\\b|\(\?|\\s|\\d|\^|\$\)|\[\^')
out=set()
def add(t):
  t=t.strip()
  if not t or not CY.search(t) or len(t)>400 or REGEXY.search(t):return
  if re.fullmatch(r'[^ ]*\|[^ ]*',t):return  # шматок регулярки «а|б|в»
  out.add(t)
def tmpl(t):
  i=[0]
  def rep(m):
    r="{%d}"%i[0];i[0]+=1;return r
  return re.sub(r'\$\{(?:[^{}]|\{[^{}]*\})*\}',rep,t)
for d in ["components","app","lib"]:
  for dp,_,fs in os.walk(d):
    if dp.startswith("app/api") or dp.startswith("lib/i18n"):continue
    for f in fs:
      if not f.endswith((".tsx",".ts")) or f in("helpDocs.ts",):continue
      s=open(os.path.join(dp,f),encoding="utf-8").read()
      s=re.sub(r'(?m)^\s*//.*$','',s);s=re.sub(r'/\*.*?\*/','',s,flags=re.S)
      for m in re.finditer(r'"((?:[^"\\\n]|\\.)*)"|\'((?:[^\'\\\n]|\\.)*)\'',s):
        add((m.group(1) if m.group(1) is not None else m.group(2)).replace('\\n','\n').replace('\\"','"'))
      for m in re.finditer(r'`((?:[^`\\]|\\.)*)`',s):add(tmpl(m.group(1)).replace('\\n','\n'))
      for m in re.finditer(r'[>}]([^<>{}]+)[<{]',s):
        t=m.group(1)
        if CY.search(t) and not re.search(r'[;=]\s*$|=>|\(\)',t):add(re.sub(r'\s+',' ',t))
json.dump(sorted(out),open("lib/i18n/strings.json","w",encoding="utf-8"),ensure_ascii=False,indent=0)
print(len(out),sum(len(x) for x in out))
