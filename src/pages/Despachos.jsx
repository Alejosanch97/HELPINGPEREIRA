import React, { useState, useEffect, useCallback, useMemo } from "react";

/* ============================================================
   DESPACHOS — atiende la cola priorizada y despacha
   Usa la acción 'despachar' del Apps Script (descuenta stock).
   ============================================================ */

const API_URL =
  "https://script.google.com/macros/s/AKfycbw0mzdDvuPMxQmP-TDcKkxc3sl-jB63uDgkDV0bK_X0R98SgWrWk8lishJ92LYxZVxiAA/exec";

const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v) => {
  const n = Number(clean(v).replace(",", "."));
  return isNaN(n) ? 0 : n;
};
const PRIORIDAD_LABEL = { 1: "Crítica", 2: "Alta", 3: "Media", 4: "Baja" };

async function fetchBoard() {
  const res = await fetch(`${API_URL}?action=board`);
  return res.json();
}
async function getSheet(sheet) {
  const res = await fetch(`${API_URL}?sheet=${encodeURIComponent(sheet)}&fresh=1`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
async function postAction(body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export const Despachos = ({ clave }) => {
  const [board, setBoard] = useState([]);
  const [acopios, setAcopios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seleccion, setSeleccion] = useState(null); // pedido a despachar
  const [idAcopio, setIdAcopio] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [b, a] = await Promise.all([fetchBoard(), getSheet("CENTROS_ACOPIO")]);
      setBoard(Array.isArray(b) ? b : []);
      setAcopios(a);
    } catch (e) {
      setMsg("Error al cargar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const pendientes = useMemo(
    () => board.filter((p) => clean(p.estado) === "PENDIENTE"),
    [board]
  );

  const abrirDespacho = (pedido) => {
    setSeleccion(pedido);
    setIdAcopio("");
    setMsg("");
  };

  const confirmarDespacho = async () => {
    if (!idAcopio) return setMsg("Selecciona el centro de acopio de origen.");
    setEnviando(true);
    setMsg("");
    try {
      const resp = await postAction({
        action: "despachar",
        clave,
        id_pedido: seleccion.id_pedido,
        id_acopio: idAcopio,
      });
      if (resp && resp.status === "success") {
        setSeleccion(null);
        await cargar();
      } else {
        setMsg((resp && resp.message) || "No se pudo despachar.");
      }
    } catch (e) {
      setMsg("Fallo de red.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="ad-desp">
      <div className="ad-crud-head">
        <div>
          <h2>Despachos</h2>
          <span className="ad-crud-count">{pendientes.length} pedidos pendientes</span>
        </div>
        <button className="ad-add" onClick={cargar}>
          ⟳ Actualizar
        </button>
      </div>

      {loading ? (
        <div className="ad-skel-wall">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ad-skel" />
          ))}
        </div>
      ) : pendientes.length === 0 ? (
        <div className="ad-empty ad-glass">
          <p>No hay pedidos pendientes. Todo despachado ✓</p>
        </div>
      ) : (
        <ul className="ad-desp-list">
          {pendientes.map((p) => (
            <li key={p.id_pedido} className={`ad-desp-card ad-glass ad-prio-${num(p.prioridad)}`}>
              <div className="ad-desp-top">
                <div>
                  <b>{clean(p.shelter)}</b>
                  <small>{clean(p.localidad)}</small>
                </div>
                <span className={`ad-badge ad-badge-${num(p.prioridad)}`}>
                  {PRIORIDAD_LABEL[num(p.prioridad)]}
                </span>
              </div>

              {p.items && p.items.length > 0 && (
                <ul className="ad-desp-items">
                  {p.items.map((it, i) => (
                    <li key={i}>
                      <span>{clean(it.categoria)}</span>
                      <b>{num(it.cantidad_solicitada)} {clean(it.unidad_medida)}</b>
                    </li>
                  ))}
                </ul>
              )}

              {clean(p.observaciones) && (
                <p className="ad-desp-obs">“{clean(p.observaciones)}”</p>
              )}

              <button className="ad-desp-btn" onClick={() => abrirDespacho(p)}>
                Despachar ayuda
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* MODAL DESPACHO */}
      {seleccion && (
        <div className="ad-overlay" onClick={() => setSeleccion(null)}>
          <div className="ad-modal ad-glass" onClick={(e) => e.stopPropagation()}>
            <div className="ad-modal-head">
              <h3>Despachar a {clean(seleccion.shelter)}</h3>
              <button className="ad-modal-x" onClick={() => setSeleccion(null)}>
                ✕
              </button>
            </div>

            <div className="ad-form">
              <div className="ad-desp-resumen">
                {seleccion.items.map((it, i) => (
                  <div key={i} className="ad-desp-res-row">
                    <span>{clean(it.categoria)}</span>
                    <b>{num(it.cantidad_solicitada)} {clean(it.unidad_medida)}</b>
                  </div>
                ))}
              </div>

              <label className="ad-field">
                <span>Centro de acopio de origen</span>
                <select value={idAcopio} onChange={(e) => setIdAcopio(e.target.value)}>
                  <option value="">Selecciona…</option>
                  {acopios.map((a) => (
                    <option key={a.id_acopio} value={clean(a.id_acopio)}>
                      {clean(a.nombre)}
                    </option>
                  ))}
                </select>
              </label>

              <p className="ad-desp-hint">
                Al confirmar se descuenta el stock del acopio, se crea el despacho
                y el pedido pasa a EN_RUTA.
              </p>

              {msg && <p className="ad-form-error">{msg}</p>}

              <button className="ad-save" onClick={confirmarDespacho} disabled={enviando}>
                {enviando ? "Despachando…" : "Confirmar despacho"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Despachos;