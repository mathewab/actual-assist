"""Offline synthetic design artifact. Requires ReportLab; no application imports or network."""
from pathlib import Path
import json
import argparse
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit

parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=Path(__file__).with_name('monthly-report-design.pdf'))
OUT = parser.parse_args().output
OUT.parent.mkdir(parents=True, exist_ok=True)
HERE = Path(__file__).parent
facts = {'month':'September 2026', 'currency':'USD', 'income_cents':720000,
         'categories_cents':{'Home':240000,'Food & groceries':76000,'Transport':42000,'Lifestyle':151000,'Utilities':31000,'Uncategorized':15000},
         'refunds_cents':12000, 'gross_spending_cents':567000,
         'captured_at':'02 Oct 2026, 09:00 UTC', 'latest_recorded':'28 Sep 2026'}
facts['spending_cents'] = sum(facts['categories_cents'].values())
facts['net_cents'] = facts['income_cents'] - facts['spending_cents']
assert facts['spending_cents'] == facts['gross_spending_cents'] - facts['refunds_cents'] == 555000
assert facts['net_cents'] == 165000
assert round(100*facts['net_cents']/facts['income_cents'],1) == 22.9
(HERE/'synthetic-facts.json').write_text(json.dumps(facts,indent=2)+'\n')
pdfmetrics.registerFont(TTFont('Sans','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Bold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Serif','/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'))
W,H=595.28,841.89
c=canvas.Canvas(str(OUT),pagesize=(W,H),invariant=1)
c.setTitle('Actual Assist | Monthly report design — synthetic review')
c.setAuthor('Actual Assist design review')
navy='#142F36'; teal='#147A72'; lime='#C9DF9D'; muted='#52666A'; paper='#F5F4EE'; line='#DCE3DC'; amber='#9A631D'
def box(x,y,w,h,fill,r=10):
 c.setFillColor(HexColor(fill)); c.roundRect(x,H-y-h,w,h,r,stroke=0,fill=1)
def txt(x,y,s,size=10,color=navy,font='Sans'):
 c.setFillColor(HexColor(color)); c.setFont(font,size); c.drawString(x,H-y-size,s)
def para(x,y,s,w,size=10,color=muted,leading=15,font='Sans'):
 lines=[line for paragraph in s.split('\n') for line in simpleSplit(paragraph,font,size,w)]
 for i,l in enumerate(lines): txt(x,y+i*leading,l,size,color,font)
 return y+len(lines)*leading
def rule(y):
 c.setStrokeColor(HexColor(line)); c.line(38,H-y,W-38,H-y)
def header(n,tag='REPORT CONCEPT'):
 box(0,0,W,H,paper,0); txt(38,26,'ACTUAL / ASSIST',10,teal,'Bold'); txt(330,26,'SYNTHETIC DATA  •  DESIGN REVIEW',8,muted)
 rule(52); txt(38,70,tag,9,teal,'Bold')
 rule(794); txt(38,806,'Design v1  /  No real financial data  /  No delivery enabled',7,muted); txt(505,806,f'{n} / 4',8,muted)
def end(): c.showPage()
def money(cents): return f'${cents/100:,.0f}'
header(1)
txt(38,94,'Your month,',31,navy,'Serif'); txt(38,133,'in perspective.',31,navy,'Serif')
txt(39,184,'SEPTEMBER 2026',11,teal,'Bold'); txt(359,184,'Saved 02 Oct 2026  /  v1',9,muted)
box(38,215,519,64,'#F3E5CB')
txt(52,226,'PARTIAL VIEW  /  IMPORT COVERAGE UNCONFIRMED',9,amber,'Bold')
para(52,245,'Latest recorded transaction: 28 Sep. Manual CSV imports may be missing. Figures describe the records captured, not a confirmed complete month.',488,9,amber,13)
for x,label,value,sub in [(38,'RECORDED INCOME',money(facts['income_cents']),'USD · included accounts'),(215,'NET SPENDING',money(facts['spending_cents']),'After $120 in refunds'),(392,'RECORDED NET',money(facts['net_cents']),'Income less net spending')]:
 box(x,300,165,111,'#FFFFFF'); txt(x+13,316,label,8,muted,'Bold'); txt(x+13,337,value,27,teal if x==392 else navy,'Bold'); txt(x+13,382,sub,8,muted)
txt(38,437,'Where the recorded income went',15,navy,'Bold')
spend=facts['spending_cents']/facts['income_cents']; box(38,471,519,28,line,4); box(38,471,519*spend,28,teal,4); box(38+519*spend,471,519*(1-spend),28,lime,4)
txt(38,512,'77.1%  net spending',10,teal,'Bold'); txt(366,512,'22.9%  recorded net',10,navy,'Bold')
para(38,536,'This is a cash-flow view of included records. The recorded net is not a verified savings balance.',500,9)
box(38,581,519,155,navy)
txt(55,598,'THE MONTH IN WORDS',9,lime,'Bold'); txt(365,598,'SAMPLE NARRATIVE',8,'#D4E7E3')
para(55,624,'Recorded income exceeded net spending by $1,650. Home was the largest spending category at $2,400. Another $150 remains uncategorized.',475,12,'#FFFFFF',19)
para(55,691,'Before drawing conclusions: finish the month’s imports and review uncategorized items. Month-over-month trends are withheld until coverage is comparable.',475,9,'#D4E7E3',14)
txt(38,754,'On-budget scope  /  USD  /  Captured 02 Oct 2026 at 09:00 UTC',8,muted)
end()
header(2,'SPENDING & DATA COVERAGE')
txt(38,98,'The details behind the month',25,navy,'Serif'); txt(38,139,'September 2026  /  saved version 1',10,muted)
txt(38,180,'Net spending by category',14,navy,'Bold'); txt(425,184,'TOTAL  $5,550',10,teal,'Bold')
for i,(name,value) in enumerate(facts['categories_cents'].items()):
 y=217+i*38
 txt(38,y,name,10); box(174,y+2,260,12,line,3); box(174,y+2,260*value/240000,12,amber if name=='Uncategorized' else teal,3)
 txt(459,y,money(value),10,navy,'Bold')
