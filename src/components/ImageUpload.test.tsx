import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ImageUpload, { IMAGE_MAX_MB } from "./ImageUpload";

vi.mock("@/lib/api", () => ({
  api: { post: vi.fn() },
}));

import { api } from "@/lib/api";

function Harness({ initial = "" }: { initial?: string }) {
  const [url, setUrl] = useState(initial);
  return (
    <>
      <ImageUpload value={url} onChange={setUrl} />
      <span data-testid="url">{url}</span>
    </>
  );
}

const file = (name = "foto.png", type = "image/png", size = 10) =>
  new File([new Uint8Array(size)], name, { type });

const input = () => screen.getByTestId("image-upload-input") as HTMLInputElement;

describe("ImageUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no pide un enlace: se adjunta un archivo", () => {
    render(<Harness />);

    expect(screen.queryByPlaceholderText("https://…")).not.toBeInTheDocument();
    expect(input()).toHaveAttribute("type", "file");
    expect(input()).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
    expect(screen.getByText("Arrastrá una foto o elegila desde tu equipo")).toBeInTheDocument();
    expect(screen.getByText(`JPG, PNG o WebP, hasta ${IMAGE_MAX_MB} MB.`)).toBeInTheDocument();
  });

  it("sube el archivo como multipart y entrega la dirección que devuelve el servicio", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockResolvedValue({ data: { url: "https://img.example/p.png" } });
    render(<Harness />);

    await user.upload(input(), file());

    await waitFor(() => expect(screen.getByTestId("url")).toHaveTextContent("https://img.example/p.png"));
    const [path, body, config] = vi.mocked(api.post).mock.calls[0] as [string, FormData, any];
    expect(path).toBe("/me/products/image");
    expect((body.get("file") as File).name).toBe("foto.png");
    expect(config.headers["Content-Type"]).toBe("multipart/form-data");
    expect(screen.getByTestId("image-upload-preview")).toHaveAttribute("src", "blob:mock-url");
    expect(screen.getByText("foto.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cambiar imagen" })).toBeInTheDocument();
  });

  it("mientras sube, lo informa y no deja cambiar la imagen", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    vi.mocked(api.post).mockReturnValue(new Promise((resolve) => { release = resolve; }) as any);
    render(<Harness />);

    await user.upload(input(), file());

    expect(await screen.findByRole("status")).toHaveTextContent("Subiendo imagen…");
    expect(screen.getByRole("button", { name: "Cambiar imagen" })).toBeDisabled();
    release({ data: { url: "https://img.example/p.png" } });
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it.each([
    ["un PDF", file("doc.pdf", "application/pdf"), "La imagen tiene que ser JPG, PNG o WebP."],
    ["un GIF", file("a.gif", "image/gif"), "La imagen tiene que ser JPG, PNG o WebP."],
    ["una foto demasiado pesada", file("grande.jpg", "image/jpeg", IMAGE_MAX_MB * 1024 * 1024 + 1), `La imagen pesa más de ${IMAGE_MAX_MB} MB.`],
  ])("rechaza %s sin subirla", async (_name, bad, message) => {
    render(<Harness />);

    fireEvent.change(input(), { target: { files: [bad] } });

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("si el servicio la rechaza, muestra el motivo y no deja una vista previa falsa", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue({ response: { data: { detail: "Formato no soportado" } } });
    render(<Harness />);

    await user.upload(input(), file());

    expect(await screen.findByRole("alert")).toHaveTextContent("Formato no soportado");
    expect(screen.queryByTestId("image-upload-preview")).not.toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("");
  });

  it("si falla sin detalle, usa el mensaje genérico", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error("boom"));
    render(<Harness />);

    await user.upload(input(), file());

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo subir la imagen.");
  });

  it("muestra la imagen que el producto ya tiene y permite quitarla", async () => {
    const user = userEvent.setup();
    render(<Harness initial="https://img.example/vieja.png" />);

    expect(screen.getByTestId("image-upload-preview")).toHaveAttribute("src", "https://img.example/vieja.png");
    expect(screen.getByText("Imagen cargada")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Quitar/ }));

    expect(screen.getByTestId("url")).toHaveTextContent("");
    expect(screen.queryByTestId("image-upload-preview")).not.toBeInTheDocument();
  });

  it("también se puede arrastrar la foto sobre el recuadro", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { url: "https://img.example/arrastrada.png" } });
    render(<Harness />);
    const zone = screen.getByTestId("image-upload");

    fireEvent.dragOver(zone);
    expect(zone.className).toContain("border-primary");
    fireEvent.dragLeave(zone);
    expect(zone.className).not.toContain("bg-primary/5");
    fireEvent.drop(zone, { dataTransfer: { files: [file("arrastrada.png")] } });

    await waitFor(() => expect(screen.getByTestId("url")).toHaveTextContent("https://img.example/arrastrada.png"));
  });

  it("al soltar sin archivos no hace nada", () => {
    render(<Harness />);

    fireEvent.drop(screen.getByTestId("image-upload"), { dataTransfer: { files: [] } });

    expect(api.post).not.toHaveBeenCalled();
  });
});
