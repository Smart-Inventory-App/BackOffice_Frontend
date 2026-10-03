import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  api: { get: vi.fn() },
}));

import { api } from "./api";
import { downloadFile } from "./download";

describe("downloadFile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pide el archivo como blob y dispara la descarga en el navegador", async () => {
    const blob = new Blob(["contenido"]);
    vi.mocked(api.get).mockResolvedValue({ data: blob });

    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const clickSpy = vi.fn();
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") el.click = clickSpy;
      return el;
    });

    await downloadFile("/reportes/export", { formato: "csv" }, "reporte.csv");

    expect(api.get).toHaveBeenCalledWith("/reportes/export", {
      params: { formato: "csv" },
      responseType: "blob",
    });
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });
});
