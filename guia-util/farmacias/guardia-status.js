(function(){
var GUARDS_URL='/data/guardias-farmacias-2026.json';
var PHARMACIES_URL='/data/farmacias.json';
var path=window.location.pathname.replace(/\/$/,'');
var slug=path.split('/').pop();
var today=new Date();
function pad(n){return String(n).padStart(2,'0');}
function key(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
var todayKey=key(today);
function findInsertTarget(){return document.querySelector('.detail-hero .container')||document.querySelector('main')||document.body;}
function mapsUrl(pharmacy){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent((pharmacy.nombre||'Farmacia')+' '+(pharmacy.direccion||'')+' Alhaurín el Grande');}
function absoluteUrl(url){return new URL(url||'/guia-util/farmacias/', window.location.origin).href;}
function injectAdvancedSchema(pharmacy,isGuard){
 if(!pharmacy){return;}
 var existing=document.getElementById('advanced-pharmacy-schema');
 if(existing){existing.remove();}
 var schema={
  '@context':'https://schema.org',
  '@type':'Pharmacy',
  '@id':absoluteUrl(pharmacy.url)+'#farmacia',
  'name':pharmacy.nombre,
  'url':absoluteUrl(pharmacy.url),
  'telephone':pharmacy.telefonoHref,
  'address':{
   '@type':'PostalAddress',
   'streetAddress':pharmacy.direccion,
   'addressLocality':'Alhaurín el Grande',
   'addressRegion':'Málaga',
   'addressCountry':'ES'
  },
  'areaServed':{'@type':'City','name':'Alhaurín el Grande'},
  'hasMap':mapsUrl(pharmacy),
  'sameAs':['https://alhaurinelgrande.es/farmacias/'],
  'mainEntityOfPage':absoluteUrl(pharmacy.url),
  'additionalProperty':[
   {'@type':'PropertyValue','name':'Calendario de guardias','value':absoluteUrl('/guia-util/farmacias/calendario/')},
   {'@type':'PropertyValue','name':'Estado de guardia hoy','value':isGuard?'De guardia hoy':'No está de guardia hoy'},
   {'@type':'PropertyValue','name':'Fuente oficial de contraste','value':'https://alhaurinelgrande.es/farmacias/'}
  ]
 };
 var script=document.createElement('script');
 script.type='application/ld+json';
 script.id='advanced-pharmacy-schema';
 script.textContent=JSON.stringify(schema);
 document.head.appendChild(script);
}
function createBadge(isGuard, pharmacy){
 var box=document.createElement('section');
 box.className='live-guard-badge '+(isGuard?'is-on-duty':'is-not-on-duty');
 box.innerHTML='<div><span>'+(isGuard?'De guardia hoy':'No está de guardia hoy')+'</span><strong>'+(pharmacy?pharmacy.nombre:'Farmacia')+'</strong><p>'+(isGuard?'Guardia orientativa de 9:30 a 9:30. Confirma siempre en la fuente oficial antes de desplazarte.':'Consulta el calendario para ver próximas guardias y la farmacia disponible hoy.')+'</p></div><div class="live-guard-actions"><a href="/guia-util/farmacias/calendario/">Ver calendario</a><a class="secondary" href="https://alhaurinelgrande.es/farmacias/" target="_blank" rel="noopener noreferrer">Fuente oficial</a></div>';
 return box;
}
function render(isGuard, pharmacy){
 var existing=document.querySelector('.live-guard-badge');
 if(existing){existing.remove();}
 var badge=createBadge(isGuard, pharmacy);
 var target=findInsertTarget();
 var heroCard=document.querySelector('.detail-hero-card');
 if(heroCard&&heroCard.parentNode){heroCard.insertAdjacentElement('afterend',badge);}else{target.insertBefore(badge,target.firstChild);}
 var status=document.querySelector('.guard-status-card');
 if(status){status.innerHTML='<span class="status-badge">'+(isGuard?'DE GUARDIA HOY':'No está de guardia hoy')+'</span><p>'+(isGuard?'Esta farmacia figura como guardia para hoy en el calendario local. Verifica siempre en la fuente oficial.':'Esta farmacia no figura como guardia para hoy en el calendario local. Consulta el calendario para próximas guardias.')+'</p>';}
 injectAdvancedSchema(pharmacy,isGuard);
}
function init(){Promise.all([fetch(PHARMACIES_URL),fetch(GUARDS_URL)]).then(function(r){if(!r[0].ok||!r[1].ok){throw new Error('No se pudieron cargar datos');}return Promise.all([r[0].json(),r[1].json()]);}).then(function(data){var pharmacies=data[0];var guards=data[1].guardias||{};var pharmacy=pharmacies.find(function(p){return (p.url||'').replace(/\/$/,'').split('/').pop()===slug;});var todaysPharmacyId=guards[todayKey];render(pharmacy&&pharmacy.id===todaysPharmacyId,pharmacy);}).catch(function(){render(false,{nombre:'Farmacia',url:window.location.pathname,direccion:'Alhaurín el Grande'});});}
init();
})();
