#!/usr/bin/env node
/**
 * asc-update-descriptions.js — Push localized long-form `description` to every ASC
 * locale on the targeted version. Replaces stale/short v2.x-era native text with
 * current-feature, current-pricing, full-length native descriptions.
 *
 * Why this script exists:
 *   The 22 non-EN locales had descriptions that were:
 *     - Native quality but outdated (18+ months of feature additions missing)
 *     - Listed old pricing ($9.99 lifetime → now $149.99) and old free/Pro split
 *     - Missing offline maps, Meshtastic mesh, 10 tactical tools, topo tiles,
 *       FixPhrase, GPX/KML, external GPS, mission planning, all themes
 *     - 4 locales (JA/KO/zh-Hans/zh-Hant) only had 400-540 chars vs EN's 3389
 *
 * NATO/military proper nouns kept in English everywhere: MGRS, UTM, DAGR, NATO,
 * SALUTE, MEDEVAC, SPOT, CASEVAC, ICS 201, ANGUS/CFF, Meshtastic, LoRa, BLE,
 * GPS, WGS84, DTG, FixPhrase, GPX, KML, Garmin GLO, Bad Elf.
 *
 * Skipped (already native + recent): en-US, fr-FR, da, hr, uk
 *
 * Usage:
 *   node scripts/asc-update-descriptions.js              # targets latest version
 *   node scripts/asc-update-descriptions.js 3.3.4        # targets v3.3.4
 */
const fs = require('fs');
const path = require('path');

function requireOrHint(mod) {
  try { return require(mod); }
  catch { console.error(`Missing dep "${mod}". Install with: npm install ${mod}`); process.exit(1); }
}

