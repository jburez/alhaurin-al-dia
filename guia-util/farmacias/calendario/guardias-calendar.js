(function(){
var farmaciasUrl='/data/farmacias.json';
var guardiasUrl='/data/guardias-farmacias-2026.json';
var meses=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
var grid=document.getElementById('calendar-grid');
var title=document.getElementById('calendar-title');
var select=document.getElementById('month-select');
var prev=document.getElementById('prev-month');
var next=document.getElementById('next-month');
var todayBox=document.getElementById('today-guard');
if(!grid||!title||!select||!prev||!next){return;}
var now=new Date();
var year=2026;
var month=now.getFullYear()===2026?now.getMonth():0;
var farmacias={};
var guardias={};
function pad(n){return String(n).padStart(2,'0');}
function key(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
var todayKey=key(now);
function initSelect(){select.innerHTML=meses.map(function(m,i){return '<option value="'+i+'">'+m+' 2026</option>';}).join('');select.value=String(month);}
function farmaciaByDay(k){var id=guardias[k];return id?farmacias[id]:null;}
function renderToday(){if(!todayBox){return;}var f=farmaciaByDay(todayKey);if(!f){todayBox.innerHTML='<div><span class="section-kicker">Guardia de hoy</span><strong>Guardia pendiente de completar</strong><p>No hay farmacia asignada para hoy en el JSON de guardias. Cuando lo rellenes, aparecerá automáticamente.</p></div><div class="guard-actions"><a href="https://alhaurinelgrande.es/farmacias/" target="_blank" rel="noopener noreferrer">Fuente oficial</a></div>';return;}todayBox.innerHTML='<div><span class="section-kicker">Guardia de hoy</span><strong>'+f.nombre+'</strong><p>'+f.direccion+' · Guardia orientativa de 9:30 a 9:30. Confirma siempre en la fuente oficial.</p></div><div class="guard-actions"><a href="'+f.url+'">Ver ficha</a><a class="secondary" href="tel:'+f.telefonoHref+'">'+f.telefono+'</a></div>';}
function render(){title.textContent=meses[month]+' 2026';select.value=String(month);grid.innerHTML='';var first=new Date(year,month,1);var last=new Date(year,month+1,0);var offset=(first.getDay()+6)%7;for(var i=0;i<offset;i++){var e=document.createElement('div');e.className='calendar-day empty';grid.appendChild(e);}for(var d=1;d<=last.getDate();d++){var date=new Date(year,month,d);var k=key(date);var f=farmaciaByDay(k);var cell=document.createElement('article');cell.className='calendar-day'+(k===todayKey?' today':'');var guard=f?'<a class="guard-link" href="'+f.url+'">'+f.nombre+'</a><span class="guard-phone">'+f.telefono+'</span>':'<span class="missing-chip">Sin dato</span><span class="guard-phone">Completar JSON</span>';cell.innerHTML='<div class="day-number">'+d+'</div>'+(k===todayKey?'<span class="today-chip">Hoy</span>':'')+guard;grid.appendChild(cell);}}
function start(){initSelect();Promise.all([fetch(farmaciasUrl),fetch(guardiasUrl)]).then(function(r){if(!r[0].ok||!r[1].ok){throw new Error('Datos no disponibles');}return Promise.all([r[0].json(),r[1].json()]);}).then(function(data){data[0].forEach(function(f){farmacias[f.id]=f;});guardias=data[1].guardias||{};renderToday();render();}).catch(function(err){grid.innerHTML='<p class="empty-state">No se pudo cargar el calendario de guardias.</p>';if(todayBox){todayBox.innerHTML='<div><span class="section-kicker">Guardia de hoy</span><strong>No disponible</strong><p>Revisa los archivos JSON.</p></div>';}console.error(err);});}
prev.addEventListener('click',function(){month=month===0?11:month-1;render();});
next.addEventListener('click',function(){month=month===11?0:month+1;render();});
select.addEventListener('change',function(e){month=Number(e.target.value);render();});
start();
})();
