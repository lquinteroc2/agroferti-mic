/**
 * Departamentos de Colombia y Bogotá, D.C., escritos como los publica el DANE en los precios de
 * insumos (SIPSA). El departamento del lote sirve para tomar el precio de referencia de esa zona.
 */
export const DEPARTAMENTOS_COLOMBIA: ReadonlyArray<string> = [
  'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá, D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare',
  'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta',
  'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda', 'San Andrés, Providencia y Santa Catalina',
  'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada'
];

/**
 * Ubicación aproximada (latitud, longitud) de la capital de cada departamento. Sirve solo para
 * escoger el departamento más cercano cuando el DANE no publica un precio en el del lote; no es un
 * dato agronómico. Bogotá, D.C. y Cundinamarca comparten capital.
 */
export const CAPITALES: Readonly<Record<string, readonly [number, number]>> = {
  'Amazonas': [-4.215, -69.941], 'Antioquia': [6.244, -75.581], 'Arauca': [7.090, -70.762], 'Atlántico': [10.969, -74.781],
  'Bogotá, D.C.': [4.711, -74.072], 'Bolívar': [10.391, -75.479], 'Boyacá': [5.535, -73.368], 'Caldas': [5.069, -75.517],
  'Caquetá': [1.614, -75.606], 'Casanare': [5.338, -72.396], 'Cauca': [2.445, -76.615], 'Cesar': [10.463, -73.253],
  'Chocó': [5.695, -76.661], 'Córdoba': [8.748, -75.881], 'Cundinamarca': [4.711, -74.072], 'Guainía': [3.865, -67.924],
  'Guaviare': [2.573, -72.646], 'Huila': [2.927, -75.282], 'La Guajira': [11.544, -72.907], 'Magdalena': [11.241, -74.199],
  'Meta': [4.142, -73.627], 'Nariño': [1.214, -77.281], 'Norte de Santander': [7.894, -72.508], 'Putumayo': [1.152, -76.653],
  'Quindío': [4.534, -75.681], 'Risaralda': [4.813, -75.696], 'San Andrés, Providencia y Santa Catalina': [12.585, -81.701],
  'Santander': [7.119, -73.123], 'Sucre': [9.305, -75.398], 'Tolima': [4.439, -75.232], 'Valle del Cauca': [3.452, -76.532],
  'Vaupés': [1.254, -70.235], 'Vichada': [6.189, -67.486]
};