para(38,452,'Refunds reduce their original spending categories. Internal transfers are excluded. Uncategorized spending remains in the total.',510,9)
rule(492); txt(38,511,'What this report knows',16,navy,'Bold')
for x,label in [(38,'INCLUDED ACCOUNT'),(244,'LATEST RECORD'),(389,'STATEMENT COVERAGE')]: txt(x,547,label,8,muted,'Bold')
for y,name,date,status in [(574,'Everyday account','28 Sep 2026','Unconfirmed'),(607,'Household card','24 Sep 2026','Unconfirmed')]:
 txt(38,y,name,10); txt(244,y,date,10); txt(389,y,status,10,amber); rule(y+25)
box(38,657,519,102,'#E7EEE7'); txt(52,671,'NEXT REVIEW',9,teal,'Bold')
para(52,692,'1. Import any remaining September statements.\n2. Review $150 of uncategorized spending.\n3. Generate v2 when ready; this saved v1 stays unchanged.',480,10,navy,17)

end()
header(3,'APPLICATION WIREFRAME / AUTHENTICATED REPORT HISTORY')
txt(38,98,'A home for every month',27,navy,'Serif'); para(38,141,'Saved reports live inside Actual Assist. Each version has its own authenticated view and download.',500,11)
box(38,195,519,345,'#FFFFFF')
box(38,195,519,45,navy,6); txt(52,210,'Actual Assist',10,'#FFFFFF','Bold'); txt(193,211,'Home    Suggestions    Jobs    Reports',9,'#E4EFEB')
txt(54,258,'Reports',22,navy,'Bold'); box(411,255,128,31,teal,5); txt(423,264,'Generate report',9,'#FFFFFF','Bold')
txt(54,297,'2026  /  Monthly archive',9,muted); rule(320)
for y,month,version,status in [(340,'September 2026','v2 · latest','Coverage unconfirmed'),(425,'August 2026','v1','Coverage unconfirmed')]:
 txt(55,y,month,12,navy,'Bold'); txt(55,y+23,version,9,muted); txt(55,y+42,status,8,amber)
 box(357,y+3,65,27,'#E7EEE7',4); txt(374,y+10,'View',9,teal,'Bold'); box(430,y+3,108,27,'#E7EEE7',4); txt(442,y+10,'Download PDF',9,teal,'Bold')
 txt(358,y+42,'Version history  ›',9,teal)
box(38,561,519,157,navy); txt(54,579,'SEPTEMBER 2026  /  VERSION HISTORY',9,lime,'Bold')
txt(54,609,'v2',13,'#FFFFFF','Bold'); txt(90,610,'Saved 06 Oct 2026 · after additional imports',10,'#FFFFFF'); txt(449,610,'View / PDF',9,lime)
txt(54,643,'v1',13,'#FFFFFF','Bold'); txt(90,644,'Saved 02 Oct 2026 · original snapshot',10,'#FFFFFF'); txt(449,644,'View / PDF',9,lime)
para(54,682,'Regenerate creates a new version. Existing files and bookmarks stay valid.',480,9,'#D4E7E3')
para(38,737,'Push preview: “Your monthly report is ready” → exact saved report. Sign-in required; no amounts or PDF attachment in the notification.',510,9)
end()
header(4,'IMPLEMENTATION PROPOSAL / NO LIVE CHANGES')
txt(38,98,'Small footprint. Durable history.',25,navy,'Serif')
para(38,141,'Reuse the app’s existing API, permissions, SQLite, jobs and persistent volume. Keep calculations local and authoritative.',510,11)
steps=[('01','CAPTURE','Read the configured Actual cache coherently; record account scope and coverage evidence.'),('02','CALCULATE','One deterministic facts object drives every total, chart and narrative input.'),('03','RENDER & SAVE','Persist frozen facts, narrative and PDF. SQLite indexes immutable versions on the existing volume.'),('04','VIEW & DOWNLOAD','Authenticated Reports UI and API. Optional later push links to a specific saved version.')]
for i,(num,title,desc) in enumerate(steps):
 y=211+i*93; box(38,y,44,44,teal,9); txt(48,y+11,num,17,'#FFFFFF','Bold'); txt(100,y+1,title,10,teal,'Bold'); para(100,y+23,desc,445,10,navy,15)
box(38,600,519,107,'#F3E5CB'); txt(53,615,'AI IS AN OPTIONAL NARRATIVE STEP',9,amber,'Bold')
para(53,638,'Reuse the existing adapter only after prompt/response logging is made privacy-safe. Send approved aggregate facts only; no raw transactions or web tools. Invalid or unavailable AI falls back to a local summary.',483,10,navy,15)
para(38,732,'Review milestone: synthetic PDF + architecture proposal. No real-data AI calls, credentials, notifications, schedules, PR or deployment.',510,10,muted,15)
end(); c.save()
print(f'PASS: synthetic arithmetic and 4-page PDF generated: {OUT}')
