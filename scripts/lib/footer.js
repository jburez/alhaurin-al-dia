// Footer único compartido por todos los generadores Node.
//
// Fuente única de verdad del footer del sitio (ver docs/AUDITORIA-2026-08-TECNICA-DISENO.md
// §3.1). Usa rutas absolutas ("/noticias/", etc.) para funcionar igual a cualquier
// profundidad de carpeta sin lógica de prefijo. Debe mantenerse idéntico a
// scripts/lib/footer.py (versión Python) y al <footer class="site-footer"> de index.html.

const SITE_FOOTER_HTML = `<footer class="site-footer">
        <div class="container">
            <div class="footer-top">
                <div class="footer-brand">
                    <div class="footer-logo">
                        <span class="footer-logo-mark">A</span>
                        <strong>Alhaurín <span>al Día</span></strong>
                    </div>
                    <p class="footer-desc">El portal de información hiperlocal independiente, servicios de consulta diaria, farmacias de guardia y guía útil de Alhaurín el Grande (Málaga).</p>
                    <div class="footer-badges">
                        <span class="footer-badge">📍 Alhaurín el Grande, Málaga</span>
                        <a href="https://whatsapp.com/channel/0029Vb8Yopz8F2pDADQLxx0S" target="_blank" rel="noopener noreferrer" class="footer-badge action whatsapp">💬 Canal Oficial WhatsApp</a>
                        <a href="/contacto/" class="footer-badge action">✉️ Contactar / Sugerir noticia</a>
                    </div>
                </div>

                <div class="footer-nav-col">
                    <h3 class="footer-heading">Secciones</h3>
                    <ul class="footer-menu">
                        <li><a href="/noticias/">Noticias de Alhaurín</a></li>
                        <li><a href="/guia-util/">Guía Útil de Servicios</a></li>
                        <li><a href="/avisos/">Avisos Municipales</a></li>
                        <li><a href="/planes/">Planes y Eventos</a></li>
                        <li><a href="/radar-social/">Radar Social</a></li>
                        <li><a href="/mi-alhaurin/">Mi Alhaurín</a></li>
                    </ul>
                </div>

                <div class="footer-nav-col">
                    <h3 class="footer-heading">Tiempo</h3>
                    <ul class="footer-menu">
                        <li><a href="/tiempo/">El Tiempo en Alhaurín</a></li>
                        <li><a href="/tiempo/comparador/">Comparador de Modelos</a></li>
                        <li><a href="/tiempo/agro/">Agro Meteo</a></li>
                        <li><a href="/tiempo/prevision-horaria/">Previsión por Horas</a></li>
                        <li><a href="/seguimiento/">En Directo</a></li>
                    </ul>
                </div>

                <div class="footer-nav-col">
                    <h3 class="footer-heading">Servicios</h3>
                    <ul class="footer-menu">
                        <li><a href="/comercios/">Comercios Destacados</a></li>
                        <li><a href="/anunciarse/">Anunciarse en la Web</a></li>
                        <li><a href="/boletin-oficial/">Boletín Oficial (BOP)</a></li>
                        <li><a href="/contacto/">Contacto y Redacción</a></li>
                        <li><a href="/sobre-nosotros/">Sobre Nosotros</a></li>
                    </ul>
                </div>
            </div>

            <div class="footer-bottom">
                <p>© 2026 Alhaurín al Día · Diario digital hiperlocal independiente.</p>
                <a href="#top" class="back-to-top">Volver arriba ↑</a>
            </div>
        </div>
    </footer>`;

module.exports = { SITE_FOOTER_HTML };
