import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { OrigenBadge, ProductoDetalle, resumenContenido } from './ProductoDetalle';
import { ProductoForm } from './ProductoForm';
import { repositorioProductos } from '../lib/db';
import { fechaLegible, formatearExacto } from '../lib/formato';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import type { DatosProducto } from '../lib/validacionPlan';
import type { ProductoVerificado } from '../types';

type Modo = 'lista' | 'nuevo' | 'editar' | 'ver';
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;
type Lectura = { ok: true; productos: ProductoVerificado[] } | { ok: false };

function precioResumido(v: ProductoVerificado): string {
  const p = v.producto;
  if (!p) return 'Datos por corregir';
  const bulto = p.presentacionKg !== undefined ? `Bulto de ${formatearExacto(p.presentacionKg)} kg` : 'Sin kg por bulto';
  return p.precioPresentacionCop !== undefined && p.fechaPrecio
    ? `${bulto} · ${formatearExacto(p.precioPresentacionCop)} COP (${fechaLegible(p.fechaPrecio)})`
    : `${bulto} · Sin precio registrado`;
}

/** Catálogo de fertilizantes según su etiqueta, común a todos los lotes. */
export function ProductosSeccion() {
  const [modo, setModo] = useState<Modo>('lista');
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  /** Recién guardado: mientras la consulta no lo traiga, se espera en lugar de mostrar la lista. */
  const [pendienteId, setPendienteId] = useState<string | null>(null);
  // El error de lectura se captura aquí para mostrar un mensaje en lugar de romper la pantalla.
  const lectura = useLiveQuery<Lectura>(async () => {
    try {
      return { ok: true, productos: await repositorioProductos.listar() };
    } catch {
      return { ok: false };
    }
  }, []);
  const productos = lectura?.ok ? lectura.productos : undefined;
  const seleccionado = productos?.find(p => p.id === seleccionId);
  // Si el producto abierto ya no existe (p. ej. se eliminó en otra pestaña), se vuelve a la lista.
  const perdido = (modo === 'ver' || modo === 'editar') && productos !== undefined && !seleccionado;
  const esperando = perdido && pendienteId !== null && pendienteId === seleccionId;
  const modoVisible: Modo = perdido && !esperando ? 'lista' : modo;
  useEffect(() => {
    if (seleccionado && seleccionado.id === pendienteId) setPendienteId(null);
  }, [seleccionado, pendienteId]);

  function abrir(m: Modo, id: string | null = seleccionId) {
    setAviso(null);
    setPendienteId(null);
    setSeleccionId(id);
    setModo(m);
  }

  async function guardar(datos: DatosProducto, { descartarDanados }: { descartarDanados: boolean }) {
    const editando = modo === 'editar' && seleccionado;
    const id = await repositorioProductos.guardar(datos, { id: editando ? seleccionado.id : undefined, descartarDanados });
    setSeleccionId(id);
    setPendienteId(id);
    setModo('ver');
    setAviso({ tipo: 'ok', texto: editando ? 'Los cambios del producto se guardaron.' : 'El producto se guardó en el catálogo de este dispositivo.' });
  }

  async function borrar(p: ProductoVerificado) {
    if (!window.confirm(`¿Eliminar “${p.nombre || 'este producto'}” del catálogo? Los planes que ya lo usan conservan su propia copia. Esta acción no se puede deshacer.`)) return;
    try {
      await repositorioProductos.eliminar(p.id);
      abrir('lista', null);
      setAviso({ tipo: 'ok', texto: 'El producto se eliminó del catálogo.' });
    } catch (error) {
      setAviso({ tipo: 'error', texto: error instanceof ErrorPersistencia ? error.message : 'No se pudo eliminar el producto. Vuelve a intentarlo.' });
    }
  }


  return (
    <section className="soil-section" aria-labelledby="titulo-productos">
      <div className="section-header">
        <div>
          <div className="section-kicker">FERTILIZANTES</div>
          <h1 id="titulo-productos">Catálogo de productos</h1>
          <p>Registra los fertilizantes tal como aparecen en su etiqueta. Este catálogo sirve para todos tus lotes. La app no recomienda productos ni dosis.</p>
        </div>
        {modoVisible === 'lista' && lectura?.ok && <button className="btn btn-outline" onClick={() => abrir('nuevo', null)}>+ Agregar producto</button>}
      </div>

      {aviso && <div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`notice ${aviso.tipo === 'error' ? 'notice-error' : 'notice-ok'}`}>
        <span aria-hidden="true">{aviso.tipo === 'error' ? '!' : '✓'}</span>{aviso.texto}
        <button onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
      </div>}

      {lectura && !lectura.ok && <div className="notice notice-error" role="alert">
        <span aria-hidden="true">!</span>
        No se pudieron leer los productos guardados en este navegador. Tus datos no se han borrado. Recarga la página; si el problema sigue, revisa que el navegador permita almacenamiento local y no esté en modo privado.
      </div>}

      {modo === 'nuevo' && <ProductoForm onGuardar={guardar} onCancelar={() => abrir('lista', null)} />}
      {modo === 'editar' && seleccionado && <ProductoForm key={seleccionado.id} inicial={seleccionado} onGuardar={guardar} onCancelar={() => abrir('ver')} />}
      {modo === 'ver' && seleccionado && <>
        <button className="back" onClick={() => abrir('lista', null)}>← Volver al catálogo</button>
        <ProductoDetalle producto={seleccionado} onEditar={() => abrir('editar')} onEliminar={() => void borrar(seleccionado)} />
      </>}

      {esperando && <div className="empty"><p>Cargando producto…</p></div>}

      {modoVisible === 'lista' && (
        lectura === undefined ? <div className="empty"><p>Cargando productos…</p></div>
          : !productos ? null
          : productos.length === 0 ? <div className="empty soil-empty"><h3>Aún no hay productos en el catálogo</h3><p>Ten a mano la etiqueta del fertilizante: necesitarás su nombre y el porcentaje de cada nutriente con su forma química.</p><button className="btn btn-primary" onClick={() => abrir('nuevo', null)}>Agregar el primer producto</button></div>
          : <ul className="soil-history" aria-label="Productos del catálogo, en orden alfabético">{productos.map((v, i) => (
            // Un registro sin identificador válido no se puede abrir: la app no podría editarlo ni eliminarlo.
            <li key={v.id || `sin-id-${i}`}><button className="lot-card soil-card" disabled={!v.id} title={v.id ? undefined : 'Registro sin identificador válido'} onClick={() => abrir('ver', v.id)}>
              <span className="lot-card-content">
                <strong>{v.nombre || 'Producto sin nombre'}</strong>
                <span>{v.producto ? resumenContenido(v.producto) : 'Contenido por corregir'}</span>
                <small>{precioResumido(v)}</small>
                <span className="card-badges"><OrigenBadge esEjemplo={v.producto?.esEjemplo} />{v.problemas.length > 0 && <span className="badge badge-error">Datos por corregir</span>}</span>
              </span>
              <span className="arrow" aria-hidden="true">›</span>
            </button></li>
          ))}</ul>
      )}
    </section>
  );
}
