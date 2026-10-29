import { useState, type FormEvent } from 'react';
import { precioPorKgCop } from '../lib/calculos';
import { CATALOGO_NUTRIENTES, OPCION_OTRO, buscarElemento } from '../lib/catalogoNutrientes';
import { formatearExacto, formatearResultado, numeroATexto } from '../lib/formato';
import { ErrorPersistencia } from '../lib/repositorioAnalisis';
import { fechaLocalISO, numeroSinAmbiguedad, validarNumeroSinAmbiguedad } from '../lib/validacion';
import {
  validarProducto,
  type DatosProducto,
  type EntradaContenido,
  type EntradaProducto,
  type ErroresProducto
} from '../lib/validacionPlan';
import type { ContenidoDeclarado, ProductoVerificado } from '../types';

interface Props {
  inicial?: ProductoVerificado;
  onGuardar: (datos: DatosProducto, opciones: { descartarDanados: boolean }) => Promise<void>;
  onCancelar: () => void;
}

type FilaContenido = EntradaContenido & { clave: number };
type EntradaFormulario = Omit<EntradaProducto, 'contenido'> & { contenido: FilaContenido[] };
type CampoTexto = 'nombre' | 'presentacionKg' | 'precioPresentacionCop' | 'fechaPrecio';

const OTRO = '__otro';
let siguienteClave = 0;
const filaVacia = (): FilaContenido => ({ clave: siguienteClave++, elemento: '', forma: '', porcentaje: '', elementoLibre: false, formaLibre: false });

/** Usa las listas solo si el texto guardado coincide exactamente; si no, conserva el texto original. */
function filaDesdeGuardado(c: ContenidoDeclarado): FilaContenido {
  const el = CATALOGO_NUTRIENTES.find(e => e.nombre === c.elemento);
  const base = { clave: siguienteClave++, porcentaje: numeroATexto(c.porcentaje) };
  if (!el) return { ...base, elemento: c.elemento, forma: c.forma, elementoLibre: true, formaLibre: true };
  return { ...base, elemento: el.nombre, forma: c.forma, elementoLibre: false, formaLibre: !el.formas.includes(c.forma) };
}

/** Un producto dañado no tiene datos completos: se precarga solo su nombre y se reescribe con la etiqueta. */
function entradaInicial(inicial?: ProductoVerificado): EntradaFormulario {
  const p = inicial?.producto;
  return {
    nombre: p?.nombre ?? inicial?.nombre ?? '',
    contenido: p?.contenido.length ? p.contenido.map(filaDesdeGuardado) : [filaVacia()],
    presentacionKg: p?.presentacionKg !== undefined ? numeroSinAmbiguedad(p.presentacionKg) : '',
    precioPresentacionCop: p?.precioPresentacionCop !== undefined ? numeroSinAmbiguedad(p.precioPresentacionCop) : '',
    fechaPrecio: p?.fechaPrecio ?? '',
    esEjemplo: p ? p.esEjemplo : null
  };
}

/** Cómo se leyeron el precio y los kg, antes de guardar (p. ej. para ver que 150000 son 150.000 COP). */
function vistaPrevia(precioTexto: string, kgTexto: string): string | null {
  const precio = validarNumeroSinAmbiguedad(precioTexto, { campo: 'Precio' });
  const kg = validarNumeroSinAmbiguedad(kgTexto, { campo: 'Kg', positivo: true });
  if (!precio.ok || !kg.ok || precio.valor === undefined || kg.valor === undefined) return null;
  try {
    return `Bulto de ${formatearExacto(kg.valor)} kg a ${formatearExacto(precio.valor)} COP: equivale a ${formatearResultado(precioPorKgCop(precio.valor, kg.valor))} COP por kg.`;
  } catch {
    return null;
  }
}

