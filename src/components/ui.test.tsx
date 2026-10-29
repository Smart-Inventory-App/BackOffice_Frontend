import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Layers } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  Notice,
  PILL_WIDTH,
  PageHeader,
  Segmented,
  Spinner,
  StatCard,
  StatTile,
} from "./ui";
import ProductRow from "./ProductRow";
import type { MyProduct } from "@/lib/types";

describe("StatTile", () => {
  it("muestra el ícono, el número, el título y el comentario en una pastilla del ancho fijo", () => {
    render(<StatTile testId="t" icon={Layers} tone="teal" title="Productos" value="12" comment="Total" />);

    expect(screen.getByTestId("t-value")).toHaveTextContent("12");
    expect(screen.getByText("Productos")).toBeInTheDocument();
    expect(screen.getByTestId("t-comment").style.width).toBe(`${PILL_WIDTH}px`);
    expect(screen.getByTestId("t").tagName).toBe("DIV");
  });

  it("con solidComment, el comentario lleva el color del ícono y la letra blanca", () => {
    render(<StatTile testId="t" icon={Layers} tone="blue" accent="#112233" title="P" value="1" comment="Total" solidComment />);

    expect(screen.getByTestId("t-comment").style.backgroundColor).toBe("rgb(17, 34, 51)");
    expect(screen.getByTestId("t-comment").style.color).toBe("rgb(255, 255, 255)");
    expect(screen.getByTestId("t-icon").style.color).toBe("rgb(17, 34, 51)");
  });

  it("si se puede tocar, es un botón con una flecha", async () => {
    const onClick = vi.fn();
    render(<StatTile testId="t" icon={Layers} tone="red" title="Stock bajo" value="3" comment="Alertas de stock" onClick={onClick} />);

    await userEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("sin testId no marca nada para las pruebas", () => {
    render(<StatTile icon={Layers} tone="yellow" title="Vencimientos" value="1" comment="x" />);

    expect(screen.queryByTestId("t-value")).not.toBeInTheDocument();
  });
});

describe("StatCard, Badge y otros", () => {
  it.each(["primary", "primaryDark", "danger", "muted"] as const)("StatCard con el acento %s", (accent) => {
    render(<StatCard label="Etiqueta" value={5} hint="ayuda" accent={accent} />);

    expect(screen.getByText("Etiqueta")).toBeInTheDocument();
    expect(screen.getByText("ayuda")).toBeInTheDocument();
  });

  it.each(["ok", "off", "warn", "info", "neutral"] as const)("Badge %s", (tone) => {
    render(<Badge tone={tone}>Texto</Badge>);

    expect(screen.getByText("Texto")).toBeInTheDocument();
  });

  it("PageHeader con subtítulo y acciones, EmptyState, Card y Spinner", () => {
    render(
      <Card>
        <PageHeader title="Título" subtitle="Subtítulo" actions={<button>Acción</button>} />
        <EmptyState>Nada por acá</EmptyState>
        <Spinner />
      </Card>,
    );

    expect(screen.getByRole("heading", { name: "Título" })).toBeInTheDocument();
    expect(screen.getByText("Subtítulo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acción" })).toBeInTheDocument();
    expect(screen.getByText("Nada por acá")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Cargando" })).toBeInTheDocument();
  });

  it("PageHeader sin subtítulo ni acciones", () => {
    render(<PageHeader title="Solo título" />);

    expect(screen.getByRole("heading", { name: "Solo título" })).toBeInTheDocument();
  });

  it.each(["primary", "outline", "danger", "ghost", "dark"] as const)("Button %s", async (tone) => {
    const onClick = vi.fn();
    render(<Button tone={tone} onClick={onClick}>Tocar</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Tocar" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("Notice: error, ok e información", () => {
    render(
      <>
        <Notice tone="error">Falló</Notice>
        <Notice tone="ok">Listo</Notice>
        <Notice tone="info">Ojo</Notice>
      </>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Falló");
    expect(screen.getAllByRole("status").map((n) => n.textContent)).toEqual(["Listo", "Ojo"]);
  });
});

describe("Field", () => {
  it("asocia el rótulo con el campo y muestra la ayuda", () => {
    render(<Field label="Nombre completo" help="Como figura en el documento" />);

    expect(screen.getByLabelText("Nombre completo")).toBeInTheDocument();
    expect(screen.getByText("Como figura en el documento")).toBeInTheDocument();
  });

  it("el error reemplaza a la ayuda y pinta el borde", () => {
    render(<Field label="Email" help="ayuda" error="No es válido" />);

    expect(screen.getByText("No es válido")).toBeInTheDocument();
    expect(screen.queryByText("ayuda")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email").className).toContain("border-danger");
  });

  it("acepta contenido a la derecha y funciona sin rótulo", () => {
    render(<Field placeholder="Sin rótulo" right={<span>ojo</span>} />);

    expect(screen.getByPlaceholderText("Sin rótulo").className).toContain("pr-11");
    expect(screen.getByText("ojo")).toBeInTheDocument();
  });
});

describe("Segmented", () => {
  it("marca la opción elegida y avisa cuando se elige otra", async () => {
    const onChange = vi.fn();
    render(
      <Segmented
        testIdPrefix="op"
        value="b"
        onChange={onChange}
        options={[
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ]}
      />,
    );

    expect(screen.getByTestId("op-b")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByTestId("op-a"));
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("funciona sin prefijo de pruebas", () => {
    render(<Segmented value={1} onChange={() => {}} options={[{ key: 1, label: "Uno" }]} />);

    expect(screen.getByRole("button", { name: "Uno" })).toBeInTheDocument();
  });
});

describe("Modal", () => {
  it("lleva la flecha de volver a la izquierda del título, y el cuerpo con su propio scroll", () => {
    render(<Modal title="Ventana" onClose={() => {}}>Contenido</Modal>);

    const dialog = screen.getByRole("dialog", { name: "Ventana" });
    const back = screen.getByLabelText("Volver");
    const title = screen.getByRole("heading", { name: "Ventana" });
    expect(back.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("modal-body").className).toContain("overflow-y-auto");
    expect(dialog).toHaveTextContent("Contenido");
  });

  it("se cierra con la flecha, con el fondo y con Escape; el fondo no envuelve al cuerpo", async () => {
    const onClose = vi.fn();
    render(<Modal title="Ventana" onClose={onClose}>Contenido</Modal>);

    await userEvent.click(screen.getByLabelText("Volver"));
    await userEvent.click(screen.getByTestId("modal-backdrop"));
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("a");

    expect(onClose).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("modal-backdrop").contains(screen.getByTestId("modal-body"))).toBe(false);
  });

  it("puede ser una ventana centrada y tener un pie", () => {
    render(<Modal title="Centro" variant="center" footer={<button>Pie</button>} onClose={() => {}}>x</Modal>);

    expect(screen.getByRole("button", { name: "Pie" })).toBeInTheDocument();
    expect(screen.getByRole("dialog").className).toContain("mx-4");
  });
});

describe("ConfirmDialog", () => {
  it("confirma o cancela, y el botón es rojo si borra algo", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="Eliminar" message="¿Seguro?" confirmLabel="Eliminar" danger onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByRole("button", { name: "Eliminar" }).className).toContain("bg-critical");
    await userEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("por defecto es del color de la app, y deshabilita confirmar mientras trabaja", () => {
    render(<ConfirmDialog title="Cambiar" message="x" busy onConfirm={() => {}} onCancel={() => {}} />);

    const confirm = screen.getByRole("button", { name: "Confirmar" });
    expect(confirm.className).toContain("bg-primary");
    expect(confirm).toBeDisabled();
  });
});

describe("ProductRow", () => {
  const product: MyProduct = {
    id: 1, nombre: "Yerba", marca: null, categoria: "Almacén", stock: 4, vencimiento: null, descripcion: null,
    imagen_url: null, ubicacion: null, codigo_barras: null, stock_minimo: null, dias_alerta_vencimiento: null, created_at: null,
  };

  it("sin acción es solo informativo, y con una acción es un botón", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<ul><ProductRow product={product} testId="fila" /></ul>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("fila")).toHaveTextContent("Almacén");

    rerender(<ul><ProductRow product={product} testId="fila" caption="Cargado hoy" onClick={onClick} right={<span>extra</span>} /></ul>);
    await userEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByText("Cargado hoy")).toBeInTheDocument();
    expect(screen.getByText("extra")).toBeInTheDocument();
  });
});