const ROOT = path.resolve(__dirname, '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'secrets/asc_api_key.json'), 'utf8'));

// Native long-form descriptions. Each mirrors the EN structure section-by-section.
// Length target: 2800-3500 chars per locale.
const DESCRIPTIONS = {

  'de-DE': `Das militärische DAGR (AN/PSN-13) kostet 2.500 $ und wiegt fast ein Pfund. Red Grid MGRS bringt dieselben Kernfunktionen der Landnavigation in Ihre Tasche — live 10-stelliges MGRS, magnetische Deklination, Wegpunkte, Peilung und Entfernung — kostenlos. Kein Netzwerk erforderlich. Keine Daten gesammelt. Keine Konten anzulegen.


IHR TELEFON. DAGR-KLASSE.


Wie der Defense Advanced GPS Receiver, den Soldaten weltweit tragen, zeigt Red Grid Ihre Military-Grid-Reference-System-Position in Echtzeit mit 1-Meter-Präzision. Aber Red Grid geht weiter — mit Offline-Taktikkarten, Meshtastic-Mesh-Netzwerk, NATO-Phonetik-Sprachausgabe, taktischer Berichtserzeugung und Schrittzählung, die das DAGR nicht bietet.


OFFLINE-TAKTIKKARTEN:

- Drei Kartenstile: Standard, Dark Tactical und Topografisch (Höhenlinien)
- Kacheln für Ihren Einsatzraum herunterladen
- Offline-Modus für netzwerkfreie Kartennutzung
- MGRS-Gitter über alle Kartenstile gelegt
- Funktioniert vollständig getrennt von jedem Netzwerk


MESHTASTIC MESH-NETZWERK:

- Teilen Sie Ihre Position über LoRa-Mesh per BLE
- Sehen Sie andere Mesh-Nutzer in Echtzeit auf der Karte
- Kein Mobilfunk, kein Internet, keine Infrastruktur nötig
- Nur Meshtastic-Funkgeräte und Telefone


DAGR-ÄQUIVALENTE FUNKTIONEN:

- Live MGRS-Koordinaten (4/6/8/10-stellige Präzision)
- Magnetische Deklination (WMM-Modell)
- Wegpunktspeicher mit Peilung und Entfernung
- Rückazimut und Koppelnavigation
- Geschwindigkeit, Höhe und Kurs
- Mehrere Koordinatenformate (MGRS, UTM, DD, DMS)
- Komplett offline — keine Cloud-Abhängigkeit


10 TAKTISCHE WERKZEUGE:

- Rückazimut-Rechner
- Koppelnavigations-Plotter
- Zwei-Punkt-Resektion
- Schrittzähler
- Magnetische Deklination
- Zeit-Distanz-Geschwindigkeit
- Sonnen- und Monddaten
- MGRS-Präzisionsumschalter (1m bis 100km)
- Höhe und Hangwinkel
- Foto-Geostempel (MGRS/DTG ins Bild)


6 FUNKBEREITE BERICHTSVORLAGEN:

Erzeugen Sie formatierte Berichte zur Übertragung über jedes Netz — eine Fähigkeit, die das DAGR nicht hat:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9-Zeilen MEDEVAC
- SPOT-Bericht
- ICS 201 Lagebericht
- CASEVAC
- ANGUS/CFF-Feuerauftrag


WEITERE FUNKTIONEN:

- NATO-Phonetik-Sprachausgabe (Hände frei)
- HUD-Modus (Vollbild-Taktikanzeige)
- Externes GPS (Garmin GLO, Bad Elf)
- GPX/KML Import und Export
- FixPhrase: Open-Source What3Words-Alternative
- Missionsplanung mit Routenüberlagerung
- 4 taktische Themen (Rot, NVG, Tag, Blau)
- Haptisches Feedback für blindes Bedienen
- 6 Sprachen (EN, FR, DE, ES, JA, KO)


FÜR OPERATOREN GEBAUT:

Red Grid MGRS ist für Militärpersonal, SAR-Teams, Polizei, Forstfeuerwehren, Ersthelfer, Jäger und Hinterland-Wanderer entworfen, die in unwegsamen Umgebungen auf genaue Gitterkoordinaten angewiesen sind.


NULL-FUSSABDRUCK PRIVATSPHÄRE:

- Keine Konten. Keine Anmeldung. Kein Login.
- Keine Cloud-Synchronisation. Keine Analyse. Kein Tracking.
- Keine Werbung. Keine Daten verlassen Ihr Gerät.
- Standortdaten nur im Speicher, nie gespeichert oder übertragen.


Kostenlos herunterladen — enthält live 10-stelliges MGRS, 1 Thema, Basis-Werkzeuge und 3 Berichtsvorlagen. Upgrade auf Red Grid Pro für alle 10 Werkzeuge, Offline-Karten, Mesh-Netzwerk, alle Themen, unbegrenzte Wegpunkte und alle 6 Berichte. Monatlich, jährlich oder Lifetime erhältlich.`,


  'es-ES': `El DAGR militar (AN/PSN-13) cuesta 2.500 $ y pesa casi medio kilo. Red Grid MGRS pone las mismas capacidades centrales de navegación terrestre en tu bolsillo — MGRS de 10 dígitos en vivo, declinación magnética, waypoints, rumbo y distancia — gratis. Sin red. Sin recolección de datos. Sin cuentas que crear.


TU TELÉFONO. CAPACIDAD DAGR.


Como el Defense Advanced GPS Receiver que llevan los combatientes en todo el mundo, Red Grid muestra tu posición Military Grid Reference System en tiempo real con precisión de 1 metro. Pero Red Grid va más allá — añadiendo mapas tácticos sin conexión, malla Meshtastic, voz fonética OTAN, generación de informes tácticos y conteo de pasos que el DAGR no ofrece.


MAPAS TÁCTICOS SIN CONEXIÓN:

- Tres estilos de mapa: Estándar, Táctico Oscuro y Topográfico (curvas de nivel)
- Descarga teselas para tu zona de operaciones
- Modo offline para uso del mapa sin red
- Cuadrícula MGRS sobre todos los estilos
- Funciona completamente desconectado de cualquier red


MALLA MESHTASTIC:

- Comparte tu posición sobre malla LoRa vía BLE
- Ve a otros usuarios mesh en el mapa en tiempo real
- Sin cobertura, sin internet, sin infraestructura
- Solo radios Meshtastic y teléfonos


FUNCIONES EQUIVALENTES AL DAGR:

- Coordenadas MGRS en vivo (precisión 4/6/8/10 dígitos)
- Declinación magnética (modelo WMM)
- Almacenamiento de waypoints con rumbo y distancia
- Azimut inverso y navegación por estima
- Velocidad, altitud y rumbo
- Múltiples formatos de coordenadas (MGRS, UTM, DD, DMS)
- Operación totalmente offline — cero dependencia en la nube


10 HERRAMIENTAS TÁCTICAS:

- Calculadora de azimut inverso
- Trazador de navegación por estima
- Resección de dos puntos
- Contador de pasos
- Referencia de declinación magnética
- Solucionador Tiempo-Distancia-Velocidad
- Posición de Sol y Luna
- Selector de precisión MGRS (1m a 100km)
- Calculadora de elevación y pendiente
- Geosello de fotos (MGRS/DTG grabado en imágenes)


6 PLANTILLAS DE INFORMES LISTAS PARA RADIO:

Genera informes formateados listos para transmitir por cualquier red — capacidad que el DAGR no incluye:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- MEDEVAC de 9 líneas
- Informe SPOT
- Resumen de incidente ICS 201
- CASEVAC
- Misión de fuego ANGUS/CFF


MÁS CAPACIDADES:

- Lectura de voz fonética OTAN (uso manos libres)
- Modo HUD (pantalla táctica completa)
- Soporte GPS externo (Garmin GLO, Bad Elf)
- Importación y exportación GPX/KML
- FixPhrase: alternativa open-source a What3Words
- Planificación de misión con ruta superpuesta
- 4 temas tácticos (rojo, NVG, día, azul)
- Retroalimentación háptica para operación sin mirar
- 6 idiomas (EN, FR, DE, ES, JA, KO)


CONSTRUIDA PARA OPERADORES:

Red Grid MGRS está diseñada para personal militar, equipos de búsqueda y rescate, fuerzas del orden, bomberos forestales, primeros respondedores, cazadores y excursionistas que dependen de coordenadas precisas en entornos austeros.


PRIVACIDAD DE HUELLA CERO:

- Sin cuentas. Sin registro. Sin login.
- Sin sincronización en la nube. Sin analítica. Sin seguimiento.
- Sin publicidad. Ningún dato sale de tu dispositivo.
- Los datos de ubicación solo están en memoria, nunca se almacenan ni transmiten.


Descarga gratis — incluye MGRS de 10 dígitos en vivo, 1 tema, herramientas básicas y 3 plantillas de informes. Actualiza a Red Grid Pro para las 10 herramientas, mapas offline, malla, todos los temas, waypoints ilimitados y los 6 informes. Mensual, anual o de por vida.`,


  'es-MX': `El DAGR militar (AN/PSN-13) cuesta $2,500 USD y pesa casi medio kilo. Red Grid MGRS pone las mismas capacidades centrales de navegación terrestre en tu bolsillo — MGRS de 10 dígitos en vivo, declinación magnética, waypoints, rumbo y distancia — gratis. Sin red. Sin recolección de datos. Sin cuentas.


TU CELULAR. CAPACIDAD DAGR.


Como el Defense Advanced GPS Receiver que cargan los combatientes en todo el mundo, Red Grid muestra tu posición Military Grid Reference System en tiempo real con precisión de 1 metro. Pero Red Grid va más allá — agregando mapas tácticos sin conexión, malla Meshtastic, voz fonética OTAN, generación de reportes tácticos y conteo de pasos que el DAGR no incluye.


MAPAS TÁCTICOS OFFLINE:

- Tres estilos de mapa: Estándar, Táctico Oscuro y Topográfico (curvas de nivel)
- Descarga teselas para tu área de operaciones
- Modo offline para usar el mapa sin red
- Cuadrícula MGRS sobre todos los estilos
- Funciona totalmente desconectado de cualquier red


MALLA MESHTASTIC:

- Comparte tu posición por malla LoRa vía BLE
- Ve a otros usuarios mesh en el mapa en tiempo real
- Sin señal celular, sin internet, sin infraestructura
- Solo radios Meshtastic y celulares


FUNCIONES EQUIVALENTES AL DAGR:

- Coordenadas MGRS en vivo (precisión 4/6/8/10 dígitos)
- Declinación magnética (modelo WMM)
- Almacenamiento de waypoints con rumbo y distancia
- Azimut inverso y estima
- Velocidad, altitud y rumbo
- Múltiples formatos de coordenadas (MGRS, UTM, DD, DMS)
- Operación 100% offline — cero dependencia de la nube


10 HERRAMIENTAS TÁCTICAS:

- Calculadora de azimut inverso
- Trazador de estima
- Resección de dos puntos
- Conteo de pasos
- Referencia de declinación magnética
- Solucionador Tiempo-Distancia-Velocidad
- Posición de Sol y Luna
- Selector de precisión MGRS (1m a 100km)
- Calculadora de elevación y pendiente
- Geosello de foto (MGRS/DTG en la imagen)


6 PLANTILLAS DE REPORTE LISTAS PARA RADIO:

Genera reportes formateados listos para transmitir por cualquier red — capacidad que el DAGR no tiene:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- MEDEVAC de 9 líneas
- Reporte SPOT
- Resumen de incidente ICS 201
- CASEVAC
- Misión de fuego ANGUS/CFF


MÁS CAPACIDADES:

- Lectura de voz fonética OTAN (manos libres)
- Modo HUD (pantalla táctica completa)
- Soporte GPS externo (Garmin GLO, Bad Elf)
- Importación y exportación GPX/KML
- FixPhrase: alternativa open-source a What3Words
- Planificación de misión con ruta superpuesta
- 4 temas tácticos (rojo, NVG, día, azul)
- Retroalimentación háptica para operación sin ver
- 6 idiomas (EN, FR, DE, ES, JA, KO)


HECHA PARA OPERADORES:

Red Grid MGRS está diseñada para personal militar, equipos de búsqueda y rescate, policía táctica, bomberos forestales, primeros respondientes, cazadores y excursionistas que dependen de coordenadas precisas en entornos austeros.


PRIVACIDAD HUELLA CERO:

- Sin cuentas. Sin registro. Sin login.
- Sin sincronización en la nube. Sin analítica. Sin rastreo.
- Sin anuncios. Ningún dato sale de tu dispositivo.
- Los datos de ubicación viven solo en memoria, nunca se guardan ni se transmiten.


Descarga gratis — incluye MGRS de 10 dígitos en vivo, 1 tema, herramientas básicas y 3 plantillas de reporte. Mejora a Red Grid Pro para las 10 herramientas, mapas offline, malla, todos los temas, waypoints ilimitados y los 6 reportes. Mensual, anual o de por vida.`,


  'it': `Il DAGR militare (AN/PSN-13) costa 2.500 $ e pesa quasi mezzo chilo. Red Grid MGRS porta le stesse capacità centrali di navigazione terrestre in tasca — MGRS a 10 cifre in tempo reale, declinazione magnetica, waypoint, rilevamento e distanza — gratis. Nessuna rete richiesta. Nessun dato raccolto. Nessun account da creare.


IL TUO TELEFONO. CAPACITÀ DAGR.


Come il Defense Advanced GPS Receiver portato dai combattenti in tutto il mondo, Red Grid mostra la tua posizione Military Grid Reference System in tempo reale con precisione di 1 metro. Ma Red Grid va oltre — aggiungendo mappe tattiche offline, mesh Meshtastic, voce fonetica NATO, generazione di rapporti tattici e conteggio passi che il DAGR non offre.


MAPPE TATTICHE OFFLINE:

- Tre stili di mappa: Standard, Dark Tactical e Topografica (curve di livello)
- Scarica tessere per la tua area di operazione
- Modalità offline per uso mappa senza rete
- Griglia MGRS sovrapposta a tutti gli stili
- Funziona completamente staccato da ogni rete


RETE MESH MESHTASTIC:

- Condividi la tua posizione su mesh LoRa via BLE
- Vedi altri utenti mesh sulla mappa in tempo reale
- Nessun segnale cellulare, nessuna connessione, nessuna infrastruttura
- Solo radio Meshtastic e telefoni


FUNZIONI EQUIVALENTI AL DAGR:

- Coordinate MGRS in tempo reale (precisione 4/6/8/10 cifre)
- Declinazione magnetica (modello WMM)
- Archiviazione waypoint con rilevamento e distanza
- Azimut inverso e stima
- Velocità, altitudine e direzione
- Formati di coordinate multipli (MGRS, UTM, DD, DMS)
- Funzionamento totalmente offline — zero dipendenze cloud


10 STRUMENTI TATTICI:

- Calcolatore azimut inverso
- Tracciatore stima
- Resezione a due punti
- Contapassi
- Riferimento declinazione magnetica
- Risolutore Tempo-Distanza-Velocità
- Dati Sole e Luna
- Selettore precisione MGRS (1m a 100km)
- Calcolatore quota e pendenza
- Geomarcatura foto (MGRS/DTG inciso sull'immagine)


6 MODELLI DI RAPPORTO PRONTI PER RADIO:

Genera rapporti formattati pronti per la trasmissione su qualsiasi rete — capacità che il DAGR non include:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- MEDEVAC a 9 righe
- Rapporto SPOT
- Briefing incidente ICS 201
- CASEVAC
- Missione di fuoco ANGUS/CFF


ALTRE CAPACITÀ:

- Lettura vocale fonetica NATO (mani libere)
- Modalità HUD (display tattico a schermo intero)
- Supporto GPS esterno (Garmin GLO, Bad Elf)
- Importazione ed esportazione GPX/KML
- FixPhrase: alternativa open-source a What3Words
- Pianificazione missione con sovrapposizione rotta
- 4 temi tattici (rosso, NVG, giorno, blu)
- Feedback aptico per operazione senza guardare
- 6 lingue (EN, FR, DE, ES, JA, KO)


COSTRUITA PER OPERATORI:

Red Grid MGRS è progettata per personale militare, squadre di ricerca e soccorso, forze dell'ordine, vigili del fuoco forestali, primi soccorritori, cacciatori ed escursionisti che dipendono da coordinate precise in ambienti austeri.


PRIVACY A IMPRONTA ZERO:

- Nessun account. Nessuna registrazione. Nessun login.
- Nessuna sincronizzazione cloud. Nessuna analisi. Nessun tracciamento.
- Nessun annuncio. Nessun dato lascia il tuo dispositivo.
- I dati di posizione esistono solo in memoria, mai memorizzati né trasmessi.


Scarica gratis — include MGRS a 10 cifre in tempo reale, 1 tema, strumenti base e 3 modelli di rapporto. Aggiorna a Red Grid Pro per tutti i 10 strumenti, mappe offline, mesh, tutti i temi, waypoint illimitati e tutti i 6 rapporti. Mensile, annuale o a vita.`,


  'nl-NL': `De militaire DAGR (AN/PSN-13) kost $2.500 en weegt bijna een pond. Red Grid MGRS brengt dezelfde kerncapaciteit voor landnavigatie in je broekzak — live 10-cijferige MGRS, magnetische declinatie, waypoints, peiling en afstand — gratis. Geen netwerk nodig. Geen gegevens verzameld. Geen accounts aanmaken.


JE TELEFOON. DAGR-KLASSE.


Net als de Defense Advanced GPS Receiver die wereldwijd door militairen wordt gedragen, toont Red Grid je Military Grid Reference System-positie in realtime met 1-meter precisie. Maar Red Grid gaat verder — met offline tactische kaarten, Meshtastic mesh-netwerk, NAVO-fonetische spraakuitvoer, tactische rapportgeneratie en stappentelling die de DAGR niet biedt.


OFFLINE TACTISCHE KAARTEN:

- Drie kaartstijlen: Standaard, Dark Tactical en Topografisch (hoogtelijnen)
- Download tegels voor je operatiegebied
- Offline-modus voor netwerkloos kaartgebruik
- MGRS-raster over alle kaartstijlen
- Werkt volledig losgekoppeld van elk netwerk


MESHTASTIC MESH-NETWERK:

- Deel je positie via LoRa-mesh via BLE
- Zie andere mesh-gebruikers op de kaart in realtime
- Geen mobiel signaal, geen internet, geen infrastructuur nodig
- Alleen Meshtastic-radio's en telefoons


DAGR-EQUIVALENTE FUNCTIES:

- Live MGRS-coördinaten (4/6/8/10-cijferige precisie)
- Magnetische declinatie (WMM-model)
- Waypoint-opslag met peiling en afstand
- Terugazimuth en gegist bestek
- Snelheid, hoogte en koers
- Meerdere coördinaatformaten (MGRS, UTM, DD, DMS)
- Volledig offline werking — nul cloud-afhankelijkheid


10 TACTISCHE GEREEDSCHAPPEN:

- Terugazimuth-rekenmachine
- Gegist-bestek-plotter
- Achterwaartse insnijding
- Stappenteller
- Magnetische declinatie-referentie
- Tijd-Afstand-Snelheid-oplosser
- Zon- en maandata
- MGRS-precisieschakelaar (1m tot 100km)
- Hoogte- en hellingrekenmachine
- Foto-geostempel (MGRS/DTG ingebrand)


6 RADIOKLARE RAPPORTSJABLONEN:

Genereer geformatteerde rapporten klaar voor verzending over elk net — een mogelijkheid die de DAGR niet biedt:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9-regels MEDEVAC
- SPOT-rapport
- ICS 201 incident briefing
- CASEVAC
- ANGUS/CFF vuuropdracht


MEER CAPACITEITEN:

- NAVO-fonetische spraakuitvoer (handsfree)
- HUD-modus (tactisch volledig scherm)
- Externe GPS (Garmin GLO, Bad Elf)
- GPX/KML import en export
- FixPhrase: open-source What3Words-alternatief
- Missieplanning met routeoverlay
- 4 tactische thema's (rood, NVG, dag, blauw)
- Haptische feedback voor blind bedienen
- 6 talen (EN, FR, DE, ES, JA, KO)


GEBOUWD VOOR OPERATORS:

Red Grid MGRS is ontworpen voor militair personeel, SAR-teams, politie, bosbrandbestrijders, eerstehulpverleners, jagers en outback-wandelaars die in zware omstandigheden afhankelijk zijn van precieze rasterscoördinaten.


NUL-VOETAFDRUK PRIVACY:

- Geen accounts. Geen registratie. Geen inloggen.
- Geen cloud-sync. Geen analytics. Geen tracking.
- Geen advertenties. Geen gegevens verlaten je apparaat.
- Locatiegegevens leven alleen in het geheugen, nooit opgeslagen of verzonden.


Download gratis — bevat live 10-cijferige MGRS, 1 thema, basisgereedschappen en 3 rapportsjablonen. Upgrade naar Red Grid Pro voor alle 10 gereedschappen, offline kaarten, mesh, alle thema's, onbeperkte waypoints en alle 6 rapporten. Maandelijks, jaarlijks of levenslang.`,


  'pt-BR': `O DAGR militar (AN/PSN-13) custa US$ 2.500 e pesa quase meio quilo. O Red Grid MGRS coloca as mesmas capacidades centrais de navegação terrestre no seu bolso — MGRS de 10 dígitos ao vivo, declinação magnética, waypoints, azimute e distância — de graça. Sem rede. Sem coleta de dados. Sem contas para criar.


SEU CELULAR. CAPACIDADE DAGR.


Como o Defense Advanced GPS Receiver que combatentes do mundo todo carregam, o Red Grid mostra sua posição Military Grid Reference System em tempo real com precisão de 1 metro. Mas o Red Grid vai além — adicionando mapas táticos offline, malha Meshtastic, leitura por voz fonética OTAN, geração de relatórios táticos e contador de passos que o DAGR não tem.


MAPAS TÁTICOS OFFLINE:

- Três estilos de mapa: Padrão, Tático Escuro e Topográfico (curvas de nível)
- Baixa azulejos para a sua área de operação
- Modo offline para uso do mapa sem rede
- Grade MGRS sobre todos os estilos
- Funciona totalmente desconectado de qualquer rede


MALHA MESHTASTIC:

- Compartilhe sua posição via malha LoRa por BLE
- Veja outros usuários da malha no mapa em tempo real
- Sem sinal celular, sem internet, sem infraestrutura
- Apenas rádios Meshtastic e celulares


FUNÇÕES EQUIVALENTES AO DAGR:

- Coordenadas MGRS em tempo real (precisão de 4/6/8/10 dígitos)
- Declinação magnética (modelo WMM)
- Armazenamento de waypoints com azimute e distância
- Azimute reverso e navegação estimada
- Velocidade, altitude e direção
- Múltiplos formatos de coordenadas (MGRS, UTM, DD, DMS)
- Operação 100% offline — zero dependência de nuvem


10 FERRAMENTAS TÁTICAS:

- Calculadora de azimute reverso
- Plotador de navegação estimada
- Resseção de dois pontos
- Contador de passos
- Referência de declinação magnética
- Resolutor Tempo-Distância-Velocidade
- Posição do Sol e da Lua
- Seletor de precisão MGRS (1m a 100km)
- Calculadora de elevação e inclinação
- Geocarimbo de foto (MGRS/DTG gravado na imagem)


6 MODELOS DE RELATÓRIO PRONTOS PARA RÁDIO:

Gere relatórios formatados prontos para transmitir em qualquer rede — capacidade que o DAGR não tem:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- MEDEVAC de 9 linhas
- Relatório SPOT
- Briefing de incidente ICS 201
- CASEVAC
- Missão de fogo ANGUS/CFF


MAIS RECURSOS:

- Leitura por voz fonética OTAN (mãos livres)
- Modo HUD (tela tática em tela cheia)
- Suporte a GPS externo (Garmin GLO, Bad Elf)
- Importação e exportação GPX/KML
- FixPhrase: alternativa open-source ao What3Words
- Planejamento de missão com sobreposição de rota
- 4 temas táticos (vermelho, NVG, dia, azul)
- Feedback háptico para operação sem olhar
- 6 idiomas (EN, FR, DE, ES, JA, KO)


FEITO PARA OPERADORES:

O Red Grid MGRS é projetado para militares, equipes de busca e salvamento, forças policiais, brigadistas, primeiros socorristas, caçadores e mochileiros que dependem de coordenadas precisas em ambientes austeros.


PRIVACIDADE PEGADA ZERO:

- Sem contas. Sem cadastro. Sem login.
- Sem sincronização na nuvem. Sem analytics. Sem rastreamento.
- Sem anúncios. Nenhum dado sai do seu dispositivo.
- Dados de localização vivem apenas em memória, nunca armazenados ou transmitidos.


Baixe grátis — inclui MGRS de 10 dígitos ao vivo, 1 tema, ferramentas básicas e 3 modelos de relatório. Atualize para Red Grid Pro por todas as 10 ferramentas, mapas offline, malha, todos os temas, waypoints ilimitados e todos os 6 relatórios. Mensal, anual ou vitalício.`,


  'ru': `Военный DAGR (AN/PSN-13) стоит 2 500 долларов и весит почти полкилограмма. Red Grid MGRS даёт те же ключевые возможности наземной навигации в кармане — 10-значный MGRS в реальном времени, магнитное склонение, путевые точки, азимут и расстояние — бесплатно. Сеть не нужна. Данные не собираются. Учётные записи не создаются.


ВАШ ТЕЛЕФОН. КЛАСС DAGR.


Как Defense Advanced GPS Receiver, который носят бойцы по всему миру, Red Grid отображает вашу позицию Military Grid Reference System в реальном времени с точностью до 1 метра. Но Red Grid идёт дальше — добавляя офлайн-тактические карты, mesh-сеть Meshtastic, фонетическую озвучку НАТО, генерацию тактических донесений и счётчик шагов, которых нет у DAGR.


ОФЛАЙН-ТАКТИЧЕСКИЕ КАРТЫ:

- Три стиля карты: стандартный, тёмный тактический и топографический (изолинии)
- Загрузка тайлов для вашего района операций
- Офлайн-режим без сети
- Сетка MGRS поверх всех стилей
- Работает полностью отключённо от любой сети


MESHTASTIC MESH-СЕТЬ:

- Передавайте свою позицию по LoRa-mesh через BLE
- Видите других пользователей mesh на карте в реальном времени
- Без сотовой связи, без интернета, без инфраструктуры
- Только радиостанции Meshtastic и телефоны


ВОЗМОЖНОСТИ УРОВНЯ DAGR:

- Координаты MGRS в реальном времени (4/6/8/10 знаков точности)
- Магнитное склонение (модель WMM)
- Хранение путевых точек с азимутом и расстоянием
- Обратный азимут и счисление пути
- Скорость, высота и курс
- Несколько форматов координат (MGRS, UTM, DD, DMS)
- Полная офлайн-работа — ноль зависимости от облака


10 ТАКТИЧЕСКИХ ИНСТРУМЕНТОВ:

- Калькулятор обратного азимута
- Планировщик счисления пути
- Обратная засечка по двум точкам
- Счётчик шагов
- Справочник магнитного склонения
- Решатель Время-Расстояние-Скорость
- Положение Солнца и Луны
- Переключатель точности MGRS (от 1 м до 100 км)
- Калькулятор высоты и уклона
- Гео-штамп фото (MGRS/DTG поверх изображения)


6 ШАБЛОНОВ ДОНЕСЕНИЙ ГОТОВЫХ К ПЕРЕДАЧЕ:

Создавайте форматированные донесения готовые к передаче по любому каналу — возможность, которой нет у DAGR:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9-строчный MEDEVAC
- Донесение SPOT
- Брифинг ICS 201
- CASEVAC
- Огневая заявка ANGUS/CFF


ДОПОЛНИТЕЛЬНЫЕ ВОЗМОЖНОСТИ:

- Фонетическая озвучка НАТО (без рук)
- HUD-режим (полноэкранный тактический дисплей)
- Поддержка внешнего GPS (Garmin GLO, Bad Elf)
- Импорт и экспорт GPX/KML
- FixPhrase: open-source альтернатива What3Words
- Планирование миссии с маршрутом
- 4 тактических темы (красная, NVG, дневная, синяя)
- Тактильная отдача для управления без взгляда
- 6 языков (EN, FR, DE, ES, JA, KO)


СОЗДАНО ДЛЯ ОПЕРАТОРОВ:

Red Grid MGRS разработан для военнослужащих, поисково-спасательных команд, силовиков, лесных пожарных, спасателей, охотников и любителей дикой природы, которым нужны точные координаты в суровых условиях.


НУЛЕВОЙ СЛЕД ПРИВАТНОСТИ:

- Никаких учётных записей. Никакой регистрации. Никакого входа.
- Никакой облачной синхронизации. Никакой аналитики. Никакого отслеживания.
- Никакой рекламы. Никакие данные не покидают устройство.
- Данные о местоположении живут только в памяти, никогда не сохраняются и не передаются.


Бесплатная загрузка — включает 10-значный MGRS в реальном времени, 1 тему, базовые инструменты и 3 шаблона донесений. Обновитесь до Red Grid Pro: все 10 инструментов, офлайн-карты, mesh, все темы, неограниченные путевые точки и все 6 донесений. Помесячно, ежегодно или пожизненно.`,


  'pl': `Wojskowy DAGR (AN/PSN-13) kosztuje 2 500 USD i waży prawie pół kilo. Red Grid MGRS daje te same kluczowe możliwości nawigacji lądowej w kieszeni — żywe 10-cyfrowe MGRS, deklinację magnetyczną, punkty trasy, azymut i odległość — za darmo. Bez sieci. Bez zbierania danych. Bez kont.


TWÓJ TELEFON. KLASA DAGR.


Tak jak Defense Advanced GPS Receiver noszony przez żołnierzy na całym świecie, Red Grid pokazuje twoją pozycję Military Grid Reference System w czasie rzeczywistym z dokładnością 1 metra. Ale Red Grid idzie dalej — dodając tryb offline tactical maps, sieć mesh Meshtastic, fonetyczną mowę NATO, generowanie meldunków taktycznych i liczenie kroków, czego DAGR nie oferuje.


MAPY TAKTYCZNE OFFLINE:

- Trzy style map: standardowy, ciemny taktyczny i topograficzny (poziomice)
- Pobieranie kafli dla twojego rejonu działań
- Tryb offline do użycia mapy bez sieci
- Siatka MGRS na wszystkich stylach
- Działa całkowicie odłączony od każdej sieci


SIEĆ MESH MESHTASTIC:

- Udostępniaj swoją pozycję przez mesh LoRa via BLE
- Widz innych użytkowników mesh na mapie w czasie rzeczywistym
- Bez sygnału komórkowego, bez internetu, bez infrastruktury
- Tylko radia Meshtastic i telefony


FUNKCJE RÓWNOWAŻNE DAGR:

- Współrzędne MGRS na żywo (precyzja 4/6/8/10 cyfr)
- Deklinacja magnetyczna (model WMM)
- Przechowywanie punktów trasy z azymutem i odległością
- Azymut powrotny i nawigacja zliczeniowa
- Prędkość, wysokość i kurs
- Wiele formatów współrzędnych (MGRS, UTM, DD, DMS)
- Pełna praca offline — zero zależności od chmury


10 NARZĘDZI TAKTYCZNYCH:

- Kalkulator azymutu powrotnego
- Plotter nawigacji zliczeniowej
- Wcięcie wstecz z dwóch punktów
- Krokomierz
- Odniesienie deklinacji magnetycznej
- Solver Czas-Odległość-Prędkość
- Pozycja Słońca i Księżyca
- Selektor precyzji MGRS (1m do 100km)
- Kalkulator wysokości i nachylenia
- Geopieczęć zdjęcia (MGRS/DTG na obrazie)


6 SZABLONÓW MELDUNKÓW GOTOWYCH DO RADIA:

Generuj sformatowane meldunki gotowe do nadania przez dowolną sieć — czego DAGR nie ma:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9-wierszowy MEDEVAC
- Meldunek SPOT
- Briefing ICS 201
- CASEVAC
- Zadanie ogniowe ANGUS/CFF


WIĘCEJ MOŻLIWOŚCI:

- Fonetyczna mowa NATO (bez użycia rąk)
- Tryb HUD (taktyczny pełny ekran)
- Obsługa zewnętrznego GPS (Garmin GLO, Bad Elf)
- Import i eksport GPX/KML
- FixPhrase: open-source alternatywa dla What3Words
- Planowanie misji z nakładką trasy
- 4 motywy taktyczne (czerwony, NVG, dzień, niebieski)
- Sprzężenie haptyczne do obsługi bez patrzenia
- 6 języków (EN, FR, DE, ES, JA, KO)


ZBUDOWANE DLA OPERATORÓW:

Red Grid MGRS jest zaprojektowany dla wojska, zespołów poszukiwawczo-ratowniczych, służb porządkowych, strażaków leśnych, ratowników, myśliwych i wędrowców, którzy w trudnym terenie polegają na dokładnych współrzędnych.


PRYWATNOŚĆ ZEROWY ŚLAD:

- Żadnych kont. Żadnej rejestracji. Żadnego logowania.
- Żadnej synchronizacji w chmurze. Żadnych analiz. Żadnego śledzenia.
- Żadnych reklam. Żadne dane nie opuszczają urządzenia.
- Dane lokalizacji żyją tylko w pamięci, nigdy nie są zapisywane ani przesyłane.


Pobierz za darmo — zawiera 10-cyfrowe MGRS na żywo, 1 motyw, podstawowe narzędzia i 3 szablony meldunków. Ulepsz do Red Grid Pro dla wszystkich 10 narzędzi, map offline, sieci mesh, wszystkich motywów, nielimitowanych punktów trasy i wszystkich 6 meldunków. Miesięcznie, rocznie lub na całe życie.`,


  'tr': `Askeri DAGR (AN/PSN-13) 2.500 dolar tutar ve neredeyse yarım kilo ağırlığındadır. Red Grid MGRS aynı temel kara seyrüsefer kabiliyetlerini cebinizde sunar — 10 haneli canlı MGRS, manyetik sapma, ara noktalar, kerteriz ve mesafe — ücretsiz. Ağ gerektirmez. Veri toplamaz. Hesap oluşturmaz.


TELEFONUNUZ. DAGR SINIFI.


Dünya genelinde savaşçıların taşıdığı Defense Advanced GPS Receiver gibi Red Grid de Military Grid Reference System konumunuzu 1 metre hassasiyetinde gerçek zamanlı gösterir. Ama Red Grid daha ileri gider — DAGR'ın sunmadığı çevrimdışı taktik haritalar, Meshtastic mesh ağı, NATO fonetik sesli okuma, taktik rapor üretimi ve adım sayma gibi özellikler ekler.


ÇEVRİMDIŞI TAKTİK HARİTALAR:

- Üç harita stili: Standart, Karanlık Taktik ve Topografik (eş yükselti eğrileri)
- Operasyon alanınız için karo indirme
- Ağsız harita kullanımı için çevrimdışı modu
- Tüm stillerin üzerinde MGRS ızgarası
- Her ağdan tamamen bağımsız çalışır


MESHTASTIC MESH AĞ:

- Konumunuzu BLE üzerinden LoRa mesh ile paylaşın
- Diğer mesh kullanıcılarını haritada gerçek zamanlı görün
- Hücresel servis, internet veya altyapı gerekmez
- Sadece Meshtastic radyolar ve telefonlar


DAGR EŞDEĞER ÖZELLİKLER:

- Canlı MGRS koordinatları (4/6/8/10 hane hassasiyet)
- Manyetik sapma (WMM modeli)
- Kerteriz ve mesafe ile ara nokta saklama
- Geri kerteriz ve hesaplı seyrüsefer
- Hız, irtifa ve seyir
- Çoklu koordinat formatları (MGRS, UTM, DD, DMS)
- Tam çevrimdışı çalışma — sıfır bulut bağımlılığı


10 TAKTİK ARAÇ:

- Geri kerteriz hesaplayıcı
- Hesaplı seyrüsefer plotleri
- İki nokta geri kestirme
- Adım sayar
- Manyetik sapma referansı
- Zaman-Mesafe-Hız çözücü
- Güneş ve Ay verileri
- MGRS hassasiyet seçici (1m'den 100km'ye)
- Yükseklik ve eğim hesaplayıcı
- Foto geomülk (görüntüye MGRS/DTG yakma)


RADYO İÇİN HAZIR 6 RAPOR ŞABLONU:

DAGR'ın içermediği bir özellik — herhangi bir telsiz ağı üzerinden iletime hazır biçimlendirilmiş raporlar üretin:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9 satırlık MEDEVAC
- SPOT raporu
- ICS 201 olay brifingi
- CASEVAC
- ANGUS/CFF ateş görevi


DAHA FAZLA YETENEK:

- NATO fonetik sesli okuma (eller serbest)
- HUD modu (tam ekran taktik gösterim)
- Harici GPS desteği (Garmin GLO, Bad Elf)
- GPX/KML içe ve dışa aktarma
- FixPhrase: What3Words'e açık kaynak alternatif
- Rota katmanlı görev planlama
- 4 taktik tema (kırmızı, NVG, gündüz, mavi)
- Bakmadan kullanım için dokunsal geri bildirim
- 6 dil (EN, FR, DE, ES, JA, KO)


OPERATÖRLER İÇİN YAPILDI:

Red Grid MGRS, sert koşullarda doğru ızgara koordinatlarına bağımlı askeri personel, arama ve kurtarma ekipleri, kolluk kuvvetleri, orman yangını ekipleri, ilk müdahaleciler, avcılar ve doğa yürüyüşçüleri için tasarlandı.


SIFIR İZ GİZLİLİK:

- Hesap yok. Kayıt yok. Giriş yok.
- Bulut senkronu yok. Analitik yok. Takip yok.
- Reklam yok. Hiçbir veri cihazınızdan ayrılmaz.
- Konum verileri yalnızca bellekte yaşar, asla saklanmaz veya iletilmez.


Ücretsiz indirin — canlı 10 haneli MGRS, 1 tema, temel araçlar ve 3 rapor şablonu içerir. Tüm 10 araç, çevrimdışı haritalar, mesh, tüm temalar, sınırsız ara noktalar ve tüm 6 rapor için Red Grid Pro'ya yükseltin. Aylık, yıllık veya ömür boyu.`,


  'sv': `Den militära DAGR (AN/PSN-13) kostar 2 500 dollar och väger nästan ett halvkilo. Red Grid MGRS ger samma kärnfunktioner för landnavigering i fickan — live 10-siffrig MGRS, missvisning, waypoints, bäring och avstånd — gratis. Inget nätverk krävs. Inga data samlas in. Inga konton att skapa.


DIN TELEFON. DAGR-KLASS.


Liksom Defense Advanced GPS Receiver som soldater bär världen över visar Red Grid din Military Grid Reference System-position i realtid med 1-meters precision. Men Red Grid går längre — med offline taktiska kartor, Meshtastic mesh-nätverk, NATO-fonetisk röstuppläsning, taktisk rapportgenerering och stegräkning som DAGR inte erbjuder.


OFFLINE TAKTISKA KARTOR:

- Tre kartstilar: Standard, Dark Tactical och Topografisk (höjdkurvor)
- Ladda ner kartrutor för ditt operationsområde
- Offline-läge för nätverkslös kartanvändning
- MGRS-rutnät över alla kartstilar
- Fungerar helt frikopplat från varje nätverk


MESHTASTIC MESH-NÄTVERK:

- Dela din position över LoRa-mesh via BLE
- Se andra mesh-användare på kartan i realtid
- Ingen mobiltäckning, inget internet, ingen infrastruktur
- Bara Meshtastic-radioapparater och telefoner


DAGR-EKVIVALENTA FUNKTIONER:

- Live MGRS-koordinater (4/6/8/10-siffrig precision)
- Missvisning (WMM-modell)
- Waypoint-lagring med bäring och avstånd
- Återbäring och död räkning
- Hastighet, höjd och kurs
- Flera koordinatformat (MGRS, UTM, DD, DMS)
- Helt offline-drift — noll molnberoende


10 TAKTISKA VERKTYG:

- Återbäringsräknare
- Plotter för död räkning
- Tvåpunktsresektion
- Stegräknare
- Missvisningsreferens
- Lösare för Tid-Distans-Hastighet
- Sol- och måndata
- MGRS-precisionsväljare (1 m till 100 km)
- Höjd- och lutningsräknare
- Foto-geostämpel (MGRS/DTG inbränt)


6 RADIOFÄRDIGA RAPPORTMALLAR:

Generera formaterade rapporter klara att skickas över vilket nät som helst — en förmåga DAGR inte har:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9-raders MEDEVAC
- SPOT-rapport
- ICS 201 incidentbriefing
- CASEVAC
- ANGUS/CFF eldorder


FLER FUNKTIONER:

- NATO-fonetisk röstuppläsning (handsfree)
- HUD-läge (taktisk fullskärm)
- Stöd för extern GPS (Garmin GLO, Bad Elf)
- GPX/KML import och export
- FixPhrase: open-source-alternativ till What3Words
- Uppdragsplanering med ruttöverlägg
- 4 taktiska teman (rött, NVG, dag, blått)
- Haptisk feedback för blind användning
- 6 språk (EN, FR, DE, ES, JA, KO)


BYGGT FÖR OPERATÖRER:

Red Grid MGRS är designat för militär personal, SAR-team, polis, skogsbrandbekämpare, första hjälpen, jägare och vildmarksvandrare som i krävande miljöer förlitar sig på exakta rutnätskoordinater.


NOLL-AVTRYCK INTEGRITET:

- Inga konton. Ingen registrering. Ingen inloggning.
- Ingen molnsynk. Ingen analys. Ingen spårning.
- Inga annonser. Inga data lämnar din enhet.
- Platsdata lever bara i minnet, lagras eller överförs aldrig.


Ladda ner gratis — inkluderar live 10-siffrig MGRS, 1 tema, grundläggande verktyg och 3 rapportmallar. Uppgradera till Red Grid Pro för alla 10 verktyg, offline-kartor, mesh, alla teman, obegränsade waypoints och alla 6 rapporter. Månads-, års- eller livstidsabonnemang.`,


  'no': `Den militære DAGR (AN/PSN-13) koster 2 500 dollar og veier nesten et halvkilo. Red Grid MGRS gir de samme kjernefunksjonene for landnavigering i lommen — live 10-sifret MGRS, magnetisk misvisning, veipunkter, peiling og avstand — gratis. Intet nettverk kreves. Ingen data samles inn. Ingen kontoer å opprette.


DIN TELEFON. DAGR-KLASSE.


Som Defense Advanced GPS Receiver som soldater bærer verden over, viser Red Grid din Military Grid Reference System-posisjon i sanntid med 1-meters presisjon. Men Red Grid går lenger — med offline taktiske kart, Meshtastic mesh-nettverk, NATO fonetisk taleopplesing, taktisk rapportgenerering og skritteller som DAGR ikke har.


OFFLINE TAKTISKE KART:

- Tre kartstiler: Standard, Dark Tactical og Topografisk (høydekurver)
- Last ned kartfliser for ditt operasjonsområde
- Offline-modus for nettverksløs kartbruk
- MGRS-rutenett over alle kartstiler
- Fungerer fullstendig frakoblet ethvert nettverk


MESHTASTIC MESH-NETTVERK:

- Del posisjonen din via LoRa-mesh over BLE
- Se andre mesh-brukere på kartet i sanntid
- Ingen mobil dekning, intet internett, ingen infrastruktur
- Bare Meshtastic-radioer og telefoner


DAGR-EKVIVALENTE FUNKSJONER:

- Live MGRS-koordinater (4/6/8/10-sifret presisjon)
- Magnetisk misvisning (WMM-modell)
- Veipunktslagring med peiling og avstand
- Returpeiling og dødregning
- Fart, høyde og kurs
- Flere koordinatformater (MGRS, UTM, DD, DMS)
- Helt offline-drift — null skyavhengighet


10 TAKTISKE VERKTØY:

- Returpeiling-kalkulator
- Plotter for dødregning
- Topunktsoppmåling
- Skritteller
- Magnetisk misvisning-referanse
- Tid-Avstand-Fart-løser
- Sol- og månedata
- MGRS-presisjonsvelger (1m til 100km)
- Høyde- og hellingskalkulator
- Foto-geostempel (MGRS/DTG brent inn)


6 RADIOKLARE RAPPORTMALER:

Generer formaterte rapporter klare til å sendes over ethvert nett — en mulighet DAGR ikke har:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9-linjers MEDEVAC
- SPOT-rapport
- ICS 201 hendelsesbriefing
- CASEVAC
- ANGUS/CFF ildordre


FLERE MULIGHETER:

- NATO fonetisk taleopplesing (håndfri)
- HUD-modus (taktisk fullskjerm)
- Ekstern GPS-støtte (Garmin GLO, Bad Elf)
- GPX/KML import og eksport
- FixPhrase: open-source alternativ til What3Words
- Oppdragsplanlegging med ruteoverlegg
- 4 taktiske temaer (rødt, NVG, dag, blått)
- Haptisk tilbakemelding for blind betjening
- 6 språk (EN, FR, DE, ES, JA, KO)


BYGGET FOR OPERATØRER:

Red Grid MGRS er designet for militært personell, SAR-team, politi, skogbrannfolk, førstehjelpere, jegere og friluftsentusiaster som i ulendte omgivelser stoler på presise rutenettskoordinater.


NULL-FOTAVTRYKK PERSONVERN:

- Ingen kontoer. Ingen registrering. Ingen innlogging.
- Ingen skysync. Ingen analyse. Ingen sporing.
- Ingen annonser. Ingen data forlater enheten din.
- Posisjonsdata lever bare i minnet, aldri lagret eller overført.


Last ned gratis — inkluderer live 10-sifret MGRS, 1 tema, basisverktøy og 3 rapportmaler. Oppgrader til Red Grid Pro for alle 10 verktøy, offline-kart, mesh, alle temaer, ubegrensede veipunkter og alle 6 rapporter. Måneds-, års- eller livstidsabonnement.`,


  'sk': `Vojenský DAGR (AN/PSN-13) stojí 2 500 dolárov a váži takmer pol kila. Red Grid MGRS dáva rovnaké základné možnosti pozemnej navigácie do vrecka — živé 10-miestne MGRS, magnetickú deklináciu, trasové body, azimut a vzdialenosť — zadarmo. Bez siete. Bez zberu dát. Bez účtov.


VÁŠ TELEFÓN. TRIEDA DAGR.


Tak ako Defense Advanced GPS Receiver, ktorý nosia bojovníci po celom svete, Red Grid zobrazuje vašu pozíciu Military Grid Reference System v reálnom čase s presnosťou 1 metra. Ale Red Grid ide ďalej — pridáva offline taktické mapy, mesh sieť Meshtastic, fonetický hlas NATO, generovanie taktických hlásení a počítanie krokov, ktoré DAGR nemá.


OFFLINE TAKTICKÉ MAPY:

- Tri štýly máp: Štandardný, Dark Tactical a Topografický (vrstevnice)
- Sťahovanie dlaždíc pre vašu oblasť operácií
- Offline režim na použitie mapy bez siete
- MGRS mriežka nad všetkými štýlmi
- Funguje úplne odpojený od akejkoľvek siete


MESHTASTIC MESH SIEŤ:

- Zdieľajte pozíciu cez LoRa mesh via BLE
- Vidíte iných mesh používateľov na mape v reálnom čase
- Bez mobilného signálu, bez internetu, bez infraštruktúry
- Len rádiá Meshtastic a telefóny


FUNKCIE EKVIVALENTNÉ DAGR:

- Živé MGRS súradnice (presnosť 4/6/8/10 cifier)
- Magnetická deklinácia (model WMM)
- Ukladanie trasových bodov s azimutom a vzdialenosťou
- Spätný azimut a navigácia výpočtom
- Rýchlosť, výška a smer
- Viac formátov súradníc (MGRS, UTM, DD, DMS)
- Plne offline prevádzka — nulová cloudová závislosť


10 TAKTICKÝCH NÁSTROJOV:

- Kalkulačka spätného azimutu
- Plotter navigácie výpočtom
- Spätné pretínanie z dvoch bodov
- Krokomer
- Referencia magnetickej deklinácie
- Riešič Čas-Vzdialenosť-Rýchlosť
- Pozícia Slnka a Mesiaca
- Volič presnosti MGRS (1m až 100km)
- Kalkulačka výšky a sklonu
- Foto-geopečiatka (MGRS/DTG na obrázku)


6 RÁDIOPRIPRAVENÝCH ŠABLÓN HLÁSENÍ:

Generujte formátované hlásenia pripravené na odovzdanie cez akúkoľvek sieť — schopnosť, ktorú DAGR nemá:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9-riadkový MEDEVAC
- Hlásenie SPOT
- Brífing ICS 201
- CASEVAC
- Palebná úloha ANGUS/CFF


ĎALŠIE MOŽNOSTI:

- Fonetický hlas NATO (bez rúk)
- HUD režim (taktický celoobrazovkový displej)
- Podpora externého GPS (Garmin GLO, Bad Elf)
- Import a export GPX/KML
- FixPhrase: open-source alternatíva k What3Words
- Plánovanie misie s prekrytím trasy
- 4 taktické témy (červená, NVG, deň, modrá)
- Haptická spätná väzba na ovládanie bez pohľadu
- 6 jazykov (EN, FR, DE, ES, JA, KO)


VYTVORENÉ PRE OPERÁTOROV:

Red Grid MGRS je navrhnutý pre vojenský personál, pátracie a záchranárske tímy, polícu, lesných hasičov, prvých záchranárov, lovcov a turistov, ktorí v drsných podmienkach spoliehajú na presné mriežkové súradnice.


SÚKROMIE NULOVEJ STOPY:

- Žiadne účty. Žiadna registrácia. Žiadne prihlásenie.
- Žiadna cloudová synchronizácia. Žiadne analytiky. Žiadne sledovanie.
- Žiadne reklamy. Žiadne dáta neopustia vaše zariadenie.
- Údaje o polohe žijú len v pamäti, nikdy sa neukladajú ani neprenášajú.


Stiahnite zadarmo — zahŕňa živé 10-miestne MGRS, 1 tému, základné nástroje a 3 šablóny hlásení. Aktualizujte na Red Grid Pro pre všetkých 10 nástrojov, offline mapy, mesh, všetky témy, neobmedzené trasové body a všetkých 6 hlásení. Mesačne, ročne alebo doživotne.`,


  'ja': `軍用DAGR（AN/PSN-13）は2,500ドルで重さ約450グラム。Red Grid MGRSは同じ核心の陸上ナビゲーション能力をポケットに入れます — ライブ10桁MGRS、磁気偏差、ウェイポイント、方位と距離 — 無料で。ネットワーク不要。データ収集なし。アカウント作成不要。


あなたのスマートフォン。DAGRクラス。


世界中の戦闘員が携帯するDefense Advanced GPS Receiverと同様、Red GridはMilitary Grid Reference Systemの位置を1メートル精度でリアルタイム表示します。しかしRed Gridはさらに進化 — DAGRにはないオフライン戦術マップ、Meshtasticメッシュネットワーク、NATOフォネティック音声出力、戦術レポート生成、歩数カウントを追加しています。


オフライン戦術マップ：

- 3つの地図スタイル: スタンダード、ダーク戦術、地形図（等高線）
- 作戦地域のタイルをダウンロード
- オフラインモードでネットワーク不要のマップ利用
- すべての地図スタイルに重ねるMGRSグリッド
- あらゆるネットワークから完全切断で動作


MESHTASTICメッシュネットワーク：

- BLE経由のLoRaメッシュで位置を共有
- 他のメッシュユーザーを地図上にリアルタイム表示
- 携帯電波不要、インターネット不要、インフラ不要
- Meshtastic無線機と携帯電話だけ


DAGR相当の機能：

- ライブMGRS座標（4/6/8/10桁精度）
- 磁気偏差（WMMモデル）
- 方位と距離付きウェイポイント保存
- 逆方位と推測航法
- 速度、高度、進路
- 複数座標フォーマット（MGRS、UTM、DD、DMS）
- 完全オフライン動作 — クラウド依存ゼロ


10種の戦術ツール：

- 逆方位計算
- 推測航法プロッター
- 二点後方交会
- 歩数カウント
- 磁気偏差リファレンス
- 時間・距離・速度ソルバー
- 太陽・月位置データ
- MGRS精度切替（1mから100kmまで）
- 高度・斜面計算
- 写真ジオスタンプ（MGRS/DTGを画像に焼き込み）


無線対応6種のレポートテンプレート：

DAGRには無い機能 — 任意の通信網で送信可能なフォーマット済みレポートを生成：

- SALUTE（Size, Activity, Location, Unit, Time, Equipment）
- 9行MEDEVAC
- SPOTレポート
- ICS 201インシデントブリーフィング
- CASEVAC
- ANGUS/CFF火力指示


その他の機能：

- NATOフォネティック音声出力（ハンズフリー）
- HUDモード（全画面戦術ディスプレイ）
- 外部GPS対応（Garmin GLO、Bad Elf）
- GPX/KMLのインポートとエクスポート
- FixPhrase: What3Wordsのオープンソース代替
- ルートオーバーレイ付きミッション計画
- 4種の戦術テーマ（レッド、NVG、デイ、ブルー）
- 視認なしで操作可能な触覚フィードバック
- 6言語（EN、FR、DE、ES、JA、KO）


オペレーター向けに構築：

Red Grid MGRSは過酷な環境で正確なグリッド座標に依存する軍人、捜索救助チーム、法執行機関、森林消防士、初動対応員、ハンター、バックカントリーハイカー向けに設計されています。


ゼロフットプリント・プライバシー：

- アカウント不要。サインアップ不要。ログイン不要。
- クラウド同期なし。アナリティクスなし。トラッキングなし。
- 広告なし。データはデバイスから外に出ません。
- 位置データはメモリ内のみ存在し、保存も送信もされません。


無料ダウンロード — ライブ10桁MGRS表示、1テーマ、基本ツール、3つのレポートテンプレートを含む。Red Grid Proへのアップグレードで全10ツール、オフラインマップ、メッシュネットワーク、全テーマ、無制限ウェイポイント、全6レポートが利用可能。月額、年額、買い切りオプションあり。`,


  'ko': `군용 DAGR (AN/PSN-13)은 2,500달러이며 무게는 약 450그램입니다. Red Grid MGRS는 동일한 핵심 지상 항법 능력을 주머니에 담습니다 — 실시간 10자리 MGRS, 자기 편차, 웨이포인트, 방위 및 거리 — 무료로. 네트워크 불필요. 데이터 수집 없음. 계정 생성 없음.


당신의 스마트폰. DAGR 등급.


전 세계 전투원이 휴대하는 Defense Advanced GPS Receiver처럼 Red Grid는 1미터 정밀도로 Military Grid Reference System 위치를 실시간 표시합니다. 그러나 Red Grid는 한 걸음 더 — DAGR에는 없는 오프라인 전술 지도, Meshtastic 메시 네트워크, NATO 음성 출력, 전술 보고서 생성, 페이스 카운트 기능을 추가했습니다.


오프라인 전술 지도:

- 3가지 지도 스타일: 표준, 다크 전술, 지형도(등고선)
- 작전 지역의 타일 다운로드
- 네트워크 없이 지도 사용을 위한 오프라인 모드
- 모든 지도 스타일에 중첩되는 MGRS 그리드
- 모든 네트워크에서 완전히 분리되어 작동


MESHTASTIC 메시 네트워크:

- BLE를 통한 LoRa 메시로 위치 공유
- 지도에서 다른 메시 사용자를 실시간으로 확인
- 셀룰러, 인터넷, 인프라 불필요
- Meshtastic 무전기와 스마트폰만 있으면 됨


DAGR 동급 기능:

- 실시간 MGRS 좌표 (4/6/8/10자리 정밀도)
- 자기 편차 (WMM 모델)
- 방위 및 거리가 포함된 웨이포인트 저장
- 후방 방위와 추측 항법
- 속도, 고도, 진행 방향
- 다중 좌표 형식 (MGRS, UTM, DD, DMS)
- 완전 오프라인 작동 — 클라우드 의존도 제로


10가지 전술 도구:

- 후방 방위 계산기
- 추측 항법 플로터
- 두 점 후방 교회법
- 페이스 카운트 추적기
- 자기 편차 참고 자료
- 시간-거리-속도 해결사
- 태양과 달 위치 데이터
- MGRS 정밀도 선택기 (1m에서 100km까지)
- 고도와 경사 계산기
- 사진 지오스탬프 (이미지에 MGRS/DTG 각인)


무전 준비된 6가지 보고서 템플릿:

DAGR 하드웨어에는 없는 기능 — 모든 통신망에서 전송 가능한 형식의 보고서 생성:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9-라인 MEDEVAC
- SPOT 보고서
- ICS 201 사건 브리핑
- CASEVAC
- ANGUS/CFF 사격 임무


더 많은 기능:

- NATO 음성 판독 (핸즈프리)
- HUD 모드 (전체 화면 전술 디스플레이)
- 외부 GPS 지원 (Garmin GLO, Bad Elf)
- GPX/KML 가져오기 및 내보내기
- FixPhrase: What3Words의 오픈소스 대안
- 경로 오버레이가 있는 미션 계획
- 4가지 전술 테마 (빨강, NVG, 주간, 파랑)
- 보지 않고 조작할 수 있는 햅틱 피드백
- 6개 언어 (EN, FR, DE, ES, JA, KO)


오퍼레이터를 위해 제작:

Red Grid MGRS는 험난한 환경에서 정확한 그리드 좌표에 의존하는 군인, 수색 구조 팀, 법 집행 기관, 산불 진압 대원, 응급 구조 요원, 사냥꾼, 백컨트리 등산객을 위해 설계되었습니다.


제로 풋프린트 개인 정보 보호:

- 계정 없음. 가입 없음. 로그인 없음.
- 클라우드 동기화 없음. 분석 없음. 추적 없음.
- 광고 없음. 어떤 데이터도 기기에서 나가지 않습니다.
- 위치 데이터는 메모리에만 존재하며, 저장되거나 전송되지 않습니다.


무료 다운로드 — 실시간 10자리 MGRS 표시, 1개 테마, 기본 도구, 3개 보고서 템플릿 포함. Red Grid Pro로 업그레이드하면 전체 10개 도구, 오프라인 지도, 메시 네트워크, 모든 테마, 무제한 웨이포인트, 전체 6개 보고서 사용 가능. 월간, 연간 또는 평생 옵션 제공.`,


  'zh-Hans': `军用 DAGR (AN/PSN-13) 售价 2,500 美元，重约 450 克。Red Grid MGRS 将相同的核心陆地导航能力放入您的口袋 — 实时 10 位 MGRS、磁偏角、航点、方位和距离 — 免费使用。无需网络。不收集数据。无需创建账户。


您的手机。DAGR 级别。


如同全球作战人员佩戴的 Defense Advanced GPS Receiver，Red Grid 以 1 米精度实时显示您的 Military Grid Reference System 位置。但 Red Grid 更进一步 — 加入了离线战术地图、Meshtastic 网状网络、NATO 语音播报、战术报告生成和步数统计，这些都是 DAGR 没有的。


离线战术地图：

- 三种地图样式：标准、深色战术、地形图（等高线）
- 为您的作战区域下载瓦片
- 离线模式下无网络使用地图
- 所有地图样式上叠加 MGRS 网格
- 完全脱离任何网络运行


MESHTASTIC 网状网络：

- 通过 BLE 经 LoRa 网状网络共享您的位置
- 在地图上实时查看其他网状网络用户
- 无需手机信号、无需互联网、无需基础设施
- 仅需 Meshtastic 无线电和手机


DAGR 同等功能：

- 实时 MGRS 坐标（4/6/8/10 位精度）
- 磁偏角（WMM 模型）
- 带方位和距离的航点存储
- 反方位和航位推算
- 速度、海拔和航向
- 多种坐标格式（MGRS、UTM、DD、DMS）
- 完全离线运行 — 零云依赖


10 种战术工具：

- 反方位计算器
- 航位推算绘图仪
- 两点后方交会
- 步数追踪器
- 磁偏角参考
- 时间-距离-速度求解器
- 日月位置数据
- MGRS 精度选择器（1 米至 100 公里）
- 海拔和坡度计算器
- 照片地理戳（MGRS/DTG 烙印到图像中）


6 种无线电准备就绪的报告模板：

生成可在任何网络上传输的格式化报告 — DAGR 硬件没有的能力：

- SALUTE（Size, Activity, Location, Unit, Time, Equipment）
- 9 行 MEDEVAC
- SPOT 报告
- ICS 201 事件简报
- CASEVAC
- ANGUS/CFF 火力任务


更多功能：

- NATO 语音播报（免提）
- HUD 模式（全屏战术显示）
- 外部 GPS 支持（Garmin GLO、Bad Elf）
- GPX/KML 导入和导出
- FixPhrase：开源的 What3Words 替代方案
- 带路线叠加的任务规划
- 4 种战术主题（红色、NVG、白天、蓝色）
- 触觉反馈用于免视操作
- 6 种语言（EN、FR、DE、ES、JA、KO）


为操作员而生：

Red Grid MGRS 专为在严酷环境中依赖精确网格坐标的军事人员、搜救队、执法人员、森林消防员、急救人员、猎人和野外徒步者设计。


零足迹隐私：

- 无账户。无注册。无登录。
- 无云同步。无分析。无追踪。
- 无广告。任何数据都不会离开您的设备。
- 位置数据仅存在于内存中，从不存储或传输。


免费下载 — 包含实时 10 位 MGRS 显示、1 个主题、基本工具和 3 个报告模板。升级到 Red Grid Pro，享受全部 10 个工具、离线地图、网状网络、所有主题、无限航点和全部 6 个报告。提供月付、年付或终身付费选项。`,


  'zh-Hant': `軍用 DAGR（AN/PSN-13）售價 2,500 美元，重約 450 公克。Red Grid MGRS 將相同的核心陸地導航能力放入您的口袋 — 即時 10 位 MGRS、磁偏角、航點、方位和距離 — 免費使用。無需網路。不收集資料。無需建立帳號。


您的手機。DAGR 級別。


如同全球作戰人員佩戴的 Defense Advanced GPS Receiver，Red Grid 以 1 公尺精度即時顯示您的 Military Grid Reference System 位置。但 Red Grid 更進一步 — 加入了離線戰術地圖、Meshtastic 網狀網路、NATO 語音播報、戰術報告生成和步數計算，這些都是 DAGR 所沒有的。


離線戰術地圖：

- 三種地圖樣式：標準、深色戰術、地形圖（等高線）
- 為您的作戰區域下載圖磚
- 離線模式下無網路使用地圖
- 所有地圖樣式上疊加 MGRS 網格
- 完全脫離任何網路運作


MESHTASTIC 網狀網路：

- 透過 BLE 經 LoRa 網狀網路分享您的位置
- 在地圖上即時查看其他網狀網路使用者
- 無需行動訊號、無需網際網路、無需基礎設施
- 僅需 Meshtastic 無線電與手機


DAGR 同等功能：

- 即時 MGRS 座標（4/6/8/10 位精度）
- 磁偏角（WMM 模型）
- 帶方位和距離的航點儲存
- 反方位與航位推算
- 速度、高度與航向
- 多種座標格式（MGRS、UTM、DD、DMS）
- 完全離線運作 — 零雲端相依


10 種戰術工具：

- 反方位計算器
- 航位推算繪圖儀
- 兩點後方交會
- 步數追蹤器
- 磁偏角參考
- 時間-距離-速度求解器
- 日月位置資料
- MGRS 精度選擇器（1 公尺至 100 公里）
- 高度與坡度計算器
- 照片地理戳（MGRS/DTG 烙印到影像中）


6 種無線電就緒的報告範本：

產生可在任何網路上傳輸的格式化報告 — DAGR 硬體所沒有的能力：

- SALUTE（Size, Activity, Location, Unit, Time, Equipment）
- 9 行 MEDEVAC
- SPOT 報告
- ICS 201 事件簡報
- CASEVAC
- ANGUS/CFF 火力任務


更多功能：

- NATO 語音播報（免持）
- HUD 模式（全螢幕戰術顯示）
- 外部 GPS 支援（Garmin GLO、Bad Elf）
- GPX/KML 匯入與匯出
- FixPhrase：開源的 What3Words 替代方案
- 帶路線疊加的任務規劃
- 4 種戰術主題（紅色、NVG、白天、藍色）
- 觸覺回饋用於免視操作
- 6 種語言（EN、FR、DE、ES、JA、KO）


為操作員而生：

Red Grid MGRS 專為在嚴酷環境中仰賴精確網格座標的軍事人員、搜救隊、執法人員、森林消防員、緊急救護員、獵人與野外徒步者設計。


零足跡隱私：

- 無帳號。無註冊。無登入。
- 無雲端同步。無分析。無追蹤。
- 無廣告。任何資料都不會離開您的裝置。
- 位置資料僅存在於記憶體中，從不儲存或傳輸。


免費下載 — 包含即時 10 位 MGRS 顯示、1 個主題、基本工具和 3 個報告範本。升級到 Red Grid Pro，享受全部 10 個工具、離線地圖、網狀網路、所有主題、無限航點和全部 6 個報告。提供月付、年付或終身付費選項。`,


  'th': `DAGR ทางทหาร (AN/PSN-13) มีราคา 2,500 ดอลลาร์และหนักเกือบครึ่งกิโลกรัม Red Grid MGRS นำความสามารถหลักด้านการนำทางบนบกแบบเดียวกันใส่ในกระเป๋าของคุณ — MGRS 10 หลักแบบเรียลไทม์ การหักเหสนามแม่เหล็ก จุดอ้างอิง ทิศทางและระยะทาง — ฟรี ไม่ต้องใช้เครือข่าย ไม่เก็บข้อมูล ไม่ต้องสร้างบัญชี


โทรศัพท์ของคุณ ความสามารถระดับ DAGR


เช่นเดียวกับ Defense Advanced GPS Receiver ที่นักรบทั่วโลกพกพา Red Grid แสดงตำแหน่ง Military Grid Reference System ของคุณแบบเรียลไทม์ด้วยความแม่นยำ 1 เมตร แต่ Red Grid ทำได้มากกว่า — เพิ่มแผนที่ยุทธวิธีออฟไลน์ เครือข่ายเมช Meshtastic การอ่านออกเสียงตามรหัสภาษา NATO การสร้างรายงานยุทธวิธี และการนับก้าว ซึ่ง DAGR ไม่มี


แผนที่ยุทธวิธีออฟไลน์:

- รูปแบบแผนที่สามแบบ: มาตรฐาน, ยุทธวิธีดำมืด, ภูมิประเทศ (เส้นชั้นความสูง)
- ดาวน์โหลดไทล์สำหรับพื้นที่ปฏิบัติการของคุณ
- โหมดออฟไลน์สำหรับใช้แผนที่โดยไม่ต้องมีเครือข่าย
- กริด MGRS ซ้อนทับบนทุกรูปแบบแผนที่
- ทำงานได้แม้ไม่เชื่อมต่อกับเครือข่ายใดๆ เลย


เครือข่ายเมช MESHTASTIC:

- แชร์ตำแหน่งผ่านเมช LoRa ทาง BLE
- ดูผู้ใช้เมชอื่นๆ บนแผนที่แบบเรียลไทม์
- ไม่ต้องมีสัญญาณมือถือ อินเทอร์เน็ต หรือโครงสร้างพื้นฐาน
- เพียงแค่วิทยุ Meshtastic และโทรศัพท์


ฟีเจอร์เทียบเท่า DAGR:

- พิกัด MGRS แบบเรียลไทม์ (ความแม่นยำ 4/6/8/10 หลัก)
- การหักเหสนามแม่เหล็ก (โมเดล WMM)
- จัดเก็บจุดอ้างอิงพร้อมทิศทางและระยะทาง
- ทิศย้อนกลับและการนำทางด้วยการคำนวณ
- ความเร็ว ความสูง และทิศทาง
- หลายรูปแบบพิกัด (MGRS, UTM, DD, DMS)
- ทำงานออฟไลน์เต็มรูปแบบ — ไม่พึ่งพาคลาวด์


เครื่องมือยุทธวิธี 10 รายการ:

- เครื่องคำนวณทิศย้อนกลับ
- เครื่องวาดการนำทางด้วยการคำนวณ
- การหาตำแหน่งย้อนกลับจากสองจุด
- ตัวนับก้าว
- ข้อมูลอ้างอิงการหักเหสนามแม่เหล็ก
- เครื่องคำนวณ เวลา-ระยะทาง-ความเร็ว
- ข้อมูลตำแหน่งดวงอาทิตย์และดวงจันทร์
- ตัวเลือกความแม่นยำ MGRS (1 เมตรถึง 100 กิโลเมตร)
- เครื่องคำนวณความสูงและความชัน
- ตราประทับภาพถ่าย (MGRS/DTG บนภาพ)


แม่แบบรายงาน 6 รูปแบบพร้อมใช้กับวิทยุ:

สร้างรายงานที่จัดรูปแบบพร้อมส่งผ่านเครือข่ายใดก็ได้ — ความสามารถที่ DAGR ไม่มี:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- MEDEVAC 9 บรรทัด
- รายงาน SPOT
- การบรรยายสรุปเหตุการณ์ ICS 201
- CASEVAC
- การยิงสนับสนุน ANGUS/CFF


ความสามารถเพิ่มเติม:

- การอ่านออกเสียงตามรหัส NATO (มือว่าง)
- โหมด HUD (จอแสดงผลยุทธวิธีเต็มจอ)
- รองรับ GPS ภายนอก (Garmin GLO, Bad Elf)
- นำเข้าและส่งออก GPX/KML
- FixPhrase: ทางเลือกโอเพนซอร์สแทน What3Words
- การวางแผนภารกิจพร้อมการซ้อนเส้นทาง
- 4 ธีมยุทธวิธี (แดง, NVG, กลางวัน, น้ำเงิน)
- การตอบสนองแบบสัมผัสสำหรับการใช้งานโดยไม่มอง
- 6 ภาษา (EN, FR, DE, ES, JA, KO)


สร้างเพื่อผู้ปฏิบัติการ:

Red Grid MGRS ออกแบบมาสำหรับบุคลากรทางทหาร ทีมค้นหาและกู้ภัย หน่วยงานบังคับใช้กฎหมาย เจ้าหน้าที่ดับไฟป่า ผู้ตอบสนองคนแรก นักล่า และนักเดินป่า ที่พึ่งพาพิกัดที่แม่นยำในสภาพแวดล้อมที่โหดร้าย


ความเป็นส่วนตัวรอยเท้าศูนย์:

- ไม่มีบัญชี ไม่มีการลงทะเบียน ไม่มีการเข้าสู่ระบบ
- ไม่มีการซิงค์คลาวด์ ไม่มีการวิเคราะห์ ไม่มีการติดตาม
- ไม่มีโฆษณา ไม่มีข้อมูลใดออกจากอุปกรณ์ของคุณ
- ข้อมูลตำแหน่งอยู่ในหน่วยความจำเท่านั้น ไม่เคยถูกจัดเก็บหรือส่ง


ดาวน์โหลดฟรี — รวม MGRS 10 หลักแบบเรียลไทม์, 1 ธีม, เครื่องมือพื้นฐาน และ 3 แม่แบบรายงาน อัปเกรดเป็น Red Grid Pro เพื่อใช้เครื่องมือทั้ง 10 แผนที่ออฟไลน์ เครือข่ายเมช ทุกธีม จุดอ้างอิงไม่จำกัด และรายงานทั้ง 6 รายการ มีตัวเลือกรายเดือน รายปี หรือตลอดชีพ`,


  'vi': `DAGR quân sự (AN/PSN-13) có giá 2.500 USD và nặng gần nửa kilogam. Red Grid MGRS đặt cùng khả năng dẫn đường mặt đất cốt lõi vào túi của bạn — MGRS 10 chữ số trực tiếp, lệch từ, điểm tham chiếu, hướng và khoảng cách — miễn phí. Không cần mạng. Không thu thập dữ liệu. Không cần tạo tài khoản.


ĐIỆN THOẠI CỦA BẠN. CẤP DAGR.


Giống như Defense Advanced GPS Receiver mà các chiến binh trên toàn thế giới mang theo, Red Grid hiển thị vị trí Military Grid Reference System của bạn theo thời gian thực với độ chính xác 1 mét. Nhưng Red Grid đi xa hơn — bổ sung bản đồ chiến thuật ngoại tuyến, mạng mesh Meshtastic, đọc giọng nói NATO, tạo báo cáo chiến thuật và đếm bước, những thứ DAGR không có.


BẢN ĐỒ CHIẾN THUẬT NGOẠI TUYẾN:

- Ba kiểu bản đồ: Tiêu chuẩn, Chiến thuật Tối, và Địa hình (đường đồng mức)
- Tải xuống ô bản đồ cho khu vực hoạt động của bạn
- Chế độ ngoại tuyến để sử dụng bản đồ không cần mạng
- Lưới MGRS phủ trên tất cả các kiểu bản đồ
- Hoạt động hoàn toàn ngắt kết nối khỏi mọi mạng


MẠNG MESH MESHTASTIC:

- Chia sẻ vị trí qua mesh LoRa thông qua BLE
- Xem những người dùng mesh khác trên bản đồ theo thời gian thực
- Không cần tín hiệu di động, internet hay cơ sở hạ tầng
- Chỉ cần đài Meshtastic và điện thoại


TÍNH NĂNG TƯƠNG ĐƯƠNG DAGR:

- Tọa độ MGRS trực tiếp (độ chính xác 4/6/8/10 chữ số)
- Lệch từ (mô hình WMM)
- Lưu trữ điểm tham chiếu với hướng và khoảng cách
- Hướng ngược và dẫn đường tính toán
- Tốc độ, độ cao và hướng
- Nhiều định dạng tọa độ (MGRS, UTM, DD, DMS)
- Hoạt động ngoại tuyến hoàn toàn — không phụ thuộc đám mây


10 CÔNG CỤ TÁC CHIẾN:

- Máy tính hướng ngược
- Máy vẽ dẫn đường tính toán
- Giao hai điểm
- Bộ đếm bước
- Tham chiếu lệch từ
- Bộ giải Thời gian-Khoảng cách-Tốc độ
- Dữ liệu vị trí Mặt trời và Mặt trăng
- Bộ chọn độ chính xác MGRS (1m đến 100km)
- Máy tính độ cao và độ dốc
- Tem ảnh địa lý (khắc MGRS/DTG vào hình)


6 MẪU BÁO CÁO SẴN SÀNG CHO RADIO:

Tạo báo cáo định dạng sẵn sàng truyền qua bất kỳ mạng nào — khả năng DAGR không có:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- MEDEVAC 9 dòng
- Báo cáo SPOT
- Tóm tắt sự cố ICS 201
- CASEVAC
- Nhiệm vụ hỏa lực ANGUS/CFF


KHẢ NĂNG KHÁC:

- Đọc giọng nói NATO (rảnh tay)
- Chế độ HUD (hiển thị tác chiến toàn màn hình)
- Hỗ trợ GPS ngoài (Garmin GLO, Bad Elf)
- Nhập và xuất GPX/KML
- FixPhrase: lựa chọn mã nguồn mở thay cho What3Words
- Lập kế hoạch nhiệm vụ với tuyến đường phủ
- 4 chủ đề tác chiến (đỏ, NVG, ban ngày, xanh)
- Phản hồi xúc giác cho thao tác không nhìn
- 6 ngôn ngữ (EN, FR, DE, ES, JA, KO)


ĐƯỢC TẠO RA CHO NGƯỜI THỰC THI:

Red Grid MGRS được thiết kế cho quân nhân, đội tìm kiếm cứu nạn, lực lượng thực thi pháp luật, lính cứu hỏa rừng, nhân viên cứu hộ, thợ săn và người đi bộ đường dài, những người phụ thuộc vào tọa độ chính xác trong môi trường khắc nghiệt.


QUYỀN RIÊNG TƯ DẤU CHÂN BẰNG KHÔNG:

- Không tài khoản. Không đăng ký. Không đăng nhập.
- Không đồng bộ đám mây. Không phân tích. Không theo dõi.
- Không quảng cáo. Không dữ liệu nào rời khỏi thiết bị của bạn.
- Dữ liệu vị trí chỉ tồn tại trong bộ nhớ, không bao giờ được lưu trữ hoặc truyền đi.


Tải miễn phí — bao gồm hiển thị MGRS 10 chữ số trực tiếp, 1 chủ đề, công cụ cơ bản và 3 mẫu báo cáo. Nâng cấp lên Red Grid Pro để có cả 10 công cụ, bản đồ ngoại tuyến, mạng mesh, tất cả chủ đề, điểm tham chiếu không giới hạn và cả 6 báo cáo. Có tùy chọn hàng tháng, hàng năm hoặc trọn đời.`,


  'id': `DAGR militer (AN/PSN-13) berharga 2.500 dolar dan beratnya hampir setengah kilo. Red Grid MGRS menempatkan kemampuan navigasi darat inti yang sama di saku Anda — MGRS 10 digit langsung, deklinasi magnetik, titik jalur, baring dan jarak — gratis. Tidak perlu jaringan. Tidak ada data yang dikumpulkan. Tidak ada akun untuk dibuat.


PONSEL ANDA. KELAS DAGR.


Seperti Defense Advanced GPS Receiver yang dibawa pejuang di seluruh dunia, Red Grid menampilkan posisi Military Grid Reference System Anda secara real-time dengan presisi 1 meter. Tetapi Red Grid melangkah lebih jauh — menambahkan peta taktis offline, jaringan mesh Meshtastic, pembacaan suara fonetik NATO, pembuatan laporan taktis, dan penghitungan langkah yang tidak ditawarkan DAGR.


PETA TAKTIS OFFLINE:

- Tiga gaya peta: Standar, Taktis Gelap, dan Topografi (kontur)
- Unduh ubin untuk area operasi Anda
- Mode offline untuk penggunaan peta tanpa jaringan
- Grid MGRS di atas semua gaya peta
- Bekerja sepenuhnya terputus dari jaringan apa pun


JARINGAN MESH MESHTASTIC:

- Bagikan posisi Anda melalui mesh LoRa via BLE
- Lihat pengguna mesh lain di peta secara real-time
- Tanpa sinyal seluler, tanpa internet, tanpa infrastruktur
- Hanya radio Meshtastic dan ponsel


FUNGSI SETARA DAGR:

- Koordinat MGRS langsung (presisi 4/6/8/10 digit)
- Deklinasi magnetik (model WMM)
- Penyimpanan titik jalur dengan baring dan jarak
- Baring kembali dan navigasi penghitungan
- Kecepatan, ketinggian, dan haluan
- Beberapa format koordinat (MGRS, UTM, DD, DMS)
- Operasi offline penuh — nol ketergantungan cloud


10 ALAT TAKTIS:

- Kalkulator baring kembali
- Plotter navigasi penghitungan
- Reseksi dua titik
- Pelacak hitungan langkah
- Referensi deklinasi magnetik
- Pemecah Waktu-Jarak-Kecepatan
- Data posisi Matahari dan Bulan
- Pemilih presisi MGRS (1m hingga 100km)
- Kalkulator ketinggian dan kemiringan
- Stempel geo foto (MGRS/DTG terbakar ke gambar)


6 TEMPLAT LAPORAN SIAP RADIO:

Hasilkan laporan terformat siap dikirim melalui jaringan apa pun — kemampuan yang tidak dimiliki DAGR:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- MEDEVAC 9-baris
- Laporan SPOT
- Briefing insiden ICS 201
- CASEVAC
- Misi tembakan ANGUS/CFF


KEMAMPUAN LAINNYA:

- Pembacaan suara fonetik NATO (bebas tangan)
- Mode HUD (tampilan taktis layar penuh)
- Dukungan GPS eksternal (Garmin GLO, Bad Elf)
- Impor dan ekspor GPX/KML
- FixPhrase: alternatif open-source untuk What3Words
- Perencanaan misi dengan overlay rute
- 4 tema taktis (merah, NVG, siang, biru)
- Umpan balik haptik untuk operasi tanpa melihat
- 6 bahasa (EN, FR, DE, ES, JA, KO)


DIBUAT UNTUK OPERATOR:

Red Grid MGRS dirancang untuk personel militer, tim pencarian dan penyelamatan, penegak hukum, pemadam kebakaran hutan, responden pertama, pemburu, dan pendaki backcountry yang bergantung pada koordinat akurat di lingkungan keras.


PRIVASI JEJAK NOL:

- Tidak ada akun. Tidak ada pendaftaran. Tidak ada login.
- Tidak ada sinkronisasi cloud. Tidak ada analitik. Tidak ada pelacakan.
- Tidak ada iklan. Tidak ada data yang meninggalkan perangkat Anda.
- Data lokasi hanya hidup di memori, tidak pernah disimpan atau dikirim.


Unduh gratis — termasuk tampilan MGRS 10 digit langsung, 1 tema, alat dasar, dan 3 templat laporan. Tingkatkan ke Red Grid Pro untuk semua 10 alat, peta offline, mesh, semua tema, titik jalur tak terbatas, dan semua 6 laporan. Tersedia opsi bulanan, tahunan, atau seumur hidup.`,


  'hi': `सेना का DAGR (AN/PSN-13) 2,500 डॉलर का है और लगभग आधा किलो वज़न। Red Grid MGRS वही मूल थल नौवहन क्षमताएँ आपकी जेब में रखता है — लाइव 10-अंकीय MGRS, चुंबकीय दिकपात, वेपॉइंट, दिकमान और दूरी — मुफ़्त। कोई नेटवर्क नहीं चाहिए। कोई डेटा एकत्र नहीं। कोई खाता बनाने की ज़रूरत नहीं।


आपका फ़ोन। DAGR-स्तरीय।


जैसा कि दुनिया भर के लड़ाके Defense Advanced GPS Receiver साथ रखते हैं, Red Grid आपकी Military Grid Reference System स्थिति को 1 मीटर परिशुद्धता के साथ रीयल-टाइम में दिखाता है। लेकिन Red Grid और आगे जाता है — ऑफ़लाइन सामरिक नक्शे, Meshtastic मेश नेटवर्क, NATO ध्वन्यात्मक आवाज़ रीडआउट, सामरिक रिपोर्ट जनरेशन और पेस गिनती जोड़ता है, जो DAGR नहीं देता।


ऑफ़लाइन सामरिक नक्शे:

- तीन मानचित्र शैलियाँ: मानक, डार्क टैक्टिकल, और स्थलाकृतिक (कंटूर रेखाएँ)
- अपने ऑपरेशन क्षेत्र के लिए टाइलें डाउनलोड करें
- नेटवर्क-रहित मानचित्र उपयोग के लिए ऑफ़लाइन मोड
- सभी मानचित्र शैलियों पर MGRS ग्रिड ओवरले
- किसी भी नेटवर्क से पूरी तरह अलग होकर काम करता है


MESHTASTIC मेश नेटवर्क:

- BLE के माध्यम से LoRa मेश पर अपनी स्थिति साझा करें
- मानचित्र पर रीयल-टाइम में अन्य मेश उपयोगकर्ताओं को देखें
- सेल सेवा, इंटरनेट या बुनियादी ढाँचे की ज़रूरत नहीं
- केवल Meshtastic रेडियो और फ़ोन


DAGR-समकक्ष विशेषताएँ:

- लाइव MGRS निर्देशांक (4/6/8/10-अंकीय परिशुद्धता)
- चुंबकीय दिकपात (WMM मॉडल)
- दिकमान और दूरी सहित वेपॉइंट संग्रहण
- पश्च दिकमान और मृत गणना
- गति, ऊँचाई और दिशा
- कई निर्देशांक प्रारूप (MGRS, UTM, DD, DMS)
- पूर्ण ऑफ़लाइन संचालन — शून्य क्लाउड निर्भरता


10 सामरिक उपकरण:

- पश्च दिकमान कैलकुलेटर
- मृत गणना प्लॉटर
- दो-बिंदु पश्च-प्रतिच्छेदन
- पेस काउंट ट्रैकर
- चुंबकीय दिकपात संदर्भ
- समय-दूरी-गति समाधानकर्ता
- सूर्य और चंद्रमा स्थिति डेटा
- MGRS परिशुद्धता चयनकर्ता (1 मीटर से 100 किमी)
- ऊँचाई और ढलान कैलकुलेटर
- फ़ोटो जियोस्टैम्प (MGRS/DTG को छवि में अंकित)


रेडियो-तैयार 6 रिपोर्ट टेम्पलेट:

DAGR हार्डवेयर में नहीं — किसी भी नेटवर्क पर ट्रांसमिशन के लिए तैयार स्वरूपित रिपोर्ट उत्पन्न करें:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- 9-लाइन MEDEVAC
- SPOT रिपोर्ट
- ICS 201 घटना ब्रीफिंग
- CASEVAC
- ANGUS/CFF आग मिशन


अधिक क्षमताएँ:

- NATO ध्वन्यात्मक आवाज़ रीडआउट (हाथ-मुक्त)
- HUD मोड (पूर्ण-स्क्रीन सामरिक डिस्प्ले)
- बाहरी GPS समर्थन (Garmin GLO, Bad Elf)
- GPX/KML आयात और निर्यात
- FixPhrase: What3Words का ओपन-सोर्स विकल्प
- मार्ग ओवरले के साथ मिशन नियोजन
- 4 सामरिक थीम (लाल, NVG, दिन, नीला)
- बिना देखे संचालन के लिए हैप्टिक प्रतिक्रिया
- 6 भाषाएँ (EN, FR, DE, ES, JA, KO)


ऑपरेटरों के लिए बना:

Red Grid MGRS सैन्य कर्मियों, खोज और बचाव दलों, क़ानून प्रवर्तन, वनाग्नि लड़ाकों, पहले प्रतिक्रियाकर्ताओं, शिकारियों और पिछले देश के पैदल यात्रियों के लिए डिज़ाइन किया गया है, जो कठिन वातावरण में सटीक ग्रिड निर्देशांक पर निर्भर हैं।


शून्य-पदचिह्न गोपनीयता:

- कोई खाते नहीं। कोई साइन-अप नहीं। कोई लॉगिन नहीं।
- कोई क्लाउड सिंक नहीं। कोई एनालिटिक्स नहीं। कोई ट्रैकिंग नहीं।
- कोई विज्ञापन नहीं। कोई डेटा आपके डिवाइस से बाहर नहीं जाता।
- स्थान डेटा केवल मेमोरी में रहता है, कभी संग्रहीत या प्रसारित नहीं होता।


मुफ़्त डाउनलोड करें — लाइव 10-अंकीय MGRS डिस्प्ले, 1 थीम, बेसिक उपकरण और 3 रिपोर्ट टेम्पलेट शामिल हैं। सभी 10 उपकरणों, ऑफ़लाइन नक्शों, मेश नेटवर्किंग, सभी थीम्स, असीमित वेपॉइंट और सभी 6 रिपोर्ट के लिए Red Grid Pro में अपग्रेड करें। मासिक, वार्षिक या आजीवन विकल्प उपलब्ध।`,


  'ar-SA': `يبلغ سعر جهاز DAGR العسكري (AN/PSN-13) 2500 دولار ويزن نحو نصف كيلوغرام. يضع تطبيق Red Grid MGRS قدرات الملاحة البرية الأساسية ذاتها في جيبك — إحداثيات MGRS مباشرة من 10 أرقام، الانحراف المغناطيسي، نقاط الطريق، الاتجاه والمسافة — مجانًا. لا حاجة إلى شبكة. لا جمع للبيانات. لا حسابات لإنشائها.


هاتفك. بمستوى DAGR.


مثل Defense Advanced GPS Receiver الذي يحمله المقاتلون حول العالم، يعرض Red Grid موقعك في نظام Military Grid Reference System في الوقت الفعلي بدقة متر واحد. لكن Red Grid يذهب أبعد من ذلك — يضيف خرائط تكتيكية دون اتصال، وشبكة Meshtastic، وقراءة صوتية بأبجدية NATO، وتوليد التقارير التكتيكية، وعدّ الخطوات، وكلها ميزات لا يقدمها DAGR.


خرائط تكتيكية دون اتصال:

- ثلاثة أنماط للخريطة: قياسي، تكتيكي داكن، طبوغرافي (خطوط الكنتور)
- تنزيل بلاطات لمنطقة عملياتك
- وضع عدم الاتصال لاستخدام الخريطة بدون شبكة
- شبكة MGRS فوق جميع أنماط الخرائط
- يعمل بمعزل تام عن أي شبكة


شبكة MESHTASTIC المتشابكة:

- شارك موقعك عبر شبكة LoRa المتشابكة من خلال BLE
- شاهد مستخدمي الشبكة الآخرين على الخريطة في الوقت الفعلي
- لا حاجة إلى تغطية خلوية أو إنترنت أو بنية تحتية
- فقط أجهزة Meshtastic اللاسلكية والهواتف


ميزات مكافئة لـ DAGR:

- إحداثيات MGRS مباشرة (دقة 4/6/8/10 أرقام)
- الانحراف المغناطيسي (نموذج WMM)
- تخزين نقاط الطريق مع الاتجاه والمسافة
- الاتجاه العكسي والملاحة بالحساب التقديري
- السرعة والارتفاع والاتجاه
- تنسيقات إحداثيات متعددة (MGRS, UTM, DD, DMS)
- عمل دون اتصال بالكامل — صفر اعتماد على السحابة


عشر أدوات تكتيكية:

- حاسبة الاتجاه العكسي
- مخطط الحساب التقديري
- التقاطع العكسي من نقطتين
- متعقب عدّ الخطوات
- مرجع الانحراف المغناطيسي
- حلّال الزمن-المسافة-السرعة
- بيانات موقع الشمس والقمر
- منتقي دقة MGRS (من متر إلى 100 كم)
- حاسبة الارتفاع والميل
- ختم جغرافي للصور (دمج MGRS/DTG في الصورة)


ست قوالب تقارير جاهزة للراديو:

أنشئ تقارير منسقة جاهزة للإرسال عبر أي شبكة — قدرة لا يحتويها DAGR:

- SALUTE (Size, Activity, Location, Unit, Time, Equipment)
- MEDEVAC من 9 أسطر
- تقرير SPOT
- إفادة حادث ICS 201
- CASEVAC
- مهمة نيران ANGUS/CFF


قدرات أخرى:

- قراءة صوتية بأبجدية NATO (دون استخدام اليدين)
- وضع HUD (شاشة تكتيكية كاملة)
- دعم GPS خارجي (Garmin GLO, Bad Elf)
- استيراد وتصدير GPX/KML
- FixPhrase: بديل مفتوح المصدر لـ What3Words
- تخطيط المهمة مع تراكب المسار
- أربعة أنماط تكتيكية (أحمر، NVG، نهاري، أزرق)
- استجابة لمسية للتشغيل دون النظر
- ست لغات (EN, FR, DE, ES, JA, KO)


مصمم للمشغلين:

تم تصميم Red Grid MGRS للأفراد العسكريين، فرق البحث والإنقاذ، إنفاذ القانون، رجال إطفاء الغابات، المستجيبين الأوائل، الصيادين، والمتجولين في البراري الذين يعتمدون على إحداثيات شبكية دقيقة في بيئات قاسية.


خصوصية بأثر صفري:

- لا حسابات. لا تسجيل. لا تسجيل دخول.
- لا مزامنة سحابية. لا تحليلات. لا تتبع.
- لا إعلانات. لا بيانات تغادر جهازك.
- بيانات الموقع توجد في الذاكرة فقط، ولا تُخزَّن أو تُرسَل أبدًا.


تنزيل مجاني — يشمل عرض MGRS مباشر من 10 أرقام، نمطًا واحدًا، الأدوات الأساسية، وثلاثة قوالب تقارير. ترقية إلى Red Grid Pro لتحصل على الأدوات العشر، الخرائط دون اتصال، الشبكة المتشابكة، جميع الأنماط، نقاط طريق غير محدودة، وجميع التقارير الستة. خيارات شهرية، سنوية، أو مدى الحياة متاحة.`,
};

async function main() {
  const jwt = requireOrHint('jsonwebtoken');
  const axios = requireOrHint('axios');

  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    { iss: cfg.issuer_id, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' },
    cfg.key,
    { algorithm: 'ES256', header: { alg: 'ES256', kid: cfg.key_id, typ: 'JWT' } }
  );
  const api = axios.create({
    baseURL: 'https://api.appstoreconnect.apple.com/v1',
    headers: { Authorization: `Bearer ${token}` },
  });

  const targetVersion = process.argv[2];
  let vId;
  if (targetVersion) {
    const r = await api.get(`/apps/${cfg.app_id}/appStoreVersions`, {
      params: { 'filter[versionString]': targetVersion, 'filter[platform]': 'IOS', limit: 1 },
    });
    if (!r.data.data.length) { console.error(`No v${targetVersion} found.`); process.exit(2); }
    vId = r.data.data[0].id;
    console.log(`Targeting v${targetVersion} (id ${vId})`);
  } else {
    const r = await api.get(`/apps/${cfg.app_id}/appStoreVersions`, { params: { limit: 10 } });
    const sorted = r.data.data.slice().sort((a, b) => (b.attributes.createdDate || '').localeCompare(a.attributes.createdDate || ''));
    const eligible = sorted.find(v => ['READY_FOR_SALE','WAITING_FOR_REVIEW','PREPARE_FOR_SUBMISSION'].includes(v.attributes.appStoreState));
    if (!eligible) { console.error('No eligible version found.'); process.exit(2); }
    vId = eligible.id;
    console.log(`Targeting v${eligible.attributes.versionString} (id ${vId}, state ${eligible.attributes.appStoreState})`);
  }

  const locRes = await api.get(`/appStoreVersions/${vId}/appStoreVersionLocalizations`, { params: { limit: 200 } });
  const locs = locRes.data.data || [];
  console.log(`Version has ${locs.length} localizations\n`);

  let updated = 0, skipped = 0, failed = 0;
  for (const loc of locs) {
    const locale = loc.attributes.locale;
    const desc = DESCRIPTIONS[locale];
    if (!desc) {
      console.log(`  ↷ skip ${locale} (no native description in dict — leaves current copy intact)`);
      skipped++;
      continue;
    }
    if (desc.length > 4000) console.warn(`  ! ${locale} desc is ${desc.length} chars > Apple's 4000 limit`);
    try {
      await api.patch(`/appStoreVersionLocalizations/${loc.id}`, {
        data: {
          id: loc.id,
          type: 'appStoreVersionLocalizations',
          attributes: { description: desc },
        },
      });
      console.log(`  ✓ ${locale}  (${desc.length} chars)`);
      updated++;
    } catch (err) {
      console.error(`  ✗ ${locale}: ${err.response?.status} ${err.response?.data?.errors?.[0]?.detail || err.message}`);
      failed++;
    }
  }
  console.log(`\nDone: ${updated} updated, ${skipped} skipped (en-US/fr-FR/da/hr/uk = already-native), ${failed} failed.`);
  process.exit(failed ? 3 : 0);
}

main().catch((err) => { console.error('Fatal:', err.message); process.exit(99); });
