import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import "../Styles/shelter.css";

const API_URL =
  "https://script.google.com/macros/s/AKfycbw0mzdDvuPMxQmP-TDcKkxc3sl-jB63uDgkDV0bK_X0R98SgWrWk8lishJ92LYxZVxiAA/exec";

const CLAVE = "AYUDA2026";
const SESSION_KEY = "ax_shelter_sesion";
const RADIO_KM = 20;

const clean = (v) => (v == null ? "" : String(v).trim());
const num = (v) => { const n = Number(clean(v).replace(",", ".")); return isNaN(n) ? 0 : n; };
const PRIORIDAD_LABEL = { 1: "Crítica", 2: "Alta", 3: "Media", 4: "Baja" };

async function getSheet(sheet, fresh = false) {
  const res = await fetch(`${API_URL}?sheet=${encodeURIComponent(sheet)}${fresh ? "&fresh=1" : ""}`);
  const d = await res.json(); return Array.isArray(d) ? d : [];
}
async function getBoard() { const res = await fetch(`${API_URL}?action=board`); return res.json(); }
async function post(body) {
  const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
  return res.json();
}
function distanciaKm(a, b) {
  const R = 6371, dLat = ((b[0]-a[0])*Math.PI)/180, dLng = ((b[1]-a[1])*Math.PI)/180;
  const la1 = (a[0]*Math.PI)/180, la2 = (b[0]*Math.PI)/180;
  const h = Math.sin(dLat/2)**2 + Math.sin(dLng/2)**2*Math.cos(la1)*Math.cos(la2);
  return 2*R*Math.asin(Math.sqrt(h));
}