export function ProductoForm({ inicial, onGuardar, onCancelar }: Props) {
  const [entrada, setEntrada] = useState(() => entradaInicial(inicial));
  const [descartarDanados, setDescartarDanados] = useState(false);
  const [errores, setErrores] = useState<ErroresProducto>({});
  const [errorGeneral, setErrorGeneral] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const problemas = inicial?.problemas ?? [];

  /** Al corregir un dato desaparece su error; los demás se conservan hasta volver a guardar. */
  function corregido(campo: keyof ErroresProducto, indice?: number) {
    setErrorGeneral([]);
    setErrores(previos => {
      const { [campo]: _, ...resto } = previos;
      if (campo !== 'contenido' || indice === undefined || !previos.contenido) return resto;
      const { [indice]: __, ...filas } = previos.contenido;
      return Object.keys(filas).length ? { ...resto, contenido: filas } : resto;
    });
  }
  const cambiar = (campo: CampoTexto, valor: string) => {
    setEntrada(e => ({ ...e, [campo]: valor }));
    // El precio y la fecha dependen entre sí: corregir uno puede resolver el error del otro.
    corregido(campo);
    if (campo === 'precioPresentacionCop' || campo === 'fechaPrecio' || campo === 'presentacionKg') {
      corregido('fechaPrecio');
      corregido('presentacionKg');
    }
  };
  const cambiarFila = (indice: number, cambios: Partial<FilaContenido>) => {
    setEntrada(e => ({ ...e, contenido: e.contenido.map((c, i) => (i === indice ? { ...c, ...cambios } : c)) }));
    corregido('contenido', indice);
  };
  const elegirOrigen = (esEjemplo: boolean) => {
    setEntrada(e => ({ ...e, esEjemplo }));
    corregido('esEjemplo');
  };

  function quitarFila(indice: number) {
    setEntrada(e => ({ ...e, contenido: e.contenido.filter((_, i) => i !== indice) }));
    setErrores(({ contenido: _, ...resto }) => resto);
  }

  function elegirElemento(indice: number, valor: string) {
    if (valor === OTRO) cambiarFila(indice, { elemento: '', forma: '', elementoLibre: true, formaLibre: true });
    else cambiarFila(indice, { elemento: valor, forma: '', elementoLibre: false, formaLibre: false });
  }

  function elegirForma(indice: number, valor: string) {
    if (valor === OTRO) cambiarFila(indice, { forma: '', formaLibre: true });
    else cambiarFila(indice, { forma: valor, formaLibre: false });
  }

  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorGeneral([]);
    if (problemas.length && !descartarDanados) {
      setErrorGeneral(['Antes de guardar, confirma en el recuadro de arriba que quieres reemplazar los datos dañados.']);
      return;
    }
    const resultado = validarProducto(entrada);
    if (!resultado.ok) {
      setErrores(resultado.errores);
      setErrorGeneral(resultado.errores.general ?? ['Revisa los datos marcados en rojo antes de guardar.']);
      return;
    }
    setErrores({});
    setGuardando(true);
    try {
      await onGuardar(resultado.datos, { descartarDanados });
    } catch (error) {
      setErrorGeneral(error instanceof ErrorPersistencia
        ? [error.message, ...error.detalles]
        : ['No se pudo guardar. Verifica que tu navegador permita almacenamiento local y vuelve a intentarlo.']);
    } finally {
      setGuardando(false);
    }
  }

  const errorProps = (id: string, mensaje?: string) =>
    ({ 'aria-invalid': !!mensaje, 'aria-describedby': mensaje ? id : undefined });
  const previa = vistaPrevia(entrada.precioPresentacionCop, entrada.presentacionKg);

  return (
    <form className="form-card" onSubmit={enviar} noValidate aria-labelledby="titulo-form-producto">
      <div className="section-kicker">CATÁLOGO DE PRODUCTOS</div>
      <h2 id="titulo-form-producto">{inicial ? 'Editar producto' : 'Registrar un producto'}</h2>
      <p className="muted">Copia los datos tal como aparecen en la etiqueta del fertilizante. La app no recomienda productos ni dosis. Los campos con <span className="required">*</span> son obligatorios.</p>

      {problemas.length > 0 && <div className="error-box" role="group" aria-labelledby="titulo-danados-producto">
        <strong id="titulo-danados-producto">Este producto tiene datos guardados dañados.</strong>
        <p>Vuelve a escribir los datos desde la etiqueta. El registro original no cambia hasta que guardes.</p>
        <ul className="damage-list">{problemas.map(p => <li key={p.campo}>{p.etiqueta}: {p.detalle} Valor guardado: <code>{p.valorOriginal}</code></li>)}</ul>
        <label className="check">
          <input type="checkbox" checked={descartarDanados} onChange={e => setDescartarDanados(e.target.checked)} />
          Revisé los datos dañados: reemplazarlos por lo que escriba en este formulario.
        </label>
      </div>}

      <fieldset className="form-group">
        <legend>Producto</legend>
        <div className="fields">
          <label className="full">Nombre del producto <span className="required" aria-hidden="true">*</span>
            <input value={entrada.nombre} onChange={e => cambiar('nombre', e.target.value)} maxLength={100} placeholder="Como aparece en la etiqueta" required {...errorProps('err-nombre-producto', errores.nombre)} />
            {errores.nombre && <span id="err-nombre-producto" className="field-error">{errores.nombre}</span>}
          </label>
        </div>
        <fieldset className="choice-group" aria-describedby={errores.esEjemplo ? 'err-ejemplo' : undefined}>
          <legend>¿De dónde salen estos datos? <span className="required" aria-hidden="true">*</span></legend>
          <label className="check">
            <input type="radio" name="origen-producto" checked={entrada.esEjemplo === false} onChange={() => elegirOrigen(false)} />
            De la etiqueta de un producto real
          </label>
          <label className="check">
            <input type="radio" name="origen-producto" checked={entrada.esEjemplo === true} onChange={() => elegirOrigen(true)} />
            Son datos de EJEMPLO (ficticios, para practicar o presentar)
          </label>
          {errores.esEjemplo && <span id="err-ejemplo" className="field-error">{errores.esEjemplo}</span>}
        </fieldset>
      </fieldset>

      <fieldset className="form-group">
        <legend>Contenido declarado en la etiqueta</legend>
        <p className="hint">Registra cada nutriente con su <strong>forma química</strong> y su porcentaje, tal como los declara la etiqueta. En muchas etiquetas el grado N-P-K se expresa como N-P₂O₅-K₂O; verifica la forma en la tuya. P₂O₅ no es lo mismo que P, ni K₂O lo mismo que K, y la app no convierte entre formas. No registres los nutrientes con 0 %.</p>
        {entrada.contenido.map((c, i) => {
          const el = c.elementoLibre ? undefined : buscarElemento(c.elemento);
          const error = errores.contenido?.[i];
          const idError = `err-contenido-${c.clave}`;
          return (
            <fieldset className="nutrient-row" key={c.clave} aria-describedby={error ? idError : undefined}>
              <legend className="nutrient-legend">Nutriente {i + 1}</legend>
              <div className="nutrient-fields fields">
                <label>Elemento
                  <select value={c.elementoLibre ? OTRO : c.elemento} onChange={e => elegirElemento(i, e.target.value)} aria-invalid={!!error}>
                    <option value="">Elige…</option>
                    {CATALOGO_NUTRIENTES.map(n => <option key={n.nombre} value={n.nombre}>{n.nombre} ({n.simbolo})</option>)}
                    <option value={OTRO}>{OPCION_OTRO}</option>
                  </select>
                </label>
                {c.elementoLibre && <label>Nombre del elemento
                  <input value={c.elemento} onChange={e => cambiarFila(i, { elemento: e.target.value })} maxLength={40} placeholder="Como aparece en la etiqueta" aria-invalid={!!error} />
                </label>}
                {el && <label>Forma química
                  <select value={c.formaLibre ? OTRO : c.forma} onChange={e => elegirForma(i, e.target.value)} aria-invalid={!!error}>
                    <option value="">Elige…</option>
                    {el.formas.map(f => <option key={f} value={f}>{f}</option>)}
                    <option value={OTRO}>Otra forma / No reconocida</option>
                  </select>
                </label>}
                {(c.elementoLibre || c.formaLibre) && <label>Forma química (texto de la etiqueta)
                  <input value={c.forma} onChange={e => cambiarFila(i, { forma: e.target.value })} maxLength={20} placeholder="Ej. SO₃" aria-invalid={!!error} />
                </label>}
                <label>Porcentaje (%)
                  <input inputMode="decimal" value={c.porcentaje} onChange={e => cambiarFila(i, { porcentaje: e.target.value })} placeholder="Ej. 46" aria-invalid={!!error} />
                </label>
              </div>
              <button type="button" className="row-remove" onClick={() => quitarFila(i)}>Quitar nutriente {i + 1}</button>
              {error && <span id={idError} className="field-error full-row">{error}</span>}
            </fieldset>
          );
        })}
        <button type="button" className="btn btn-outline btn-small" onClick={() => setEntrada(e => ({ ...e, contenido: [...e.contenido, filaVacia()] }))}>+ Agregar nutriente</button>
      </fieldset>

      <fieldset className="form-group">
        <legend>Presentación y precio, opcional</legend>
        <p className="hint">Escribe los números sin punto de miles: <strong>150000</strong>, no 150.000. Si registras el precio, también se piden los kg del bulto y la fecha del precio, porque los precios cambian.</p>
        <div className="fields">
          <label>Kg por bulto
            <input inputMode="decimal" value={entrada.presentacionKg} onChange={e => cambiar('presentacionKg', e.target.value)} placeholder="Ej. 50" {...errorProps('err-kg', errores.presentacionKg)} />
            {errores.presentacionKg && <span id="err-kg" className="field-error">{errores.presentacionKg}</span>}
          </label>
          <label>Precio del bulto (COP)
            <input inputMode="decimal" value={entrada.precioPresentacionCop} onChange={e => cambiar('precioPresentacionCop', e.target.value)} placeholder="Ej. 150000" {...errorProps('err-precio', errores.precioPresentacionCop)} />
            {errores.precioPresentacionCop && <span id="err-precio" className="field-error">{errores.precioPresentacionCop}</span>}
          </label>
          <label>Fecha del precio
            <input type="date" value={entrada.fechaPrecio} max={fechaLocalISO()} onChange={e => cambiar('fechaPrecio', e.target.value)} {...errorProps('err-fecha-precio', errores.fechaPrecio)} />
            {errores.fechaPrecio && <span id="err-fecha-precio" className="field-error">{errores.fechaPrecio}</span>}
          </label>
        </div>
        {previa && <p className="hint">{previa}</p>}
      </fieldset>

      {errorGeneral.length > 0 && <div role="alert" className="error">{errorGeneral.map(m => <p key={m}>{m}</p>)}</div>}
      <div className="form-actions">
        <button className="btn btn-outline" type="button" onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar producto'}</button>
      </div>
    </form>
  );
}
