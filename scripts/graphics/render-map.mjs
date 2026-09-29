// Adapted from the owner-supplied native SVG template; source notices still apply.
// Only this reviewed module runs. The archived browser editor is never evaluated.
let MAPS, FORMATS, measureCtx, logo;
export function configureMaps(maps, formats, context, renderLogo) {
  MAPS = maps; FORMATS = formats; measureCtx = context; logo = renderLogo;
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const white='#f4f0e8',muted='#a9b5b5',ink='#0c1317';
function txt(s,x,y,size=24,fill=white,weight=400,spacing=0,maxWidth=0,anchor='start'){
 s=String(s??'');measureCtx.font=`${weight} ${size}px Arial`;
 if(maxWidth){const measured=measureCtx.measureText(s).width+Math.max(0,s.length-1)*spacing;if(measured>maxWidth)size*=maxWidth/measured;}
 return `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial,Helvetica,sans-serif" font-size="${size.toFixed(2)}" font-weight="${weight}" letter-spacing="${spacing}" text-anchor="${anchor}">${esc(s)}</text>`;
}
function title(s,x,y,maxWidth,size=86,maxLines=2){
 s=String(s).toLocaleUpperCase('cs-CZ');let lines;
 for(let attempt=0;attempt<45;attempt++){
  measureCtx.font=`900 ${size}px Arial`;
  const tokens=s.replace(/-/g,'- ').split(/\s+/).filter(Boolean);lines=[];let line='';
  for(const tok of tokens){const test=line?(line.endsWith('-')?line+tok:line+' '+tok):tok;if(measureCtx.measureText(test).width>maxWidth&&line){lines.push(line);line=tok;}else line=test;}
  if(line)lines.push(line);
  if(lines.length<=maxLines&&lines.every(l=>measureCtx.measureText(l).width<=maxWidth))break;
  size*=.955;
 }
 return lines.slice(0,maxLines).map((s,i)=>txt(s,x,y+i*size*1.08,size,white,900,-.8,maxWidth)).join('');
}
function rect(x,y,w,h,fill,op=1){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" opacity="${op}"/>`;}
function line(x1,y1,x2,y2,color,opacity=1,width=1){return `<path d="M${x1} ${y1}H${x2}" stroke="${color}" stroke-width="${width}" opacity="${opacity}"/>`;}
function image(id,x,y,w,h,opacity=1,contain=false){const [vw,vh]=id==='scene'?[718,404]:[1400,1400];return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid ${contain?'meet':'slice'}" opacity="${opacity}"><use href="#${id}"/></svg>`;}
function frame(x,y,w,h){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#768184" stroke-opacity=".45"/>`;}
function brand(x,y,scale=1){return logo('valkyria',x,y-35*scale,56*scale,62*scale)+logo('hll',x+72*scale,y-20*scale,205*scale,38*scale);}
function mapCode(m,x,y,scale=1){return txt(`MAP / ${String(m.index).padStart(2,'0')}`,x,y,12*scale,muted,700,2*scale,0,'end')+txt(m.code,x,y+31*scale,24*scale,white,800,2*scale,0,'end');}
function bg(w,h,opacity=.16){return rect(0,0,w,h,ink)+image('tac',0,0,w,h,opacity)+rect(0,0,w,h,'url(#shade)');}
function foot(w,h,label='valkyria.cz'){return line(56,h-53,w-56,h-53,'#a5aaaa',.25)+txt(label,58,h-26,12,muted,600,1)+logo('valkyria',w-80,h-44,23,26);}
export function renderSVG(id,kind,opts={}){
 const m=MAPS.find(x=>x.id===id);if(!m||!FORMATS[kind])throw new Error('Unknown map or format.');
 const {width:w,height:h}=FORMATS[kind];const accent=/^#[0-9a-f]{6}$/i.test(opts.accent||'')?opts.accent:'#cf4d42';
 const teamA=opts.teamA||'VALKYRIA',teamB=opts.teamB||'SOUPEŘ',scoreA=opts.scoreA??'—',scoreB=opts.scoreB??'—';
 const date=opts.date||'DATUM / DOPLNIT',competition=opts.competition||'SOUTĚŽ / DOPLNIT';
 const heading=opts.headline||m.name;let s='';
 const tag=(label,x,y)=>rect(x,y-17,4,21,accent)+txt(label,x+16,y,12,accent,800,2);
 if(kind==='server-card'){
  s=image('scene',0,0,w,h)+rect(0,0,w,h,'url(#photoShade)')+brand(26,35,.67)+mapCode(m,w-25,29,.72);
  s+=rect(25,h-117,4,88,accent)+title(m.name,43,h-79,w-68,39,2)+frame(.5,.5,w-1,h-1);
 }else if(kind==='server-strip'){
  s=bg(w,h,.16)+image('scene',500,0,460,h)+rect(450,0,150,h,'url(#fadeRight)');
  s+=brand(32,32,.7)+rect(32,72,42,4,accent);
  s+=title(m.name,32,133,450,49,2)+txt(m.code,w-25,h-23,12,white,700,2,0,'end')+frame(.5,.5,w-1,h-1);
 }else if(kind==='article'){
  s=bg(w,h,.2)+brand(58,55)+mapCode(m,w-58,40);
  s+=tag(opts.label||'MAPOVÝ PRŮVODCE',58,172)+title(heading,57,259,535,77,3);
  s+=image('scene',627,117,516,290)+frame(627,117,516,290)+rect(627,414,516,3,accent);
  s+=image('tac',974,435,169,139,1,true)+frame(974,435,169,139);
  s+=txt('POZNEJ BOJIŠTĚ.',627,478,23,white,800,0,320)+txt('HRAJ S TÝMEM.',627,510,23,white,800,0,320);
  s+=txt(opts.subtitle||'MAPY • KOMUNITA • TÝMOVÁ HRA',58,548,11,muted,700,1.1,545)+foot(w,h);
 }else if(kind==='match-result'){
  s=bg(w,h,.18)+brand(86,77,1.25)+tag(opts.label||'VÝSLEDEK ZÁPASU',87,206);
  s+=title(m.name,83,314,970,104,2)+image('scene',1160,100,674,379)+frame(1160,100,674,379)+rect(1160,484,674,4,accent);
  s+=rect(86,538,1748,315,'#111d23',.96)+frame(86,538,1748,315)+rect(86,538,1748,5,accent);
  s+=txt('DOMÁCÍ',155,602,15,muted,700,3)+txt('HOSTÉ',1765,602,15,muted,700,3,0,'end');
  s+=(teamA.toUpperCase()==='VALKYRIA'?logo('valkyria',155,628,106,118):txt(teamA.toUpperCase(),155,701,64,white,900,1,510))+txt(teamB.toUpperCase(),1765,701,64,white,900,1,510,'end');
  s+=txt(`${scoreA} : ${scoreB}`,960,751,141,white,800,-3,410,'middle');
  s+=logo('hll',155,778,200,37)+txt('ZÁPASOVÝ REPORT',1765,806,15,muted,500,3,0,'end');
  s+=txt(competition.toUpperCase(),89,930,21,muted,700,2,830)+txt(date,1831,930,21,muted,600,1,840,'end')+foot(w,h);
 }else if(kind==='match-preview'){
  s=bg(w,h,.18)+brand(58,55)+mapCode(m,w-58,39)+tag(opts.label||'POZVÁNKA NA ZÁPAS',58,154);
  s+=title(m.name,57,239,545,66,2)+image('scene',635,104,507,285)+frame(635,104,507,285);
  s+=rect(58,409,1084,134,'#111d23',.98)+frame(58,409,1084,134)+rect(58,409,1084,3,accent);
  s+=(teamA.toUpperCase()==='VALKYRIA'?logo('valkyria',87,435,68,76):txt(teamA.toUpperCase(),87,488,37,white,900,.4,407))+txt('VS',600,495,53,accent,900,0,100,'middle')+txt(teamB.toUpperCase(),1113,488,37,white,900,.4,407,'end');
  s+=txt(date,59,572,13,muted,600,1,650)+txt(competition,1141,572,12,muted,500,1,390,'end')+foot(w,h);
 }else if(kind==='wide'){
  s=bg(w,h,.22)+image('scene',1210,43,640,360)+frame(1210,43,640,360)+rect(1210,410,640,4,accent);
  s+=brand(73,76,1.2)+tag('MAPA',73,182)+title(m.name,67,280,1080,111,2);
  s+=txt('valkyria.cz',76,443,17,muted,600,1)+txt(m.code,1848,453,15,muted,700,2,0,'end');
 }else if(kind==='social'){
  s=bg(w,h,.22)+brand(62,65,1.15)+mapCode(m,w-64,48,1.1);
  s+=image('scene',63,149,718,404)+frame(63,149,718,404)+image('tac',801,149,216,404,.76)+frame(801,149,216,404)+rect(63,565,954,4,accent);
  s+=tag('MAPA',63,624)+title(m.name,57,746,962,96,3)+txt('POZNEJ BOJIŠTĚ. HRAJ S TÝMEM.',64,988,17,muted,700,1.2)+foot(w,h);
 }else if(kind==='tactical-poster'){
  s=rect(0,0,w,h,ink)+brand(62,57)+mapCode(m,w-63,39)+title(m.name,58,164,961,63,2);
  s+=rect(63,241,954,4,accent)+rect(63,260,954,954,'#dfd2b6')+image('tac',63,260,954,954,1,true)+frame(63,260,954,954);
  s+=txt('TAKTICKÁ MAPA',64,1266,17,white,700,1.5)+foot(w,h);
 }else if(kind==='tactical-background'){
  s=rect(0,0,w,h,ink)+image('tac',0,0,w,h,.6)+rect(0,0,w,h,'url(#backgroundShade)');
 }
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><title>${esc(m.name)} — ${esc(FORMATS[kind].label)} — VALKYRIA</title><desc>Komunitní grafická šablona. Herní podklady patří držitelům práv Hell Let Loose. Zdroje jsou v přiloženém balíčku. Skóre a soupeř jsou editovatelné, nikoli skutečný výsledek.</desc><defs><image id="scene" width="718" height="404" href="${m.scene}"/><image id="tac" width="1400" height="1400" href="${m.tactical}"/><linearGradient id="shade"><stop stop-color="#0c1317" stop-opacity=".85"/><stop offset=".7" stop-color="#0c1317" stop-opacity=".15"/><stop offset="1" stop-color="#0c1317" stop-opacity=".4"/></linearGradient><linearGradient id="photoShade" x2="0" y2="1"><stop stop-color="#071015" stop-opacity=".25"/><stop offset=".25" stop-color="#071015" stop-opacity=".05"/><stop offset="1" stop-color="#071015" stop-opacity=".95"/></linearGradient><linearGradient id="fadeRight"><stop stop-color="#0c1317"/><stop offset="1" stop-color="#0c1317" stop-opacity="0"/></linearGradient><radialGradient id="backgroundShade"><stop stop-color="#081016" stop-opacity=".52"/><stop offset="1" stop-color="#081016" stop-opacity=".87"/></radialGradient></defs>${s}</svg>`;
 return svg;
}
