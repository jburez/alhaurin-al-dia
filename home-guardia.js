(function(){
var box=document.getElementById('home-pharmacy-guard');
if(!box){return;}
function pad(n){return String(n).padStart(2,'0');}
function key(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
var today=key(new Date());
Promise.all([fetch('/data/farmacias.json'),fetch('/data/guardias-farmacias-2026.json')]).then(function(r){if(!r[0].ok||!r[1].ok){throw new Error('Datos no disponibles');}return Promise.all([r[0].json(),r[1].json()]);}).then(function(data){
 var farmacias={};data[0].forEach(function(f){farmacias[f.id]=f;});
 var guardias=data[1].guardias||{};
 var id=guardias[today];
 var farmacia=id?farmacias[id]:null;
 if(!farmacia){box.innerHTML='<div><span class="section-kicker">Farmacia de guardia hoy</span><h2>Guardia pendiente de completar</h2><p>Cuando rellenes el JSON de guardias, la farmacia de hoy aparecerá aquí automáticamente.</p></div><div class="home-guard-actions"><a href="/guia-util/farmacias/calendario/">Ver calendario</a><a class="secondary" href="https://alhaurinelgrande.es/farmacias/" target="_blank" rel="noopener noreferrer">Fuente oficial</a></div>';return;}
 box.innerHTML='<div><span class="section-kicker">Farmacia de guardia hoy</span><h2>'+farmacia.nombre+'</h2><p>'+farmacia.direccion+' · Guardia orientativa de 9:30 a 9:30. Confirma siempre en la fuente oficial antes de desplazarte.</p></div><div class="home-guard-actions"><a href="'+farmacia.url+'">Ver ficha</a><a class="secondary" href="tel:'+farmacia.telefonoHref+'">'+farmacia.telefono+'</a><a class="secondary" href="/guia-util/farmacias/calendario/">Calendario</a></div>';
}).catch(function(){box.innerHTML='<div><span class="section-kicker">Farmacia de guardia hoy</span><h2>No disponible</h2><p>No se pudo cargar el calendario de guardias.</p></div><div class="home-guard-actions"><a href="/guia-util/farmacias/calendario/">Ver calendario</a></div>';});
})();
