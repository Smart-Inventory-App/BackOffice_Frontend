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
| `/cargar` | Flujo de producto (entrada y salida), en modo usuario |
| `/metricas`, `/alertas`, `/perfil` | Consumo, avisos de stock y vencimiento, y datos de la cuenta, en modo usuario |

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
