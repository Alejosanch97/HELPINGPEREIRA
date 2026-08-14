import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "../Styles/home.css";

const API_URL =
  "https://script.google.com/macros/s/AKfycbw0mzdDvuPMxQmP-TDcKkxc3sl-jB63uDgkDV0bK_X0R98SgWrWk8lishJ92LYxZVxiAA/exec";

const clean = (v) => (v == null ? "" : String(v).trim());
const num = (v) => { const n = Number(clean(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
const RADIO_KM = 7;

const iconoShelter = L.divIcon({ className: "ax-marker", html: `<span class="ax-pin ax-pin-shelter">🏠</span>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32] });
const iconoYo = L.divIcon({ className: "ax-marker", html: `<span class="ax-pin ax-pin-me"></span>`, iconSize: [22, 22], iconAnchor: [11, 11] });

async function fetchSheet(sheet) {
  const res = await fetch(`${API_URL}?sheet=${encodeURIComponent(sheet)}`);
  const d = await res.json();
  return Array.isArray(d) ? d : [];
}
async function fetchBoard() {
  const res = await fetch(`${API_URL}?action=board`);
  return res.json();
}

async function fetchTransportes() {
  const res = await fetch(`${API_URL}?action=transportes`);
  const d = await res.json();
  return Array.isArray(d) ? d : [];
}

async function postAction(body, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
      const data = await res.json();
      // si el backend estaba ocupado, espera un poco y reintenta
      if (data && data.status === "error" && /ocupado/i.test(data.message || "") && i < intentos - 1) {
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
        continue;
      }
      return data;
    } catch (e) {
      if (i === intentos - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}
function distanciaKm(a, b) {
  const R = 6371, dLat = ((b[0]-a[0])*Math.PI)/180, dLng = ((b[1]-a[1])*Math.PI)/180;
  const la1 = (a[0]*Math.PI)/180, la2 = (b[0]*Math.PI)/180;
  const h = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2*Math.cos(la1)*Math.cos(la2);
  return 2*R*Math.asin(Math.sqrt(h));
}

export const Home = () => {
  const navigate = useNavigate();
  const [shelters, setShelters] = useState([]);
  const [board, setBoard] = useState([]);
  const [transportes, setTransportes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [miPos, setMiPos] = useState(null);
  const [modal, setModal] = useState(null); // 'donar' | 'voluntario' | 'vehiculo' | null
  const mapRef = useRef(null);

  const cargar = useCallback(async () => {
    try {
      const [sh, bd, tr] = await Promise.all([fetchSheet("SHELTERS"), fetchBoard(), fetchTransportes()]);
      setShelters(sh);
      setBoard(Array.isArray(bd) ? bd : []);
      setTransportes(Array.isArray(tr) ? tr : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    cargar();
    if (!navigator.geolocation) return;

    const ok = (p) => setMiPos([p.coords.latitude, p.coords.longitude]);

    // intento inmediato (rápido, acepta ubicación cacheada reciente)
    navigator.geolocation.getCurrentPosition(ok, () => {}, {
      enableHighAccuracy: true, timeout: 15000, maximumAge: 30000,
    });

    // watch en paralelo: cuando el fix llegue (aunque tarde), actualiza tu punto
    const watchId = navigator.geolocation.watchPosition(ok, () => {}, {
      enableHighAccuracy: true, timeout: 27000, maximumAge: 0,
    });
    const stop = setTimeout(() => navigator.geolocation.clearWatch(watchId), 30000);
    return () => { clearTimeout(stop); navigator.geolocation.clearWatch(watchId); };
  }, [cargar]);

  const yaEncuadrado = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !miPos || yaEncuadrado.current) return;
    yaEncuadrado.current = true;
    const t = setTimeout(() => {
      try {
        map.invalidateSize();
        map.fitBounds(L.latLng(miPos).toBounds(RADIO_KM * 2 * 1000), { padding: [20, 20], animate: false });
      } catch (e) { try { map.setView(miPos, 13, { animate: false }); } catch (_) {} }
    }, 300);
    return () => clearTimeout(t);
  }, [miPos]);

  const puntos = useMemo(() =>
    shelters.map((s) => ({ ...s, lat: num(s.latitud), lng: num(s.longitud) }))
      .filter((s) => s.lat !== 0 && s.lng !== 0), [shelters]);

  const cercanos = useMemo(() => {
    if (!miPos) return puntos.map((s) => ({ ...s, dist: null }));
    return puntos.map((s) => ({ ...s, dist: distanciaKm(miPos, [s.lat, s.lng]) }))
      .filter((s) => s.dist <= RADIO_KM).sort((a, b) => a.dist - b.dist);
  }, [puntos, miPos]);

  const pendPorShelter = useMemo(() => {
    const m = {};
    board.filter((p) => clean(p.estado) === "PENDIENTE").forEach((p) => {
      m[clean(p.id_shelter)] = (m[clean(p.id_shelter)] || 0) + 1;
    });
    return m;
  }, [board]);

  // transportes cercanos: el punto de recogida (origen) está dentro del radio
  const transportesCercanos = useMemo(() => {
    if (!miPos) return [];
    return transportes
      .map((t) => {
        const lat = num(t.origen_lat), lng = num(t.origen_lng);
        const dist = lat && lng ? distanciaKm(miPos, [lat, lng]) : null;
        return { ...t, dist };
      })
      .filter((t) => t.dist != null && t.dist <= RADIO_KM)
      .sort((a, b) => a.dist - b.dist);
  }, [transportes, miPos]);

  const centro = miPos; // el mapa solo se dibuja cuando ya tenemos tu ubicación

  return (
    <div className="ax-home">
      <div className="ax-bg" aria-hidden="true">
        <span className="ax-blob ax-blob-1" /><span className="ax-blob ax-blob-2" /><span className="ax-blob ax-blob-3" />
      </div>

      <header className="ax-top">
        <div className="ax-brand">
          <span className="ax-logo">◈</span>
          <div className="ax-brand-txt"><b>RED DE AYUDA</b><small>Emergencia</small></div>
        </div>
        <button className="ax-refresh" onClick={cargar} title="Actualizar">⟳</button>
      </header>

      <main className="ax-main">
        {/* MAPA */}
        <section className="ax-map-card ax-glass">
          <div className="ax-map-head">
            <span className="ax-eyebrow">PUNTO DE AYUDA CERCANOS</span>
            <span className="ax-map-count-inline">{loading ? "…" : `${cercanos.length} cercanos`}</span>
          </div>
          <div className="ax-map-box">
            {miPos ? (
              <MapContainer center={centro} zoom={13} minZoom={10} zoomControl={true} className="ax-map" scrollWheelZoom={true}
                whenReady={(e) => {
                  const map = e.target; mapRef.current = map;
                  [0, 150, 400, 800, 1200].forEach((ms) => setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, ms));
                  window.addEventListener("resize", () => { try { map.invalidateSize(); } catch (_) {} });
                  setTimeout(() => {
                    try {
                      map.invalidateSize();
                      map.fitBounds(L.latLng(miPos).toBounds(RADIO_KM * 2 * 1000), { padding: [20, 20], animate: false });
                    } catch (_) {}
                  }, 350);
                }}>
                <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Circle center={miPos} radius={RADIO_KM * 1000} pathOptions={{ color: "#2f6fed", fillColor: "#2f6fed", fillOpacity: 0.06, weight: 1.5 }} />
                <Marker position={miPos} icon={iconoYo} />
                {cercanos.map((s) => (
                  <Marker key={s.id_shelter} position={[s.lat, s.lng]} icon={iconoShelter}>
                    <Popup>
                      <div className="ax-popup">
                        <b>{clean(s.nombre)}</b>
                        {clean(s.telefono) && <a href={`tel:${clean(s.telefono)}`} className="ax-popup-call">☎ {clean(s.telefono)}</a>}
                        {pendPorShelter[clean(s.id_shelter)]
                          ? <span className="ax-popup-badge">{pendPorShelter[clean(s.id_shelter)]} pedido(s)</span>
                          : <span className="ax-popup-ok">Sin pedidos</span>}
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            ) : (
              <div className="ax-map-esperando">
                <span className="ax-map-spinner" />
                <p>Ubicándote…</p>
                <span className="ax-map-esperando-sub">Necesitamos tu ubicación para mostrarte los puntos de ayuda cercanos.</span>
                <button className="ax-gps-activar" onClick={() => {
                  navigator.geolocation.getCurrentPosition(
                    (p) => setMiPos([p.coords.latitude, p.coords.longitude]),
                    () => alert("No pudimos obtener tu ubicación. Revisa que el navegador tenga permiso de ubicación activado."),
                    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
                  );
                }}>📍 Activar mi ubicación</button>
              </div>
            )}
          </div>
        </section>

        {/* ACCIÓN PRINCIPAL: entrar como shelter */}
        <button className="ax-big-refugio" onClick={() => navigate("/shelter")}>
          <span className="ax-big-icon">🏠</span>
          <span className="ax-big-txt"><b>SOY UN PUNTO DE AYUDA</b><small>Ingresar para gestionar</small></span>
          <span className="ax-big-lock">🔒</span>
        </button>

        {/* ALERTA: transportes que necesitan quien los lleve */}
        {transportesCercanos.length > 0 && (
          <div className="ax-transporte-alerta">
            <div className="ax-transporte-alerta-head">
              <span className="ax-transporte-icon">🚨</span>
              <b>Se necesita transporte cerca de ti</b>
            </div>
            <ul className="ax-transporte-list">
              {transportesCercanos.map((t) => (
                <li key={t.id_despacho} className="ax-transporte-card ax-glass">
                  <div className="ax-transporte-ruta">
                    <b>{clean(t.origen_nombre)}</b>
                    <span className="ax-transporte-flecha">→</span>
                    <b>{clean(t.destino_nombre)}</b>
                  </div>
                  <small>Recogida a {t.dist != null ? `${t.dist.toFixed(1)} km` : "?"} de ti</small>
                  <button className="ax-transporte-btn" onClick={() => setModal({ tipo: "transporte", despacho: t })}>
                    🚗 Yo lo llevo
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ACCIONES CIUDADANAS (sin clave) */}
        <div className="ax-ayudar-head"><span className="ax-eyebrow">QUIERO AYUDAR</span></div>
        <div className="ax-ayudar-grid">
          <button className="ax-ayudar-card" onClick={() => setModal("donar")}>
            <span className="ax-ayudar-icon">📦</span>
            <b>Donar algo</b>
            <small>Te decimos a dónde llevarlo</small>
          </button>
          <button className="ax-ayudar-card" onClick={() => setModal("voluntario")}>
            <span className="ax-ayudar-icon">🙋</span>
            <b>Ser voluntario</b>
            <small>Ayuda en un centro</small>
          </button>
          <button className="ax-ayudar-card" onClick={() => setModal("vehiculo")}>
            <span className="ax-ayudar-icon">🚗</span>
            <b>Tengo vehículo</b>
            <small>Transporta insumos</small>
          </button>
        </div>
      </main>

      {modal === "donar" && <ModalDonar shelters={cercanos} onClose={() => setModal(null)} />}
      {modal === "voluntario" && <ModalVoluntario shelters={cercanos} onClose={() => setModal(null)} />}
      {modal === "vehiculo" && <ModalVehiculo onClose={() => setModal(null)} />}
      {modal && modal.tipo === "transporte" && (
        <ModalTransporte despacho={modal.despacho} onClose={() => setModal(null)} onTomado={cargar} />
      )}
    </div>
  );
};

/* ---------- Modal base reutilizable ---------- */
function ModalShell({ title, children, onClose, ok, okText }) {
  return (
    <div className="ax-modal-overlay" onClick={onClose}>
      <div className="ax-modal ax-glass" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {ok ? (
          <div className="ax-modal-ok"><span className="ax-ok-check">✓</span><h3>{okText || "Listo"}</h3><p>Gracias por ayudar.</p></div>
        ) : (
          <>
            <div className="ax-modal-head"><h3>{title}</h3><button className="ax-modal-x" onClick={onClose}>✕</button></div>
            {children}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- DONAR ---------- */
const ModalDonar = ({ shelters, onClose }) => {
  const [categorias, setCategorias] = useState([]);
  const [nombre, setNombre] = useState(""); const [tel, setTel] = useState("");
  const [cat, setCat] = useState(""); const [cant, setCant] = useState(""); const [unidad, setUnidad] = useState("");
  const [dest, setDest] = useState("");
  const [enviando, setEnviando] = useState(false); const [error, setError] = useState(""); const [ok, setOk] = useState(false);

  useEffect(() => { fetchSheet("CATEGORIAS").then(setCategorias).catch(() => {}); }, []);
  const onCat = (v) => { setCat(v); const c = categorias.find((x) => clean(x.id_categoria) === v); if (c) setUnidad(clean(c.unidad_medida)); };

  const enviar = async () => {
    setError("");
    if (!clean(nombre)) return setError("Escribe tu nombre.");
    if (!clean(tel)) return setError("Escribe tu teléfono.");
    if (!cat) return setError("Elige qué vas a donar.");
    setEnviando(true);
    try {
      const r = await postAction({ action: "donar", nombre_donante: clean(nombre), telefono: clean(tel), id_categoria: cat, cantidad: num(cant), unidad_medida: unidad, id_shelter_destino: dest });
      if (r && r.status === "success") { setOk(true); setTimeout(onClose, 1400); }
      else setError((r && r.message) || "No se pudo registrar.");
    } catch (e) { setError("Fallo de red."); } finally { setEnviando(false); }
  };

  return (
    <ModalShell title="Quiero donar" onClose={onClose} ok={ok} okText="Donación registrada">
      <div className="ax-form">
        <label className="ax-field"><span>Tu nombre *</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        <label className="ax-field"><span>Tu teléfono *</span><input value={tel} inputMode="tel" onChange={(e) => setTel(e.target.value)} /></label>
        <label className="ax-field"><span>¿Qué donas? *</span>
          <select value={cat} onChange={(e) => onCat(e.target.value)}>
            <option value="">Selecciona…</option>
            {categorias.map((c) => <option key={c.id_categoria} value={clean(c.id_categoria)}>{clean(c.nombre)}</option>)}
          </select>
        </label>
        <div className="ax-item-row">
          <input type="number" inputMode="numeric" placeholder="Cantidad" value={cant} onChange={(e) => setCant(e.target.value)} />
          <span className="ax-item-unit">{unidad || "—"}</span>
        </div>
        <label className="ax-field"><span>Llevar a (opcional)</span>
          <select value={dest} onChange={(e) => setDest(e.target.value)}>
            <option value="">El más cercano / cualquiera</option>
            {shelters.map((s) => <option key={s.id_shelter} value={clean(s.id_shelter)}>{clean(s.nombre)}{s.dist != null ? ` · ${s.dist.toFixed(1)} km` : ""}</option>)}
          </select>
        </label>
        {error && <p className="ax-form-error">{error}</p>}
        <button className="ax-submit" onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Registrar donación"}</button>
      </div>
    </ModalShell>
  );
};

/* ---------- VOLUNTARIO ---------- */
const ModalVoluntario = ({ shelters, onClose }) => {
  const [nombre, setNombre] = useState(""); const [tel, setTel] = useState("");
  const [hab, setHab] = useState(""); const [disp, setDisp] = useState(""); const [sh, setSh] = useState("");
  const [enviando, setEnviando] = useState(false); const [error, setError] = useState(""); const [ok, setOk] = useState(false);

  const enviar = async () => {
    setError("");
    if (!clean(nombre)) return setError("Escribe tu nombre.");
    if (!clean(tel)) return setError("Escribe tu teléfono.");
    setEnviando(true);
    try {
      const r = await postAction({ action: "voluntario", nombre: clean(nombre), telefono: clean(tel), habilidad: clean(hab), disponibilidad: clean(disp), id_shelter: sh });
      if (r && r.status === "success") { setOk(true); setTimeout(onClose, 1400); }
      else setError((r && r.message) || "No se pudo registrar.");
    } catch (e) { setError("Fallo de red."); } finally { setEnviando(false); }
  };

  return (
    <ModalShell title="Ser voluntario" onClose={onClose} ok={ok} okText="¡Gracias, voluntario!">
      <div className="ax-form">
        <label className="ax-field"><span>Tu nombre *</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        <label className="ax-field"><span>Tu teléfono *</span><input value={tel} inputMode="tel" onChange={(e) => setTel(e.target.value)} /></label>
        <label className="ax-field"><span>¿En qué puedes ayudar? (opcional)</span><input value={hab} onChange={(e) => setHab(e.target.value)} placeholder="Ej: cocina, primeros auxilios, logística" /></label>
        <label className="ax-field"><span>Disponibilidad (opcional)</span><input value={disp} onChange={(e) => setDisp(e.target.value)} placeholder="Ej: fines de semana, mañanas" /></label>
        <label className="ax-field"><span>Centro preferido (opcional)</span>
          <select value={sh} onChange={(e) => setSh(e.target.value)}>
            <option value="">Cualquiera</option>
            {shelters.map((s) => <option key={s.id_shelter} value={clean(s.id_shelter)}>{clean(s.nombre)}</option>)}
          </select>
        </label>
        {error && <p className="ax-form-error">{error}</p>}
        <button className="ax-submit" onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Ofrecerme como voluntario"}</button>
      </div>
    </ModalShell>
  );
};

/* ---------- VEHÍCULO ---------- */
const ModalVehiculo = ({ onClose }) => {
  const [nombre, setNombre] = useState(""); const [tel, setTel] = useState("");
  const [tipo, setTipo] = useState(""); const [cap, setCap] = useState(""); const [zona, setZona] = useState("");
  const [enviando, setEnviando] = useState(false); const [error, setError] = useState(""); const [ok, setOk] = useState(false);

  const enviar = async () => {
    setError("");
    if (!clean(nombre)) return setError("Escribe tu nombre.");
    if (!clean(tel)) return setError("Escribe tu teléfono.");
    setEnviando(true);
    try {
      const r = await postAction({ action: "vehiculo", nombre: clean(nombre), telefono: clean(tel), tipo_vehiculo: clean(tipo), capacidad: clean(cap), zona: clean(zona) });
      if (r && r.status === "success") { setOk(true); setTimeout(onClose, 1400); }
      else setError((r && r.message) || "No se pudo registrar.");
    } catch (e) { setError("Fallo de red."); } finally { setEnviando(false); }
  };

  return (
    <ModalShell title="Tengo vehículo" onClose={onClose} ok={ok} okText="¡Gracias por tu apoyo!">
      <div className="ax-form">
        <label className="ax-field"><span>Tu nombre *</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        <label className="ax-field"><span>Tu teléfono *</span><input value={tel} inputMode="tel" onChange={(e) => setTel(e.target.value)} /></label>
        <label className="ax-field"><span>Tipo de vehículo (opcional)</span><input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Ej: camioneta, moto, camión" /></label>
        <label className="ax-field"><span>Capacidad de carga (opcional)</span><input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Ej: 500 kg, 2 toneladas" /></label>
        <label className="ax-field"><span>Zona donde te mueves (opcional)</span><input value={zona} onChange={(e) => setZona(e.target.value)} placeholder="Ej: centro, norte" /></label>
        {error && <p className="ax-form-error">{error}</p>}
        <button className="ax-submit" onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Ofrecer mi vehículo"}</button>
      </div>
    </ModalShell>
  );
};

/* ---------- TOMAR TRANSPORTE ---------- */
const ModalTransporte = ({ despacho, onClose, onTomado }) => {
  const [nombre, setNombre] = useState(""); const [tel, setTel] = useState("");
  const [enviando, setEnviando] = useState(false); const [error, setError] = useState(""); const [ok, setOk] = useState(false);

  const enviar = async () => {
    setError("");
    if (!clean(nombre)) return setError("Escribe tu nombre.");
    if (!clean(tel)) return setError("Escribe tu teléfono.");
    setEnviando(true);
    try {
      const r = await postAction({ action: "tomar_transporte", id_despacho: despacho.id_despacho, nombre: clean(nombre), telefono: clean(tel) });
      if (r && r.status === "success") { setOk(true); setTimeout(() => { onClose(); onTomado && onTomado(); }, 1400); }
      else setError((r && r.message) || "No se pudo registrar.");
    } catch (e) { setError("Fallo de red."); } finally { setEnviando(false); }
  };

  return (
    <ModalShell title="Yo lo llevo" onClose={onClose} ok={ok} okText="¡Gracias! Transporte asignado">
      <div className="ax-form">
        <div className="ax-transporte-ruta ax-transporte-ruta-modal">
          <b>{clean(despacho.origen_nombre)}</b>
          <span className="ax-transporte-flecha">→</span>
          <b>{clean(despacho.destino_nombre)}</b>
        </div>
        {clean(despacho.origen_tel) && <a href={`tel:${clean(despacho.origen_tel)}`} className="ax-popup-call">☎ Recogida: {clean(despacho.origen_tel)}</a>}
        {clean(despacho.destino_tel) && <a href={`tel:${clean(despacho.destino_tel)}`} className="ax-popup-call">☎ Entrega: {clean(despacho.destino_tel)}</a>}
        <label className="ax-field"><span>Tu nombre *</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
        <label className="ax-field"><span>Tu teléfono *</span><input value={tel} inputMode="tel" onChange={(e) => setTel(e.target.value)} /></label>
        {error && <p className="ax-form-error">{error}</p>}
        <button className="ax-submit" onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Confirmar que lo llevo"}</button>
      </div>
    </ModalShell>
  );
};

export default Home;