import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Pagination from "./Pagination";

describe("Pagination", () => {
  it("muestra el rango, el total y deshabilita Anterior en la primera página", () => {
    render(<Pagination page={0} pageSize={10} total={25} onPageChange={vi.fn()} />);
    expect(screen.getByText("1–10 de 25")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anterior/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Siguiente/ })).not.toBeDisabled();
  });

  it("deshabilita Siguiente en la última página", () => {
    render(<Pagination page={2} pageSize={10} total={25} onPageChange={vi.fn()} />);
    expect(screen.getByText("21–25 de 25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Siguiente/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Anterior/ })).not.toBeDisabled();
  });

  it("con total 0, muestra un rango de 0 y una sola página", () => {
    render(<Pagination page={0} pageSize={10} total={0} onPageChange={vi.fn()} />);
    expect(screen.getByText("0–0 de 0")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 1")).toBeInTheDocument();
  });

  it("llama a onPageChange con la página siguiente y la anterior", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageSize={10} total={30} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: /Siguiente/ }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole("button", { name: /Anterior/ }));
    expect(onPageChange).toHaveBeenCalledWith(0);
  });
});
