# Backoffice Frontend — Smart Inventory

Interfaz web del panel de administración (backoffice) de Smart Inventory. Pensada para usuarios administradores: ver el estado general del sistema, gestionar/habilitar usuarios y supervisar los productos e imágenes que cargan.

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
| `/login` | Login de administrador |
| `/` | Dashboard — métricas globales y gráficos |
| `/usuarios` | Lista de usuarios, búsqueda y habilitar/deshabilitar |
| `/usuarios/:id` | Detalle de usuario + sus productos |
| `/productos` | Productos cargados (con imagen), búsqueda y eliminación |
| `/auditoria` | Actividad de usuarios: altas, productos, logins y cambios de rol |
| `/ocr` | Módulo de OCR: estado de los motores, tiempos y precisión, prueba de fotos y auditoría de escaneos |
| `/ml` | Modelos de predicción de consumo |
| `/cargar` | Flujo de producto (entrada y salida) en modo usuario, con tres formas de carga: manual, por archivo y **por foto** (pestaña Procesamiento) |
| `/metricas`, `/alertas`, `/perfil` | Consumo, avisos de stock y vencimiento, y datos de la cuenta, en modo usuario |

La pestaña **Procesamiento** de `/cargar` (`src/components/Procesamiento.tsx`) es la contracara de usuario del mismo módulo: manda la foto a `/me/products/ocr/*`, espera —mostrando el lugar en la fila y la espera estimada, porque un comprobante tarda cerca de un minuto— y devuelve un borrador **ya emparejado** con el inventario de quien escanea. Nada se guarda hasta que la persona confirma, y lo que se confirma va a los endpoints de alta y de salida de siempre.

En entrada hay tres caminos (imagen del producto, comprobante, código de barras) y en salida dos (código de barras y comprobante): no hay salida por foto del envase porque una etiqueta no dice de qué lote sale el stock. Cuando el código leído no corresponde a ningún producto, el flujo salta al alta manual con el código ya cargado.

La página de OCR habla con `/admin/ocr/*` del backoffice, que a su vez habla con el coordinador del módulo. La foto que se sube desde ahí para probar **no se guarda en ningún lado**: se procesa en memoria y de la ejecución sólo queda un renglón de auditoría con quién la pidió, cuánto tardó y un resumen recortado de lo leído.

---

## Configuración

`.env` (a partir de `.env.example`):

```env
VITE_API_URL=http://localhost:8002
```

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