export const Shelter = () => {
  const [clave, setClave] = useState(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [miShelterId, setMiShelterId] = useState(null);

  const [shelters, setShelters] = useState([]);
  const [board, setBoard] = useState([]);
  const [inventario, setInventario] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [tab, setTab] = useState("resumen");
  const [loading, setLoading] = useState(false);
  const [modalCrear, setModalCrear] = useState(false);

  useEffect(() => {
    const s = sessionStorage.getItem(SESSION_KEY);
    if (s) {
      try {
        const { clave: c, shelter } = JSON.parse(s);
        if (c === CLAVE) { setClave(c); setMiShelterId(shelter || null); }
      } catch (_) {}
    }
  }, []);

  const cargarTodo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}?action=bootstrap`);
      const d = await res.json();
      setShelters(Array.isArray(d.shelters) ? d.shelters : []);
      setBoard(Array.isArray(d.board) ? d.board : []);
      setInventario(Array.isArray(d.inventario) ? d.inventario : []);
      setCategorias(Array.isArray(d.categorias) ? d.categorias : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (clave) cargarTodo(); }, [clave, cargarTodo]);

  const entrar = () => {
    if (input.trim() === CLAVE) {
      setClave(CLAVE);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ clave: CLAVE, shelter: null }));
    } else setError("Clave incorrecta.");
  };
  const salir = () => { sessionStorage.removeItem(SESSION_KEY); setClave(null); setMiShelterId(null); setInput(""); };
  const elegirShelter = (id) => {
    setMiShelterId(id);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ clave: CLAVE, shelter: id }));
    setTab("resumen");
  };

  const miShelter = useMemo(() => shelters.find((s) => clean(s.id_shelter) === clean(miShelterId)), [shelters, miShelterId]);
  const miPos = useMemo(() => miShelter && num(miShelter.latitud) ? [num(miShelter.latitud), num(miShelter.longitud)] : null, [miShelter]);

  const miInventario = useMemo(() =>
    inventario.filter((i) => clean(i.id_shelter) === clean(miShelterId))
      .map((i) => ({ ...i, nombreCat: (categorias.find((c) => clean(c.id_categoria) === clean(i.id_categoria)) || {}).nombre || i.id_categoria })),
    [inventario, miShelterId, categorias]);

  const misPedidos = useMemo(() => board.filter((p) => clean(p.id_shelter) === clean(miShelterId)), [board, miShelterId]);

  const pedidosOtros = useMemo(() => {
  const otros = board.filter((p) => clean(p.id_shelter) !== clean(miShelterId) && clean(p.estado) === "PENDIENTE");
  if (!miPos) return otros.map((p) => ({ ...p, dist: null }));
  return otros.map((p) => {
    const lat = num(p.latitud), lng = num(p.longitud);
    const dist = lat && lng ? distanciaKm(miPos, [lat, lng]) : null;
    return { ...p, dist };
  })
  .filter((p) => p.dist != null && p.dist <= RADIO_KM)   // ← agrega esto
  .sort((a, b) => (a.dist ?? 9999) - (b.dist ?? 9999));
}, [board, miShelterId, miPos]);

  /* ---------------- PANTALLA CLAVE ---------------- */
  if (!clave) {
    return (
      <div className="sh-gate">
        <div className="sh-bg"><span className="sh-blob sh-blob-1" /><span className="sh-blob sh-blob-2" /></div>
        <div className="sh-gate-card sh-glass">
          <span className="sh-gate-icon">🏠</span>
          <h1>Acceso de shelter</h1>
          <p>Ingresa la clave para gestionar tu refugio.</p>
          <input type="password" className="sh-gate-input" placeholder="Clave" value={input}
            onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} autoFocus />
          {error && <p className="sh-gate-error">{error}</p>}
          <button className="sh-gate-btn" onClick={entrar}>Entrar</button>
          <Link to="/" className="sh-gate-back">← Volver al inicio</Link>
        </div>
      </div>
    );
  }

  /* ---------------- SELECCIÓN DE SHELTER ---------------- */
  if (!miShelterId) {
    return (
      <div className="sh-panel">
        <div className="sh-bg"><span className="sh-blob sh-blob-1" /><span className="sh-blob sh-blob-2" /></div>
        <header className="sh-top">
          <div className="sh-brand"><span className="sh-logo">◈</span><div className="sh-brand-txt"><b>SHELTER</b><small>Selecciona el tuyo</small></div></div>
          <div className="sh-top-actions">
            <Link to="/" className="sh-inicio-btn" title="Ir al inicio">
              <span className="sh-inicio-txt">Inicio</span>
            </Link>
            <button className="sh-logout" onClick={salir} title="Cerrar sesión">⏻</button>
          </div>
        </header>
        <main className="sh-content">
          <h2 className="sh-h2">¿Cuál es tu shelter?</h2>

          {/* Botón grande: crear un shelter nuevo con mi ubicación */}
          <button className="sh-crear-big" onClick={() => setModalCrear(true)}>
            <span className="sh-crear-icon">📍</span>
            <span className="sh-crear-txt"><b>CREAR NUEVO SHELTER</b><small>Se guarda en tu ubicación actual</small></span>
            <span className="sh-crear-plus">+</span>
          </button>

          {loading ? (
            <div className="sh-skel-wall">{[0,1,2].map((i) => <div key={i} className="sh-skel" />)}</div>
          ) : shelters.length === 0 ? (
            <div className="sh-empty sh-glass"><p>Aún no hay shelters. Crea el primero con tu ubicación.</p></div>
          ) : (
            <ul className="sh-select-list">
              {shelters.map((s) => (
                <li key={s.id_shelter}>
                  <button className="sh-select-item sh-glass" onClick={() => elegirShelter(clean(s.id_shelter))}>
                    <div><b>{clean(s.nombre)}</b><small>{clean(s.telefono) || "Sin teléfono"}</small></div>
                    <span className="sh-select-arrow">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>

        {modalCrear && (
          <ModalCrearShelter
            onClose={() => setModalCrear(false)}
            onCreado={(id) => { setModalCrear(false); cargarTodo(); if (id) elegirShelter(id); }}
          />
        )}
      </div>
    );
  }

  /* ---------------- PANEL DEL SHELTER ---------------- */
  return (
    <div className="sh-panel">
      <div className="sh-bg"><span className="sh-blob sh-blob-1" /><span className="sh-blob sh-blob-2" /></div>

      <header className="sh-top">
        <div className="sh-brand">
          <span className="sh-logo">🏠</span>
          <div className="sh-brand-txt"><b>{clean(miShelter?.nombre) || "Mi shelter"}</b><small>Panel de gestión</small></div>
        </div>
        <div className="sh-top-actions">
          <button className="sh-change" onClick={() => setMiShelterId(null)} title="Cambiar shelter">⇄</button>
          <Link to="/" className="sh-inicio-btn" title="Ir al inicio">
            <span className="sh-inicio-txt">Inicio</span>
          </Link>
          <button className="sh-logout" onClick={salir} title="Cerrar sesión">⏻</button>
        </div>
      </header>

      <nav className="sh-tabs">
        <button className={`sh-tab ${tab==="resumen"?"on":""}`} onClick={() => setTab("resumen")}>📋 Resumen</button>
        <button className={`sh-tab ${tab==="inventario"?"on":""}`} onClick={() => setTab("inventario")}>📦 Inventario</button>
        <button className={`sh-tab ${tab==="pedir"?"on":""}`} onClick={() => setTab("pedir")}>✋ Pedir</button>
        <button className={`sh-tab ${tab==="responder"?"on":""}`} onClick={() => setTab("responder")}>
          🚚 Responder{pedidosOtros.length ? <span className="sh-tab-badge">{pedidosOtros.length}</span> : null}
        </button>
      </nav>

      <main className="sh-content">
        {tab === "resumen" && (
          <ResumenTab miShelter={miShelter} misPedidos={misPedidos} miInventario={miInventario} onRefrescar={cargarTodo} loading={loading} />
        )}
        {tab === "inventario" && (
          <InventarioTab clave={CLAVE} miShelterId={miShelterId} miInventario={miInventario} categorias={categorias} onCambio={cargarTodo} />
        )}
        {tab === "pedir" && (
          <PedirTab clave={CLAVE} miShelterId={miShelterId} categorias={categorias} onEnviado={cargarTodo} />
        )}
        {tab === "responder" && (
          <ResponderTab clave={CLAVE} miShelterId={miShelterId} pedidos={pedidosOtros} miInventario={miInventario} onDespachado={cargarTodo} />
        )}
      </main>
    </div>
  );
};

/* ================= CREAR SHELTER CON GPS ================= */
function ModalCrearShelter({ onClose, onCreado }) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [responsable, setResponsable] = useState("");
  const [capacidad, setCapacidad] = useState("");
  const [pos, setPos] = useState(null);
  const [buscandoGps, setBuscandoGps] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const pedirGps = () => {
    setError(""); setBuscandoGps(true);
    if (!navigator.geolocation) { setBuscandoGps(false); setError("Tu dispositivo no soporta geolocalización."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos([p.coords.latitude, p.coords.longitude]); setBuscandoGps(false); },
      () => { setBuscandoGps(false); setError("No pudimos obtener tu ubicación. Revisa los permisos."); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  useEffect(() => { pedirGps(); /* eslint-disable-next-line */ }, []);

  const crear = async () => {
    setError("");
    if (!clean(nombre)) return setError("Escribe el nombre del shelter.");
    if (!clean(telefono)) return setError("Escribe un teléfono de contacto.");
    if (!pos) return setError("Aún no tenemos tu ubicación GPS.");
    setEnviando(true);
    try {
      const r = await post({
        action: "crear_shelter",
        nombre: clean(nombre), telefono: clean(telefono), responsable: clean(responsable),
        capacidad_personas: capacidad ? num(capacidad) : "",
        latitud: pos[0], longitud: pos[1],
      });
      if (r && r.status === "success") { setOk(true); setTimeout(() => onCreado(r.id_shelter), 1300); }
      else setError((r && r.message) || "No se pudo crear el shelter.");
    } catch (e) { setError("Fallo de red."); } finally { setEnviando(false); }
  };

  return (
    <div className="sh-overlay" onClick={onClose}>
      <div className="sh-modal sh-glass" onClick={(e) => e.stopPropagation()}>
        {ok ? (
          <div className="sh-ok-box" style={{ padding: "20px 0" }}>
            <span className="sh-ok-check">✓</span><p>Shelter creado en tu ubicación.</p>
          </div>
        ) : (
          <>
            <div className="sh-modal-head"><h3>Crear shelter</h3><button className="sh-modal-x" onClick={onClose}>✕</button></div>
            <div className="sh-form">
              <div className={`sh-gps-box ${pos ? "ok" : ""}`}>
                {buscandoGps ? <span>📍 Obteniendo tu ubicación…</span>
                  : pos ? <span>📍 Ubicación lista ({pos[0].toFixed(4)}, {pos[1].toFixed(4)})</span>
                  : <button type="button" className="sh-gps-retry" onClick={pedirGps}>📍 Activar mi ubicación</button>}
              </div>
              <label className="sh-field"><span>Nombre del shelter *</span><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Refugio Colegio Central" /></label>
              <label className="sh-field"><span>Teléfono de contacto *</span><input value={telefono} inputMode="tel" onChange={(e) => setTelefono(e.target.value)} placeholder="Ej: 3001234567" /></label>
              <label className="sh-field"><span>Responsable (opcional)</span><input value={responsable} onChange={(e) => setResponsable(e.target.value)} /></label>
              <label className="sh-field"><span>Capacidad de personas (opcional)</span><input type="number" inputMode="numeric" value={capacidad} onChange={(e) => setCapacidad(e.target.value)} placeholder="Ej: 200" /></label>
              {error && <p className="sh-form-error">{error}</p>}
              <button className="sh-save" onClick={crear} disabled={enviando || !pos}>{enviando ? "Creando…" : "Crear shelter aquí"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ================= RESUMEN ================= */
function ResumenTab({ miShelter, misPedidos, miInventario, onRefrescar, loading }) {
  const pend = misPedidos.filter((p) => clean(p.estado) === "PENDIENTE");
  return (
    <>
      <div className="sh-head-row">
        <h2 className="sh-h2">Resumen</h2>
        <button className="sh-refresh-btn" onClick={onRefrescar}>{loading ? "…" : "⟳ Actualizar"}</button>
      </div>
      <div className="sh-stats">
        <div className="sh-stat sh-glass"><b>{miInventario.length}</b><span>Insumos en stock</span></div>
        <div className="sh-stat sh-glass"><b>{pend.length}</b><span>Mis pedidos activos</span></div>
        <div className="sh-stat sh-glass"><b className="sh-stat-tel">{clean(miShelter?.telefono) || "—"}</b><span>Contacto</span></div>
      </div>

      <h3 className="sh-h3">Mis pedidos</h3>
      {misPedidos.length === 0 ? (
        <div className="sh-empty sh-glass"><p>Aún no has pedido ayuda.</p></div>
      ) : (
        <ul className="sh-cards">
          {misPedidos.map((p) => (
            <li key={p.id_pedido} className={`sh-card sh-glass sh-prio-${num(p.prioridad)}`}>
              <div className="sh-card-top">
                <span className={`sh-badge sh-badge-${num(p.prioridad)}`}>{PRIORIDAD_LABEL[num(p.prioridad)]}</span>
                <span className={`sh-estado sh-estado-${clean(p.estado).toLowerCase()}`}>{clean(p.estado)}</span>
              </div>
              <ul className="sh-items">
                {(p.items || []).map((it, i) => (
                  <li key={i}><span>{clean(it.categoria)}</span><b>{num(it.cantidad_solicitada)} {clean(it.unidad_medida)}</b></li>
                ))}
              </ul>

              {/* estado del envío */}
              {clean(p.estado) === "EN_RUTA" && (
                <div className="sh-envio">
                  {clean(p.shelter_responde) && (
                    <span className="sh-envio-linea">📦 Responde: <b>{clean(p.shelter_responde)}</b></span>
                  )}
                  {clean(p.transportista) ? (
                    <span className="sh-envio-linea sh-envio-ok">
                      🚗 Lo transporta: <b>{clean(p.transportista)}</b>
                      {clean(p.transportista_tel) && <a href={`tel:${clean(p.transportista_tel)}`} className="sh-envio-tel">☎ {clean(p.transportista_tel)}</a>}
                    </span>
                  ) : (
                    <span className="sh-envio-linea sh-envio-buscando">🔎 Buscando quién lo transporte…</span>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ================= INVENTARIO ================= */
function InventarioTab({ clave, miShelterId, miInventario, categorias, onCambio }) {
  const [form, setForm] = useState(false);
  const [cat, setCat] = useState(""); const [cant, setCant] = useState(""); const [unidad, setUnidad] = useState("");
  const [donante, setDonante] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");

  const onCat = (v) => { setCat(v); const c = categorias.find((x) => clean(x.id_categoria) === v); if (c) setUnidad(clean(c.unidad_medida)); };

  const guardar = async () => {
    setError("");
    if (!cat) return setError("Elige el insumo.");
    if (num(cant) <= 0) return setError("Escribe la cantidad.");
    setSaving(true);
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const r = await post({ action: "create", sheet: "INVENTARIO", clave,
        data: { id_shelter: miShelterId, id_categoria: cat, cantidad_disponible: num(cant), unidad_medida: unidad, fecha_ingreso: hoy, origen_donante: clean(donante) } });
      if (r && r.status === "success") { setForm(false); setCat(""); setCant(""); setUnidad(""); setDonante(""); onCambio(); }
      else setError((r && r.message) || "No se pudo guardar.");
    } catch (e) { setError("Fallo de red."); } finally { setSaving(false); }
  };

  const borrar = async (row) => {
    if (!window.confirm("¿Eliminar este insumo del inventario?")) return;
    const r = await post({ action: "delete", sheet: "INVENTARIO", clave, rowId: row.rowId });
    if (r && r.status === "success") onCambio(); else alert((r && r.message) || "No se pudo eliminar.");
  };

  return (
    <>
      <div className="sh-head-row">
        <h2 className="sh-h2">Mi inventario</h2>
        <button className="sh-add-btn" onClick={() => setForm(true)}>+ Agregar</button>
      </div>

      {miInventario.length === 0 ? (
        <div className="sh-empty sh-glass"><p>Tu inventario está vacío. Agrega lo que ha llegado.</p></div>
      ) : (
        <ul className="sh-inv-list">
          {miInventario.map((i) => (
            <li key={i.rowId} className="sh-inv-item sh-glass">
              <div className="sh-inv-info"><b>{clean(i.nombreCat)}</b>{clean(i.origen_donante) && <small>{clean(i.origen_donante)}</small>}</div>
              <span className="sh-inv-cant">{num(i.cantidad_disponible)} {clean(i.unidad_medida)}</span>
              <button className="sh-inv-del" onClick={() => borrar(i)}>🗑</button>
            </li>
          ))}
        </ul>
      )}

      {form && (
        <div className="sh-overlay" onClick={() => setForm(false)}>
          <div className="sh-modal sh-glass" onClick={(e) => e.stopPropagation()}>
            <div className="sh-modal-head"><h3>Agregar al inventario</h3><button className="sh-modal-x" onClick={() => setForm(false)}>✕</button></div>
            <div className="sh-form">
              <label className="sh-field"><span>Insumo</span>
                <select value={cat} onChange={(e) => onCat(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {categorias.map((c) => <option key={c.id_categoria} value={clean(c.id_categoria)}>{clean(c.nombre)}</option>)}
                </select>
              </label>
              <div className="sh-item-row">
                <input type="number" inputMode="numeric" placeholder="Cantidad" value={cant} onChange={(e) => setCant(e.target.value)} />
                <span className="sh-item-unit">{unidad || "—"}</span>
              </div>
              <label className="sh-field"><span>Origen / donante (opcional)</span><input value={donante} onChange={(e) => setDonante(e.target.value)} /></label>
              {error && <p className="sh-form-error">{error}</p>}
              <button className="sh-save" onClick={guardar} disabled={saving}>{saving ? "Guardando…" : "Agregar"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ================= PEDIR AYUDA ================= */
function PedirTab({ clave, miShelterId, categorias, onEnviado }) {
  const [prioridad, setPrioridad] = useState(2);
  const [obs, setObs] = useState("");
  const [items, setItems] = useState([{ id_categoria: "", cantidad_solicitada: "", unidad_medida: "" }]);
  const [enviando, setEnviando] = useState(false); const [error, setError] = useState(""); const [ok, setOk] = useState(false);

  const setItem = (i, f, v) => setItems((prev) => {
    const c = [...prev]; c[i] = { ...c[i], [f]: v };
    if (f === "id_categoria") { const cat = categorias.find((x) => clean(x.id_categoria) === v); if (cat) c[i].unidad_medida = clean(cat.unidad_medida); }
    return c;
  });
  const add = () => setItems((p) => [...p, { id_categoria: "", cantidad_solicitada: "", unidad_medida: "" }]);
  const del = (i) => setItems((p) => p.filter((_, x) => x !== i));

  const enviar = async () => {
    setError("");
    const val = items.filter((it) => clean(it.id_categoria) && num(it.cantidad_solicitada) > 0);
    if (!val.length) return setError("Agrega al menos un insumo.");
    setEnviando(true);
    try {
      const r = await post({ action: "auxilio", clave, id_shelter: miShelterId, prioridad: Number(prioridad), observaciones: clean(obs),
        items: val.map((it) => ({ id_categoria: it.id_categoria, cantidad_solicitada: num(it.cantidad_solicitada), unidad_medida: it.unidad_medida })) });
      if (r && r.status === "success") { setOk(true); setItems([{ id_categoria: "", cantidad_solicitada: "", unidad_medida: "" }]); setObs(""); setTimeout(() => { setOk(false); onEnviado(); }, 1400); }
      else setError((r && r.message) || "No se pudo enviar.");
    } catch (e) { setError("Fallo de red."); } finally { setEnviando(false); }
  };

  if (ok) return <div className="sh-empty sh-glass sh-ok-box"><span className="sh-ok-check">✓</span><p>Pedido enviado. Otros shelters ya pueden verlo.</p></div>;

  return (
    <>
      <h2 className="sh-h2">Pedir ayuda</h2>
      <div className="sh-form sh-form-block">
        <div className="sh-field"><span>Urgencia</span>
          <div className="sh-prio-pills">
            {[1,2,3,4].map((p) => (
              <button key={p} type="button" className={`sh-pill sh-pill-${p} ${Number(prioridad)===p?"on":""}`} onClick={() => setPrioridad(p)}>{PRIORIDAD_LABEL[p]}</button>
            ))}
          </div>
        </div>
        <div className="sh-field"><span>¿Qué necesitas?</span>
          {items.map((it, i) => (
            <div key={i} className="sh-item-row">
              <select value={it.id_categoria} onChange={(e) => setItem(i, "id_categoria", e.target.value)}>
                <option value="">Insumo…</option>
                {categorias.map((c) => <option key={c.id_categoria} value={clean(c.id_categoria)}>{clean(c.nombre)}</option>)}
              </select>
              <input type="number" inputMode="numeric" placeholder="Cant." value={it.cantidad_solicitada} onChange={(e) => setItem(i, "cantidad_solicitada", e.target.value)} />
              <span className="sh-item-unit">{it.unidad_medida || "—"}</span>
              {items.length > 1 && <button type="button" className="sh-item-del-btn" onClick={() => del(i)}>✕</button>}
            </div>
          ))}
          <button type="button" className="sh-add-item" onClick={add}>+ Agregar insumo</button>
        </div>
        <label className="sh-field"><span>Nota (opcional)</span>
          <textarea rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej: sin agua desde ayer, hay niños…" />
        </label>
        {error && <p className="sh-form-error">{error}</p>}
        <button className="sh-save" onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Enviar pedido"}</button>
      </div>
    </>
  );
}

/* ================= RESPONDER ================= */
function ResponderTab({ clave, miShelterId, pedidos, miInventario, onDespachado }) {
  const [sel, setSel] = useState(null);
  const [enviando, setEnviando] = useState(false); const [msg, setMsg] = useState("");

  const stockPorCat = useMemo(() => {
    const m = {};
    miInventario.forEach((i) => { m[clean(i.id_categoria)] = (m[clean(i.id_categoria)] || 0) + num(i.cantidad_disponible); });
    return m;
  }, [miInventario]);

  const puedoCubrir = (p) => (p.items || []).some((it) => (stockPorCat[clean(it.id_categoria)] || 0) > 0);

  const responder = async () => {
    setMsg(""); setEnviando(true);
    try {
      const r = await post({ action: "despachar", clave, id_pedido: sel.id_pedido, id_shelter_origen: miShelterId });
      if (r && r.status === "success") { setSel(null); onDespachado(); }
      else setMsg((r && r.message) || "No se pudo despachar.");
    } catch (e) { setMsg("Fallo de red."); } finally { setEnviando(false); }
  };

  return (
    <>
      <h2 className="sh-h2">Responder pedidos</h2>
      <p className="sh-sub">Pedidos de otros shelters cercanos. Si tienes el insumo, puedes enviarlo desde tu inventario.</p>

      {pedidos.length === 0 ? (
        <div className="sh-empty sh-glass"><span className="sh-ok-check">✓</span><p>No hay pedidos de otros shelters ahora.</p></div>
      ) : (
        <ul className="sh-cards">
          {pedidos.map((p) => {
            const cubre = puedoCubrir(p);
            return (
              <li key={p.id_pedido} className={`sh-card sh-glass sh-prio-${num(p.prioridad)}`}>
                <div className="sh-card-top">
                  <div className="sh-card-shelter"><b>{clean(p.shelter)}</b><small>{p.dist != null ? `${p.dist.toFixed(1)} km` : "distancia desconocida"}</small></div>
                  <span className={`sh-badge sh-badge-${num(p.prioridad)}`}>{PRIORIDAD_LABEL[num(p.prioridad)]}</span>
                </div>
                <ul className="sh-items">
                  {(p.items || []).map((it, i) => {
                    const tengo = stockPorCat[clean(it.id_categoria)] || 0;
                    return (
                      <li key={i}>
                        <span>{clean(it.categoria)}</span>
                        <b className={tengo > 0 ? "sh-tengo" : "sh-no-tengo"}>
                          {num(it.cantidad_solicitada)} {clean(it.unidad_medida)}
                          {tengo > 0 ? ` · tengo ${tengo}` : " · sin stock"}
                        </b>
                      </li>
                    );
                  })}
                </ul>
                {clean(p.telefono) && <a href={`tel:${clean(p.telefono)}`} className="sh-call">☎ Llamar al shelter</a>}
                <button className={`sh-responder-btn ${cubre ? "" : "sh-disabled"}`} disabled={!cubre} onClick={() => setSel(p)}>
                  {cubre ? "Enviar de mi inventario" : "No tengo estos insumos"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {sel && (
        <div className="sh-overlay" onClick={() => setSel(null)}>
          <div className="sh-modal sh-glass" onClick={(e) => e.stopPropagation()}>
            <div className="sh-modal-head"><h3>Enviar a {clean(sel.shelter)}</h3><button className="sh-modal-x" onClick={() => setSel(null)}>✕</button></div>
            <div className="sh-form">
              <div className="sh-resumen">
                {(sel.items || []).map((it, i) => {
                  const tengo = stockPorCat[clean(it.id_categoria)] || 0;
                  const envia = Math.min(num(it.cantidad_solicitada), tengo);
                  return (
                    <div key={i} className="sh-resumen-row">
                      <span>{clean(it.categoria)}</span>
                      <b>{envia} {clean(it.unidad_medida)} {envia < num(it.cantidad_solicitada) ? "(parcial)" : ""}</b>
                    </div>
                  );
                })}
              </div>
              <p className="sh-hint">Se descontará de tu inventario y el pedido pasará a EN_RUTA.</p>
              {msg && <p className="sh-form-error">{msg}</p>}
              <button className="sh-save" onClick={responder} disabled={enviando}>{enviando ? "Enviando…" : "Confirmar envío"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Shelter;