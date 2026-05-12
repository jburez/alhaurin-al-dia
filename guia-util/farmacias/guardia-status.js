(function(){
var GUARDS_URL='/data/guardias-farmacias-2026.json';
var PHARMACIES_URL='/data/farmacias.json';
var path=window.location.pathname.replace(/\/$/,'');
var slug=path.split('/').pop();
var today=new Date();
function pad(n){return String(n).padStart(2,'0');}
function key(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
var todayKey=key(today);
function ensureSiteChrome(){
 var navHtml='<div class="topbar"><div class="container"><span>Guía local independiente de Alhaurín el Grande</span><span>Farmacias · Salud · Servicios útiles</span></div></div><header><div class="container"><nav aria-label="Navegación principal"><a class="logo" href="/" aria-label="Alhaurín al Día"><span class="logo-mark">A</span><span><strong>Alhaurín al Día</strong><span>Información local útil</span></span></a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-menu" aria-label="Abrir menú de navegación"><span></span><span></span><span></span></button><div class="nav-links" id="main-menu"><a href="/noticias/">Noticias</a><a href="/guia-util/">Guía útil</a><a href="/planes/">Planes</a><a href="/comercios/">Comercios</a><a href="/anunciarse/" class="nav-cta">Anunciarse</a></div></nav></div></header>';
 if(!document.querySelector('header')){
  document.body.insertAdjacentHTML('afterbegin',navHtml);
 }else{
  var nav=document.querySelector('header nav');
  var links=document.querySelector('header .nav-links');
  if(links&&!links.id){links.id='main-menu';}
  if(nav&&!document.querySelector('header .menu-toggle')){
   var button=document.createElement('button');
   button.className='menu-toggle';
   button.type='button';
   button.setAttribute('aria-expanded','false');
   button.setAttribute('aria-controls','main-menu');
   button.setAttribute('aria-label','Abrir menú de navegación');
   button.innerHTML='<span></span><span></span><span></span>';
   nav.insertBefore(button, links||nav.lastElementChild);
  }
 }
 if(!document.querySelector('footer')){
  document.body.insertAdjacentHTML('beforeend','<footer><div class="container"><span>© 2026 Alhaurín al Día · Guía local independiente</span><div class="footer-links"><a href="/noticias/">Noticias</a><a href="/guia-util/">Guía útil</a><a href="/planes/">Planes</a><a href="/comercios/">Comercios</a><a href="/anunciarse/">Anunciarse</a></div></div></footer>');
 }else if(!document.querySelector('footer .footer-links')){
  var footerContainer=document.querySelector('footer .container')||document.querySelector('footer');
  footerContainer.insertAdjacentHTML('beforeend','<div class="footer-links"><a href="/noticias/">Noticias</a><a href="/guia-util/">Guía útil</a><a href="/planes/">Planes</a><a href="/comercios/">Comercios</a><a href="/anunciarse/">Anunciarse</a></div>');
 }
}
function initMobileMenu(){
 var menu=document.getElementById('main-menu');
 var button=document.querySelector('.menu-toggle');
 if(!menu||!button){return;}
 button.addEventListener('click',function(){
  var isOpen=menu.classList.toggle('open');
  button.classList.toggle('open',isOpen);
  button.setAttribute('aria-expanded',String(isOpen));
  document.body.classList.toggle('menu-open',isOpen);
 });
 menu.querySelectorAll('a').forEach(function(link){
  link.addEventListener('click',function(){
   menu.classList.remove('open');
   button.classList.remove('open');
   button.setAttribute('aria-expanded','false');
   document.body.classList.remove('menu-open');
  });
 });
}
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
function init(){
 ensureSiteChrome();
 initMobileMenu();
 Promise.all([fetch(PHARMACIES_URL),fetch(GUARDS_URL)]).then(function(r){if(!r[0].ok||!r[1].ok){throw new Error('No se pudieron cargar datos');}return Promise.all([r[0].json(),r[1].json()]);}).then(function(data){var pharmacies=data[0];var guards=data[1].guardias||{};var pharmacy=pharmacies.find(function(p){return (p.url||'').replace(/\/$/,'').split('/').pop()===slug;});var todaysPharmacyId=guards[todayKey];render(pharmacy&&pharmacy.id===todaysPharmacyId,pharmacy);}).catch(function(){render(false,{nombre:'Farmacia',url:window.location.pathname,direccion:'Alhaurín el Grande'});});
}
init();
})();
