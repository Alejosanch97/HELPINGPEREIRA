import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import "../Styles/admin.css";
import { CrudTable } from "./CrudTable";
import { Despachos } from "./Despachos";

/* ============================================================
   ADMIN — Panel del coordinador
   Puerta por clave (valida contra el backend) + pestañas.
   ============================================================ */

const API_URL =
  "https://script.google.com/macros/s/AKfycbw0mzdDvuPMxQmP-TDcKkxc3sl-jB63uDgkDV0bK_X0R98SgWrWk8lishJ92LYxZVxiAA/exec";

const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());
const SESSION_KEY = "ax_admin_clave";

async function getSheet(sheet) {
  const res = await fetch(`${API_URL}?sheet=${encodeURIComponent(sheet)}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Valida la clave intentando una operación protegida ligera (crea/borra nada):
// hacemos un create con datos vacíos a una hoja protegida y leemos el mensaje.
// Más simple: intentamos un update inexistente; si dice "clave inválida" -> mal.
async function validarClave(clave) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action: "update",
      sheet: "LOCALIDADES",
      clave,
      idField: "id_localidad",
      idValue: "__probe__", // no existe: no modifica nada
    }),
  });
  const data = await res.json();
  // Si la clave es mala, el backend responde "Clave requerida o invalida".
  // Si es buena, responde "No se encontró la fila a actualizar".
  if (data && data.message && /clave/i.test(data.message)) return false;
  return true;
}

/* ---------- Config de columnas por tabla ---------- */
// display: convierte un id en su nombre usando los catálogos (lookups)
const nombrePorId = (sheet, idKey, nameKey) => (raw, lookups) => {
  const list = lookups[sheet] || [];
  const found = list.find((r) => clean(r[idKey]) === clean(raw));
  return found ? clean(found[nameKey]) : raw;
};

const TABLE_CONFIG = {
  LOCALIDADES: {
    titulo: "Localidades",
    idField: "id_localidad",
    columns: [
      { key: "id_localidad", label: "ID", readOnly: true },
      { key: "nombre", label: "Nombre", type: "text" },
      { key: "municipio", label: "Municipio", type: "text" },
      {
        key: "nivel_afectacion", label: "Afectación", type: "select",
        options: [
          { value: "Critica", label: "Crítica" },
          { value: "Alta", label: "Alta" },
          { value: "Media", label: "Media" },
          { value: "Baja", label: "Baja" },
        ],
      },
      { key: "poblacion_estimada", label: "Población", type: "number" },
      { key: "latitud", label: "Latitud", type: "number" },
      { key: "longitud", label: "Longitud", type: "number" },
      { key: "notas", label: "Notas", type: "text", hideInList: true },
    ],
  },
  SHELTERS: {
    titulo: "Refugios",
    idField: "id_shelter",
    columns: [
      { key: "id_shelter", label: "ID", readOnly: true },
      { key: "nombre", label: "Nombre", type: "text" },
      {
        key: "id_localidad", label: "Localidad", type: "select",
        options: (lk) => (lk.LOCALIDADES || []).map((l) => ({
          value: clean(l.id_localidad), label: clean(l.nombre),
        })),
        display: nombrePorId("LOCALIDADES", "id_localidad", "nombre"),
      },
      { key: "responsable", label: "Responsable", type: "text", hideInList: true },
      { key: "telefono", label: "Teléfono", type: "text" },
      { key: "capacidad_personas", label: "Capacidad", type: "number", hideInList: true },
      { key: "personas_actuales", label: "Actuales", type: "number", hideInList: true },
      { key: "latitud", label: "Latitud", type: "number", hideInList: true },
      { key: "longitud", label: "Longitud", type: "number", hideInList: true },
      {
        key: "estado", label: "Estado", type: "select", hideInList: true,
        options: [
          { value: "Activo", label: "Activo" },
          { value: "Lleno", label: "Lleno" },
          { value: "Cerrado", label: "Cerrado" },
        ],
      },
    ],
  },
  CENTROS_ACOPIO: {
    titulo: "Centros de acopio",
    idField: "id_acopio",
    columns: [
      { key: "id_acopio", label: "ID", readOnly: true },
      { key: "nombre", label: "Nombre", type: "text" },
      { key: "direccion", label: "Dirección", type: "text" },
      { key: "responsable", label: "Responsable", type: "text", hideInList: true },
      { key: "telefono", label: "Teléfono", type: "text" },
      { key: "latitud", label: "Latitud", type: "number", hideInList: true },
      { key: "longitud", label: "Longitud", type: "number", hideInList: true },
      {
        key: "estado", label: "Estado", type: "select", hideInList: true,
        options: [
          { value: "Operativo", label: "Operativo" },
          { value: "Saturado", label: "Saturado" },
          { value: "Cerrado", label: "Cerrado" },
        ],
      },
    ],
  },
  CATEGORIAS: {
    titulo: "Categorías de insumos",
    idField: "id_categoria",
    columns: [
      { key: "id_categoria", label: "ID", readOnly: true },
      { key: "nombre", label: "Nombre", type: "text" },
      { key: "grupo", label: "Grupo", type: "text" },
      { key: "unidad_medida", label: "Unidad", type: "text" },
      {
        key: "perecedero", label: "Perecedero", type: "select", hideInList: true,
        options: [
          { value: "Si", label: "Sí" },
          { value: "No", label: "No" },
        ],
      },
    ],
  },
  INVENTARIO: {
    titulo: "Inventario",
    idField: "id_inventario",
    columns: [
      { key: "id_inventario", label: "ID", readOnly: true },
      {
        key: "id_acopio", label: "Centro acopio", type: "select",
        options: (lk) => (lk.CENTROS_ACOPIO || []).map((a) => ({
          value: clean(a.id_acopio), label: clean(a.nombre),
        })),
        display: nombrePorId("CENTROS_ACOPIO", "id_acopio", "nombre"),
      },
      {
        key: "id_categoria", label: "Insumo", type: "select",
        options: (lk) => (lk.CATEGORIAS || []).map((c) => ({
          value: clean(c.id_categoria), label: clean(c.nombre),
        })),
        display: nombrePorId("CATEGORIAS", "id_categoria", "nombre"),
      },
      { key: "cantidad_disponible", label: "Cantidad", type: "number" },
      { key: "unidad_medida", label: "Unidad", type: "text", hideInList: true },
      { key: "fecha_ingreso", label: "Ingreso", type: "text", hideInList: true },
      { key: "origen_donante", label: "Donante", type: "text", hideInList: true },
    ],
  },
};

const TABS = [
  { id: "DESPACHOS", label: "Despachos", icon: "🚚" },
  { id: "LOCALIDADES", label: "Localidades", icon: "📍" },
  { id: "SHELTERS", label: "Refugios", icon: "🏠" },
  { id: "CENTROS_ACOPIO", label: "Acopio", icon: "📦" },
  { id: "INVENTARIO", label: "Inventario", icon: "📊" },
  { id: "CATEGORIAS", label: "Categorías", icon: "🏷" },
];

export const Admin = () => {
  const [clave, setClave] = useState(null);
  const [input, setInput] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("DESPACHOS");

  // catálogos compartidos para resolver los selects (id -> nombre)
  const [lookups, setLookups] = useState({});

  // sesión: recupera clave guardada
  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) setClave(saved);
  }, []);

  const cargarLookups = useCallback(async () => {
    try {
      const [loc, aco, cat] = await Promise.all([
        getSheet("LOCALIDADES"),
        getSheet("CENTROS_ACOPIO"),
        getSheet("CATEGORIAS"),
      ]);
      setLookups({ LOCALIDADES: loc, CENTROS_ACOPIO: aco, CATEGORIAS: cat });
    } catch (e) {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    if (clave) cargarLookups();
  }, [clave, cargarLookups]);

  const entrar = async () => {
    setError("");
    if (!input.trim()) return setError("Escribe la clave.");
    setVerificando(true);
    try {
      const ok = await validarClave(input.trim());
      if (ok) {
        setClave(input.trim());
        sessionStorage.setItem(SESSION_KEY, input.trim());
      } else {
        setError("Clave incorrecta.");
      }
    } catch (e) {
      setError("Fallo de red. Reintenta.");
    } finally {
      setVerificando(false);
    }
  };

  const salir = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setClave(null);
    setInput("");
  };

  /* ---------- PANTALLA DE CLAVE ---------- */
  if (!clave) {
    return (
      <div className="ad-gate">
        <div className="ad-bg" aria-hidden="true">
          <span className="ad-blob ad-blob-1" />
          <span className="ad-blob ad-blob-2" />
        </div>
        <div className="ad-gate-card ad-glass">
          <span className="ad-gate-icon">🔐</span>
          <h1>Panel de coordinación</h1>
          <p>Ingresa tu clave de coordinador para gestionar la red de ayuda.</p>
          <input
            type="password"
            className="ad-gate-input"
            placeholder="Clave de coordinador"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
          />
          {error && <p className="ad-gate-error">{error}</p>}
          <button className="ad-gate-btn" onClick={entrar} disabled={verificando}>
            {verificando ? "Verificando…" : "Entrar"}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- PANEL ---------- */
  const cfg = TABLE_CONFIG[tab];

  return (
    <div className="ad-panel">
      <div className="ad-bg" aria-hidden="true">
        <span className="ad-blob ad-blob-1" />
        <span className="ad-blob ad-blob-2" />
      </div>

      <header className="ad-top">
        <div className="ad-brand">
          <span className="ad-logo">◈</span>
          <div className="ad-brand-txt">
            <b>COORDINACIÓN</b>
            <small>Red de ayuda</small>
          </div>
        </div>
        <div className="ad-top-actions">
          <Link to="/" className="ad-home-link" title="Ver Home público">
            <span className="ad-home-icon">🏠</span>
            <span className="ad-home-txt">Inicio</span>
          </Link>
          <button className="ad-logout" onClick={salir} title="Salir">
            ⏻
          </button>
        </div>
      </header>

      {/* Tabs scrollables */}
      <nav className="ad-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`ad-tab ${tab === t.id ? "on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            <span className="ad-tab-icon">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="ad-content">
        {tab === "DESPACHOS" ? (
          <Despachos clave={clave} />
        ) : (
          <CrudTable
            key={tab}
            sheet={tab}
            titulo={cfg.titulo}
            idField={cfg.idField}
            columns={cfg.columns}
            clave={clave}
            lookups={lookups}
          />
        )}
      </main>
    </div>
  );
};

export default Admin;