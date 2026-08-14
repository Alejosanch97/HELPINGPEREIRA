import React, { useState, useEffect, useCallback } from "react";

/* ============================================================
   CRUD GENÉRICO — gestiona cualquier hoja maestra
   Recibe: sheet, columns (config), clave del coordinador.
   ============================================================ */

const API_URL =
  "https://script.google.com/macros/s/AKfycbw0mzdDvuPMxQmP-TDcKkxc3sl-jB63uDgkDV0bK_X0R98SgWrWk8lishJ92LYxZVxiAA/exec";

const clean = (v) => (v === null || v === undefined ? "" : String(v).trim());

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

/**
 * columns: [{ key, label, type?, options?, readOnly?, hideInForm? }]
 *  - type: "text" | "number" | "select"
 *  - options: [{value,label}]  (para select; o función que recibe el store)
 *  - readOnly: no editable (ej. el ID autogenerado)
 *  - hideInForm: no aparece en el formulario (se llena solo)
 * idField: nombre de la columna ID (para update/delete)
 * lookups: { SHEET: [...] } catálogos para resolver selects dinámicos
 */
export const CrudTable = ({ sheet, columns, idField, clave, lookups = {}, titulo }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // fila en edición o null (crear)
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getSheet(sheet));
    } catch (e) {
      setMsg("Error al cargar.");
    } finally {
      setLoading(false);
    }
  }, [sheet]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirCrear = () => {
    setEditing(null);
    setForm({});
    setMsg("");
    setFormOpen(true);
  };

  const abrirEditar = (row) => {
    setEditing(row);
    const f = {};
    columns.forEach((c) => (f[c.key] = clean(row[c.key])));
    setForm(f);
    setMsg("");
    setFormOpen(true);
  };

  const guardar = async () => {
    setSaving(true);
    setMsg("");
    try {
      let resp;
      if (editing) {
        resp = await postAction({
          action: "update",
          sheet,
          clave,
          rowId: editing.rowId,
          data: form,
        });
      } else {
        resp = await postAction({
          action: "create",
          sheet,
          clave,
          data: form,
        });
      }
      if (resp && resp.status === "success") {
        setFormOpen(false);
        await cargar();
      } else {
        setMsg((resp && resp.message) || "No se pudo guardar.");
      }
    } catch (e) {
      setMsg("Fallo de red.");
    } finally {
      setSaving(false);
    }
  };

  const borrar = async (row) => {
    if (!window.confirm("¿Eliminar este registro?")) return;
    try {
      const resp = await postAction({
        action: "delete",
        sheet,
        clave,
        rowId: row.rowId,
      });
      if (resp && resp.status === "success") {
        await cargar();
      } else {
        alert((resp && resp.message) || "No se pudo eliminar.");
      }
    } catch (e) {
      alert("Fallo de red.");
    }
  };

  // resuelve las opciones de un select (estáticas o desde un lookup)
  const optionsFor = (col) => {
    if (typeof col.options === "function") return col.options(lookups);
    return col.options || [];
  };

  // muestra el valor legible de una celda (resuelve IDs a nombres si hay lookup)
  const displayCell = (row, col) => {
    const raw = clean(row[col.key]);
    if (col.display) return col.display(raw, lookups, row);
    return raw;
  };

  // columnas visibles en la tabla (máx 3 para móvil + acciones)
  const visibleCols = columns.filter((c) => !c.hideInList).slice(0, 3);

  return (
    <div className="ad-crud">
      <div className="ad-crud-head">
        <div>
          <h2>{titulo || sheet}</h2>
          <span className="ad-crud-count">{rows.length} registros</span>
        </div>
        <button className="ad-add" onClick={abrirCrear}>
          + Nuevo
        </button>
      </div>

      {loading ? (
        <div className="ad-skel-wall">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ad-skel" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="ad-empty ad-glass">
          <p>Aún no hay registros. Crea el primero con “+ Nuevo”.</p>
        </div>
      ) : (
        <ul className="ad-rows">
          {rows.map((row) => (
            <li key={row.rowId} className="ad-row ad-glass">
              <div className="ad-row-main">
                {visibleCols.map((col, i) => (
                  <div
                    key={col.key}
                    className={i === 0 ? "ad-cell-primary" : "ad-cell"}
                  >
                    {i > 0 && <span className="ad-cell-label">{col.label}</span>}
                    <span>{displayCell(row, col)}</span>
                  </div>
                ))}
              </div>
              <div className="ad-row-actions">
                <button className="ad-edit" onClick={() => abrirEditar(row)}>
                  ✎
                </button>
                <button className="ad-del" onClick={() => borrar(row)}>
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* FORM MODAL */}
      {formOpen && (
        <div className="ad-overlay" onClick={() => setFormOpen(false)}>
          <div
            className="ad-modal ad-glass"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="ad-modal-head">
              <h3>{editing ? "Editar" : "Nuevo"} · {titulo || sheet}</h3>
              <button className="ad-modal-x" onClick={() => setFormOpen(false)}>
                ✕
              </button>
            </div>

            <div className="ad-form">
              {columns
                .filter((c) => !c.hideInForm)
                .map((col) => {
                  const disabled = col.readOnly && !editing ? false : col.readOnly;
                  if (col.readOnly && !editing) return null; // ID autogenerado: no mostrar al crear
                  return (
                    <label key={col.key} className="ad-field">
                      <span>{col.label}</span>
                      {col.type === "select" ? (
                        <select
                          value={form[col.key] || ""}
                          disabled={disabled}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, [col.key]: e.target.value }))
                          }
                        >
                          <option value="">Selecciona…</option>
                          {optionsFor(col).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={col.type === "number" ? "number" : "text"}
                          inputMode={col.type === "number" ? "decimal" : "text"}
                          value={form[col.key] || ""}
                          disabled={disabled}
                          placeholder={col.placeholder || ""}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, [col.key]: e.target.value }))
                          }
                        />
                      )}
                    </label>
                  );
                })}

              {msg && <p className="ad-form-error">{msg}</p>}

              <button className="ad-save" onClick={guardar} disabled={saving}>
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear registro"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CrudTable;