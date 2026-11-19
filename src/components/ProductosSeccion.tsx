import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { OrigenBadge, ProductoDetalle, resumenContenido } from './ProductoDetalle';
import { ProductoForm } from './ProductoForm';
import { useSeleccionViva, type ModoSeccion } from './useSeleccionViva';
import { leerReferencias, repositorioProductos } from '../lib/db';
import { fechaLegible, formatearExacto } from '../lib/formato';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import type { DatosProducto } from '../lib/validacionPlan';
import type { ProductoVerificado } from '../types';
import { confirmar } from './Confirmacion';
import { CatalogoFertilizantes } from './CatalogoFertilizantes';
import { productoDesdeReferencia, type FertilizanteReferencia } from '../lib/referencias';

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
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pestana, setPestana] = useState<'mios' | 'catalogo'>('mios');
  // El error de lectura se captura aquí para mostrar un mensaje en lugar de romper la pantalla.
  const lectura = useLiveQuery<Lectura>(async () => {
    try {
      return { ok: true, productos: await repositorioProductos.listar() };
    } catch {
      return { ok: false };
    }
  }, []);
  const productos = lectura?.ok ? lectura.productos : undefined;
  const seleccion = useSeleccionViva(productos, 'titulo-productos');
  // Catálogo de referencia (ICA y DANE), descargado de la nube y guardado en el dispositivo.
  const referencias = useLiveQuery(async () => (await leerReferencias())?.conjunto.fertilizantes ?? [], [], []);
  const { modo, modoVisible, seleccionado, esperando } = seleccion;

  function abrir(m: ModoSeccion, id?: string | null) {
    setAviso(null);
    seleccion.abrir(m, id);
  }

  async function guardar(datos: DatosProducto, { descartarDanados }: { descartarDanados: boolean }) {
    const editando = modo === 'editar' && seleccionado;
    const id = await repositorioProductos.guardar(datos, { id: editando ? seleccionado.id : undefined, descartarDanados });
    seleccion.verGuardado(id);
    setAviso({ tipo: 'ok', texto: editando ? 'Los cambios del producto se guardaron.' : 'El producto se guardó en el catálogo de este dispositivo.' });
  }

  /** Copia un fertilizante del catálogo de referencia a "Mis productos" y lo abre para revisarlo. */
  async function agregarDeCatalogo(r: FertilizanteReferencia, departamento?: string) {
    try {
      const id = await repositorioProductos.guardar({ ...productoDesdeReferencia(r, departamento), esEjemplo: false });
      setPestana('mios');
      seleccion.verGuardado(id);
      setAviso({ tipo: 'ok', texto: `«${r.nombre}» se agregó a Mis productos. Revisa que coincida con la etiqueta de tu bulto${departamento ? '' : ' y agrega el precio si lo conoces'}.` });
    } catch (error) {
      setAviso({ tipo: 'error', texto: error instanceof ErrorPersistencia ? error.message : 'No se pudo agregar el producto. Vuelve a intentarlo.' });
    }
  }

  async function borrar(p: ProductoVerificado) {
    if (!(await confirmar({ titulo: 'Eliminar producto', mensaje: `¿Eliminar “${p.nombre || 'este producto'}” del catálogo? Los planes que ya lo usan conservan su propia copia. Esta acción no se puede deshacer.`, boton: 'Eliminar', peligro: true }))) return;
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
      {/* Con un formulario abierto, el título del catálogo no se repite (el formulario tiene el suyo). */}
      {modoVisible === 'lista' ? <div className="section-header">
        <div>
          <div className="section-kicker">FERTILIZANTES</div>
          <h1 id="titulo-productos">Productos</h1>
          <p>En <strong>Mis productos</strong> están los fertilizantes que usas, tal como dice su etiqueta; sirven para todos tus lotes. En <strong>Buscar fertilizantes</strong> puedes ver todos los que tienen registro ICA en Colombia y de qué están compuestos.</p>
        </div>
        {lectura?.ok && pestana === 'mios' && <button className="btn btn-outline" onClick={() => abrir('nuevo', null)}>+ Agregar producto</button>}
      </div> : <h1 id="titulo-productos" className="sr-only">Catálogo de productos</h1>}

      {aviso && <div role={aviso.tipo === 'error' ? 'alert' : 'status'} className={`notice ${aviso.tipo === 'error' ? 'notice-error' : 'notice-ok'}`}>
        <span aria-hidden="true">{aviso.tipo === 'error' ? '!' : '✓'}</span>{aviso.texto}
        <button onClick={() => setAviso(null)} aria-label="Cerrar aviso">×</button>
      </div>}

      {lectura && !lectura.ok && <div className="notice notice-error" role="alert">
        <span aria-hidden="true">!</span>
        No se pudieron leer los productos guardados en este navegador. Tus datos no se han borrado. Recarga la página; si el problema sigue, revisa que el navegador permita almacenamiento local y no esté en modo privado.
      </div>}

      {modo === 'nuevo' && <>
        <button className="back" onClick={() => abrir('lista', null)}>← Volver al catálogo</button>
        <ProductoForm referencias={referencias} onGuardar={guardar} onCancelar={() => abrir('lista', null)} />
      </>}
      {modo === 'editar' && seleccionado && <button className="back" onClick={() => abrir('ver')}>← Volver al producto</button>}
      {modo === 'editar' && seleccionado && <ProductoForm key={seleccionado.id} inicial={seleccionado} onGuardar={guardar} onCancelar={() => abrir('ver')} />}
      {modo === 'ver' && seleccionado && <>
        <button className="back" onClick={() => abrir('lista', null)}>← Volver al catálogo</button>
        <ProductoDetalle producto={seleccionado} onEditar={() => abrir('editar')} onEliminar={() => void borrar(seleccionado)} />
      </>}

      {esperando && <div className="empty"><p>Cargando producto…</p></div>}

      {modoVisible === 'lista' && <div className="pestanas" role="tablist" aria-label="Productos">
        <button type="button" role="tab" id="pestana-mios" aria-selected={pestana === 'mios'} aria-controls="panel-productos" className={pestana === 'mios' ? 'activa' : ''} onClick={() => setPestana('mios')}>Mis productos{productos ? ` (${productos.length})` : ''}</button>
        <button type="button" role="tab" id="pestana-catalogo" aria-selected={pestana === 'catalogo'} aria-controls="panel-productos" className={pestana === 'catalogo' ? 'activa' : ''} onClick={() => setPestana('catalogo')}>Buscar fertilizantes{referencias.length ? ` (${referencias.length.toLocaleString('es-CO')})` : ''}</button>
      </div>}

      {modoVisible === 'lista' && pestana === 'catalogo' && <div id="panel-productos" role="tabpanel" aria-labelledby="pestana-catalogo">
        <CatalogoFertilizantes referencias={referencias} registrosPropios={new Set((productos ?? []).flatMap(v => (v.producto?.registroIca ? [v.producto.registroIca] : [])))} onAgregar={agregarDeCatalogo} />
      </div>}

      {modoVisible === 'lista' && pestana === 'mios' && (
        lectura === undefined ? <div className="empty"><p>Cargando productos…</p></div>
          : !productos ? null
          : productos.length === 0 ? <div className="empty soil-empty"><h3>Aún no tienes productos</h3><p>Busca tu fertilizante entre los que tienen registro ICA y agrégalo con un toque, o regístralo a mano con los datos de su etiqueta.</p><div className="detalle-botones"><button className="btn btn-primary" onClick={() => setPestana('catalogo')}>Buscar fertilizantes</button><button className="btn btn-outline" onClick={() => abrir('nuevo', null)}>Registrar a mano</button></div></div>
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
