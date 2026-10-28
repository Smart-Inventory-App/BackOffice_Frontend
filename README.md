# Backoffice Frontend — Smart Inventory Platform

<p align="center"><img src="assets/brand/logo_con_texto/logo_horizontal_color.png" alt="Smart Inventory" width="360"></p>

[![codecov](https://codecov.io/gh/Smart-Inventory-App/BackOffice_Frontend/branch/main/graph/badge.svg?token=HQWB45P8NJ)](https://codecov.io/gh/Smart-Inventory-App/BackOffice_Frontend)

Interfaz web del panel de administración (backoffice) de Smart Inventory Platform. Pensada para usuarios regulares y administradores: permite ver el estado general del sistema, gestionar/habilitar usuarios, gestionar y supervisar los productos e imágenes que cargan.

Tiene el **mismo aspecto y la misma lógica de negocio que la app**: la gama de colores (verde azulado `#2CC4B4` y azul `#1B3A8F`, rojo y amarillo para las alertas), los logos nuevos, las pantallas de ingreso y registro, las cuatro tarjetas del inicio, las tendencias de consumo, el Centro de Alertas y el flujo de producto. Es un servicio separado: habla solo con el `backoffice_backend`.

---

## Stack

- Vite + React 18 + TypeScript
- TailwindCSS 3
- React Router 6
- TanStack Query 5 (data fetching)
- Axios (cliente HTTP con interceptor de token)
- Recharts (gráficos del dashboard)
- lucide-react (íconos)

Puerto: **3000** (está habilitado en el CORS del `backoffice_backend`).

---

## Páginas

| Ruta | Descripción |
|------|-------------|
| `/login`, `/register`, `/forgot-password`, `/set-password` | Ingreso en dos pasos (email y contraseña, con el ojo para mostrarla), registro, **recuperar o crear la contraseña** con un código por mail (también para cuentas de Google) y la contraseña del primer ingreso de un administrador |
| `/` | **Usuario**: inicio con las cuatro tarjetas, tendencias, últimos cambios y productos recientes. **Administrador**: dashboard de la plataforma |
| `/alertas` | Centro de Alertas (usuario) |
| `/metricas` | Tendencias de Consumo: las del usuario o, para un administrador, las de toda la plataforma |
| `/usuarios` | Lista de usuarios, búsqueda y habilitar/deshabilitar |
| `/usuarios/:id` | Detalle de usuario: unidades, alertas, consumo de 30 días, sus alertas y sus productos con el nivel de cada uno |
| `/productos` | Productos cargados (con imagen y nivel de alerta), búsqueda, filtros, orden, exportación, eliminación y **stock total por producto**; el usuario ve su inventario y abre la **información de cada producto** |
| `/auditoria` | Actividad de usuarios: altas, productos, logins y cambios de rol |
| `/ocr` | Módulo de OCR: estado de los motores, tiempos y precisión, prueba de fotos y auditoría de escaneos |
| `/ml` | Modelos de predicción de consumo |
| `/cargar` | Flujo de producto (entrada y salida) en modo usuario, con tres formas de carga: manual, por archivo y **por foto** (pestaña Procesamiento) |
| `/perfil` | Datos de la cuenta, tipo de cuenta y reglas de alerta, en modo usuario |

#### Inicio del usuario

Como el de la app: «Bienvenido, <nombre>» y «Tu estado»; cuatro tarjetas (**Productos** → «Total inventario», **Productos en stock** → «Total unidades», **Vencimientos** → «Alertas de productos», **Stock bajo** → «Alertas de stock») con los números con puntos de miles y los cuatro comentarios del mismo largo y centrados; el comentario de Productos va con el fondo del color de su ícono y letra blanca. «Vencimientos» abre el Centro de Alertas con **Vencimiento** ya elegido y «Stock bajo» con **Stock**. Debajo, el botón «Tendencias» (ventana), **Últimos Cambios** (5, con «Ver más» al historial con «Cargar más») y **Productos Recientes** (3).

#### Tendencias de Consumo

Períodos de **7, 14 y 30 días** (sin 90), gráfico por día que se ve **entero, sin desplazarse**, con el día elegido y su detalle **centrado** entre las flechas «<» y «>» que retroceden y avanzan un día, «Promedio de consumidos por día», «Día de mayor consumo: 21 de octubre» (dos renglones), comparación con el período anterior y los **5 productos más consumidos** (sin «Menos usados»). Los días son los de Argentina. Está en `src/components/TrendsPanel.tsx`.

#### Centro de Alertas

«Críticas» y «Advertencias» son filtros: al tocar una, su contorno es **rojo** o **amarillo**; con las opciones Todas / Stock / Vencimiento los números siguen al tipo elegido. «Según tus reglas» va primero y «Generado por el sistema» después, con la marca «Predicción» fija arriba a la derecha de lo que calcula el modelo. Cada alerta tiene dos renglones de descripción («Quedan X ud. restantes que alcanzan para x días. Mínimo configurado de X días.») y un detalle que se desplaza; en un producto ya vencido no se explica la regla de aviso. Los niveles son los de la app: se avisa con **menos de** N días.

#### Imágenes de producto

La imagen se **adjunta como archivo** (se elige o se arrastra; JPG, PNG o WebP de hasta 10 MB) con vista previa; el archivo viaja por `POST /me/products/image` y el producto guarda la dirección que devuelve. Ya no se escribe un enlace (`src/components/ImageUpload.tsx`).

#### Perfil

Nombre, apellido y usuario de hasta 20 caracteres con contador; el usuario se consulta mientras se escribe (**único**, sin distinguir mayúsculas); días de las alertas de 2 a 90 y hora del chequeo de 0 a 23 en hora de Argentina, con botones para subir y bajar; tipo de cuenta (Individuo / Comercio).

#### Stock total por producto

En `/productos` el botón **Stock total** (arriba, y uno por cada fila) abre una ventana con la suma del stock de todos los productos que tienen el mismo nombre y categoría, de cualquier marca (`src/components/StockTotalModal.tsx`):

- Desde el botón de arriba se **busca por nombre** (a partir de 2 letras, con sugerencias). Si hay un dueño elegido en el filtro de la página, se cuenta solo lo de ese usuario; si no, lo de **toda la plataforma**, y la ventana indica cuántos usuarios suman.
- Desde el botón de una fila se abre directamente con ese producto, acotado al usuario dueño de esa fila.
- El nombre y el resumen (stock total y cantidad de productos) **quedan fijos**; solo se desplaza el listado de «Productos encontrados». Cada producto tiene una casilla para incluirlo o sacarlo de la suma, y el total se recalcula al instante.

El orden por nombre de las tablas de productos es alfabético (no distingue mayúsculas ni tildes) y al ordenar por vencimiento no aparecen los productos sin fecha; lo resuelve el `backoffice_backend`.

La pestaña **Procesamiento** de `/cargar` (`src/components/Procesamiento.tsx`) es la contracara de usuario del mismo módulo: manda la foto a `/me/products/ocr/*`, espera —mostrando el lugar en la fila y la espera estimada, porque un comprobante tarda cerca de un minuto— y devuelve un borrador **ya emparejado** con el inventario de quien escanea. Nada se guarda hasta que la persona confirma, y lo que se confirma va a los endpoints de alta y de salida de siempre.

En entrada hay tres caminos (imagen del producto, comprobante, código de barras) y en salida dos (código de barras y comprobante): no hay salida por foto del envase porque una etiqueta no dice de qué lote sale el stock. Cuando el código leído no corresponde a ningún producto, el flujo salta al alta manual con el código ya cargado.

La página de OCR habla con `/admin/ocr/*` del backoffice, que a su vez habla con el coordinador del módulo. La foto que se sube desde ahí para probar **no se guarda en ningún lado**: se procesa en memoria y de la ejecución sólo queda un renglón de auditoría con quién la pidió, cuánto tardó y un resumen recortado de lo leído.

---

## Configuración

`.env` (a partir de `.env.example`):

```env
VITE_API_URL=http://localhost:8002
```

No hay otras variables: la subida de imágenes también pasa por el `backoffice_backend`.

---

## Setup local

```powershell
npm install
npm run dev      # http://localhost:3000
```

Requiere el `backoffice_backend` corriendo en `http://localhost:8002` y un administrador creado (ver `backoffice_backend/README.md` → `create_admin.py`).

```powershell
npm run build    # type-check + build de producción
```

---

## Tests

```powershell
npm test                # vitest
npm run test:coverage   # con cobertura (umbral del 90 %)
```

467 tests, 99 % de cobertura de líneas y 91 % de ramas.
