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
                    <p class="footer-desc">Guía práctica de Alhaurín el Grande (Málaga): farmacia de guardia, agenda, avisos, guías de servicios y comercios locales.</p>
                    <div class="footer-badges">
                        <span class="footer-badge">📍 Alhaurín el Grande, Málaga</span>
                        <a href="https://whatsapp.com/channel/0029Vb8Yopz8F2pDADQLxx0S" target="_blank" rel="noopener noreferrer" class="footer-badge action whatsapp">💬 Canal de WhatsApp</a>
                        <a href="/contacto/" class="footer-badge action">✉️ Contacto</a>
                    </div>
                </div>

                <div class="footer-nav-col">
                    <h3 class="footer-heading">Hoy</h3>
                    <ul class="footer-menu">
                        <li><a href="/farmacia-de-guardia/">Farmacia de guardia</a></li>
                        <li><a href="/tiempo/">El tiempo</a></li>
                        <li><a href="/avisos/">Avisos</a></li>
                        <li><a href="/agenda/">Agenda</a></li>
                        <li><a href="/este-fin-de-semana/">Este fin de semana</a></li>
                    </ul>
                </div>

                <div class="footer-nav-col">
                    <h3 class="footer-heading">Guías y servicios</h3>
                    <ul class="footer-menu">
                        <li><a href="/guias/">Guías prácticas</a></li>
                        <li><a href="/guia-util/">Guía útil</a></li>
                        <li><a href="/comercios/">Comercios</a></li>
                        <li><a href="/boletin-oficial/">Boletín Oficial (BOP)</a></li>
                        <li><a href="/noticias/">Actualidad</a></li>
                    </ul>
                </div>

                <div class="footer-nav-col">
                    <h3 class="footer-heading">El proyecto</h3>
                    <ul class="footer-menu">
                        <li><a href="/sobre-nosotros/">Sobre el proyecto</a></li>
                        <li><a href="/contacto/">Contacto</a></li>
                        <li><a href="/anunciarse/">Anúnciate</a></li>
                    </ul>
                </div>
            </div>

            <nav class="footer-legal" aria-label="Información legal">
                <a href="/sobre-nosotros/">Sobre el proyecto</a>
                <a href="/contacto/">Contacto</a>
                <a href="/privacidad/">Privacidad</a>
                <a href="/cookies/">Cookies</a>
                <a href="/aviso-legal/">Aviso legal</a>
                <button type="button" class="footer-consent-link" data-consent-open>Configurar cookies</button>
            </nav>

            <div class="footer-bottom">
                <p>© 2026 Alhaurín al Día · Guía práctica de Alhaurín el Grande.</p>
                <a href="#top" class="back-to-top">Volver arriba ↑</a>
            </div>
        </div>
    </footer>`;

module.exports = { SITE_FOOTER_HTML };
